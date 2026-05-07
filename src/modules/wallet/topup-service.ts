import { and, desc, eq, gt, lte, sql } from 'drizzle-orm'
import { db } from '../../db'
import { topups, walletTransactions } from '../../db/schema'
import { getPaymentConfig, getWebhookConfig } from '../../lib/config-store'
import { buildPromptPayQrDataUrl } from '../../lib/promptpay'

const MAX_AMOUNT = 1_000_000

export class TopupConfigError extends Error {
  reason: 'no_payment_config' | 'no_webhook_config' | 'no_slot_available'
  constructor(reason: 'no_payment_config' | 'no_webhook_config' | 'no_slot_available') {
    super(reason)
    this.reason = reason
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

function buildDeltaCandidates(min: number, max: number): number[] {
  const candidates: number[] = []
  const start = Math.round(min * 100)
  const end = Math.round(max * 100)
  for (let i = start; i <= end; i++) {
    if (i === 0) continue
    candidates.push(i / 100)
  }
  return shuffle(candidates)
}

export async function createTopup(args: {
  userId: string
  baseAmount: number
}): Promise<{
  id: string
  amountBase: string
  amountToPay: string
  expiresAt: Date
  qrPayload: string
  qrDataUrl: string
}> {
  if (!Number.isFinite(args.baseAmount) || args.baseAmount < 1 || args.baseAmount > MAX_AMOUNT) {
    throw new RangeError('invalid_amount')
  }

  const [paymentCfg, webhookCfg] = await Promise.all([
    getPaymentConfig(),
    getWebhookConfig(),
  ])
  if (!paymentCfg) throw new TopupConfigError('no_payment_config')
  if (!webhookCfg) throw new TopupConfigError('no_webhook_config')

  const expiresAt = new Date(Date.now() + webhookCfg.expiryMinutes * 60_000)
  const minDelta = Number(webhookCfg.randomMinDelta)
  const maxDelta = Number(webhookCfg.randomMaxDelta)
  const candidates = buildDeltaCandidates(minDelta, maxDelta)

  const baseAmount = Number(args.baseAmount.toFixed(2))

  for (const delta of candidates) {
    const amountToPay = Number((baseAmount + delta).toFixed(2))
    if (amountToPay <= 0) continue
    try {
      const [row] = await db
        .insert(topups)
        .values({
          userId: args.userId,
          amountBase: baseAmount.toFixed(2),
          amountToPay: amountToPay.toFixed(2),
          expiresAt,
          status: 'pending',
        })
        .returning()
      if (!row) continue
      const { payload, dataUrl } = await buildPromptPayQrDataUrl(
        paymentCfg.promptpayId,
        Number(row.amountToPay),
      )
      return {
        id: row.id,
        amountBase: row.amountBase,
        amountToPay: row.amountToPay,
        expiresAt: row.expiresAt,
        qrPayload: payload,
        qrDataUrl: dataUrl,
      }
    } catch (e) {
      if (isUniqueViolation(e)) continue
      throw e
    }
  }

  throw new TopupConfigError('no_slot_available')
}

function isUniqueViolation(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const code = (e as { code?: unknown }).code
  return code === '23505'
}

export async function getWalletBalance(
  userId: string,
  tx?: typeof db,
): Promise<number> {
  const exec = tx ?? db
  const r = await exec
    .select({ s: sql<string>`COALESCE(SUM(amount), 0)::text` })
    .from(walletTransactions)
    .where(eq(walletTransactions.userId, userId))
  return Number(r[0]?.s ?? 0)
}

export async function expirePendingTopups() {
  await db
    .update(topups)
    .set({ status: 'expired' })
    .where(and(eq(topups.status, 'pending'), lte(topups.expiresAt, new Date())))
}

export async function listMyTopups(userId: string, limit = 20) {
  return db
    .select()
    .from(topups)
    .where(eq(topups.userId, userId))
    .orderBy(desc(topups.createdAt))
    .limit(Math.min(limit, 100))
}

export async function getMyTopup(userId: string, id: string) {
  const rows = await db
    .select()
    .from(topups)
    .where(and(eq(topups.id, id), eq(topups.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

export async function getActivePendingTopupForAmount(amount: string, now: Date) {
  const rows = await db
    .select()
    .from(topups)
    .where(
      and(
        eq(topups.amountToPay, amount),
        eq(topups.status, 'pending'),
        gt(topups.expiresAt, now),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}
