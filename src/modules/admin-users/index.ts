import { Elysia, t } from 'elysia'
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '../../db'
import {
  orders,
  session,
  user as userTable,
  walletTransactions,
} from '../../db/schema'
import { adminGuard, recordAdminAction } from '../../middlewares/admin'

const RoleEnum = t.Union([t.Literal('user'), t.Literal('admin')])

const RoleBody = t.Object({ role: RoleEnum })
const AdjustBody = t.Object({
  amount: t.Number({ minimum: -100_000, maximum: 100_000 }),
  note: t.Optional(t.String({ maxLength: 200 })),
})

export const adminUsersModule = new Elysia({ name: 'admin-users' })
  .use(adminGuard)
  .get(
    '/api/admin/users',
    async ({ query, status }) => {
      const conditions = []
      if (query.role) conditions.push(eq(userTable.role, query.role))
      if (query.q && query.q.trim().length > 0) {
        const like = `%${query.q.trim()}%`
        conditions.push(
          or(ilike(userTable.email, like), ilike(userTable.name, like))!,
        )
      }
      const where = conditions.length ? and(...conditions) : undefined

      const limit = Math.min(Number(query.limit ?? 30), 100)
      const page = Math.max(1, Number(query.page ?? 1))
      const offset = (page - 1) * limit

      void status

      const [items, totalRow] = await Promise.all([
        db
          .select({
            id: userTable.id,
            email: userTable.email,
            name: userTable.name,
            role: userTable.role,
            emailVerified: userTable.emailVerified,
            createdAt: userTable.createdAt,
            orderCount: sql<number>`(
              SELECT COUNT(*)::int FROM orders
              WHERE orders.user_id = "user".id
            )`,
            totalSpent: sql<string>`(
              SELECT COALESCE(SUM(total), 0)::text FROM orders
              WHERE orders.user_id = "user".id
            )`,
            walletBalance: sql<string>`(
              SELECT COALESCE(SUM(amount), 0)::text FROM wallet_transactions
              WHERE wallet_transactions.user_id = "user".id
            )`,
          })
          .from(userTable)
          .where(where)
          .orderBy(desc(userTable.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ c: sql<number>`COUNT(*)::int` })
          .from(userTable)
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
        q: t.Optional(t.String()),
        role: t.Optional(RoleEnum),
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
      requireAdmin: true,
    },
  )
  .get(
    '/api/admin/users/:id',
    async ({ params, status }) => {
      const u = await db
        .select()
        .from(userTable)
        .where(eq(userTable.id, params.id))
        .limit(1)
      if (u.length === 0) return status(404, { error: 'not_found' })

      const [recentOrders, recentTxs, sessions, stats] = await Promise.all([
        db
          .select({
            id: orders.id,
            total: orders.total,
            status: orders.status,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .where(eq(orders.userId, params.id))
          .orderBy(desc(orders.createdAt))
          .limit(20),
        db
          .select()
          .from(walletTransactions)
          .where(eq(walletTransactions.userId, params.id))
          .orderBy(desc(walletTransactions.createdAt))
          .limit(20),
        db
          .select({
            id: session.id,
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
            expiresAt: session.expiresAt,
            createdAt: session.createdAt,
          })
          .from(session)
          .where(eq(session.userId, params.id))
          .orderBy(desc(session.createdAt))
          .limit(10),
        db
          .select({
            orderCount: sql<number>`(
              SELECT COUNT(*)::int FROM orders WHERE user_id = ${params.id}
            )`,
            totalSpent: sql<string>`(
              SELECT COALESCE(SUM(total), 0)::text FROM orders WHERE user_id = ${params.id}
            )`,
            walletBalance: sql<string>`(
              SELECT COALESCE(SUM(amount), 0)::text FROM wallet_transactions WHERE user_id = ${params.id}
            )`,
          })
          .from(userTable)
          .where(eq(userTable.id, params.id))
          .limit(1),
      ])

      return {
        user: u[0],
        stats: stats[0] ?? {
          orderCount: 0,
          totalSpent: '0',
          walletBalance: '0',
        },
        orders: recentOrders,
        walletTransactions: recentTxs,
        sessions,
      }
    },
    { requireAdmin: true },
  )
  .patch(
    '/api/admin/users/:id/role',
    async ({ params, body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      if (params.id === user.id && body.role !== 'admin') {
        return status(409, { error: 'cannot_demote_self' })
      }
      const [row] = await db
        .update(userTable)
        .set({ role: body.role, updatedAt: new Date() })
        .where(eq(userTable.id, params.id))
        .returning({ id: userTable.id, email: userTable.email, role: userTable.role })
      if (!row) return status(404, { error: 'not_found' })
      await recordAdminAction({
        adminId: user.id,
        action: 'user.role_change',
        target: params.id,
        payload: { newRole: body.role, email: row.email },
        ip: clientIp,
      })
      return { item: row }
    },
    { body: RoleBody, requireAdmin: true },
  )
  .post(
    '/api/admin/users/:id/wallet-adjust',
    async ({ params, body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      if (body.amount === 0) {
        return status(400, { error: 'zero_amount' })
      }
      const u = await db
        .select({ id: userTable.id, email: userTable.email })
        .from(userTable)
        .where(eq(userTable.id, params.id))
        .limit(1)
      if (u.length === 0) return status(404, { error: 'user_not_found' })

      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${params.id}))`)
        const balanceRow = await tx
          .select({ s: sql<string>`COALESCE(SUM(amount), 0)::text` })
          .from(walletTransactions)
          .where(eq(walletTransactions.userId, params.id))
        const balance = Number(balanceRow[0]?.s ?? 0)
        const newBalance = balance + body.amount
        if (newBalance < 0) {
          throw new Error('would_be_negative')
        }
        const [tx_] = await tx
          .insert(walletTransactions)
          .values({
            userId: params.id,
            type: 'adjust',
            amount: body.amount.toFixed(2),
            balanceAfter: newBalance.toFixed(2),
            note: body.note ?? `Manual adjust by admin ${user.id}`,
          })
          .returning()
        return { tx: tx_!, newBalance: newBalance.toFixed(2) }
      }).catch((e) => {
        if (e instanceof Error && e.message === 'would_be_negative') {
          return null
        }
        throw e
      })

      if (!result)
        return status(409, { error: 'would_be_negative' })

      await recordAdminAction({
        adminId: user.id,
        action: 'user.wallet_adjust',
        target: params.id,
        payload: {
          amount: body.amount.toFixed(2),
          newBalance: result.newBalance,
          note: body.note,
          email: u[0]!.email,
        },
        ip: clientIp,
      })

      return {
        ok: true,
        newBalance: result.newBalance,
        transaction: result.tx,
      }
    },
    { body: AdjustBody, requireAdmin: true },
  )
