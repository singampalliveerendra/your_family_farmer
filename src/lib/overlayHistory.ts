/** Pure rule for useBackToClose: after a Back, is overlay `id`'s history step gone?
 *  Steps are numbered in opening order, so any state below `id` (or none) means
 *  Back went past this overlay's step. */
export function overlayStepGone(state: unknown, id: number): boolean {
  const top = (state as { yffOverlay?: unknown } | null)?.yffOverlay
  return typeof top !== 'number' || top < id
}
