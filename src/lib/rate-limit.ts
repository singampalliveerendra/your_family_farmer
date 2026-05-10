// Tiny in-memory token-bucket-ish limiter. Per-process only — fine for a single
// Vercel region; for multi-region scale we'd swap to Redis. Enough to slow
// brute-force on /api/consumer/login until that's needed.

type Bucket = { count: number; windowStart: number }
const buckets = new Map<string, Bucket>()

const SWEEP_INTERVAL_MS = 60 * 60 * 1000 // 1h
let lastSweep = Date.now()

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  // Drop entries whose window has long expired (≥1h)
  for (const [k, b] of buckets) {
    if (now - b.windowStart > SWEEP_INTERVAL_MS) buckets.delete(k)
  }
}

/**
 * Returns true when the request is allowed (under the limit), false when blocked.
 * @param key identifier — combine ip + phone for login attempts
 * @param max max attempts per window
 * @param windowMs window length in ms
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  sweep(now)
  const bucket = buckets.get(key)
  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now })
    return true
  }
  if (bucket.count >= max) return false
  bucket.count += 1
  return true
}
