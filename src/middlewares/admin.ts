import { Elysia } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { ipAllowlist, adminAuditLog } from '../db/schema'
import { ipInAnyCidr } from '../lib/ip'
import { getClientIp } from '../lib/client-ip'
import { env } from '../config/env'
import { authContext } from './auth'

const bootstrapCidrs = env.ADMIN_IP_BOOTSTRAP
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

async function isIpAllowed(ip: string): Promise<boolean> {
  if (!ip) return false
  if (bootstrapCidrs.length && ipInAnyCidr(ip, bootstrapCidrs)) return true
  const rows = await db
    .select({ cidr: ipAllowlist.cidr })
    .from(ipAllowlist)
    .where(eq(ipAllowlist.enabled, true))
  return ipInAnyCidr(ip, rows.map((r) => r.cidr))
}

export const adminGuard = new Elysia({ name: 'admin-guard' })
  .use(authContext)
  .macro({
    requireAdmin(enabled: boolean) {
      if (!enabled) return {}
      return {
        async resolve({ user, sessionId, request, server, status }) {
          if (!user || !sessionId) {
            return status(401, { error: 'unauthorized' })
          }
          if (user.role !== 'admin') {
            return status(403, { error: 'forbidden' })
          }
          const ip = getClientIp(request, server)
          if (!(await isIpAllowed(ip))) {
            return status(403, { error: 'ip_not_allowed', ip })
          }
          return { user, sessionId, clientIp: ip }
        },
      }
    },
  })

export async function recordAdminAction(input: {
  adminId: string
  action: string
  target?: string | null
  payload?: unknown
  ip?: string | null
}) {
  await db.insert(adminAuditLog).values({
    adminId: input.adminId,
    action: input.action,
    target: input.target ?? null,
    payload: input.payload === undefined ? null : (input.payload as never),
    ip: input.ip ?? null,
  })
}
