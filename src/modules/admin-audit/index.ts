import { Elysia, t } from 'elysia'
import { and, desc, eq, gte, ilike, lte, sql } from 'drizzle-orm'
import { db } from '../../db'
import { adminAuditLog, user as userTable } from '../../db/schema'
import { adminGuard } from '../../middlewares/admin'

export const adminAuditModule = new Elysia({
  prefix: '/api/admin/audit-log',
})
  .use(adminGuard)
  .get(
    '/',
    async ({ query, status }) => {
      const conditions = []
      if (query.adminId) conditions.push(eq(adminAuditLog.adminId, query.adminId))
      if (query.action && query.action.trim().length > 0) {
        conditions.push(ilike(adminAuditLog.action, `${query.action.trim()}%`))
      }
      if (query.target && query.target.trim().length > 0) {
        conditions.push(ilike(adminAuditLog.target, `%${query.target.trim()}%`))
      }
      if (query.from) {
        const d = new Date(query.from)
        if (Number.isNaN(d.getTime())) return status(400, { error: 'invalid_from' })
        conditions.push(gte(adminAuditLog.createdAt, d))
      }
      if (query.to) {
        const d = new Date(query.to)
        if (Number.isNaN(d.getTime())) return status(400, { error: 'invalid_to' })
        conditions.push(lte(adminAuditLog.createdAt, d))
      }
      const where = conditions.length ? and(...conditions) : undefined
      const limit = Math.min(Number(query.limit ?? 50), 200)
      const page = Math.max(1, Number(query.page ?? 1))
      const offset = (page - 1) * limit

      const [items, totalRow] = await Promise.all([
        db
          .select({
            id: adminAuditLog.id,
            adminId: adminAuditLog.adminId,
            adminEmail: userTable.email,
            adminName: userTable.name,
            action: adminAuditLog.action,
            target: adminAuditLog.target,
            payload: adminAuditLog.payload,
            ip: adminAuditLog.ip,
            createdAt: adminAuditLog.createdAt,
          })
          .from(adminAuditLog)
          .leftJoin(userTable, eq(adminAuditLog.adminId, userTable.id))
          .where(where)
          .orderBy(desc(adminAuditLog.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ c: sql<number>`COUNT(*)::int` })
          .from(adminAuditLog)
          .leftJoin(userTable, eq(adminAuditLog.adminId, userTable.id))
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
        adminId: t.Optional(t.String()),
        action: t.Optional(t.String()),
        target: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
      requireAdmin: true,
    },
  )
