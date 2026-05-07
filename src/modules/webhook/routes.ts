import { Elysia } from 'elysia'
import { and, eq, gt, sql } from 'drizzle-orm'
import { db } from '../../db'
import { topups, walletTransactions, webhookEvents } from '../../db/schema'
import { getWebhookConfig } from '../../lib/config-store'
import { verifyApiKey } from '../../lib/api-key'
import { getClientIp } from '../../lib/client-ip'

type LogParams = {
  rawBody: string
  headers: Record<string, string>
  sourceIp: string | null
  status:
    | 'matched'
    | 'unmatched'
    | 'rejected_filter'
    | 'rejected_invalid_key'
    | 'invalid_payload'
  parsedAmount?: string | null
  matchedTopupId?: string | null
}

async function logEvent(p: LogParams) {
  await db.insert(webhookEvents).values({
    rawBody: p.rawBody,
    headers: p.headers,
    sourceIp: p.sourceIp,
    parsedAmount: p.parsedAmount ?? null,
    status: p.status,
    matchedTopupId: p.matchedTopupId ?? null,
  })
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((v, k) => {
    if (k.toLowerCase() === 'x-api-key') {
      out[k] = '<redacted>'
      return
    }
    out[k] = v
  })
  return out
}

export const webhookRoutes = new Elysia({ name: 'webhook-routes' }).post(
  '/api/webhook/payment',
  async ({ request, server, set }) => {
    set.headers['cache-control'] = 'no-store'
    const rawBody = await request.text()
    const headerObj = headersToObject(request.headers)
    const sourceIp = getClientIp(request, server) || null
    const apiKey = request.headers.get('x-api-key')

    const config = await getWebhookConfig()
    if (!config) {
      await logEvent({
        rawBody,
        headers: headerObj,
        sourceIp,
        status: 'rejected_invalid_key',
      })
      set.status = 503
      return { ok: false, error: 'webhook_not_initialized' }
    }

    if (!verifyApiKey(apiKey, config.apiKeyHash)) {
      await logEvent({
        rawBody,
        headers: headerObj,
        sourceIp,
        status: 'rejected_invalid_key',
      })
      set.status = 401
      return { ok: false, error: 'invalid_api_key' }
    }

    const mustContain = (config.mustContain ?? []) as string[]
    const missing = mustContain.filter((kw) => !rawBody.includes(kw))
    if (missing.length > 0) {
      await logEvent({
        rawBody,
        headers: headerObj,
        sourceIp,
        status: 'rejected_filter',
      })
      set.status = 202
      return { ok: false, error: 'rejected_filter', missingKeywords: missing }
    }

    let parsedAmountNum: number | null = null
    if (rawBody.length > 4000) {
      parsedAmountNum = null
    } else {
      try {
        const re = new RegExp(config.amountRegex)
        const m = re.exec(rawBody)
        if (m && m[1]) {
          parsedAmountNum = Number(m[1].replace(/,/g, ''))
          if (!Number.isFinite(parsedAmountNum)) parsedAmountNum = null
        }
      } catch {
        parsedAmountNum = null
      }
    }

    if (parsedAmountNum === null || parsedAmountNum <= 0) {
      await logEvent({
        rawBody,
        headers: headerObj,
        sourceIp,
        status: 'invalid_payload',
      })
      set.status = 202
      return { ok: false, error: 'amount_not_parsed' }
    }

    const parsedAmountStr = parsedAmountNum.toFixed(2)
    const now = new Date()

    const result = await db.transaction(async (tx) => {
      const candidate = await tx
        .select()
        .from(topups)
        .where(
          and(
            eq(topups.amountToPay, parsedAmountStr),
            eq(topups.status, 'pending'),
            gt(topups.expiresAt, now),
          ),
        )
        .for('update', { skipLocked: true })
        .limit(1)

      if (candidate.length === 0) return null
      const topup = candidate[0]!

      const balanceRow = await tx
        .select({ s: sql<string>`COALESCE(SUM(amount), 0)::text` })
        .from(walletTransactions)
        .where(eq(walletTransactions.userId, topup.userId))
      const balanceBefore = Number(balanceRow[0]?.s ?? 0)
      const baseAmount = Number(topup.amountBase)
      let newBalance = balanceBefore + baseAmount

      await tx
        .update(topups)
        .set({ status: 'confirmed', confirmedAt: now })
        .where(eq(topups.id, topup.id))

      await tx.insert(walletTransactions).values({
        userId: topup.userId,
        type: 'topup',
        amount: topup.amountBase,
        balanceAfter: newBalance.toFixed(2),
        refId: topup.id,
        note: `Top-up via webhook (paid ${topup.amountToPay})`,
      })

      // Apply first-top-up bonus if enabled and this is user's first topup
      const bonusPercent = Number(process.env.FIRST_TOPUP_BONUS_PERCENT ?? 0)
      const bonusMax = Number(process.env.FIRST_TOPUP_BONUS_MAX ?? 100)
      let bonusApplied = 0
      if (bonusPercent > 0) {
        const priorTopups = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(walletTransactions)
          .where(
            and(
              eq(walletTransactions.userId, topup.userId),
              eq(walletTransactions.type, 'topup'),
            ),
          )
        // After our insert above, count >= 1. If exactly 1 → first ever.
        if (Number(priorTopups[0]?.c ?? 0) === 1) {
          bonusApplied = Math.min(
            bonusMax,
            Math.floor((baseAmount * bonusPercent) / 100 * 100) / 100,
          )
          if (bonusApplied > 0) {
            newBalance = newBalance + bonusApplied
            await tx.insert(walletTransactions).values({
              userId: topup.userId,
              type: 'adjust',
              amount: bonusApplied.toFixed(2),
              balanceAfter: newBalance.toFixed(2),
              refId: topup.id,
              note: `🎁 โบนัสเติมครั้งแรก ${bonusPercent}%`,
            })
          }
        }
      }

      return {
        topupId: topup.id,
        userId: topup.userId,
        amount: topup.amountBase,
        bonus: bonusApplied,
      }
    })

    await logEvent({
      rawBody,
      headers: headerObj,
      sourceIp,
      parsedAmount: parsedAmountStr,
      status: result ? 'matched' : 'unmatched',
      matchedTopupId: result?.topupId,
    })

    if (!result) {
      return { ok: true, matched: false, parsedAmount: parsedAmountStr }
    }
    return {
      ok: true,
      matched: true,
      parsedAmount: parsedAmountStr,
      topupId: result.topupId,
      creditedAmount: result.amount,
    }
  },
)
