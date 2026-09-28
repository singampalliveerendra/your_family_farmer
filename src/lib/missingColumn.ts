/**
 * PostgREST reports a column the schema cache doesn't know as PGRST204 —
 * "Could not find the 'sale_step' column of 'produce_listings' in the schema
 * cache". A column added by a migration only exists once that migration has
 * been run, and on an environment where it hasn't, sending the field would fail
 * the ENTIRE write: a farmer couldn't publish a harvest at all. So that one
 * case is detected and the save retried without the field, with the farmer told
 * which part specifically didn't stick.
 *
 * Deliberately narrow. It must not swallow a genuine failure — a permission
 * error or a constraint violation has to keep failing loudly — so both the
 * column name AND PostgREST's own wording have to be present.
 */
export function isMissingColumnError(msg: string | null | undefined, column: string): boolean {
  if (!msg) return false
  return msg.includes(column) && /schema cache|column/i.test(msg)
}
