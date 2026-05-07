import { Elysia, t } from 'elysia'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import {
  orderItems,
  orders,
  products,
  reviews,
  user as userTable,
} from '../../db/schema'
import { authContext } from '../../middlewares/auth'
import { adminGuard, recordAdminAction } from '../../middlewares/admin'

const ReviewCreateBody = t.Object({
  orderItemId: t.String({ minLength: 1 }),
  rating: t.Integer({ minimum: 1, maximum: 5 }),
  comment: t.Optional(t.Nullable(t.String({ maxLength: 1000 }))),
})

export const publicReviews = new Elysia({ name: 'public-reviews' }).get(
  '/api/products/:slug/reviews',
  async ({ params, query, status }) => {
    const product = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, params.slug))
      .limit(1)
    if (product.length === 0) return status(404, { error: 'product_not_found' })
    const productId = product[0]!.id
    const limit = Math.min(Number(query.limit ?? 20), 100)
    const page = Math.max(1, Number(query.page ?? 1))
    const offset = (page - 1) * limit

    const [items, totalRow, summary] = await Promise.all([
      db
        .select({
          id: reviews.id,
          rating: reviews.rating,
          comment: reviews.comment,
          createdAt: reviews.createdAt,
          userName: userTable.name,
        })
        .from(reviews)
        .leftJoin(userTable, eq(reviews.userId, userTable.id))
        .where(
          and(
            eq(reviews.productId, productId),
            eq(reviews.deletedByAdmin, false),
          ),
        )
        .orderBy(desc(reviews.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(reviews)
        .where(
          and(
            eq(reviews.productId, productId),
            eq(reviews.deletedByAdmin, false),
          ),
        ),
      db
        .select({
          avg: sql<string>`COALESCE(AVG(rating)::numeric(3,2), 0)::text`,
          count: sql<number>`count(*)::int`,
        })
        .from(reviews)
        .where(
          and(
            eq(reviews.productId, productId),
            eq(reviews.deletedByAdmin, false),
          ),
        ),
    ])

    return {
      items,
      total: Number(totalRow[0]?.c ?? 0),
      page,
      limit,
      summary: {
        avg: Number(summary[0]?.avg ?? 0),
        count: Number(summary[0]?.count ?? 0),
      },
    }
  },
  {
    query: t.Object({
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
    }),
  },
)

export const userReviews = new Elysia({ name: 'user-reviews' })
  .use(authContext)
  .get(
    '/api/me/reviewable',
    async ({ user, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const rows = await db
        .select({
          orderItemId: orderItems.id,
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          productNameSnapshot: orderItems.productNameSnapshot,
          productSlug: products.slug,
          deliveredAt: orders.deliveredAt,
          existingReviewId: reviews.id,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .leftJoin(products, eq(orderItems.productId, products.id))
        .leftJoin(
          reviews,
          and(
            eq(reviews.orderItemId, orderItems.id),
            eq(reviews.userId, user.id),
          ),
        )
        .where(
          and(eq(orders.userId, user.id), eq(orders.status, 'delivered')),
        )
        .orderBy(desc(orders.createdAt))
      return { items: rows }
    },
    { requireAuth: true },
  )
  .post(
    '/api/me/reviews',
    async ({ body, user, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })

      const lineRows = await db
        .select({
          id: orderItems.id,
          productId: orderItems.productId,
          orderUserId: orders.userId,
          orderStatus: orders.status,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(eq(orderItems.id, body.orderItemId))
        .limit(1)
      if (lineRows.length === 0)
        return status(404, { error: 'order_item_not_found' })
      const line = lineRows[0]!
      if (line.orderUserId !== user.id)
        return status(403, { error: 'not_your_order' })
      if (line.orderStatus !== 'delivered')
        return status(409, { error: 'order_not_delivered' })

      const existing = await db
        .select({ id: reviews.id })
        .from(reviews)
        .where(
          and(
            eq(reviews.userId, user.id),
            eq(reviews.orderItemId, body.orderItemId),
          ),
        )
        .limit(1)
      if (existing.length > 0)
        return status(409, { error: 'already_reviewed' })

      const [row] = await db
        .insert(reviews)
        .values({
          productId: line.productId,
          userId: user.id,
          orderItemId: body.orderItemId,
          rating: body.rating,
          comment: body.comment ?? null,
        })
        .returning()
      return { item: row }
    },
    { body: ReviewCreateBody, requireAuth: true },
  )

export const adminReviews = new Elysia({ name: 'admin-reviews' })
  .use(adminGuard)
  .get(
    '/api/admin/reviews',
    async ({ query }) => {
      const conditions: ReturnType<typeof eq>[] = []
      if (query.productId) conditions.push(eq(reviews.productId, query.productId))
      if (query.deleted === 'true')
        conditions.push(eq(reviews.deletedByAdmin, true))
      if (query.deleted === 'false')
        conditions.push(eq(reviews.deletedByAdmin, false))
      const where = conditions.length ? and(...conditions) : undefined
      const limit = Math.min(Number(query.limit ?? 30), 100)
      const page = Math.max(1, Number(query.page ?? 1))
      const offset = (page - 1) * limit

      const [items, totalRow] = await Promise.all([
        db
          .select({
            id: reviews.id,
            productId: reviews.productId,
            productName: products.name,
            productSlug: products.slug,
            userId: reviews.userId,
            userName: userTable.name,
            userEmail: userTable.email,
            rating: reviews.rating,
            comment: reviews.comment,
            deletedByAdmin: reviews.deletedByAdmin,
            createdAt: reviews.createdAt,
          })
          .from(reviews)
          .leftJoin(products, eq(reviews.productId, products.id))
          .leftJoin(userTable, eq(reviews.userId, userTable.id))
          .where(where)
          .orderBy(desc(reviews.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(reviews)
          .where(where),
      ])
      return {
        items,
        total: Number(totalRow[0]?.c ?? 0),
        page,
        limit,
      }
    },
    {
      query: t.Object({
        productId: t.Optional(t.String()),
        deleted: t.Optional(
          t.Union([t.Literal('true'), t.Literal('false')]),
        ),
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
      requireAdmin: true,
    },
  )
  .delete(
    '/api/admin/reviews/:id',
    async ({ params, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const [row] = await db
        .update(reviews)
        .set({ deletedByAdmin: true })
        .where(
          and(
            eq(reviews.id, params.id),
            eq(reviews.deletedByAdmin, false),
          ),
        )
        .returning({ id: reviews.id, productId: reviews.productId })
      if (!row) return status(404, { error: 'not_found_or_already_deleted' })
      await recordAdminAction({
        adminId: user.id,
        action: 'review.delete',
        target: params.id,
        payload: { productId: row.productId },
        ip: clientIp,
      })
      return { ok: true }
    },
    { requireAdmin: true },
  )
  .post(
    '/api/admin/reviews/:id/restore',
    async ({ params, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const [row] = await db
        .update(reviews)
        .set({ deletedByAdmin: false })
        .where(
          and(
            eq(reviews.id, params.id),
            eq(reviews.deletedByAdmin, true),
          ),
        )
        .returning({ id: reviews.id })
      if (!row) return status(404, { error: 'not_deleted' })
      await recordAdminAction({
        adminId: user.id,
        action: 'review.restore',
        target: params.id,
        ip: clientIp,
      })
      return { ok: true }
    },
    { requireAdmin: true },
  )

