type Entry = { count: number; resetAt: number }

const store = new Map<string, Entry>()

// Periodically clean up expired entries (every 5 minutes)
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) store.delete(key)
  }
}, 5 * 60_000).unref?.()

export function rateLimitCheck(
  key: string,
  windowMs: number,
  max: number,
): { allowed: boolean; retryAfter: number; remaining: number } {
  const now = Date.now()
  const entry = store.get(key)
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfter: 0, remaining: max - 1 }
  }
  if (entry.count >= max) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      remaining: 0,
    }
  }
  entry.count++
  return { allowed: true, retryAfter: 0, remaining: max - entry.count }
}
