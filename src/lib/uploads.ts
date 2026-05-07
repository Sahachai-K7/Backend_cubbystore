import { mkdir, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export const UPLOAD_ROOT = resolve(process.cwd(), 'uploads')
export const PRODUCT_UPLOAD_DIR = join(UPLOAD_ROOT, 'products')

const MAX_BYTES = 2 * 1024 * 1024 // 2MB
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

await mkdir(PRODUCT_UPLOAD_DIR, { recursive: true })

export type SaveImageResult = {
  publicPath: string
  diskPath: string
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
  const filename = `${id}.${ext}`
  const diskPath = join(PRODUCT_UPLOAD_DIR, filename)
  await Bun.write(diskPath, file)
  return {
    publicPath: `/uploads/products/${filename}`,
    diskPath,
    bytes: file.size,
    mime: file.type,
  }
}

export async function deleteProductImage(publicPath: string): Promise<void> {
  const prefix = '/uploads/products/'
  if (!publicPath.startsWith(prefix)) return
  const filename = publicPath.slice(prefix.length)
  if (filename.includes('/') || filename.includes('..')) return
  const diskPath = join(PRODUCT_UPLOAD_DIR, filename)
  try {
    await unlink(diskPath)
  } catch {
    // file already gone — ignore
  }
}
