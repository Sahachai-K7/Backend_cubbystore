import { Elysia, t } from 'elysia'
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '../../db'
import { orders, user as userTable } from '../../db/schema'
import { adminGuard } from '../../middlewares/admin'

const StatusFilter = t.Union([
  t.Literal('paid'),
  t.Literal('delivered'),
  t.Literal('delivery_failed'),
  t.Literal('refunded'),
])

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export const adminOrdersCsvModule = new Elysia({ name: 'admin-orders-csv' })
  .use(adminGuard)
  .get(
    '/api/admin/orders/export.csv',
    async ({ query, set, status }) => {
      const conditions = []
      if (query.status) conditions.push(eq(orders.status, query.status))
      if (query.from) {
        const d = new Date(query.from)
        if (Number.isNaN(d.getTime())) return status(400, { error: 'invalid_from' })
        conditions.push(gte(orders.createdAt, d))
      }
      if (query.to) {
        const d = new Date(query.to)
        if (Number.isNaN(d.getTime())) return status(400, { error: 'invalid_to' })
        conditions.push(lte(orders.createdAt, d))
      }
      const where = conditions.length ? and(...conditions) : undefined

      const rows = await db
        .select({
          id: orders.id,
          createdAt: orders.createdAt,
          status: orders.status,
          subtotal: orders.subtotal,
          discount: orders.discount,
          promoCode: orders.promoCode,
          total: orders.total,
          deliveredAt: orders.deliveredAt,
          refundedAt: orders.refundedAt,
          userEmail: userTable.email,
          userName: userTable.name,
          itemCount: sql<number>`(
            SELECT COUNT(*)::int FROM order_items WHERE order_items.order_id = orders.id
          )`,
          itemNames: sql<string>`COALESCE((
            SELECT STRING_AGG(product_name_snapshot || ' x' || qty, '; ')
            FROM order_items
            WHERE order_items.order_id = orders.id
          ), '')`,
        })
        .from(orders)
        .leftJoin(userTable, eq(orders.userId, userTable.id))
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(5000)

      const header = [
        'order_id',
        'created_at',
        'status',
        'user_email',
        'user_name',
        'items',
        'item_count',
        'subtotal',
        'discount',
        'promo_code',
        'total',
        'delivered_at',
        'refunded_at',
      ]
      const lines: string[] = [header.join(',')]
      for (const r of rows) {
        lines.push(
          [
            csvEscape(r.id),
            csvEscape(r.createdAt?.toISOString() ?? ''),
            csvEscape(r.status),
            csvEscape(r.userEmail ?? ''),
            csvEscape(r.userName ?? ''),
            csvEscape(r.itemNames ?? ''),
            csvEscape(r.itemCount ?? 0),
            csvEscape(r.subtotal ?? ''),
            csvEscape(r.discount ?? ''),
            csvEscape(r.promoCode ?? ''),
            csvEscape(r.total),
            csvEscape(r.deliveredAt?.toISOString() ?? ''),
            csvEscape(r.refundedAt?.toISOString() ?? ''),
          ].join(','),
        )
      }
      const csv = lines.join('\n') + '\n'

      const filename = `orders-${new Date().toISOString().slice(0, 10)}.csv`
      set.headers['content-type'] = 'text/csv; charset=utf-8'
      set.headers['content-disposition'] = `attachment; filename="${filename}"`
      // BOM helps Excel detect UTF-8 (Thai chars)
      return '﻿' + csv
    },
    {
      query: t.Object({
        status: t.Optional(StatusFilter),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
      requireAdmin: true,
    },
  )
