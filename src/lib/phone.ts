// Normalize an Indian phone number to its 10 trailing digits.
// Strips +91 / 91 / 0 prefixes and any non-digit characters. Returns '' when invalid.
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = String(raw).replace(/\D/g, '').slice(-10)
  return digits.length === 10 ? digits : ''
}
