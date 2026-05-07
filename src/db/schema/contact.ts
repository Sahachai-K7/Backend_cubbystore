import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core'
import { user } from './auth'

export const contactPlatformEnum = pgEnum('contact_platform', [
  'line',
  'discord',
  'telegram',
  'facebook',
  'instagram',
  'x',
  'email',
  'phone',
  'other',
])

export const contactLinks = pgTable(
  'contact_links',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    platform: contactPlatformEnum('platform').notNull(),
    label: text('label').notNull(),
    url: text('url').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    updatedBy: text('updated_by').references(() => user.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    enabledSortIdx: index('contact_links_enabled_sort_idx').on(
      t.enabled,
      t.sortOrder,
    ),
  }),
)
