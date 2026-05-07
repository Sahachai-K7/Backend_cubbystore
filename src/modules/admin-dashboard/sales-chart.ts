import { Elysia, t } from 'elysia'
import { gte, sql } from 'drizzle-orm'
import { db } from '../../db'
import { orders } from '../../db/schema'
import { adminGuard } from '../../middlewares/admin'

export const adminSalesChartModule = new Elysia({ name: 'admin-sales-chart' })
  .use(adminGuard)
  .get(
    '/api/admin/dashboard/sales-chart',
    async ({ query }) => {
      const days = Math.max(7, Math.min(Number(query.days ?? 30), 90))
      const since = new Date()
      since.setDate(since.getDate() - days + 1)
      since.setHours(0, 0, 0, 0)

      const rows = await db
        .select({
          date: sql<string>`DATE(${orders.createdAt})::text`,
          revenue: sql<string>`COALESCE(SUM(total), 0)::text`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(orders)
        .where(gte(orders.createdAt, since))
        .groupBy(sql`DATE(${orders.createdAt})`)
        .orderBy(sql`DATE(${orders.createdAt})`)

      // Fill missing dates with zero
      const map = new Map<string, { revenue: string; count: number }>()
      for (const r of rows) {
        map.set(r.date, { revenue: r.revenue, count: Number(r.count) })
      }

      const filled: Array<{ date: string; revenue: string; count: number }> = []
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(today.getDate() - i)
        const key = d.toISOString().slice(0, 10)
        const e = map.get(key)
        filled.push({
          date: key,
          revenue: e?.revenue ?? '0',
          count: e?.count ?? 0,
        })
      }
      return { days: filled }
    },
    {
      query: t.Object({
        days: t.Optional(t.String()),
      }),
      requireAdmin: true,
    },
  )
