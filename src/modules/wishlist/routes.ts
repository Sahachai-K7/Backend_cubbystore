import { Elysia, t } from 'elysia'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import { products, wishlists } from '../../db/schema'
import { authContext } from '../../middlewares/auth'

export const wishlistRoutes = new Elysia({ name: 'wishlist' })
  .use(authContext)
  .get(
    '/api/me/wishlist',
    async ({ user, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const items = await db
        .select({
          productId: wishlists.productId,
          createdAt: wishlists.createdAt,
          notifiedAt: wishlists.notifiedAt,
          name: products.name,
          slug: products.slug,
          price: products.price,
          imageUrl: products.imageUrl,
          isActive: products.isActive,
          availableCount: sql<number>`(
            SELECT COUNT(*)::int FROM stock_items
            WHERE stock_items.product_id = products.id
              AND stock_items.status = 'available'
          )`,
        })
        .from(wishlists)
        .innerJoin(products, eq(wishlists.productId, products.id))
        .where(eq(wishlists.userId, user.id))
        .orderBy(desc(wishlists.createdAt))
      return { items }
    },
    { requireAuth: true },
  )
  .post(
    '/api/me/wishlist',
    async ({ body, user, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const exists = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, body.productId))
        .limit(1)
      if (exists.length === 0) return status(404, { error: 'product_not_found' })
      try {
        await db.insert(wishlists).values({
          userId: user.id,
          productId: body.productId,
        })
      } catch (e) {
        // Already in wishlist — idempotent
        if (
          typeof e !== 'object' ||
          e === null ||
          (e as { code?: string }).code !== '23505'
        ) {
          throw e
        }
      }
      return { ok: true }
    },
    {
      body: t.Object({ productId: t.String({ minLength: 1 }) }),
      requireAuth: true,
    },
  )
  .delete(
    '/api/me/wishlist/:productId',
    async ({ params, user, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      await db
        .delete(wishlists)
        .where(
          and(
            eq(wishlists.userId, user.id),
            eq(wishlists.productId, params.productId),
          ),
        )
      return { ok: true }
    },
    { requireAuth: true },
  )
