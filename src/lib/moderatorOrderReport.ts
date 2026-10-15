/* Which farmers a moderator's Order Report covers. `requested` is the
 * ?farmer= value: 'all' for every farmer in the zone, a farmer id for one, or
 * nothing yet (the page only wants the farmer list). An id outside the zone is
 * refused rather than silently ignored, so a hand-edited URL can't read
 * another zone's orders. */
export function reportFarmerIds(
  requested: string | null | undefined,
  zoneFarmerIds: string[],
): { ids: string[] | null; error?: 'forbidden' } {
  const want = requested?.trim()
  if (!want) return { ids: null }
  if (want === 'all') return { ids: zoneFarmerIds }
  if (!zoneFarmerIds.includes(want)) return { ids: null, error: 'forbidden' }
  return { ids: [want] }
}
