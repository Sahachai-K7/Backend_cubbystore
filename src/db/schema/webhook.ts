import {
  pgTable,
  text,
  timestamp,
  numeric,
  jsonb,
  pgEnum,
  integer,
} from 'drizzle-orm/pg-core'
import { user } from './auth'

export const webhookStatusEnum = pgEnum('webhook_status', [
  'matched',
  'unmatched',
  'rejected_filter',
  'rejected_invalid_key',
  'invalid_payload',
])

export const webhookEvents = pgTable('webhook_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  rawBody: text('raw_body').notNull(),
  headers: jsonb('headers'),
  sourceIp: text('source_ip'),
  parsedAmount: numeric('parsed_amount', { precision: 12, scale: 2 }),
  status: webhookStatusEnum('status').notNull(),
  matchedTopupId: text('matched_topup_id'),
  receivedAt: timestamp('received_at').notNull().defaultNow(),
})

export const webhookConfig = pgTable('webhook_config', {
  id: integer('id').primaryKey(),
  apiKeyHash: text('api_key_hash').notNull(),
  apiKeyHint: text('api_key_hint').notNull(),
  mustContain: jsonb('must_contain').$type<string[]>().notNull().default([]),
  amountRegex: text('amount_regex').notNull(),
  expiryMinutes: integer('expiry_minutes').notNull().default(15),
  randomMinDelta: numeric('random_min_delta', { precision: 5, scale: 2 })
    .notNull()
    .default('-0.99'),
  randomMaxDelta: numeric('random_max_delta', { precision: 5, scale: 2 })
    .notNull()
    .default('0.99'),
  updatedBy: text('updated_by').references(() => user.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const paymentIdTypeEnum = pgEnum('payment_id_type', [
  'phone',
  'citizen_id',
  'tax_id',
  'ewallet',
])

export const paymentConfig = pgTable('payment_config', {
  id: integer('id').primaryKey(),
  promptpayId: text('promptpay_id').notNull(),
  promptpayIdType: paymentIdTypeEnum('promptpay_id_type').notNull(),
  accountName: text('account_name'),
  updatedBy: text('updated_by').references(() => user.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
