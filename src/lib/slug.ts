export function slugify(input: string): string {
  const ascii = input
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return ascii
}

export function ensureSlug(name: string, fallbackPrefix = 'item'): string {
  const s = slugify(name)
  if (s.length > 0) return s
  return `${fallbackPrefix}-${crypto.randomUUID().slice(0, 8)}`
}
