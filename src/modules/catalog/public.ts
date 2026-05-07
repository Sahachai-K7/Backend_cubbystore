import { Elysia, t } from 'elysia'
import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm'
import { db } from '../../db'
import { products, categories } from '../../db/schema'

const SORTS = {
  newest: desc(products.createdAt),
  oldest: asc(products.createdAt),
  price_asc: asc(products.price),
  price_desc: desc(products.price),
  popular: desc(products.soldCount),
} as const

export const publicProducts = new Elysia({ prefix: '/api/products' })
  .get(
    '/',
    async ({ query }) => {
      const conditions = [eq(products.isActive, true)]
      if (query.categorySlug) {
        const cat = await db
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.slug, query.categorySlug))
          .limit(1)
        if (cat.length === 0) return { items: [], total: 0, page: 1, limit: 0 }
        conditions.push(eq(products.categoryId, cat[0]!.id))
      }
      if (query.q && query.q.trim().length > 0) {
        conditions.push(ilike(products.name, `%${query.q.trim()}%`))
      }
      const where = and(...conditions)
      const sort = SORTS[(query.sort ?? 'newest') as keyof typeof SORTS] ?? SORTS.newest

      const page = Math.max(1, Number(query.page ?? 1))
      const limit = Math.min(60, Math.max(1, Number(query.limit ?? 24)))
      const offset = (page - 1) * limit

      const [items, totalRow] = await Promise.all([
        db
          .select({
            id: products.id,
            name: products.name,
            slug: products.slug,
            price: products.price,
            imageUrl: products.imageUrl,
            soldCount: products.soldCount,
            categoryId: products.categoryId,
            availableCount: sql<number>`(
              SELECT COUNT(*)::int FROM stock_items
              WHERE stock_items.product_id = products.id
                AND stock_items.status = 'available'
            )`,
            avgRating: sql<string>`(
              SELECT COALESCE(AVG(rating)::numeric(3,2), 0)::text
              FROM reviews
              WHERE reviews.product_id = products.id
                AND reviews.deleted_by_admin = false
            )`,
            reviewCount: sql<number>`(
              SELECT COUNT(*)::int FROM reviews
              WHERE reviews.product_id = products.id
                AND reviews.deleted_by_admin = false
            )`,
          })
          .from(products)
          .where(where)
          .orderBy(sort)
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(products)
          .where(where),
      ])
      return {
        items,
        total: Number(totalRow[0]?.count ?? 0),
        page,
        limit,
      }
    },
    {
      query: t.Object({
        categorySlug: t.Optional(t.String()),
        q: t.Optional(t.String()),
        sort: t.Optional(
          t.Union([
            t.Literal('newest'),
            t.Literal('oldest'),
            t.Literal('price_asc'),
            t.Literal('price_desc'),
            t.Literal('popular'),
          ]),
        ),
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
    },
  )
  .get('/:slug', async ({ params, status }) => {
    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        description: products.description,
        price: products.price,
        imageUrl: products.imageUrl,
        soldCount: products.soldCount,
        isActive: products.isActive,
        createdAt: products.createdAt,
        category: {
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
        },
        availableCount: sql<number>`(
          SELECT COUNT(*)::int FROM stock_items
          WHERE stock_items.product_id = products.id
            AND stock_items.status = 'available'
        )`,
        avgRating: sql<string>`(
          SELECT COALESCE(AVG(rating)::numeric(3,2), 0)::text
          FROM reviews
          WHERE reviews.product_id = products.id
            AND reviews.deleted_by_admin = false
        )`,
        reviewCount: sql<number>`(
          SELECT COUNT(*)::int FROM reviews
          WHERE reviews.product_id = products.id
            AND reviews.deleted_by_admin = false
        )`,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(eq(products.slug, params.slug), eq(products.isActive, true)))
      .limit(1)
    if (rows.length === 0) return status(404, { error: 'not_found' })
    return { item: rows[0] }
  })
