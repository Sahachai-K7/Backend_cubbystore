import { Elysia } from 'elysia'
import { rateLimitCheck } from '../lib/rate-limit'
import { getClientIp } from '../lib/client-ip'

const RULES: Array<{
  match: (path: string, method: string) => boolean
  scope: string
  windowMs: number
  max: number
}> = [
  // Auth: 10 sign-in / 5 sign-up per minute
  {
    match: (p) => p.startsWith('/api/auth/sign-in'),
    scope: 'auth_signin',
    windowMs: 60_000,
    max: 10,
  },
  {
    match: (p) => p.startsWith('/api/auth/sign-up'),
    scope: 'auth_signup',
    windowMs: 60_000,
    max: 5,
  },
  {
    match: (p) => p.startsWith('/api/auth/forget-password') ||
      p.startsWith('/api/auth/reset-password') ||
      p.startsWith('/api/auth/send-verification-email'),
    scope: 'auth_recovery',
    windowMs: 60_000,
    max: 5,
  },
  {
    match: (p) => p.startsWith('/api/auth/callback'),
    scope: 'auth_callback',
    windowMs: 60_000,
    max: 30,
  },
  // Webhook: 60 hits per minute (Tasker)
  {
    match: (p) => p === '/api/webhook/payment',
    scope: 'webhook',
    windowMs: 60_000,
    max: 60,
  },
  // Checkout: 10 per minute
  {
    match: (p, m) => p === '/api/me/checkout' && m === 'POST',
    scope: 'checkout',
    windowMs: 60_000,
    max: 10,
  },
  // Top-up create: 10 per minute
  {
    match: (p, m) => p === '/api/topups' && m === 'POST',
    scope: 'topup',
    windowMs: 60_000,
    max: 10,
  },
]

export const rateLimitMiddleware = new Elysia({ name: 'rate-limit' }).onBeforeHandle(
  ({ request, server, set, status }) => {
    const url = new URL(request.url)
    const rule = RULES.find((r) => r.match(url.pathname, request.method))
    if (!rule) return

    const ip = getClientIp(request, server) || 'unknown'
    const key = `${rule.scope}:${ip}`
    const r = rateLimitCheck(key, rule.windowMs, rule.max)
    if (!r.allowed) {
      set.headers['retry-after'] = String(r.retryAfter)
      return status(429, {
        error: 'too_many_requests',
        retryAfter: r.retryAfter,
      })
    }
    set.headers['x-ratelimit-remaining'] = String(r.remaining)
  },
)
