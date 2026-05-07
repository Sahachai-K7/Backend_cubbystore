import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { eq, like } from 'drizzle-orm'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { db } from '../db'
import { products } from '../db/schema'
import { env } from '../config/env'

const LEGACY_PREFIX = '/uploads/products/'

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/**
 * Run-once migration for product images that were uploaded to the old local
 * volume (`/app/uploads/products/<uuid>.png`). For each row whose imageUrl
 * still starts with `/uploads/`, read the file from disk, push it to S3, and
 * update the row to the new public URL. Safe to call on every boot — does
 * nothing once all rows are migrated, or if S3 isn't configured yet.
 */
export async function migrateLegacyImagesIfNeeded(): Promise<void> {
  if (
    !env.S3_ENDPOINT ||
    !env.S3_BUCKET ||
    !env.S3_ACCESS_KEY_ID ||
    !env.S3_SECRET_ACCESS_KEY ||
    !env.S3_PUBLIC_URL
  ) {
    return
  }

  const rows = await db
    .select({ id: products.id, imageUrl: products.imageUrl })
    .from(products)
    .where(like(products.imageUrl, `${LEGACY_PREFIX}%`))

  if (rows.length === 0) return

  console.log(`[migrate-uploads-to-r2] found ${rows.length} legacy row(s)`)

  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: false,
  })

  const uploadRoot = resolve(process.cwd(), 'uploads')

  let migrated = 0
  let missing = 0

  for (const row of rows) {
    if (!row.imageUrl) continue
    const filename = row.imageUrl.slice(LEGACY_PREFIX.length)
    if (!filename || filename.includes('/') || filename.includes('..')) {
      continue
    }
    const diskPath = join(uploadRoot, 'products', filename)

    let buf: Buffer
    try {
      buf = await readFile(diskPath)
    } catch {
      console.warn(
        `[migrate-uploads-to-r2] file missing on disk: ${diskPath} — skipping (manual re-upload needed for product ${row.id})`,
      )
      missing++
      continue
    }

    const ext = filename.split('.').pop()?.toLowerCase() ?? ''
    const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream'
    const key = `products/${filename}`

    await client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: buf,
        ContentType: mime,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    )

    const newUrl = `${env.S3_PUBLIC_URL}/${key}`
    await db
      .update(products)
      .set({ imageUrl: newUrl, updatedAt: new Date() })
      .where(eq(products.id, row.id))

    migrated++
  }

  console.log(
    `[migrate-uploads-to-r2] migrated=${migrated} missing=${missing} of ${rows.length}`,
  )
}
