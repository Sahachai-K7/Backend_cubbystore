import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { categories, products, stockItems } from '../../db/schema'
import { adminGuard, recordAdminAction } from '../../middlewares/admin'
import { ensureSlug, slugify } from '../../lib/slug'

const BulkItem = t.Object({
  name: t.String({ minLength: 1, maxLength: 200 }),
  slug: t.Optional(t.String({ maxLength: 200 })),
  categorySlug: t.Optional(t.String()),
  description: t.Optional(t.Nullable(t.String({ maxLength: 5000 }))),
  price: t.Number({ minimum: 0, maximum: 9_999_999.99 }),
  isActive: t.Optional(t.Boolean()),
  imageUrl: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
  payloads: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 5000 }))),
})

export const adminBulkImportModule = new Elysia({ name: 'admin-bulk-import' })
  .use(adminGuard)
  .post(
    '/api/admin/products/bulk',
    async ({ body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })

      const results: Array<{
        name: string
        status: 'created' | 'skipped' | 'error'
        productId?: string
        slug?: string
        stockAdded?: number
        error?: string
      }> = []

      // Resolve category slugs once (build map)
      const slugSet = new Set<string>()
      for (const it of body.items) if (it.categorySlug) slugSet.add(it.categorySlug)
      const catRows =
        slugSet.size > 0
          ? await db
              .select({ id: categories.id, slug: categories.slug })
              .from(categories)
          : []
      const catMap = new Map(catRows.map((r) => [r.slug, r.id]))

      for (const item of body.items) {
        try {
          const slug = item.slug
            ? slugify(item.slug)
            : ensureSlug(item.name, 'product')
          const categoryId = item.categorySlug
            ? catMap.get(item.categorySlug) ?? null
            : null

          // Check existing slug
          const dupe = await db
            .select({ id: products.id })
            .from(products)
            .where(eq(products.slug, slug))
            .limit(1)
          if (dupe.length > 0) {
            results.push({
              name: item.name,
              status: 'skipped',
              slug,
              error: 'slug_taken',
            })
            continue
          }

          const [row] = await db
            .insert(products)
            .values({
              name: item.name,
              slug,
              categoryId,
              description: item.description ?? null,
              price: item.price.toFixed(2),
              isActive: item.isActive ?? true,
              imageUrl: item.imageUrl ?? null,
            })
            .returning({ id: products.id, slug: products.slug })

          let stockAdded = 0
          if (item.payloads && item.payloads.length > 0) {
            const inserted = await db
              .insert(stockItems)
              .values(
                item.payloads.map((p: string) => ({
                  productId: row!.id,
                  payload: p,
                })),
              )
              .returning({ id: stockItems.id })
            stockAdded = inserted.length
          }

          results.push({
            name: item.name,
            status: 'created',
            productId: row!.id,
            slug: row!.slug,
            stockAdded,
          })
        } catch (e) {
          results.push({
            name: item.name,
            status: 'error',
            error: e instanceof Error ? e.message : 'unknown',
          })
        }
      }

      const created = results.filter((r) => r.status === 'created').length
      await recordAdminAction({
        adminId: user.id,
        action: 'product.bulk_import',
        target: null,
        payload: {
          submitted: body.items.length,
          created,
          skipped: results.filter((r) => r.status === 'skipped').length,
          errors: results.filter((r) => r.status === 'error').length,
        },
        ip: clientIp,
      })

      return { results, summary: { submitted: body.items.length, created } }
    },
    {
      body: t.Object({
        items: t.Array(BulkItem, { maxItems: 200 }),
      }),
      requireAdmin: true,
    },
  )
