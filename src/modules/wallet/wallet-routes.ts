import { Elysia, t } from 'elysia'
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import { walletTransactions } from '../../db/schema'
import { authContext } from '../../middlewares/auth'

export const walletRoutes = new Elysia({ name: 'wallet-routes' })
  .use(authContext)
  .get(
    '/api/me/wallet',
    async ({ user, query, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const limit = Math.min(Number(query.limit ?? 30), 100)

      const [balanceRow, txs] = await Promise.all([
        db
          .select({ s: sql<string>`COALESCE(SUM(amount), 0)::text` })
          .from(walletTransactions)
          .where(eq(walletTransactions.userId, user.id)),
        db
          .select()
          .from(walletTransactions)
          .where(eq(walletTransactions.userId, user.id))
          .orderBy(desc(walletTransactions.createdAt))
          .limit(limit),
      ])

      return {
        balance: balanceRow[0]?.s ?? '0',
        transactions: txs,
      }
    },
    {
      query: t.Object({ limit: t.Optional(t.String()) }),
      requireAuth: true,
    },
  )
