import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'

export function generateApiKey(): { plaintext: string; hash: string; hint: string } {
  const plaintext = randomBytes(32).toString('hex')
  const hash = createHash('sha256').update(plaintext).digest('hex')
  const hint = `…${plaintext.slice(-4)}`
  return { plaintext, hash, hint }
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

export function verifyApiKey(plaintext: string | null | undefined, expectedHash: string | null | undefined): boolean {
  if (!plaintext || !expectedHash) return false
  const provided = createHash('sha256').update(plaintext).digest()
  let expected: Buffer
  try {
    expected = Buffer.from(expectedHash, 'hex')
  } catch {
    return false
  }
  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}
