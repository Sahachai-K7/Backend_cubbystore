import { Elysia } from 'elysia'
import { auth } from '../lib/auth'

export type SessionUser = {
  id: string
  email: string
  name: string | null
  role: 'user' | 'admin'
  emailVerified: boolean
}

export const authContext = new Elysia({ name: 'auth-context' })
  .derive({ as: 'global' }, async ({ request }) => {
    const result = await auth.api.getSession({ headers: request.headers })
    if (!result) {
      return { user: null as SessionUser | null, sessionId: null as string | null }
    }
    const u = result.user as unknown as SessionUser & Record<string, unknown>
    return {
      user: {
        id: u.id,
        email: u.email,
        name: u.name ?? null,
        role: (u.role as 'user' | 'admin') ?? 'user',
        emailVerified: !!u.emailVerified,
      } satisfies SessionUser,
      sessionId: result.session.id,
    }
  })
  .macro({
    requireAuth(enabled: boolean) {
      if (!enabled) return {}
      return {
        resolve({ user, sessionId, status }) {
          if (!user || !sessionId) {
            return status(401, { error: 'unauthorized' })
          }
          return { user, sessionId }
        },
      }
    },
  })
