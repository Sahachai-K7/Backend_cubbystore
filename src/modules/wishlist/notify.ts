import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../db'
import {
  products,
  user as userTable,
  wishlists,
} from '../../db/schema'
import { sendRestockEmail } from '../../lib/email'
import { env } from '../../config/env'

/**
 * After stock has been added to a product, fire restock notifications to
 * all wishlist subscribers who haven't been notified for the current cycle.
 *
 * "Current cycle" = a notifiedAt that is null or older than the latest add.
 * We use a simpler rule: if notifiedAt IS NULL → notify and set timestamp.
 * Admin can re-trigger by clearing notifiedAt manually if needed (rare).
 */
export async function notifyRestockSubscribers(productId: string) {
  const productRow = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      isActive: products.isActive,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1)
  if (productRow.length === 0 || !productRow[0]!.isActive) return

  const subscribers = await db
    .select({
      userId: wishlists.userId,
      email: userTable.email,
      name: userTable.name,
    })
    .from(wishlists)
    .innerJoin(userTable, eq(wishlists.userId, userTable.id))
    .where(
      and(eq(wishlists.productId, productId), isNull(wishlists.notifiedAt)),
    )

  if (subscribers.length === 0) return

  const frontendOrigin = env.FRONTEND_ORIGINS[0] ?? 'http://localhost:5173'
  const productUrl = `${frontendOrigin}/products/${productRow[0]!.slug}`

  // Send emails sequentially to avoid hitting Resend rate limit
  for (const sub of subscribers) {
    await sendRestockEmail({
      to: sub.email,
      customerName: sub.name,
      productName: productRow[0]!.name,
      productUrl,
    })
  }

  // Mark all as notified
  await db
    .update(wishlists)
    .set({ notifiedAt: new Date() })
    .where(
      and(eq(wishlists.productId, productId), isNull(wishlists.notifiedAt)),
    )
}

