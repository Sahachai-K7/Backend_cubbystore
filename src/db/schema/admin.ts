import {
  pgTable,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
} from 'drizzle-orm/pg-core'
import { user } from './auth'

export const ipAllowlist = pgTable('ip_allowlist', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  cidr: text('cidr').notNull().unique(),
  label: text('label'),
  enabled: boolean('enabled').notNull().default(true),
  addedBy: text('added_by').references(() => user.id),
  addedAt: timestamp('added_at').notNull().defaultNow(),
})

export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    adminId: text('admin_id')
      .notNull()
      .references(() => user.id),
    action: text('action').notNull(),
    target: text('target'),
    payload: jsonb('payload'),
    ip: text('ip'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    adminCreatedIdx: index('admin_audit_admin_created_idx').on(
      t.adminId,
      t.createdAt,
    ),
    createdAtIdx: index('admin_audit_created_at_idx').on(t.createdAt),
  }),
)
