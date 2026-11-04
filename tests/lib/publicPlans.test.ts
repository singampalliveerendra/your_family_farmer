import { describe, it, expect, vi, beforeEach } from 'vitest'

// The homepage's plan read never breaks the page.
const state = { result: { data: [] as unknown[] | null, error: null as unknown }, throws: false, filters: [] as string[] }
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => {
      if (state.throws) throw new Error('boom')
      state.filters.push(`from:${t}`)
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => { state.filters.push(`${c}=${v}`); return b },
        order: () => b,
        then: (res: (v: unknown) => unknown) => Promise.resolve(state.result).then(res),
      }
      return b
    },
  },
}))
const { activePlans } = await import('@/lib/publicPlans')

beforeEach(() => { state.result = { data: [], error: null }; state.throws = false; state.filters = [] })

describe('activePlans', () => {
  it('reads active plans only', async () => {
    state.result = { data: [{ id: 'p1' }], error: null }
    expect(await activePlans()).toEqual([{ id: 'p1' }])
    expect(state.filters).toEqual(['from:subscription_plans', 'active=true'])
  })
  it('before the migration (an error) → no plans, no crash', async () => {
    state.result = { data: null, error: { message: 'relation does not exist' } }
    expect(await activePlans()).toEqual([])
  })
  it('a thrown client error → no plans', async () => {
    state.throws = true
    expect(await activePlans()).toEqual([])
  })
})
