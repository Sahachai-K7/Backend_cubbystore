import { Elysia, t } from 'elysia'
import { asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { ipAllowlist } from '../../db/schema'
import { adminGuard, recordAdminAction } from '../../middlewares/admin'
import { ipInCidr } from '../../lib/ip'

const CidrCreate = t.Object({
  cidr: t.String({ minLength: 1, maxLength: 60 }),
  label: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
  enabled: t.Optional(t.Boolean()),
})

const CidrPatch = t.Object({
  label: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
  enabled: t.Optional(t.Boolean()),
})

function isValidCidrish(input: string): boolean {
  // Use ipInCidr's parser by feeding the same value as both sides — returns true on valid
  return ipInCidr(input.split('/')[0] ?? '', input)
}

export const adminIpModule = new Elysia({ prefix: '/api/admin/ip-allowlist' })
  .use(adminGuard)
  .get(
    '/',
    async () => {
      const items = await db
        .select()
        .from(ipAllowlist)
        .orderBy(asc(ipAllowlist.addedAt))
      return { items }
    },
    { requireAdmin: true },
  )
  .post(
    '/',
    async ({ body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      if (!isValidCidrish(body.cidr)) {
        return status(400, { error: 'invalid_cidr' })
      }
      try {
        const [row] = await db
          .insert(ipAllowlist)
          .values({
            cidr: body.cidr,
            label: body.label ?? null,
            enabled: body.enabled ?? true,
            addedBy: user.id,
          })
          .returning()
        await recordAdminAction({
          adminId: user.id,
          action: 'ip_allowlist.create',
          target: row!.id,
          payload: { cidr: row!.cidr, label: row!.label },
          ip: clientIp,
        })
        return { item: row }
      } catch (e) {
        if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505') {
          return status(409, { error: 'cidr_already_exists' })
        }
        throw e
      }
    },
    { body: CidrCreate, requireAdmin: true },
  )
  .patch(
    '/:id',
    async ({ params, body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const patch: Partial<typeof ipAllowlist.$inferInsert> = {}
      if (body.label !== undefined) patch.label = body.label
      if (body.enabled !== undefined) patch.enabled = body.enabled
      const [row] = await db
        .update(ipAllowlist)
        .set(patch)
        .where(eq(ipAllowlist.id, params.id))
        .returning()
      if (!row) return status(404, { error: 'not_found' })
      await recordAdminAction({
        adminId: user.id,
        action: 'ip_allowlist.update',
        target: params.id,
        payload: patch,
        ip: clientIp,
      })
      return { item: row }
    },
    { body: CidrPatch, requireAdmin: true },
  )
  .delete(
    '/:id',
    async ({ params, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const [row] = await db
        .delete(ipAllowlist)
        .where(eq(ipAllowlist.id, params.id))
        .returning()
      if (!row) return status(404, { error: 'not_found' })
      await recordAdminAction({
        adminId: user.id,
        action: 'ip_allowlist.delete',
        target: params.id,
        payload: { cidr: row.cidr },
        ip: clientIp,
      })
      return { ok: true }
    },
    { requireAdmin: true },
  )
