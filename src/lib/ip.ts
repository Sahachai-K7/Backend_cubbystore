function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    const v = Number(p)
    if (!Number.isInteger(v) || v < 0 || v > 255) return null
    n = (n << 8) | v
  }
  return n >>> 0
}

function ipv6ToBytes(ip: string): Uint8Array | null {
  let s = ip
  if (s.startsWith('::ffff:') && s.includes('.')) {
    s = s.slice(7)
    const v4 = ipv4ToInt(s)
    if (v4 === null) return null
    const out = new Uint8Array(16)
    out[10] = 0xff
    out[11] = 0xff
    out[12] = (v4 >>> 24) & 0xff
    out[13] = (v4 >>> 16) & 0xff
    out[14] = (v4 >>> 8) & 0xff
    out[15] = v4 & 0xff
    return out
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  const total = 8
  const fill = total - left.length - right.length
  if (halves.length === 1 && left.length !== total) return null
  if (halves.length === 2 && fill < 0) return null
  const groups = [
    ...left,
    ...Array<string>(halves.length === 2 ? fill : 0).fill('0'),
    ...right,
  ]
  if (groups.length !== total) return null
  const out = new Uint8Array(16)
  for (let i = 0; i < total; i++) {
    const g = groups[i]
    if (!g || !/^[0-9a-fA-F]{1,4}$/.test(g)) return null
    const v = parseInt(g, 16)
    out[i * 2] = (v >>> 8) & 0xff
    out[i * 2 + 1] = v & 0xff
  }
  return out
}

export function ipInCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) {
    return ipInCidr(ip, cidr.includes(':') ? `${cidr}/128` : `${cidr}/32`)
  }
  const [base, prefixStr] = cidr.split('/')
  if (!base || !prefixStr) return false
  const prefix = Number(prefixStr)
  if (!Number.isInteger(prefix)) return false

  const isV4 = !ip.includes(':') && !base.includes(':')
  if (isV4) {
    const a = ipv4ToInt(ip)
    const b = ipv4ToInt(base)
    if (a === null || b === null) return false
    if (prefix < 0 || prefix > 32) return false
    if (prefix === 0) return true
    const mask = (~0 << (32 - prefix)) >>> 0
    return (a & mask) === (b & mask)
  }

  const aBytes = ipv6ToBytes(ip)
  const bBytes = ipv6ToBytes(base)
  if (!aBytes || !bBytes) return false
  if (prefix < 0 || prefix > 128) return false
  let bits = prefix
  for (let i = 0; i < 16 && bits > 0; i++) {
    if (bits >= 8) {
      if (aBytes[i] !== bBytes[i]) return false
      bits -= 8
    } else {
      const mask = (0xff << (8 - bits)) & 0xff
      if ((aBytes[i]! & mask) !== (bBytes[i]! & mask)) return false
      bits = 0
    }
  }
  return true
}

export function ipInAnyCidr(ip: string, cidrs: string[]): boolean {
  return cidrs.some((c) => ipInCidr(ip, c))
}
