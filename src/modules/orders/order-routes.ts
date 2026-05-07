import { Elysia, t } from 'elysia'
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm'
import { db } from '../../db'
import {
  orderItems,
  orders,
  stockItems,
  user as userTable,
} from '../../db/schema'
import { authContext } from '../../middlewares/auth'
import { adminGuard, recordAdminAction } from '../../middlewares/admin'
import { deliverOrder } from './checkout-service'

async function getOrderWithItems(orderId: string) {
  const orderRow = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
  if (orderRow.length === 0) return null

  const lines = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.id))

  const lineIds = lines.map((l) => l.id)
  const stocks =
    lineIds.length > 0
      ? await db
          .select()
          .from(stockItems)
          .where(inArray(stockItems.orderItemId, lineIds))
      : []

  const stockByLine: Record<string, typeof stocks> = {}
  for (const s of stocks) {
    if (!s.orderItemId) continue
    if (!stockByLine[s.orderItemId]) stockByLine[s.orderItemId] = []
    stockByLine[s.orderItemId]!.push(s)
  }

  return {
    order: orderRow[0]!,
    lines: lines.map((l) => ({
      ...l,
      delivered: stockByLine[l.id] ?? [],
    })),
  }
}

export const userOrderRoutes = new Elysia({ name: 'user-orders' })
  .use(authContext)
  .get(
    '/api/me/orders',
    async ({ user, query, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const limit = Math.min(Number(query.limit ?? 20), 100)
      const items = await db
        .select()
        .from(orders)
        .where(eq(orders.userId, user.id))
        .orderBy(desc(orders.createdAt))
        .limit(limit)
      return { items }
    },
    {
      query: t.Object({ limit: t.Optional(t.String()) }),
      requireAuth: true,
    },
  )
  .get(
    '/api/me/orders/:id',
    async ({ params, user, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const data = await getOrderWithItems(params.id)
      if (!data) return status(404, { error: 'not_found' })
      if (data.order.userId !== user.id)
        return status(404, { error: 'not_found' })
      return data
    },
    { requireAuth: true },
  )

const StatusFilter = t.Union([
  t.Literal('paid'),
  t.Literal('delivered'),
  t.Literal('delivery_failed'),
])

export const adminOrderRoutes = new Elysia({ name: 'admin-orders' })
  .use(adminGuard)
  .get(
    '/api/admin/orders',
    async ({ query, status: respStatus }) => {
      const conditions = []
      if (query.status) conditions.push(eq(orders.status, query.status))
      if (query.userId) conditions.push(eq(orders.userId, query.userId))
      if (query.from) {
        const d = new Date(query.from)
        if (Number.isNaN(d.getTime()))
          return respStatus(400, { error: 'invalid_from' })
        conditions.push(gte(orders.createdAt, d))
      }
      if (query.to) {
        const d = new Date(query.to)
        if (Number.isNaN(d.getTime()))
          return respStatus(400, { error: 'invalid_to' })
        conditions.push(lte(orders.createdAt, d))
      }
      if (query.q && query.q.trim().length > 0) {
        const like = `%${query.q.trim()}%`
        conditions.push(
          or(
            ilike(orders.id, like),
            ilike(userTable.email, like),
            ilike(userTable.name, like),
          )!,
        )
      }
      const where = conditions.length ? and(...conditions) : undefined
      const limit = Math.min(Number(query.limit ?? 30), 100)
      const page = Math.max(1, Number(query.page ?? 1))
      const offset = (page - 1) * limit

      const [items, totalRow] = await Promise.all([
        db
          .select({
            id: orders.id,
            userId: orders.userId,
            userEmail: userTable.email,
            userName: userTable.name,
            total: orders.total,
            status: orders.status,
            deliveredAt: orders.deliveredAt,
            deliveryError: orders.deliveryError,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .leftJoin(userTable, eq(orders.userId, userTable.id))
          .where(where)
          .orderBy(desc(orders.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(orders)
          .leftJoin(userTable, eq(orders.userId, userTable.id))
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
        status: t.Optional(StatusFilter),
        userId: t.Optional(t.String()),
        q: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
      requireAdmin: true,
    },
  )
  .get(
    '/api/admin/orders/:id',
    async ({ params, status }) => {
      const data = await getOrderWithItems(params.id)
      if (!data) return status(404, { error: 'not_found' })
      const u = await db
        .select({ email: userTable.email, name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, data.order.userId))
        .limit(1)
      return {
        ...data,
        customer: u[0] ?? null,
      }
    },
    { requireAdmin: true },
  )
  .post(
    '/api/admin/orders/:id/resend-delivery',
    async ({ params, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const data = await getOrderWithItems(params.id)
      if (!data) return status(404, { error: 'not_found' })
      const u = await db
        .select({ email: userTable.email, name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, data.order.userId))
        .limit(1)
      if (u.length === 0) return status(404, { error: 'user_not_found' })

      const items: { productName: string; payload: string }[] = []
      for (const line of data.lines) {
        for (const s of line.delivered) {
          items.push({
            productName: line.productNameSnapshot,
            payload: s.payload,
          })
        }
      }

      const result = await deliverOrder(params.id, {
        email: u[0]!.email,
        name: u[0]!.name,
        total: data.order.total,
        items,
      })
      await recordAdminAction({
        adminId: user.id,
        action: 'order.resend_delivery',
        target: params.id,
        payload: { ok: result.ok, error: result.error },
        ip: clientIp,
      })
      if (!result.ok) return status(502, { ok: false, error: result.error })
      return { ok: true }
    },
    { requireAdmin: true },
  )
