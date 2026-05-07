import { eq, sql } from 'drizzle-orm'
import { db } from '../../db'
import { promoCodes } from '../../db/schema'

export type PromoValidationResult =
  | {
      valid: true
      promo: typeof promoCodes.$inferSelect
      discount: number
      finalTotal: number
    }
  | {
      valid: false
      error:
        | 'not_found'
        | 'inactive'
        | 'expired'
        | 'used_up'
        | 'min_total_not_met'
    }

export async function validatePromo(
  code: string,
  subtotal: number,
): Promise<PromoValidationResult> {
  const normalized = code.trim().toUpperCase()
  const rows = await db
    .select()
    .from(promoCodes)
    .where(eq(promoCodes.code, normalized))
    .limit(1)
  const promo = rows[0]
  if (!promo) return { valid: false, error: 'not_found' }
  if (!promo.isActive) return { valid: false, error: 'inactive' }
  if (promo.expiresAt && promo.expiresAt <= new Date())
    return { valid: false, error: 'expired' }
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses)
    return { valid: false, error: 'used_up' }
  const min = promo.minTotal ? Number(promo.minTotal) : 0
  if (subtotal < min) return { valid: false, error: 'min_total_not_met' }

  const value = Number(promo.value)
  const rawDiscount =
    promo.type === 'percent' ? (subtotal * value) / 100 : value
  // Round down to 2 decimals, never exceed subtotal
  const discount = Math.min(
    subtotal,
    Math.floor(rawDiscount * 100) / 100,
  )
  return {
    valid: true,
    promo,
    discount,
    finalTotal: Number((subtotal - discount).toFixed(2)),
  }
}

type DbOrTx = Pick<typeof db, 'update'>

/**
 * Increment usedCount atomically inside a transaction. Caller can pass tx or db.
 * Throws if maxUses race fails.
 */
export async function consumePromo(
  tx: DbOrTx,
  promoId: string,
): Promise<void> {
  const [row] = await tx
    .update(promoCodes)
    .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
    .where(eq(promoCodes.id, promoId))
    .returning({ usedCount: promoCodes.usedCount, maxUses: promoCodes.maxUses })
  if (!row) throw new Error('promo_consume_failed')
  if (row.maxUses !== null && row.usedCount > row.maxUses) {
    throw new Error('promo_used_up')
  }
}
