import { Elysia, t } from 'elysia'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import {
  orderItems,
  orders,
  products,
  stockItems,
  walletTransactions,
} from '../../db/schema'
import { adminGuard, recordAdminAction } from '../../middlewares/admin'

const RefundBody = t.Object({
  restoreStock: t.Optional(t.Boolean()),
  reason: t.Optional(t.String({ maxLength: 500 })),
})

export const refundRoutes = new Elysia({ name: 'admin-refund' })
  .use(adminGuard)
  .post(
    '/api/admin/orders/:id/refund',
    async ({ params, body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })

      try {
        const result = await db.transaction(async (tx) => {
          const orderRow = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, params.id))
            .for('update')
            .limit(1)
          if (orderRow.length === 0) throw new Error('not_found')
          const order = orderRow[0]!
          if (order.status === 'refunded') throw new Error('already_refunded')

          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${order.userId}))`,
          )

          // Fetch lines + their stock items
          const lines = await tx
            .select({ id: orderItems.id, productId: orderItems.productId, qty: orderItems.qty })
            .from(orderItems)
            .where(eq(orderItems.orderId, order.id))

          // Compute refunded balance: get current balance + add order.total
          const balanceRow = await tx
            .select({ s: sql<string>`COALESCE(SUM(amount), 0)::text` })
            .from(walletTransactions)
            .where(eq(walletTransactions.userId, order.userId))
          const balance = Number(balanceRow[0]?.s ?? 0)
          const refundAmount = Number(order.total)
          const newBalance = (balance + refundAmount).toFixed(2)

          // Mark order refunded
          const now = new Date()
          await tx
            .update(orders)
            .set({
              status: 'refunded',
              refundedAt: now,
              refundReason: body.reason ?? null,
            })
            .where(eq(orders.id, order.id))

          // Insert wallet refund tx
          await tx.insert(walletTransactions).values({
            userId: order.userId,
            type: 'refund',
            amount: refundAmount.toFixed(2),
            balanceAfter: newBalance,
            refId: order.id,
            note: body.reason
              ? `Refund order ${order.id.slice(0, 8)}: ${body.reason}`
              : `Refund order ${order.id.slice(0, 8)}`,
          })

          // Optionally restore stock
          let restoredCount = 0
          if (body.restoreStock) {
            for (const line of lines) {
              const restored = await tx
                .update(stockItems)
                .set({ status: 'available', orderItemId: null, soldAt: null })
                .where(eq(stockItems.orderItemId, line.id))
                .returning({ id: stockItems.id })
              restoredCount += restored.length

              if (restored.length > 0) {
                await tx
                  .update(products)
                  .set({
                    soldCount: sql`GREATEST(0, ${products.soldCount} - ${restored.length})`,
                    updatedAt: now,
                  })
                  .where(eq(products.id, line.productId))
              }
            }
          }

          return { orderId: order.id, refundAmount: refundAmount.toFixed(2), newBalance, restoredCount }
        })

        await recordAdminAction({
          adminId: user.id,
          action: 'order.refund',
          target: params.id,
          payload: {
            amount: result.refundAmount,
            restoreStock: !!body.restoreStock,
            restoredCount: result.restoredCount,
            reason: body.reason,
          },
          ip: clientIp,
        })

        return { ok: true, ...result }
      } catch (e) {
        if (e instanceof Error) {
          if (e.message === 'not_found') return status(404, { error: 'not_found' })
          if (e.message === 'already_refunded')
            return status(409, { error: 'already_refunded' })
        }
        throw e
      }
    },
    { body: RefundBody, requireAdmin: true },
  )
