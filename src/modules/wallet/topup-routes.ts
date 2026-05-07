import { Elysia, t } from 'elysia'
import { authContext } from '../../middlewares/auth'
import {
  createTopup,
  expirePendingTopups,
  getMyTopup,
  listMyTopups,
  TopupConfigError,
} from './topup-service'

const TopupCreateBody = t.Object({
  amount: t.Number({ minimum: 1, maximum: 50_000 }),
})

export const topupRoutes = new Elysia({ name: 'topup-routes' })
  .use(authContext)
  .post(
    '/api/topups',
    async ({ body, user, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      if (!user.emailVerified) return status(403, { error: 'email_not_verified' })
      try {
        const created = await createTopup({
          userId: user.id,
          baseAmount: body.amount,
        })
        return { item: created }
      } catch (e) {
        if (e instanceof TopupConfigError) {
          return status(409, { error: e.reason })
        }
        if (e instanceof RangeError) {
          return status(400, { error: 'invalid_amount' })
        }
        throw e
      }
    },
    { body: TopupCreateBody, requireAuth: true },
  )
  .get(
    '/api/topups/:id',
    async ({ params, user, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      // sweep before read so client sees up-to-date status
      await expirePendingTopups()
      const row = await getMyTopup(user.id, params.id)
      if (!row) return status(404, { error: 'not_found' })
      return { item: row }
    },
    { requireAuth: true },
  )
  .get(
    '/api/topups',
    async ({ user, query, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const limit = Math.min(Number(query.limit ?? 20), 100)
      const items = await listMyTopups(user.id, limit)
      return { items }
    },
    {
      query: t.Object({ limit: t.Optional(t.String()) }),
      requireAuth: true,
    },
  )
