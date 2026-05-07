import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { products } from './catalog'

/**
 * Restock notification subscriptions: a user wants to be emailed when a
 * specific product comes back in stock. Acts as a wishlist too.
 */
export const wishlists = pgTable(
  'wishlists',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    notifyEmail: timestamp('notify_email'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    notifiedAt: timestamp('notified_at'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.productId] }),
    productIdx: index('wishlists_product_idx').on(t.productId),
  }),
)
