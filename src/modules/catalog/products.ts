import { Elysia, t } from 'elysia'
import { and, desc, eq, ilike, sql } from 'drizzle-orm'
import { db } from '../../db'
import { products, categories } from '../../db/schema'
import { adminGuard, recordAdminAction } from '../../middlewares/admin'
import { ensureSlug, slugify } from '../../lib/slug'
import { saveProductImage, deleteProductImage } from '../../lib/uploads'

const ProductCreate = t.Object({
  name: t.String({ minLength: 1, maxLength: 200 }),
  slug: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
  categoryId: t.Optional(t.Nullable(t.String())),
  description: t.Optional(t.Nullable(t.String({ maxLength: 5000 }))),
  price: t.Number({ minimum: 0, maximum: 9_999_999.99 }),
  isActive: t.Optional(t.Boolean()),
})

const ProductPatch = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
  slug: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
  categoryId: t.Optional(t.Nullable(t.String())),
  description: t.Optional(t.Nullable(t.String({ maxLength: 5000 }))),
  price: t.Optional(t.Number({ minimum: 0, maximum: 9_999_999.99 })),
  isActive: t.Optional(t.Boolean()),
})

const formatPrice = (n: number): string => n.toFixed(2)

export const adminProducts = new Elysia({ prefix: '/api/admin/products' })
  .use(adminGuard)
  .get(
    '/',
    async ({ query }) => {
      const conditions = []
      if (query.categoryId)
        conditions.push(eq(products.categoryId, query.categoryId))
      if (query.q) conditions.push(ilike(products.name, `%${query.q}%`))
      if (query.active === 'true')
        conditions.push(eq(products.isActive, true))
      if (query.active === 'false')
        conditions.push(eq(products.isActive, false))
      if (query.lowStock === 'true') {
        const threshold = Number(query.threshold ?? 5)
        conditions.push(
          sql`(
            SELECT COUNT(*) FROM stock_items
            WHERE stock_items.product_id = products.id
              AND stock_items.status = 'available'
          ) < ${threshold}`,
        )
      }

      const where = conditions.length ? and(...conditions) : undefined
      const rows = await db
        .select({
          id: products.id,
          categoryId: products.categoryId,
          name: products.name,
          slug: products.slug,
          description: products.description,
          price: products.price,
          imageUrl: products.imageUrl,
          soldCount: products.soldCount,
          isActive: products.isActive,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
          availableCount: sql<number>`(
            SELECT COUNT(*)::int FROM stock_items
            WHERE stock_items.product_id = products.id
              AND stock_items.status = 'available'
          )`,
        })
        .from(products)
        .where(where)
        .orderBy(desc(products.createdAt))
        .limit(Math.min(Number(query.limit ?? 50), 200))
      return { items: rows }
    },
    {
      query: t.Object({
        categoryId: t.Optional(t.String()),
        q: t.Optional(t.String()),
        active: t.Optional(t.Union([t.Literal('true'), t.Literal('false')])),
        lowStock: t.Optional(t.Union([t.Literal('true'), t.Literal('false')])),
        threshold: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
      requireAdmin: true,
    },
  )
  .get(
    '/:id',
    async ({ params, status }) => {
      const rows = await db
        .select()
        .from(products)
        .where(eq(products.id, params.id))
        .limit(1)
      if (rows.length === 0) return status(404, { error: 'not_found' })
      return { item: rows[0] }
    },
    { requireAdmin: true },
  )
  .post(
    '/',
    async ({ body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      if (body.categoryId) {
        const cat = await db
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, body.categoryId))
          .limit(1)
        if (cat.length === 0)
          return status(400, { error: 'invalid_category' })
      }
      const slug = body.slug ? slugify(body.slug) : ensureSlug(body.name, 'product')
      const dupe = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.slug, slug))
        .limit(1)
      if (dupe.length > 0) return status(409, { error: 'slug_taken', slug })

      const [row] = await db
        .insert(products)
        .values({
          name: body.name,
          slug,
          categoryId: body.categoryId ?? null,
          description: body.description ?? null,
          price: formatPrice(body.price),
          isActive: body.isActive ?? true,
        })
        .returning()
      await recordAdminAction({
        adminId: user.id,
        action: 'product.create',
        target: row!.id,
        payload: { name: row!.name, slug: row!.slug, price: row!.price },
        ip: clientIp,
      })
      return { item: row }
    },
    { body: ProductCreate, requireAdmin: true },
  )
  .patch(
    '/:id',
    async ({ params, body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const existing = await db
        .select()
        .from(products)
        .where(eq(products.id, params.id))
        .limit(1)
      if (existing.length === 0) return status(404, { error: 'not_found' })

      const patch: Partial<typeof products.$inferInsert> = { updatedAt: new Date() }
      if (body.name !== undefined) patch.name = body.name
      if (body.slug !== undefined) {
        const slug = slugify(body.slug)
        if (slug !== existing[0]!.slug) {
          const dupe = await db
            .select({ id: products.id })
            .from(products)
            .where(eq(products.slug, slug))
            .limit(1)
          if (dupe.length > 0 && dupe[0]!.id !== params.id) {
            return status(409, { error: 'slug_taken', slug })
          }
          patch.slug = slug
        }
      }
      if (body.categoryId !== undefined) patch.categoryId = body.categoryId
      if (body.description !== undefined) patch.description = body.description
      if (body.price !== undefined) patch.price = formatPrice(body.price)
      if (body.isActive !== undefined) patch.isActive = body.isActive

      const [row] = await db
        .update(products)
        .set(patch)
        .where(eq(products.id, params.id))
        .returning()
      await recordAdminAction({
        adminId: user.id,
        action: 'product.update',
        target: params.id,
        payload: patch,
        ip: clientIp,
      })
      return { item: row }
    },
    { body: ProductPatch, requireAdmin: true },
  )
  .delete(
    '/:id',
    async ({ params, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      let row: typeof products.$inferSelect | undefined
      try {
        ;[row] = await db
          .delete(products)
          .where(eq(products.id, params.id))
          .returning()
      } catch (e) {
        if (
          typeof e === 'object' &&
          e !== null &&
          (e as { code?: string }).code === '23503'
        ) {
          return status(409, {
            error: 'product_has_orders',
            hint: 'ลบไม่ได้เพราะเคยมีคนซื้อสินค้านี้แล้ว — แนะนำให้ "ปิดขาย" แทนเพื่อรักษาประวัติออเดอร์',
          })
        }
        throw e
      }
      if (!row) return status(404, { error: 'not_found' })
      if (row.imageUrl) await deleteProductImage(row.imageUrl)
      await recordAdminAction({
        adminId: user.id,
        action: 'product.delete',
        target: params.id,
        payload: { name: row.name },
        ip: clientIp,
      })
      return { ok: true }
    },
    { requireAdmin: true },
  )
  .put(
    '/:id/image',
    async ({ params, body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const existing = await db
        .select()
        .from(products)
        .where(eq(products.id, params.id))
        .limit(1)
      if (existing.length === 0) return status(404, { error: 'not_found' })

      const saved = await saveProductImage(body.image)
      if (existing[0]!.imageUrl) await deleteProductImage(existing[0]!.imageUrl)

      const [row] = await db
        .update(products)
        .set({ imageUrl: saved.publicPath, updatedAt: new Date() })
        .where(eq(products.id, params.id))
        .returning()
      await recordAdminAction({
        adminId: user.id,
        action: 'product.image.update',
        target: params.id,
        payload: { imageUrl: saved.publicPath, bytes: saved.bytes },
        ip: clientIp,
      })
      return { item: row }
    },
    {
      body: t.Object({
        image: t.File({ type: ['image/jpeg', 'image/png', 'image/webp'], maxSize: '2m' }),
      }),
      requireAdmin: true,
    },
  )
  .delete(
    '/:id/image',
    async ({ params, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const existing = await db
        .select()
        .from(products)
        .where(eq(products.id, params.id))
        .limit(1)
      if (existing.length === 0) return status(404, { error: 'not_found' })
      if (existing[0]!.imageUrl)
        await deleteProductImage(existing[0]!.imageUrl)
      const [row] = await db
        .update(products)
        .set({ imageUrl: null, updatedAt: new Date() })
        .where(eq(products.id, params.id))
        .returning()
      await recordAdminAction({
        adminId: user.id,
        action: 'product.image.delete',
        target: params.id,
        ip: clientIp,
      })
      return { item: row }
    },
    { requireAdmin: true },
  )
