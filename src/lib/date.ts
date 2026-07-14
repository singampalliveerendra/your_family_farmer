// Today's date as YYYY-MM-DD in India, not UTC. Using toISOString() would roll
// over at 5:30am IST and let a consumer pick "yesterday" as a needed-by date.
export function todayInIndia(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

// True when an ISO date string (YYYY-MM-DD) is before today in India.
export function isPastDate(iso: string | null | undefined): boolean {
  if (!iso) return false
  return iso < todayInIndia()
}
