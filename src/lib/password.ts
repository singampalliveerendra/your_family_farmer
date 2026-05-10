import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'

// scrypt with per-user salt — matches the existing farmer login pattern
// Format on disk: "salt_hex:hash_hex"
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const hashBuffer = Buffer.from(hash, 'hex')
    const derived = scryptSync(password, salt, 64)
    if (hashBuffer.length !== derived.length) return false
    return timingSafeEqual(hashBuffer, derived)
  } catch {
    return false
  }
}
