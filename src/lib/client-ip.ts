import { env } from '../config/env'
import { ipInAnyCidr } from './ip'

type Server = {
  requestIP?: (r: Request) => { address: string } | null
} | null | undefined

export function getClientIp(request: Request, server: Server): string {
  const direct = server?.requestIP ? server.requestIP(request)?.address ?? '' : ''

  if (direct && env.TRUSTED_PROXY_CIDRS.length > 0 && ipInAnyCidr(direct, env.TRUSTED_PROXY_CIDRS)) {
    const cf = request.headers.get('cf-connecting-ip')
    if (cf) {
      const v = cf.trim()
      if (v) return v
    }
    const real = request.headers.get('x-real-ip')
    if (real) {
      const v = real.trim()
      if (v) return v
    }
    const fwd = request.headers.get('x-forwarded-for')
    if (fwd) {
      const first = fwd.split(',')[0]?.trim()
      if (first) return first
    }
  }

  return direct
}
