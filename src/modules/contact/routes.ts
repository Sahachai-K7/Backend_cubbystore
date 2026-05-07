import { Elysia, t } from 'elysia'
import { asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { contactLinks } from '../../db/schema'
import { adminGuard, recordAdminAction } from '../../middlewares/admin'

const Platform = t.Union([
  t.Literal('line'),
  t.Literal('discord'),
  t.Literal('telegram'),
  t.Literal('facebook'),
  t.Literal('instagram'),
  t.Literal('x'),
  t.Literal('email'),
  t.Literal('phone'),
  t.Literal('other'),
])

const CreateBody = t.Object({
  platform: Platform,
  label: t.String({ minLength: 1, maxLength: 80 }),
  url: t.String({ minLength: 1, maxLength: 500 }),
  enabled: t.Optional(t.Boolean()),
  sortOrder: t.Optional(t.Integer({ minimum: 0 })),
})

const PatchBody = t.Object({
  platform: t.Optional(Platform),
  label: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
  url: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
  enabled: t.Optional(t.Boolean()),
  sortOrder: t.Optional(t.Integer({ minimum: 0 })),
})

export const publicContact = new Elysia({ name: 'public-contact' }).get(
  '/api/contact-links',
  async () => {
    const items = await db
      .select({
        id: contactLinks.id,
        platform: contactLinks.platform,
        label: contactLinks.label,
        url: contactLinks.url,
        sortOrder: contactLinks.sortOrder,
      })
      .from(contactLinks)
      .where(eq(contactLinks.enabled, true))
      .orderBy(asc(contactLinks.sortOrder), asc(contactLinks.label))
    return { items }
  },
)

export const adminContact = new Elysia({ prefix: '/api/admin/contact-links' })
  .use(adminGuard)
  .get(
    '/',
    async () => {
      const items = await db
        .select()
        .from(contactLinks)
        .orderBy(asc(contactLinks.sortOrder), asc(contactLinks.label))
      return { items }
    },
    { requireAdmin: true },
  )
  .post(
    '/',
    async ({ body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const [row] = await db
        .insert(contactLinks)
        .values({
          platform: body.platform,
          label: body.label,
          url: body.url,
          enabled: body.enabled ?? true,
          sortOrder: body.sortOrder ?? 0,
          updatedBy: user.id,
        })
        .returning()
      await recordAdminAction({
        adminId: user.id,
        action: 'contact_link.create',
        target: row!.id,
        payload: { platform: row!.platform, label: row!.label },
        ip: clientIp,
      })
      return { item: row }
    },
    { body: CreateBody, requireAdmin: true },
  )
  .patch(
    '/:id',
    async ({ params, body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const patch: Partial<typeof contactLinks.$inferInsert> = {
        updatedBy: user.id,
        updatedAt: new Date(),
      }
      if (body.platform !== undefined) patch.platform = body.platform
      if (body.label !== undefined) patch.label = body.label
      if (body.url !== undefined) patch.url = body.url
      if (body.enabled !== undefined) patch.enabled = body.enabled
      if (body.sortOrder !== undefined) patch.sortOrder = body.sortOrder

      const [row] = await db
        .update(contactLinks)
        .set(patch)
        .where(eq(contactLinks.id, params.id))
        .returning()
      if (!row) return status(404, { error: 'not_found' })
      await recordAdminAction({
        adminId: user.id,
        action: 'contact_link.update',
        target: params.id,
        payload: patch,
        ip: clientIp,
      })
      return { item: row }
    },
    { body: PatchBody, requireAdmin: true },
  )
  .delete(
    '/:id',
    async ({ params, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const [row] = await db
        .delete(contactLinks)
        .where(eq(contactLinks.id, params.id))
        .returning()
      if (!row) return status(404, { error: 'not_found' })
      await recordAdminAction({
        adminId: user.id,
        action: 'contact_link.delete',
        target: params.id,
        payload: { platform: row.platform, label: row.label },
        ip: clientIp,
      })
      return { ok: true }
    },
    { requireAdmin: true },
  )

