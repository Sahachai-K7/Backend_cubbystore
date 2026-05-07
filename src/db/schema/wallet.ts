import { sql } from 'drizzle-orm'
import {
  pgTable,
  text,
  timestamp,
  numeric,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { user } from './auth'

export const walletTxnTypeEnum = pgEnum('wallet_txn_type', [
  'topup',
  'purchase',
  'refund',
  'adjust',
])

export const walletTransactions = pgTable(
  'wallet_transactions',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    type: walletTxnTypeEnum('type').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    balanceAfter: numeric('balance_after', {
      precision: 12,
      scale: 2,
    }).notNull(),
    refId: text('ref_id'),
    note: text('note'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('wallet_user_idx').on(t.userId, t.createdAt),
  }),
)

export const topupStatusEnum = pgEnum('topup_status', [
  'pending',
  'confirmed',
  'expired',
  'cancelled',
])

export const topups = pgTable(
  'topups',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    amountBase: numeric('amount_base', { precision: 12, scale: 2 }).notNull(),
    amountToPay: numeric('amount_to_pay', {
      precision: 12,
      scale: 2,
    }).notNull(),
    status: topupStatusEnum('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at').notNull(),
    confirmedAt: timestamp('confirmed_at'),
    matchedEventId: text('matched_event_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    uniquePendingAmount: uniqueIndex('topups_unique_pending_amount')
      .on(t.amountToPay)
      .where(sql`${t.status} = 'pending'`),
    userIdx: index('topups_user_idx').on(t.userId, t.createdAt),
    statusExpiryIdx: index('topups_status_expiry_idx').on(
      t.status,
      t.expiresAt,
    ),
  }),
)
