import { Elysia, t } from 'elysia'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { promoCodes } from '../../db/schema'
import { adminGuard, recordAdminAction } from '../../middlewares/admin'

const PromoCreate = t.Object({
  code: t.String({ minLength: 2, maxLength: 40 }),
  type: t.Union([t.Literal('percent'), t.Literal('amount')]),
  value: t.Number({ minimum: 0.01, maximum: 1_000_000 }),
  minTotal: t.Optional(t.Nullable(t.Number({ minimum: 0 }))),
  maxUses: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  expiresAt: t.Optional(t.Nullable(t.String())),
  isActive: t.Optional(t.Boolean()),
  note: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
})

const PromoPatch = t.Object({
  type: t.Optional(t.Union([t.Literal('percent'), t.Literal('amount')])),
  value: t.Optional(t.Number({ minimum: 0.01, maximum: 1_000_000 })),
  minTotal: t.Optional(t.Nullable(t.Number({ minimum: 0 }))),
  maxUses: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  expiresAt: t.Optional(t.Nullable(t.String())),
  isActive: t.Optional(t.Boolean()),
  note: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
})

const normalizeCode = (s: string) => s.trim().toUpperCase()

export const adminPromoModule = new Elysia({ prefix: '/api/admin/promo-codes' })
  .use(adminGuard)
  .get(
    '/',
    async ({ query }) => {
      const conditions = []
      if (query.active === 'true')
        conditions.push(eq(promoCodes.isActive, true))
      if (query.active === 'false')
        conditions.push(eq(promoCodes.isActive, false))
      const where = conditions.length ? and(...conditions) : undefined
      const items = await db
        .select()
        .from(promoCodes)
        .where(where)
        .orderBy(desc(promoCodes.createdAt))
      return { items }
    },
    {
      query: t.Object({
        active: t.Optional(t.Union([t.Literal('true'), t.Literal('false')])),
      }),
      requireAdmin: true,
    },
  )
  .post(
    '/',
    async ({ body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const code = normalizeCode(body.code)

      try {
        const [row] = await db
          .insert(promoCodes)
          .values({
            code,
            type: body.type,
            value: body.value.toFixed(2),
            minTotal: body.minTotal?.toFixed(2) ?? null,
            maxUses: body.maxUses ?? null,
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
            isActive: body.isActive ?? true,
            note: body.note ?? null,
            createdBy: user.id,
          })
          .returning()
        await recordAdminAction({
          adminId: user.id,
          action: 'promo.create',
          target: row!.id,
          payload: { code: row!.code, type: row!.type, value: row!.value },
          ip: clientIp,
        })
        return { item: row }
      } catch (e) {
        if (
          typeof e === 'object' &&
          e !== null &&
          (e as { code?: string }).code === '23505'
        ) {
          return status(409, { error: 'code_already_exists' })
        }
        throw e
      }
    },
    { body: PromoCreate, requireAdmin: true },
  )
  .patch(
    '/:id',
    async ({ params, body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const patch: Partial<typeof promoCodes.$inferInsert> = {
        updatedAt: new Date(),
      }
      if (body.type !== undefined) patch.type = body.type
      if (body.value !== undefined) patch.value = body.value.toFixed(2)
      if (body.minTotal !== undefined)
        patch.minTotal = body.minTotal === null ? null : body.minTotal.toFixed(2)
      if (body.maxUses !== undefined) patch.maxUses = body.maxUses
      if (body.expiresAt !== undefined)
        patch.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
      if (body.isActive !== undefined) patch.isActive = body.isActive
      if (body.note !== undefined) patch.note = body.note

      const [row] = await db
        .update(promoCodes)
        .set(patch)
        .where(eq(promoCodes.id, params.id))
        .returning()
      if (!row) return status(404, { error: 'not_found' })
      await recordAdminAction({
        adminId: user.id,
        action: 'promo.update',
        target: params.id,
        payload: patch,
        ip: clientIp,
      })
      return { item: row }
    },
    { body: PromoPatch, requireAdmin: true },
  )
  .delete(
    '/:id',
    async ({ params, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const [row] = await db
        .delete(promoCodes)
        .where(eq(promoCodes.id, params.id))
        .returning()
      if (!row) return status(404, { error: 'not_found' })
      await recordAdminAction({
        adminId: user.id,
        action: 'promo.delete',
        target: params.id,
        payload: { code: row.code },
        ip: clientIp,
      })
      return { ok: true }
    },
    { requireAdmin: true },
  )
