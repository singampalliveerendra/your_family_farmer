// Shown only on Vercel Preview builds (the staging/test site).
// NEXT_PUBLIC_VERCEL_ENV is set by Vercel itself: 'production' on main,
// 'preview' on every other branch. Production therefore never renders this.
export default function StagingBanner() {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV !== 'preview') return null

  return (
    <div className="sticky top-0 z-[100] flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-center text-xs font-semibold text-amber-950">
      <span aria-hidden>⚠️</span>
      <span>TEST SITE — fake data, test payments. Not the real Go Grameen.</span>
    </div>
  )
}
