import { Elysia, t } from 'elysia'
import { adminGuard, recordAdminAction } from '../../middlewares/admin'
import {
  getPaymentConfig,
  upsertPaymentConfig,
  getWebhookConfig,
  upsertWebhookSettings,
} from '../../lib/config-store'
import { upsertWebhookKey } from '../../lib/api-key-store'

const PaymentConfigBody = t.Object({
  promptpayId: t.String({ minLength: 5, maxLength: 30 }),
  promptpayIdType: t.Union([
    t.Literal('phone'),
    t.Literal('citizen_id'),
    t.Literal('tax_id'),
    t.Literal('ewallet'),
  ]),
  accountName: t.Optional(t.Nullable(t.String({ maxLength: 80 }))),
})

const WebhookSettingsBody = t.Object({
  mustContain: t.Array(t.String({ minLength: 1, maxLength: 200 }), { maxItems: 20 }),
  amountRegex: t.String({ minLength: 1, maxLength: 200 }),
  expiryMinutes: t.Integer({ minimum: 1, maximum: 240 }),
  randomMinDelta: t.Number({ minimum: -10, maximum: 0 }),
  randomMaxDelta: t.Number({ minimum: 0, maximum: 10 }),
})

const sanitizeWebhookConfig = (
  row: NonNullable<Awaited<ReturnType<typeof getWebhookConfig>>>,
) => ({
  apiKeyHint: row.apiKeyHint,
  mustContain: row.mustContain ?? [],
  amountRegex: row.amountRegex,
  expiryMinutes: row.expiryMinutes,
  randomMinDelta: row.randomMinDelta,
  randomMaxDelta: row.randomMaxDelta,
  updatedAt: row.updatedAt,
})

export const adminConfigModule = new Elysia({ name: 'admin-config' })
  .use(adminGuard)
  .get(
    '/api/admin/payment-config',
    async () => {
      const row = await getPaymentConfig()
      return { item: row }
    },
    { requireAdmin: true },
  )
  .put(
    '/api/admin/payment-config',
    async ({ body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const row = await upsertPaymentConfig({
        promptpayId: body.promptpayId.replace(/[^0-9]/g, ''),
        promptpayIdType: body.promptpayIdType,
        accountName: body.accountName ?? null,
        updatedBy: user.id,
      })
      await recordAdminAction({
        adminId: user.id,
        action: 'payment_config.update',
        target: 'singleton',
        payload: { promptpayIdType: body.promptpayIdType },
        ip: clientIp,
      })
      return { item: row }
    },
    { body: PaymentConfigBody, requireAdmin: true },
  )
  .get(
    '/api/admin/webhook-config',
    async () => {
      const row = await getWebhookConfig()
      return { item: row ? sanitizeWebhookConfig(row) : null }
    },
    { requireAdmin: true },
  )
  .put(
    '/api/admin/webhook-config',
    async ({ body, user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      try {
        new RegExp(body.amountRegex)
      } catch {
        return status(400, { error: 'invalid_regex' })
      }
      const REDOS_PATTERN = /\([^)]*[+*?][^)]*\)[+*?]|\([^)]*\)[+*?]\([^)]*\)[+*?]/
      if (REDOS_PATTERN.test(body.amountRegex)) {
        return status(400, { error: 'unsafe_regex_pattern' })
      }
      try {
        const row = await upsertWebhookSettings({
          mustContain: body.mustContain,
          amountRegex: body.amountRegex,
          expiryMinutes: body.expiryMinutes,
          randomMinDelta: body.randomMinDelta.toFixed(2),
          randomMaxDelta: body.randomMaxDelta.toFixed(2),
          updatedBy: user.id,
        })
        await recordAdminAction({
          adminId: user.id,
          action: 'webhook_config.update',
          target: 'singleton',
          payload: { mustContain: body.mustContain, expiryMinutes: body.expiryMinutes },
          ip: clientIp,
        })
        return { item: sanitizeWebhookConfig(row) }
      } catch (e) {
        if (e instanceof Error && e.message === 'webhook_config_not_initialized') {
          return status(409, {
            error: 'webhook_not_initialized',
            hint: 'POST /api/admin/webhook-config/rotate-key first to create initial config',
          })
        }
        throw e
      }
    },
    { body: WebhookSettingsBody, requireAdmin: true },
  )
  .post(
    '/api/admin/webhook-config/rotate-key',
    async ({ user, clientIp, status }) => {
      if (!user) return status(401, { error: 'unauthorized' })
      const { row, plaintextOnce } = await upsertWebhookKey({
        updatedBy: user.id,
        rotate: true,
      })
      await recordAdminAction({
        adminId: user.id,
        action: 'webhook_config.key_rotated',
        target: 'singleton',
        payload: { hint: row.apiKeyHint },
        ip: clientIp,
      })
      return {
        plaintextKey: plaintextOnce,
        item: sanitizeWebhookConfig(row),
      }
    },
    { requireAdmin: true },
  )
