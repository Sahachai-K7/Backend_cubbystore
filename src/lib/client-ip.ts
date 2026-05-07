import { env } from '../config/env'
import { ipInAnyCidr } from './ip'

type Server = {
  requestIP?: (r: Request) => { address: string } | null
} | null | undefined

// `::ffff:1.2.3.4` (IPv4-mapped IPv6, returned by dual-stack Bun sockets)
// → `1.2.3.4` so callers can write plain IPv4 CIDRs without caring.
function normalizeIp(ip: string): string {
  if (ip.startsWith('::ffff:') && ip.includes('.')) {
    return ip.slice(7)
  }
  return ip
}

export function getClientIp(request: Request, server: Server): string {
  const raw = server?.requestIP ? server.requestIP(request)?.address ?? '' : ''
  const direct = normalizeIp(raw)

  if (direct && env.TRUSTED_PROXY_CIDRS.length > 0 && ipInAnyCidr(direct, env.TRUSTED_PROXY_CIDRS)) {
    const cf = request.headers.get('cf-connecting-ip')
    if (cf) {
      const v = normalizeIp(cf.trim())
      if (v) return v
    }
    const real = request.headers.get('x-real-ip')
    if (real) {
      const v = normalizeIp(real.trim())
      if (v) return v
    }
    const fwd = request.headers.get('x-forwarded-for')
    if (fwd) {
      const first = fwd.split(',')[0]?.trim()
      if (first) return normalizeIp(first)
    }
  }

  return direct
}
