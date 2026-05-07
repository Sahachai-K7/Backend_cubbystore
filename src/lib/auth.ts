import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '../db'
import { env } from '../config/env'
import * as schema from '../db/schema'
import { sendVerificationEmail } from './email'

const googleEnabled = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
const isHttps = env.BETTER_AUTH_URL.startsWith('https://')

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  // When backend is HTTPS (e.g. behind Cloudflare tunnel), assume cross-site
  // setup with frontend on a different domain. Browsers require
  // SameSite=None + Secure to send cookies cross-site. On plain http://localhost
  // we keep Better-Auth defaults so cookies still work in local dev.
  advanced: isHttps
    ? {
        defaultCookieAttributes: {
          sameSite: 'none',
          secure: true,
          httpOnly: true,
        },
      }
    : undefined,

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user: u, url }) => {
      // Ensure the verify link lands users on a friendly FE page after
      // success. If the caller (signUp / resend) didn't set callbackURL,
      // default to the first HTTPS frontend origin + /email-verified.
      let finalUrl = url
      try {
        const parsed = new URL(url)
        if (!parsed.searchParams.get('callbackURL')) {
          const feOrigin =
            env.FRONTEND_ORIGINS.find((o) => o.startsWith('https://')) ??
            env.FRONTEND_ORIGINS[0]
          if (feOrigin) {
            parsed.searchParams.set(
              'callbackURL',
              `${feOrigin}/email-verified`,
            )
            finalUrl = parsed.toString()
          }
        }
      } catch {
        // unparseable url — leave it
      }
      await sendVerificationEmail({
        to: u.email,
        customerName: u.name ?? null,
        url: finalUrl,
      })
    },
  },

  socialProviders: googleEnabled
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }
    : undefined,

  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'user',
        input: false,
      },
    },
  },

  trustedOrigins: env.FRONTEND_ORIGINS,

  databaseHooks: {
    user: {
      create: {
        before: async (data) => {
          if (
            env.INITIAL_ADMIN_EMAIL &&
            data.email?.toLowerCase() === env.INITIAL_ADMIN_EMAIL.toLowerCase()
          ) {
            return { data: { ...data, role: 'admin' } }
          }
          return { data }
        },
      },
    },
  },
})

export type Auth = typeof auth
export type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>
