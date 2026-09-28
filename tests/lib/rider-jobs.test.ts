import { describe, it, expect } from 'vitest'
import { jobKeyOf, groupByJob } from '@/lib/rider-jobs'

// /api/orders/place writes one `orders` row per cart line, so three things from
// one farmer are three rows. For the rider that is ONE job: one bag, one farm,
// one door, one handover code. Ungrouped it becomes three cards to accept and —
// far worse — two riders can each claim a different line of the same bag.

describe('jobKeyOf', () => {
  // USE: same checkout + same farmer = the same physical pickup and drop, so
  // the rows must land on one key.
  it('gives rows from one checkout and one farmer the same key', () => {
    const a = jobKeyOf({ id: 'r1', checkout_id: 'c1', farmer_id: 'f1' })
    const b = jobKeyOf({ id: 'r2', checkout_id: 'c1', farmer_id: 'f1' })
    expect(a).toBe(b)
  })

  // USE: a second farmer in the same cart is a genuinely separate pickup stop —
  // which is exactly what the +₹15 extra delivery charge pays for. Merging them
  // would have the rider paid once for two journeys.
  it('separates a second farmer in the same checkout', () => {
    const a = jobKeyOf({ id: 'r1', checkout_id: 'c1', farmer_id: 'f1' })
    const b = jobKeyOf({ id: 'r2', checkout_id: 'c1', farmer_id: 'f2' })
    expect(a).not.toBe(b)
  })

  // USE: two different buyers must never share a job, however coincidental
  // their farmer and timing.
  it('separates different checkouts', () => {
    expect(jobKeyOf({ id: 'r1', checkout_id: 'c1', farmer_id: 'f1' }))
      .not.toBe(jobKeyOf({ id: 'r2', checkout_id: 'c2', farmer_id: 'f1' }))
  })

  // USE: rows predating the checkout_id column carry NULL and cannot be grouped
  // by key. Each becomes a job of one — today's exact behaviour, so nothing
  // regresses for old orders — and crucially they do NOT all collapse into a
  // single shared "null" job.
  it('makes every legacy row without a checkout id its own job', () => {
    const a = jobKeyOf({ id: 'r1', checkout_id: null, farmer_id: 'f1' })
    const b = jobKeyOf({ id: 'r2', checkout_id: null, farmer_id: 'f1' })
    expect(a).not.toBe(b)
    expect(a).toContain('r1')
  })

  // USE: a row with no farmer is equally ungroupable and must not merge with
  // any other.
  it('makes a row with no farmer its own job', () => {
    expect(jobKeyOf({ id: 'r1', checkout_id: 'c1', farmer_id: null }))
      .not.toBe(jobKeyOf({ id: 'r2', checkout_id: 'c1', farmer_id: null }))
  })
})

describe('groupByJob', () => {
  // USE: the rider's list. Three lines from one farmer collapse to one card;
  // the second farmer stays a second card. This is the whole feature.
  it('collapses a multi-line order into one job per farmer', () => {
    const rows = [
      { id: 'r1', checkout_id: 'c1', farmer_id: 'f1' },
      { id: 'r2', checkout_id: 'c1', farmer_id: 'f1' },
      { id: 'r3', checkout_id: 'c1', farmer_id: 'f2' },
      { id: 'r4', checkout_id: 'c1', farmer_id: 'f1' },
    ]
    const jobs = groupByJob(rows)
    expect(jobs).toHaveLength(2)
    expect(jobs[0].rows.map((r) => r.id)).toEqual(['r1', 'r2', 'r4'])
    expect(jobs[1].rows.map((r) => r.id)).toEqual(['r3'])
  })

  // USE: the caller's query is already sorted (newest first). Re-ordering here
  // would shuffle the rider's list on every refresh, and the first row of each
  // job is what anchors its card.
  it('preserves the order the rows arrived in', () => {
    const rows = [
      { id: 'r3', checkout_id: 'c2', farmer_id: 'f9' },
      { id: 'r1', checkout_id: 'c1', farmer_id: 'f1' },
      { id: 'r2', checkout_id: 'c1', farmer_id: 'f1' },
    ]
    expect(groupByJob(rows).map((j) => j.rows[0].id)).toEqual(['r3', 'r1'])
  })

  // USE: earnings are stamped on ONE row of a batch and 0 on its siblings, so a
  // job's pay is the SUM over its rows. This is what an ungrouped list got
  // wrong — "₹30" on one card and nothing on the rest.
  it('keeps every row of a job together so its fees can be summed', () => {
    const rows = [
      { id: 'r1', checkout_id: 'c1', farmer_id: 'f1', rider_payout: 30 },
      { id: 'r2', checkout_id: 'c1', farmer_id: 'f1', rider_payout: 0 },
      { id: 'r3', checkout_id: 'c1', farmer_id: 'f1', rider_payout: 0 },
    ]
    const [job] = groupByJob(rows)
    expect(job.rows.reduce((sum, r) => sum + r.rider_payout, 0)).toBe(30)
  })

  // USE: an empty list is the rider's normal "no jobs today" state and must not
  // throw on their dashboard.
  it('returns nothing for an empty list', () => {
    expect(groupByJob([])).toEqual([])
  })
})
