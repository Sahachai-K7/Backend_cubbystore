import { lt } from 'drizzle-orm'
import { db } from '../../db'
import { webhookEvents } from '../../db/schema'

const RETENTION_DAYS = 90

export async function cleanupOldWebhookEvents(days = RETENTION_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const deleted = await db
    .delete(webhookEvents)
    .where(lt(webhookEvents.receivedAt, cutoff))
    .returning({ id: webhookEvents.id })
  return deleted.length
}

let timer: ReturnType<typeof setInterval> | null = null

export function startWebhookEventsRetentionJob() {
  if (timer) return // already started
  // Run once shortly after boot, then daily
  setTimeout(() => {
    cleanupOldWebhookEvents().catch((e) =>
      console.error('[webhook-cleanup]', e),
    )
  }, 60_000)
  timer = setInterval(() => {
    cleanupOldWebhookEvents().catch((e) =>
      console.error('[webhook-cleanup]', e),
    )
  }, 24 * 60 * 60 * 1000)
}
