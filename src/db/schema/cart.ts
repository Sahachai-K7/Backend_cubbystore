import {
  pgTable,
  text,
  timestamp,
  integer,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { products } from './catalog'

export const cartItems = pgTable(
  'cart_items',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    qty: integer('qty').notNull().default(1),
    addedAt: timestamp('added_at').notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.productId] }),
  }),
)
