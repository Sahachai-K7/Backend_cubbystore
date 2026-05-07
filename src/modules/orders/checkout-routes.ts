import { Elysia, t } from 'elysia'
import { authContext } from '../../middlewares/auth'
import { checkout, CheckoutError } from './checkout-service'

const CheckoutBody = t.Optional(
  t.Object({
    promoCode: t.Optional(t.String({ maxLength: 40 })),
  }),
)

export const checkoutRoutes = new Elysia({ name: 'checkout-routes' })
  .use(authContext)
  .post(
    '/api/me/checkout',
    async ({ body, user, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      if (!user.emailVerified) return status(403, { error: 'email_not_verified' })
      try {
        const result = await checkout(user.id, {
          promoCode: body?.promoCode,
        })
        return result
      } catch (e) {
        if (e instanceof CheckoutError) {
          return status(409, { error: e.code, detail: e.detail })
        }
        throw e
      }
    },
    { body: CheckoutBody, requireAuth: true },
  )
