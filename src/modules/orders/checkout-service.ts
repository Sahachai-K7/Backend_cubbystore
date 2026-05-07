import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import {
  cartItems,
  orderItems,
  orders,
  products,
  stockItems,
  user as userTable,
  walletTransactions,
} from '../../db/schema'
import { sendOrderDeliveryEmail } from '../../lib/email'
import { consumePromo, validatePromo } from '../promo/service'

type CheckoutErrorCode =
  | 'cart_empty'
  | 'product_inactive'
  | 'insufficient_stock'
  | 'insufficient_balance'
  | 'invalid_promo'

export class CheckoutError extends Error {
  code: CheckoutErrorCode
  detail?: unknown
  constructor(code: CheckoutErrorCode, detail?: unknown) {
    super(code)
    this.code = code
    this.detail = detail
  }
}

export type CheckoutResult = {
  orderId: string
  subtotal: string
  discount: string
  total: string
  balanceAfter: string
  itemsCount: number
  promoCode: string | null
}

type PostCommitPayload = {
  orderId: string
  subtotal: string
  discount: string
  total: string
  balanceAfter: string
  email: string
  name: string | null
  items: { productName: string; payload: string }[]
  promoCode: string | null
}

export async function checkout(
  userId: string,
  opts: { promoCode?: string } = {},
): Promise<CheckoutResult> {
  const postCommit = await db.transaction(async (tx): Promise<PostCommitPayload> => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`)

    const cart = await tx
      .select({
        productId: cartItems.productId,
        qty: cartItems.qty,
        productName: products.name,
        productActive: products.isActive,
        unitPrice: products.price,
      })
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .where(eq(cartItems.userId, userId))

    if (cart.length === 0) throw new CheckoutError('cart_empty')

    const inactive = cart.filter((c) => !c.productActive).map((c) => c.productId)
    if (inactive.length > 0) {
      throw new CheckoutError('product_inactive', { productIds: inactive })
    }

    let subtotal = 0
    for (const c of cart) subtotal += Number(c.unitPrice) * c.qty
    const subtotalStr = subtotal.toFixed(2)

    // Apply promo code if provided
    let discount = 0
    let appliedPromoCode: string | null = null
    let appliedPromoId: string | null = null
    if (opts.promoCode && opts.promoCode.trim()) {
      const result = await validatePromo(opts.promoCode, subtotal)
      if (!result.valid) {
        throw new CheckoutError('invalid_promo', { reason: result.error })
      }
      discount = result.discount
      appliedPromoCode = result.promo.code
      appliedPromoId = result.promo.id
    }

    const total = Number((subtotal - discount).toFixed(2))
    const totalStr = total.toFixed(2)
    const discountStr = discount.toFixed(2)

    const balanceRow = await tx
      .select({ s: sql<string>`COALESCE(SUM(amount), 0)::text` })
      .from(walletTransactions)
      .where(eq(walletTransactions.userId, userId))
    const balance = Number(balanceRow[0]?.s ?? 0)
    if (balance < total) {
      throw new CheckoutError('insufficient_balance', {
        required: totalStr,
        balance: balance.toFixed(2),
      })
    }

    if (appliedPromoId) {
      await consumePromo(tx, appliedPromoId)
    }

    const [orderRow] = await tx
      .insert(orders)
      .values({
        userId,
        subtotal: subtotalStr,
        discount: discountStr,
        promoCode: appliedPromoCode,
        total: totalStr,
        status: 'paid',
      })
      .returning()
    const order = orderRow!

    const deliveredItems: { productName: string; payload: string }[] = []

    for (const line of cart) {
      const [orderItem] = await tx
        .insert(orderItems)
        .values({
          orderId: order.id,
          productId: line.productId,
          productNameSnapshot: line.productName,
          qty: line.qty,
          unitPrice: line.unitPrice,
        })
        .returning({ id: orderItems.id })

      const stockRows = await tx
        .select()
        .from(stockItems)
        .where(
          and(
            eq(stockItems.productId, line.productId),
            eq(stockItems.status, 'available'),
          ),
        )
        .for('update', { skipLocked: true })
        .limit(line.qty)

      if (stockRows.length < line.qty) {
        throw new CheckoutError('insufficient_stock', {
          productId: line.productId,
          requested: line.qty,
          available: stockRows.length,
        })
      }

      const ids = stockRows.map((s) => s.id)
      const now = new Date()
      await tx
        .update(stockItems)
        .set({
          status: 'sold',
          orderItemId: orderItem!.id,
          soldAt: now,
        })
        .where(inArray(stockItems.id, ids))

      await tx
        .update(products)
        .set({
          soldCount: sql`${products.soldCount} + ${line.qty}`,
          updatedAt: now,
        })
        .where(eq(products.id, line.productId))

      for (const s of stockRows) {
        deliveredItems.push({
          productName: line.productName,
          payload: s.payload,
        })
      }
    }

    const balanceAfter = (balance - total).toFixed(2)
    await tx.insert(walletTransactions).values({
      userId,
      type: 'purchase',
      amount: (-total).toFixed(2),
      balanceAfter,
      refId: order.id,
      note: `Order ${order.id.slice(0, 8)} (${cart.length} รายการ)`,
    })

    await tx.delete(cartItems).where(eq(cartItems.userId, userId))

    const u = await tx
      .select({ email: userTable.email, name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1)

    return {
      orderId: order.id,
      subtotal: subtotalStr,
      discount: discountStr,
      total: totalStr,
      balanceAfter,
      email: u[0]!.email,
      name: u[0]!.name,
      items: deliveredItems,
      promoCode: appliedPromoCode,
    }
  })

  // Now deliver — outside the transaction
  await deliverOrder(postCommit.orderId, {
    email: postCommit.email,
    name: postCommit.name,
    total: postCommit.total,
    items: postCommit.items,
  })

  return {
    orderId: postCommit.orderId,
    subtotal: postCommit.subtotal,
    discount: postCommit.discount,
    total: postCommit.total,
    balanceAfter: postCommit.balanceAfter,
    itemsCount: postCommit.items.length,
    promoCode: postCommit.promoCode,
  }
}

export async function deliverOrder(
  orderId: string,
  args: {
    email: string
    name: string | null
    total: string
    items: { productName: string; payload: string }[]
  },
): Promise<{ ok: boolean; error?: string }> {
  const result = await sendOrderDeliveryEmail({
    to: args.email,
    customerName: args.name,
    orderId,
    totalTHB: `฿${args.total}`,
    items: args.items,
  })

  const now = new Date()
  if (result.ok) {
    await db
      .update(orders)
      .set({
        status: 'delivered',
        deliveredAt: now,
        deliveryError: null,
      })
      .where(eq(orders.id, orderId))
    return { ok: true }
  }

  await db
    .update(orders)
    .set({
      status: 'delivery_failed',
      deliveryError: result.error,
    })
    .where(eq(orders.id, orderId))
  return { ok: false, error: result.error }
}
