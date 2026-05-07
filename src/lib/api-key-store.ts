import { eq } from 'drizzle-orm'
import { db } from '../db'
import { webhookConfig } from '../db/schema'
import { generateApiKey } from './api-key'

const SINGLETON_ID = 1

const DEFAULT_REGEX = '(\\d+\\.\\d{2})'
const DEFAULT_EXPIRY = 15
const DEFAULT_MIN_DELTA = '-0.99'
const DEFAULT_MAX_DELTA = '0.99'

export async function upsertWebhookKey(input: { updatedBy: string; rotate: boolean }) {
  const existing = await db
    .select()
    .from(webhookConfig)
    .where(eq(webhookConfig.id, SINGLETON_ID))
    .limit(1)

  const { plaintext, hash, hint } = generateApiKey()

  if (existing.length === 0) {
    const [row] = await db
      .insert(webhookConfig)
      .values({
        id: SINGLETON_ID,
        apiKeyHash: hash,
        apiKeyHint: hint,
        mustContain: [],
        amountRegex: DEFAULT_REGEX,
        expiryMinutes: DEFAULT_EXPIRY,
        randomMinDelta: DEFAULT_MIN_DELTA,
        randomMaxDelta: DEFAULT_MAX_DELTA,
        updatedBy: input.updatedBy,
      })
      .returning()
    return { row: row!, plaintextOnce: plaintext }
  }

  if (!input.rotate) {
    return { row: existing[0]!, plaintextOnce: null as string | null }
  }

  const [row] = await db
    .update(webhookConfig)
    .set({
      apiKeyHash: hash,
      apiKeyHint: hint,
      updatedBy: input.updatedBy,
      updatedAt: new Date(),
    })
    .where(eq(webhookConfig.id, SINGLETON_ID))
    .returning()
  return { row: row!, plaintextOnce: plaintext }
}
