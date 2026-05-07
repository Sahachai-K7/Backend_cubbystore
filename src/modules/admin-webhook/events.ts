import { Elysia, t } from 'elysia'
import { and, desc, eq, gte, ilike, lte, sql } from 'drizzle-orm'
import { db } from '../../db'
import { webhookEvents } from '../../db/schema'
import { adminGuard, recordAdminAction } from '../../middlewares/admin'
import { cleanupOldWebhookEvents } from './cleanup'

const StatusEnum = t.Union([
  t.Literal('matched'),
  t.Literal('unmatched'),
  t.Literal('rejected_filter'),
  t.Literal('rejected_invalid_key'),
  t.Literal('invalid_payload'),
])

export const adminWebhookEventsModule = new Elysia({
  prefix: '/api/admin/webhook/events',
})
  .use(adminGuard)
  .get(
    '/',
    async ({ query, status }) => {
      const conditions = []
      if (query.status) conditions.push(eq(webhookEvents.status, query.status))
      if (query.from) {
        const fromDate = new Date(query.from)
        if (Number.isNaN(fromDate.getTime()))
          return status(400, { error: 'invalid_from' })
        conditions.push(gte(webhookEvents.receivedAt, fromDate))
      }
      if (query.to) {
        const toDate = new Date(query.to)
        if (Number.isNaN(toDate.getTime()))
          return status(400, { error: 'invalid_to' })
        conditions.push(lte(webhookEvents.receivedAt, toDate))
      }
      if (query.q && query.q.trim().length > 0) {
        conditions.push(ilike(webhookEvents.rawBody, `%${query.q.trim()}%`))
      }
      const where = conditions.length ? and(...conditions) : undefined
      const limit = Math.min(Number(query.limit ?? 50), 200)
      const page = Math.max(1, Number(query.page ?? 1))
      const offset = (page - 1) * limit

      const [items, totalRow] = await Promise.all([
        db
          .select()
          .from(webhookEvents)
          .where(where)
          .orderBy(desc(webhookEvents.receivedAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(webhookEvents)
          .where(where),
      ])

      return {
        items,
        total: Number(totalRow[0]?.c ?? 0),
        page,
        limit,
      }
    },
    {
      query: t.Object({
        status: t.Optional(StatusEnum),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        q: t.Optional(t.String()),
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
      requireAdmin: true,
    },
  )
  .get(
    '/:id',
    async ({ params, status }) => {
      const rows = await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.id, params.id))
        .limit(1)
      if (rows.length === 0) return status(404, { error: 'not_found' })
      return { item: rows[0] }
    },
    { requireAdmin: true },
  )
  .post(
    '/cleanup',
    async ({ user, status, clientIp }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const deleted = await cleanupOldWebhookEvents()
      await recordAdminAction({
        adminId: user.id,
        action: 'webhook.events.cleanup',
        target: null,
        payload: { deletedCount: deleted, retentionDays: 90 },
        ip: clientIp,
      })
      return { ok: true, deleted }
    },
    { requireAdmin: true },
  )
