import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { products } from './catalog'

export const reviews = pgTable(
  'reviews',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    orderItemId: text('order_item_id').notNull(),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    deletedByAdmin: boolean('deleted_by_admin').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    uniqByPurchase: uniqueIndex('reviews_unique_per_purchase').on(
      t.userId,
      t.orderItemId,
    ),
    productIdx: index('reviews_product_idx').on(
      t.productId,
      t.deletedByAdmin,
    ),
  }),
)
