import {
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core'
import { user } from './auth'

export const promoTypeEnum = pgEnum('promo_type', ['percent', 'amount'])

export const promoCodes = pgTable(
  'promo_codes',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    code: text('code').notNull().unique(),
    type: promoTypeEnum('type').notNull(),
    value: numeric('value', { precision: 12, scale: 2 }).notNull(),
    minTotal: numeric('min_total', { precision: 12, scale: 2 }),
    maxUses: integer('max_uses'),
    usedCount: integer('used_count').notNull().default(0),
    expiresAt: timestamp('expires_at'),
    isActive: boolean('is_active').notNull().default(true),
    note: text('note'),
    createdBy: text('created_by').references(() => user.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    activeIdx: index('promo_codes_active_idx').on(t.isActive, t.expiresAt),
  }),
)
