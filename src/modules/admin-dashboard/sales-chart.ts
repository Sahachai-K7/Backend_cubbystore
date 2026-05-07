import { Elysia, t } from 'elysia'
import { and, gte, ne, sql } from 'drizzle-orm'
import { db } from '../../db'
import { orders } from '../../db/schema'
import { adminGuard } from '../../middlewares/admin'

const TZ = 'Asia/Bangkok'

/** Format a Date as YYYY-MM-DD in the configured business timezone. */
function dateKeyInBangkok(d: Date): string {
  // 'en-CA' yields YYYY-MM-DD which matches Postgres DATE() output.
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

export const adminSalesChartModule = new Elysia({ name: 'admin-sales-chart' })
  .use(adminGuard)
  .get(
    '/api/admin/dashboard/sales-chart',
    async ({ query }) => {
      const days = Math.max(7, Math.min(Number(query.days ?? 30), 90))

      // Window starts at midnight Bangkok-time, `days` ago. We bound on UTC
      // timestamps because that's how Postgres stores them; pulling a few
      // hours of slack on either side is fine — the GROUP BY normalizes.
      const since = new Date()
      since.setDate(since.getDate() - days)
      since.setHours(0, 0, 0, 0)

      const rows = await db
        .select({
          date: sql<string>`DATE(${orders.createdAt} AT TIME ZONE ${TZ})::text`,
          revenue: sql<string>`COALESCE(SUM(total), 0)::text`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(orders)
        .where(
          and(
            gte(orders.createdAt, since),
            // Refunded orders shouldn't inflate revenue
            ne(orders.status, 'refunded'),
          ),
        )
        .groupBy(sql`DATE(${orders.createdAt} AT TIME ZONE ${TZ})`)
        .orderBy(sql`DATE(${orders.createdAt} AT TIME ZONE ${TZ})`)

      const map = new Map<string, { revenue: string; count: number }>()
      for (const r of rows) {
        map.set(r.date, { revenue: r.revenue, count: Number(r.count) })
      }

      // Fill the day axis using the same Bangkok-day keying so missing days
      // line up exactly with what the SQL returned.
      const filled: Array<{ date: string; revenue: string; count: number }> = []
      const todayKey = dateKeyInBangkok(new Date())
      const todayDate = new Date(todayKey + 'T00:00:00')
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(todayDate)
        d.setDate(todayDate.getDate() - i)
        const key = dateKeyInBangkok(d)
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
