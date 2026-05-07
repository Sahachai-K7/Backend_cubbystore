import { Elysia, t } from 'elysia'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import { products, stockItems } from '../../db/schema'
import { adminGuard, recordAdminAction } from '../../middlewares/admin'

const StockBulkAdd = t.Object({
  payloads: t.Union([
    t.String({ minLength: 1, maxLength: 100_000 }),
    t.Array(t.String({ minLength: 1, maxLength: 5000 }), { maxItems: 1000 }),
  ]),
})

function splitPayloads(input: string | string[]): string[] {
  const lines = Array.isArray(input)
    ? input
    : input.split(/\r?\n/)
  return lines.map((s) => s.trim()).filter((s) => s.length > 0)
}

export const adminStock = new Elysia({ prefix: '/api/admin/products/:id/stock' })
  .use(adminGuard)
  .get(
    '/summary',
    async ({ params, status }) => {
      const exists = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, params.id))
        .limit(1)
      if (exists.length === 0) return status(404, { error: 'product_not_found' })

      const rows = await db
        .select({
          status: stockItems.status,
          count: sql<number>`count(*)::int`,
        })
        .from(stockItems)
        .where(eq(stockItems.productId, params.id))
        .groupBy(stockItems.status)
      const summary = { available: 0, sold: 0 }
      for (const r of rows) {
        if (r.status === 'available') summary.available = Number(r.count)
        if (r.status === 'sold') summary.sold = Number(r.count)
      }
      return summary
    },
    { requireAdmin: true },
  )
  .get(
    '/',
    async ({ params, query, status }) => {
      const exists = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, params.id))
        .limit(1)
      if (exists.length === 0) return status(404, { error: 'product_not_found' })

      const conditions = [eq(stockItems.productId, params.id)]
      if (query.status === 'available')
        conditions.push(eq(stockItems.status, 'available'))
      if (query.status === 'sold')
        conditions.push(eq(stockItems.status, 'sold'))
      const rows = await db
        .select()
        .from(stockItems)
        .where(and(...conditions))
        .orderBy(desc(stockItems.createdAt))
        .limit(Math.min(Number(query.limit ?? 200), 1000))
      return { items: rows }
    },
    {
      query: t.Object({
        status: t.Optional(
          t.Union([t.Literal('available'), t.Literal('sold')]),
        ),
        limit: t.Optional(t.String()),
      }),
      requireAdmin: true,
    },
  )
  .post(
    '/',
    async ({ params, body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const exists = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, params.id))
        .limit(1)
      if (exists.length === 0) return status(404, { error: 'product_not_found' })

      const payloads = splitPayloads(body.payloads)
      if (payloads.length === 0)
        return status(400, { error: 'no_payloads' })

      const inserted = await db
        .insert(stockItems)
        .values(payloads.map((p) => ({ productId: params.id, payload: p })))
        .returning({ id: stockItems.id })
      await recordAdminAction({
        adminId: user.id,
        action: 'stock.bulk_add',
        target: params.id,
        payload: { count: inserted.length },
        ip: clientIp,
      })

      // Fire restock notifications in the background — don't await/block response
      void import('../wishlist/notify').then(({ notifyRestockSubscribers }) =>
        notifyRestockSubscribers(params.id).catch((err) =>
          console.error('[restock notify]', err),
        ),
      )

      return { added: inserted.length }
    },
    { body: StockBulkAdd, requireAdmin: true },
  )
  .delete(
    '/:stockId',
    async ({ params, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const [row] = await db
        .delete(stockItems)
        .where(
          and(
            eq(stockItems.id, params.stockId),
            eq(stockItems.productId, params.id),
            eq(stockItems.status, 'available'),
          ),
        )
        .returning({ id: stockItems.id })
      if (!row)
        return status(404, { error: 'not_found_or_already_sold' })
      await recordAdminAction({
        adminId: user.id,
        action: 'stock.delete',
        target: params.stockId,
        payload: { productId: params.id },
        ip: clientIp ?? null,
      })
      return { ok: true }
    },
    { requireAdmin: true },
  )
