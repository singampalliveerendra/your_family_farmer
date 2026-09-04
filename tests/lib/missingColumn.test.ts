import { describe, it, expect } from 'vitest'
import { isMissingColumnError } from '@/lib/missingColumn'

// The guard that keeps a farmer able to publish on an environment behind on
// migrations (5d2a176). `sale_step` only exists once sale-step-migration.sql
// has run; before that, sending the field fails the ENTIRE insert, so a form
// that quietly ignored the step would instead refuse to publish at all.
//
// The danger in a check like this is the opposite one: if it matches too
// loosely it swallows a REAL failure and the farmer is told "saved" when
// nothing was written. So both halves — the column name and PostgREST's own
// wording — have to be present.

const PGRST204 =
  "Could not find the 'sale_step' column of 'produce_listings' in the schema cache"

describe('isMissingColumnError', () => {
  // The exact message PostgREST returns for a column the schema cache has
  // never seen. This is the one case worth retrying without the field.
  it('recognises the real PostgREST missing-column message', () => {
    expect(isMissingColumnError(PGRST204, 'sale_step')).toBe(true)
  })

  // A successful write has no error to inspect.
  it('is false when there is no error message', () => {
    expect(isMissingColumnError(null, 'sale_step')).toBe(false)
    expect(isMissingColumnError(undefined, 'sale_step')).toBe(false)
    expect(isMissingColumnError('', 'sale_step')).toBe(false)
  })

  // A different column being missing is a different problem, and retrying
  // without sale_step would not fix it.
  it('is false when the message is about another column', () => {
    expect(isMissingColumnError(PGRST204, 'soil_ph')).toBe(false)
  })

  // The failures that MUST keep failing loudly: permission and network errors
  // say nothing about a column, so they are never retried away.
  it('does not swallow a permission or connection failure', () => {
    for (const msg of [
      'permission denied for table produce_listings',
      'new row violates row-level security policy for table "produce_listings"',
      'JWT expired',
      'fetch failed',
    ]) {
      expect(isMissingColumnError(msg, 'sale_step')).toBe(false)
    }
  })

  // Naming the column is not on its own enough — PostgREST's wording has to be
  // there too, or any error that happened to quote the value would be retried.
  it('needs the schema-cache wording, not just the column name', () => {
    expect(isMissingColumnError('sale_step must be greater than 0', 'sale_step')).toBe(false)
    expect(isMissingColumnError('could not find the column in the schema cache', 'sale_step'))
      .toBe(false)
  })

  // DOCUMENTS A KNOWN IMPRECISION, it does not endorse it: a constraint
  // violation that happens to use the word "column" also matches. Harmless
  // today because sale_step is nullable with a default, so this message cannot
  // arise for it — but if that ever changes, tighten the check to PGRST204 and
  // this test is where it will show up.
  it('also matches a not-null violation naming the same column', () => {
    expect(
      isMissingColumnError('null value in column "sale_step" violates not-null constraint', 'sale_step'),
    ).toBe(true)
  })
})
