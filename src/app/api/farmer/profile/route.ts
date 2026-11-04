import { NextRequest, NextResponse } from 'next/server'
import { requireSeller, svc } from '@/lib/sellerAuth'
import { FARMER_SELF_COLUMNS } from '@/lib/farmerColumns'
import { sellerProfilePatch } from '@/lib/sellerWriteRules'
import { reqLang, tr } from '@/lib/serverLang'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The logged-in seller's OWN profile (security fix, 2026-11-04).
//   GET   — their full row, including what the public no longer sees (phone,
//           farm address, exact location, pickup-point phones).
//   PATCH — edit it. Before, the dashboard wrote `farmers` straight from the
//           browser and the public key could rewrite ANY farmer's name, phone,
//           address or UPI ID. Now the row is pinned to the signed cookie and
//           only SELLER_PROFILE_COLUMNS can change.

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export async function GET(req: NextRequest) {
  const supabase = svc()
  const me = await requireSeller(req, supabase)
  if (!me) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })
  const { data, error } = await supabase.from('farmers').select(`${FARMER_SELF_COLUMNS}, story_quote_te`).eq('id', me.id).maybeSingle()
  if (error) {
    // story_quote_te may not exist before its migration — never lose the profile over it.
    const plain = await supabase.from('farmers').select(FARMER_SELF_COLUMNS).eq('id', me.id).maybeSingle()
    return NextResponse.json({ farmer: plain.data ?? null })
  }
  return NextResponse.json({ farmer: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = svc()
  const me = await requireSeller(req, supabase)
  if (!me) return NextResponse.json({ error: 'Please log in first.' }, { status: 401 })
  const lang = reqLang(req)
  const t = (en: string, te: string) => tr(lang, en, te)
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

  const { patch, refused } = sellerProfilePatch(body)
  if (refused.length) console.warn('[YFF farmer/profile] refused keys:', refused.join(', '))
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true, farmer: null })

  if ('name' in patch && (typeof patch.name !== 'string' || !patch.name.trim())) {
    return NextResponse.json({ error: t('Enter your name.', 'మీ పేరు నమోదు చేయండి.') }, { status: 400 })
  }
  if ('slug' in patch) {
    const slug = String(patch.slug ?? '').trim().toLowerCase()
    if (!SLUG_RE.test(slug) || slug.length > 80) return NextResponse.json({ error: t('That page link is not valid.', 'ఆ పేజీ లింక్ సరైనది కాదు.') }, { status: 400 })
    const { data: taken } = await supabase.from('farmers').select('id').eq('slug', slug).neq('id', me.id).maybeSingle()
    if (taken) return NextResponse.json({ error: t('That page link is already taken.', 'ఆ పేజీ లింక్ ఇప్పటికే వాడుకలో ఉంది.') }, { status: 409 })
    patch.slug = slug
  }
  if ('phone' in patch) {
    const phone = String(patch.phone ?? '').replace(/\D/g, '').slice(-10)
    if (!/^[6-9]\d{9}$/.test(phone)) return NextResponse.json({ error: t('Enter a valid 10-digit mobile number.', 'సరైన 10 అంకెల మొబైల్ నంబర్ నమోదు చేయండి.') }, { status: 400 })
    // The phone is how a seller logs in: never let two accounts of the same
    // kind share one (a farmer and an aggregator account may — 2026-08-12).
    const { data: clash } = await supabase.from('farmers').select('id').eq('phone', phone).eq('account_type', me.account_type ?? 'farmer').neq('id', me.id).maybeSingle()
    if (clash) return NextResponse.json({ error: t('Another account already uses this number.', 'ఈ నంబర్‌ను మరో ఖాతా ఇప్పటికే వాడుతోంది.') }, { status: 409 })
    patch.phone = phone
  }

  const { data, error } = await supabase.from('farmers').update(patch).eq('id', me.id).select(FARMER_SELF_COLUMNS).maybeSingle()
  if (error) {
    // Optional columns (soil_ph, social links, story_quote_te) may not exist
    // on an older database — the dashboard sends those separately, best-effort.
    console.error('[YFF farmer/profile PATCH] failed:', error.message)
    return NextResponse.json({ error: t('Could not save your profile. Please try again.', 'మీ ప్రొఫైల్ సేవ్ కాలేదు. మళ్లీ ప్రయత్నించండి.'), detail: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, farmer: data })
}
