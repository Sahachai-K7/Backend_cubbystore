import {
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { products } from './catalog'

export const orderStatusEnum = pgEnum('order_status', [
  'paid',
  'delivered',
  'delivery_failed',
  'refunded',
])

export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }),
    discount: numeric('discount', { precision: 12, scale: 2 }),
    promoCode: text('promo_code'),
    total: numeric('total', { precision: 12, scale: 2 }).notNull(),
    status: orderStatusEnum('status').notNull().default('paid'),
    deliveredAt: timestamp('delivered_at'),
    deliveryError: text('delivery_error'),
    refundedAt: timestamp('refunded_at'),
    refundReason: text('refund_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('orders_user_idx').on(t.userId, t.createdAt),
    statusIdx: index('orders_status_idx').on(t.status),
  }),
)

export const orderItems = pgTable(
  'order_items',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    productNameSnapshot: text('product_name_snapshot').notNull(),
    qty: integer('qty').notNull(),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  },
  (t) => ({
    orderIdx: index('order_items_order_idx').on(t.orderId),
  }),
)
