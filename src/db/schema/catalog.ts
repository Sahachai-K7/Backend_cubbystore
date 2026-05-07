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

export const categories = pgTable('categories', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  parentId: text('parent_id'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const products = pgTable(
  'products',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    categoryId: text('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
    imageUrl: text('image_url'),
    soldCount: integer('sold_count').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    activeIdx: index('products_active_idx').on(t.isActive, t.createdAt),
    categoryIdx: index('products_category_idx').on(t.categoryId),
  }),
)

export const stockStatusEnum = pgEnum('stock_status', ['available', 'sold'])

export const stockItems = pgTable(
  'stock_items',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    payload: text('payload').notNull(),
    status: stockStatusEnum('status').notNull().default('available'),
    orderItemId: text('order_item_id'),
    soldAt: timestamp('sold_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    productAvailableIdx: index('stock_product_available_idx').on(
      t.productId,
      t.status,
    ),
  }),
)
