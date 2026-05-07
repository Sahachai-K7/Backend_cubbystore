import { Elysia, t } from 'elysia'
import { eq, asc } from 'drizzle-orm'
import { db } from '../../db'
import { categories } from '../../db/schema'
import { adminGuard, recordAdminAction } from '../../middlewares/admin'
import { ensureSlug, slugify } from '../../lib/slug'

const CategoryCreate = t.Object({
  name: t.String({ minLength: 1, maxLength: 80 }),
  slug: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
  parentId: t.Optional(t.Nullable(t.String())),
  sortOrder: t.Optional(t.Integer({ minimum: 0 })),
})

const CategoryPatch = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
  slug: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
  parentId: t.Optional(t.Nullable(t.String())),
  sortOrder: t.Optional(t.Integer({ minimum: 0 })),
})

export const publicCategories = new Elysia({ prefix: '/api/categories' }).get(
  '/',
  async () => {
    const rows = await db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name))
    return { items: rows }
  },
)

export const adminCategories = new Elysia({ prefix: '/api/admin/categories' })
  .use(adminGuard)
  .get('/', async () => {
    const rows = await db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name))
    return { items: rows }
  }, { requireAdmin: true })
  .post(
    '/',
    async ({ body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const slug = body.slug ? slugify(body.slug) : ensureSlug(body.name, 'category')
      const exists = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, slug))
        .limit(1)
      if (exists.length > 0) {
        return status(409, { error: 'slug_taken', slug })
      }
      const [row] = await db
        .insert(categories)
        .values({
          name: body.name,
          slug,
          parentId: body.parentId ?? null,
          sortOrder: body.sortOrder ?? 0,
        })
        .returning()
      await recordAdminAction({
        adminId: user.id,
        action: 'category.create',
        target: row!.id,
        payload: { name: row!.name, slug: row!.slug },
        ip: clientIp,
      })
      return { item: row }
    },
    { body: CategoryCreate, requireAdmin: true },
  )
  .patch(
    '/:id',
    async ({ params, body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const existing = await db
        .select()
        .from(categories)
        .where(eq(categories.id, params.id))
        .limit(1)
      if (existing.length === 0) return status(404, { error: 'not_found' })

      const patch: Partial<typeof categories.$inferInsert> = {}
      if (body.name !== undefined) patch.name = body.name
      if (body.slug !== undefined) {
        const slug = slugify(body.slug)
        if (slug !== existing[0]!.slug) {
          const dupe = await db
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.slug, slug))
            .limit(1)
          if (dupe.length > 0 && dupe[0]!.id !== params.id) {
            return status(409, { error: 'slug_taken', slug })
          }
          patch.slug = slug
        }
      }
      if (body.parentId !== undefined) patch.parentId = body.parentId
      if (body.sortOrder !== undefined) patch.sortOrder = body.sortOrder

      const [row] = await db
        .update(categories)
        .set(patch)
        .where(eq(categories.id, params.id))
        .returning()
      await recordAdminAction({
        adminId: user.id,
        action: 'category.update',
        target: params.id,
        payload: patch,
        ip: clientIp,
      })
      return { item: row }
    },
    { body: CategoryPatch, requireAdmin: true },
  )
  .delete(
    '/:id',
    async ({ params, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const [row] = await db
        .delete(categories)
        .where(eq(categories.id, params.id))
        .returning()
      if (!row) return status(404, { error: 'not_found' })
      await recordAdminAction({
        adminId: user.id,
        action: 'category.delete',
        target: params.id,
        payload: { name: row.name },
        ip: clientIp,
      })
      return { ok: true }
    },
    { requireAdmin: true },
  )
