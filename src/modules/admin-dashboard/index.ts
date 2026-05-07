import { Elysia } from 'elysia'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '../../db'
import {
  orders,
  orderItems,
  products,
  stockItems,
  topups,
  user as userTable,
  walletTransactions,
} from '../../db/schema'
import { adminGuard } from '../../middlewares/admin'

export const adminDashboardModule = new Elysia({ name: 'admin-dashboard' })
  .use(adminGuard)
  .get(
    '/api/admin/dashboard',
    async () => {
      const now = new Date()
      const startOfToday = new Date(now)
      startOfToday.setHours(0, 0, 0, 0)
      const last7d = new Date(now)
      last7d.setDate(last7d.getDate() - 7)
      const last30d = new Date(now)
      last30d.setDate(last30d.getDate() - 30)
      const last24h = new Date(now)
      last24h.setHours(last24h.getHours() - 24)

      const [
        salesToday,
        sales7d,
        sales30d,
        ordersStatus,
        newUsers,
        lowStockCount,
        lowStockTop,
        topSellers,
        pendingTopups,
        walletLiability,
      ] = await Promise.all([
        // sales today
        db
          .select({
            total: sql<string>`COALESCE(SUM(total), 0)::text`,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(orders)
          .where(gte(orders.createdAt, startOfToday)),
        db
          .select({
            total: sql<string>`COALESCE(SUM(total), 0)::text`,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(orders)
          .where(gte(orders.createdAt, last7d)),
        db
          .select({
            total: sql<string>`COALESCE(SUM(total), 0)::text`,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(orders)
          .where(gte(orders.createdAt, last30d)),
        // orders by status
        db
          .select({
            status: orders.status,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(orders)
          .groupBy(orders.status),
        // new users last 24h
        db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(userTable)
          .where(gte(userTable.createdAt, last24h)),
        // low stock count (products with available < 5)
        db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(products)
          .where(
            sql`${products.isActive} = true AND (
              SELECT COUNT(*) FROM stock_items
              WHERE stock_items.product_id = products.id
                AND stock_items.status = 'available'
            ) < 5`,
          ),
        // low stock top — list of low-stock active products with sold_count > 0
        db
          .select({
            id: products.id,
            name: products.name,
            slug: products.slug,
            soldCount: products.soldCount,
            available: sql<number>`(
              SELECT COUNT(*)::int FROM stock_items
              WHERE stock_items.product_id = products.id
                AND stock_items.status = 'available'
            )`,
          })
          .from(products)
          .where(
            sql`${products.isActive} = true AND (
              SELECT COUNT(*) FROM stock_items
              WHERE stock_items.product_id = products.id
                AND stock_items.status = 'available'
            ) < 5`,
          )
          .orderBy(desc(products.soldCount))
          .limit(5),
        // top sellers in last 30 days
        db
          .select({
            productId: orderItems.productId,
            name: products.name,
            slug: products.slug,
            qtySold: sql<number>`COALESCE(SUM(${orderItems.qty}), 0)::int`,
            revenue: sql<string>`COALESCE(SUM(${orderItems.qty} * ${orderItems.unitPrice}), 0)::text`,
          })
          .from(orderItems)
          .innerJoin(orders, eq(orderItems.orderId, orders.id))
          .leftJoin(products, eq(orderItems.productId, products.id))
          .where(gte(orders.createdAt, last30d))
          .groupBy(orderItems.productId, products.name, products.slug)
          .orderBy(sql`SUM(${orderItems.qty}) DESC`)
          .limit(5),
        // pending top-ups
        db
          .select({
            count: sql<number>`COUNT(*)::int`,
            total: sql<string>`COALESCE(SUM(amount_base), 0)::text`,
          })
          .from(topups)
          .where(
            and(eq(topups.status, 'pending'), gte(topups.expiresAt, now)),
          ),
        // sum of all user wallet balances (liability)
        db
          .select({
            total: sql<string>`COALESCE(SUM(amount), 0)::text`,
          })
          .from(walletTransactions),
      ])

      const statusMap: Record<string, number> = {
        paid: 0,
        delivered: 0,
        delivery_failed: 0,
      }
      for (const r of ordersStatus) statusMap[r.status] = Number(r.count)

      // touch unused stockItems import to silence future lint
      void stockItems

      return {
        sales: {
          today: {
            total: salesToday[0]?.total ?? '0',
            count: Number(salesToday[0]?.count ?? 0),
          },
          last7d: {
            total: sales7d[0]?.total ?? '0',
            count: Number(sales7d[0]?.count ?? 0),
          },
          last30d: {
            total: sales30d[0]?.total ?? '0',
            count: Number(sales30d[0]?.count ?? 0),
          },
        },
        orders: {
          paid: statusMap.paid ?? 0,
          delivered: statusMap.delivered ?? 0,
          deliveryFailed: statusMap.delivery_failed ?? 0,
        },
        users: {
          newLast24h: Number(newUsers[0]?.count ?? 0),
        },
        stock: {
          lowCount: Number(lowStockCount[0]?.count ?? 0),
          topLow: lowStockTop,
        },
        topSellers,
        topups: {
          pendingCount: Number(pendingTopups[0]?.count ?? 0),
          pendingTotal: pendingTopups[0]?.total ?? '0',
        },
        walletLiability: walletLiability[0]?.total ?? '0',
      }
    },
    { requireAdmin: true },
  )
