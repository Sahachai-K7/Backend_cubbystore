import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { env } from '../config/env'

const MAX_BYTES = 2 * 1024 * 1024 // 2MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export const PRODUCTS_PREFIX = 'products'

let cachedClient: S3Client | null = null
function getClient(): S3Client {
  if (cachedClient) return cachedClient
  if (
    !env.S3_ENDPOINT ||
    !env.S3_BUCKET ||
    !env.S3_ACCESS_KEY_ID ||
    !env.S3_SECRET_ACCESS_KEY
  ) {
    throw new Error('s3_storage_not_configured')
  }
  cachedClient = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: false,
  })
  return cachedClient
}

export type SaveImageResult = {
  url: string
  key: string
  bytes: number
  mime: string
}

export async function saveProductImage(file: File): Promise<SaveImageResult> {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error(`unsupported_image_type:${file.type}`)
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`image_too_large:${file.size}`)
  }
  const ext = EXT_BY_MIME[file.type]!
  const id = crypto.randomUUID()
  const key = `${PRODUCTS_PREFIX}/${id}.${ext}`
  const body = new Uint8Array(await file.arrayBuffer())

  await getClient().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: file.type,
      // UUID filename means content is immutable — let browsers cache forever
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )

  return {
    url: `${env.S3_PUBLIC_URL}/${key}`,
    key,
    bytes: file.size,
    mime: file.type,
  }
}

export async function deleteProductImage(url: string): Promise<void> {
  const key = extractKey(url)
  if (!key) return
  try {
    await getClient().send(
      new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    )
  } catch {
    // already gone or missing perms — ignore so callers can proceed
  }
}

/**
 * Pull the bucket key out of either:
 *   - a full public URL:  `${S3_PUBLIC_URL}/products/<uuid>.png`
 *   - a legacy local path: `/uploads/products/<uuid>.png`
 *   - a bare key:          `products/<uuid>.png`
 */
export function extractKey(input: string): string | null {
  if (!input) return null
  if (env.S3_PUBLIC_URL && input.startsWith(env.S3_PUBLIC_URL + '/')) {
    return safeKey(input.slice(env.S3_PUBLIC_URL.length + 1))
  }
  if (input.startsWith('/uploads/')) {
    return safeKey(input.slice('/uploads/'.length))
  }
  if (input.startsWith(PRODUCTS_PREFIX + '/')) {
    return safeKey(input)
  }
  return null
}

function safeKey(k: string): string | null {
  if (!k || k.includes('..')) return null
  return k
}
