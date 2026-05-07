import { Elysia, t } from 'elysia'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import { cartItems, products } from '../../db/schema'
import { authContext } from '../../middlewares/auth'

const AddBody = t.Object({
  productId: t.String({ minLength: 1 }),
  qty: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
})

const PatchBody = t.Object({
  qty: t.Integer({ minimum: 0, maximum: 100 }),
})

async function listCart(userId: string) {
  const rows = await db
    .select({
      productId: cartItems.productId,
      qty: cartItems.qty,
      addedAt: cartItems.addedAt,
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
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(eq(cartItems.userId, userId))
    .orderBy(asc(cartItems.addedAt))

  const total = rows.reduce(
    (sum, r) => sum + Number(r.price) * r.qty,
    0,
  )
  return { items: rows, total: total.toFixed(2), count: rows.reduce((s, r) => s + r.qty, 0) }
}

export const cartRoutes = new Elysia({ name: 'cart-routes' })
  .use(authContext)
  .get(
    '/api/me/cart',
    async ({ user, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      return listCart(user.id)
    },
    { requireAuth: true },
  )
  .post(
    '/api/me/cart',
    async ({ body, user, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const product = await db
        .select({
          id: products.id,
          isActive: products.isActive,
          available: sql<number>`(
            SELECT COUNT(*)::int FROM stock_items
            WHERE stock_items.product_id = products.id
              AND stock_items.status = 'available'
          )`,
        })
        .from(products)
        .where(eq(products.id, body.productId))
        .limit(1)
      if (product.length === 0) return status(404, { error: 'product_not_found' })
      if (!product[0]!.isActive)
        return status(409, { error: 'product_inactive' })

      const addQty = body.qty ?? 1
      const existing = await db
        .select()
        .from(cartItems)
        .where(
          and(
            eq(cartItems.userId, user.id),
            eq(cartItems.productId, body.productId),
          ),
        )
        .limit(1)

      const newQty = (existing[0]?.qty ?? 0) + addQty
      if (newQty > Number(product[0]!.available)) {
        return status(409, {
          error: 'insufficient_stock',
          available: Number(product[0]!.available),
        })
      }

      if (existing.length === 0) {
        await db
          .insert(cartItems)
          .values({ userId: user.id, productId: body.productId, qty: newQty })
      } else {
        await db
          .update(cartItems)
          .set({ qty: newQty })
          .where(
            and(
              eq(cartItems.userId, user.id),
              eq(cartItems.productId, body.productId),
            ),
          )
      }
      return listCart(user.id)
    },
    { body: AddBody, requireAuth: true },
  )
  .patch(
    '/api/me/cart/:productId',
    async ({ params, body, user, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      if (body.qty === 0) {
        await db
          .delete(cartItems)
          .where(
            and(
              eq(cartItems.userId, user.id),
              eq(cartItems.productId, params.productId),
            ),
          )
        return listCart(user.id)
      }
      const available = await db
        .select({
          c: sql<number>`(
            SELECT COUNT(*)::int FROM stock_items
            WHERE stock_items.product_id = ${params.productId}
              AND stock_items.status = 'available'
          )`,
        })
        .from(products)
        .where(eq(products.id, params.productId))
        .limit(1)
      if (available.length === 0)
        return status(404, { error: 'product_not_found' })
      if (body.qty > Number(available[0]!.c)) {
        return status(409, {
          error: 'insufficient_stock',
          available: Number(available[0]!.c),
        })
      }
      const updated = await db
        .update(cartItems)
        .set({ qty: body.qty })
        .where(
          and(
            eq(cartItems.userId, user.id),
            eq(cartItems.productId, params.productId),
          ),
        )
        .returning()
      if (updated.length === 0) return status(404, { error: 'not_in_cart' })
      return listCart(user.id)
    },
    { body: PatchBody, requireAuth: true },
  )
  .delete(
    '/api/me/cart/:productId',
    async ({ params, user, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      await db
        .delete(cartItems)
        .where(
          and(
            eq(cartItems.userId, user.id),
            eq(cartItems.productId, params.productId),
          ),
        )
      return listCart(user.id)
    },
    { requireAuth: true },
  )
  .delete(
    '/api/me/cart',
    async ({ user, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      await db.delete(cartItems).where(eq(cartItems.userId, user.id))
      return listCart(user.id)
    },
    { requireAuth: true },
  )
