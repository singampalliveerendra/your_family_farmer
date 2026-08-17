// The aggregator dashboard is the SAME component as the farmer one, mounted at
// its own URL. An aggregator does everything a farmer does — produce, harvests,
// orders, pickups, payouts — plus the source-farmer registry, so there is no
// second dashboard to build, only a second address for it.
//
// Re-exported rather than copied on purpose: the farmer dashboard is ~3,600
// lines. A duplicate would have to be fixed twice for every future change and
// would drift within a sprint. The component reads `account_type` and swaps its
// own wording (header, profile modal, field labels), and redirects a seller who
// lands on the wrong one of the two URLs.
export { default } from '@/app/farmer/dashboard/page'
