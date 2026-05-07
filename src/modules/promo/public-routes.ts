import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { cartItems, products } from '../../db/schema'
import { authContext } from '../../middlewares/auth'
import { validatePromo } from './service'

export const publicPromoRoutes = new Elysia({ name: 'public-promo' })
  .use(authContext)
  .post(
    '/api/me/promo/validate',
    async ({ body, user, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })

      // Compute subtotal from current cart
      const lines = await db
        .select({
          qty: cartItems.qty,
          price: products.price,
        })
        .from(cartItems)
        .innerJoin(products, eq(cartItems.productId, products.id))
        .where(eq(cartItems.userId, user.id))
      const subtotal = lines.reduce(
        (s, l) => s + Number(l.price) * l.qty,
        0,
      )
      if (subtotal === 0) {
        return status(400, { error: 'cart_empty' })
      }

      const result = await validatePromo(body.code, subtotal)
      if (!result.valid) {
        return status(409, { error: result.error })
      }
      return {
        ok: true,
        code: result.promo.code,
        discount: result.discount.toFixed(2),
        subtotal: subtotal.toFixed(2),
        finalTotal: result.finalTotal.toFixed(2),
        type: result.promo.type,
        value: result.promo.value,
      }
    },
    {
      body: t.Object({ code: t.String({ minLength: 1, maxLength: 40 }) }),
      requireAuth: true,
    },
  )

