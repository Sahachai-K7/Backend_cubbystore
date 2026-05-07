import { eq } from 'drizzle-orm'
import { db } from '../db'
import { paymentConfig, webhookConfig } from '../db/schema'

const SINGLETON_ID = 1

export async function getPaymentConfig() {
  const rows = await db
    .select()
    .from(paymentConfig)
    .where(eq(paymentConfig.id, SINGLETON_ID))
    .limit(1)
  return rows[0] ?? null
}

export type UpsertPaymentConfigInput = {
  promptpayId: string
  promptpayIdType: 'phone' | 'citizen_id' | 'tax_id' | 'ewallet'
  accountName: string | null
  updatedBy: string
}

export async function upsertPaymentConfig(input: UpsertPaymentConfigInput) {
  const existing = await getPaymentConfig()
  if (!existing) {
    const [row] = await db
      .insert(paymentConfig)
      .values({
        id: SINGLETON_ID,
        promptpayId: input.promptpayId,
        promptpayIdType: input.promptpayIdType,
        accountName: input.accountName,
        updatedBy: input.updatedBy,
      })
      .returning()
    return row!
  }
  const [row] = await db
    .update(paymentConfig)
    .set({
      promptpayId: input.promptpayId,
      promptpayIdType: input.promptpayIdType,
      accountName: input.accountName,
      updatedBy: input.updatedBy,
      updatedAt: new Date(),
    })
    .where(eq(paymentConfig.id, SINGLETON_ID))
    .returning()
  return row!
}

export async function getWebhookConfig() {
  const rows = await db
    .select()
    .from(webhookConfig)
    .where(eq(webhookConfig.id, SINGLETON_ID))
    .limit(1)
  return rows[0] ?? null
}

export type UpsertWebhookSettingsInput = {
  mustContain: string[]
  amountRegex: string
  expiryMinutes: number
  randomMinDelta: string
  randomMaxDelta: string
  updatedBy: string
}

export async function upsertWebhookSettings(input: UpsertWebhookSettingsInput) {
  const existing = await getWebhookConfig()
  if (!existing) {
    throw new Error('webhook_config_not_initialized')
  }
  const [row] = await db
    .update(webhookConfig)
    .set({
      mustContain: input.mustContain,
      amountRegex: input.amountRegex,
      expiryMinutes: input.expiryMinutes,
      randomMinDelta: input.randomMinDelta,
      randomMaxDelta: input.randomMaxDelta,
      updatedBy: input.updatedBy,
      updatedAt: new Date(),
    })
    .where(eq(webhookConfig.id, SINGLETON_ID))
    .returning()
  return row!
}

