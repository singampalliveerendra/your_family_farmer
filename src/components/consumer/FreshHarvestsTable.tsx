'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCart, EditableQty } from '@/components/consumer/Cart'
import { useConsumerAuth } from '@/lib/ConsumerAuthContext'
import { useLang } from '@/lib/LanguageContext'
import { localizeName } from '@/lib/localizeName'
import { harvestRelTime, freshnessLeftDays } from '@/lib/harvest'
import { normalizePickupSchedule } from '@/lib/pickup-slots'
import { CONSUMER_VISIBLE_STATUSES } from '@/lib/produceStatus'

// Two compact harvest tables shown above the consumer search box:
//   FreshHarvestsTable    — already-picked harvests (buyable now), newest first
//   UpcomingHarvestsTable — future/pre-book harvests, soonest first
// Each row is one HARVEST (its own product): tapping it opens that harvest's
// detail page, and the cart icon adds that specific harvest — so two harvests of
// the same produce are independent. They read the `harvests` table (see
// scripts/harvests-migration.sql) and silently render nothing when the table
// isn't present yet or there are no matching harvests.

type Listing = {
  id: string
  name: string
  emoji?: string | null
  status?: string | null
  // Fallback shelf life: it's a produce-level property, so most harvests carry
  // null and inherit it from the listing.
  shelf_life_days?: number | null
}

type HarvestRow = {
  id: string
  harvested_at: string
  produce_listing_id: string
  stock_qty?: number | null
  shelf_life_days?: number | null
  // PostgREST embeds the parent listing as an object (many-to-one).
  produce_listings?: Listing | Listing[] | null
}

const DAY = 86_400_000
// Outer bound on the fetch window for fresh harvests. Nothing with a longer
// shelf life than this can still be fresh, so a harvest older than it can be
// left in the database — this is a query bound, not the freshness rule.
const MAX_SHELF_LIFE_DAYS = 90
type Variant = 'fresh' | 'upcoming'

// A harvest judges itself by its OWN stock, never the template's — a template
// can be sold out while a freshly logged pick still has kilos left. null means
// the farmer doesn't track quantity, which is not the same as zero.
const isHarvestSoldOut = (r: HarvestRow) => r.stock_qty != null && r.stock_qty <= 0

// A picked harvest is fresh while it has shelf life left. The harvest's own
// shelf_life_days wins when set; otherwise it inherits the produce's. When
// neither is set we can't compute freshness, so we keep the harvest rather than
// hide a perfectly good listing over a missing number.
function isStillFresh(r: HarvestRow): boolean {
  const listing = Array.isArray(r.produce_listings) ? r.produce_listings[0] : r.produce_listings
  const shelf = r.shelf_life_days ?? listing?.shelf_life_days ?? null
  const left = freshnessLeftDays(r.harvested_at, shelf)
  return left == null || left >= 0
}

function HarvestTable({ variant }: { variant: Variant }) {
  const { lang, L } = useLang()
  const router = useRouter()
  const { addItem, setQty, cart } = useCart()
  const { requireAuth } = useConsumerAuth()
  const [rows, setRows] = useState<HarvestRow[]>([])
  const [loaded, setLoaded] = useState(false)
  // Listing ids currently being fetched-and-added, so the cart icon can show a
  // spinner and ignore double taps.
  const [adding, setAdding] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    const now = Date.now()
    const base = supabase
      .from('harvests')
      .select('id, harvested_at, produce_listing_id, stock_qty, shelf_life_days, produce_listings!inner(id, name, emoji, status, shelf_life_days)')
      // A harvest has its own stock, so a 'sold_out' template must not hide it —
      // only a genuine takedown (paused/suspended) should. See produceStatus.ts.
      .in('produce_listings.status', CONSUMER_VISIBLE_STATUSES)
      // Paused picks are hidden from buyers without being deleted.
      .eq('paused', false)
    // Fresh = already picked and still inside its shelf life, newest first.
    // Upcoming = picks in the next 7 days (pre-book), soonest first.
    //
    // Shelf life is what decides freshness, not a fixed age: a 30-day turmeric
    // and a 2-day leafy green are both "fresh" for as long as the farmer says
    // they keep. Postgres can't compare a row against its own shelf-life column
    // through PostgREST, so we over-fetch a generous window here and let
    // freshnessLeftDays() (the same helper behind the "3 days fresh left" label)
    // make the call below — one definition of fresh, not two.
    const q =
      variant === 'fresh'
        ? base
            .gte('harvested_at', new Date(now - MAX_SHELF_LIFE_DAYS * DAY).toISOString())
            .lte('harvested_at', new Date(now).toISOString())
            .order('harvested_at', { ascending: false })
        : base
            .gt('harvested_at', new Date(now).toISOString())
            .lte('harvested_at', new Date(now + 7 * DAY).toISOString())
            .order('harvested_at', { ascending: true })
    q.limit(60).then(({ data }) => {
      if (cancelled) return
      const all = (data ?? []) as HarvestRow[]
      const visible = variant === 'upcoming' ? all : all.filter(isStillFresh)
      // Sold-out harvests STAY in the table, shown as sold out with the add
      // button replaced. Dropping them made a farmer's crop vanish the moment
      // the last kilo went, which is the one moment a buyer most wants to know
      // it exists — same reasoning as CONSUMER_VISIBLE_STATUSES for the grid.
      // They sink below everything buyable: context, not the offer.
      setRows(
        [...visible]
          .sort((a, b) => Number(isHarvestSoldOut(a)) - Number(isHarvestSoldOut(b)))
          .slice(0, 12),
      )
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [variant])

  // One listing from the embed (handle either object or single-element array).
  const listingOf = (r: HarvestRow): Listing | null => {
    const l = r.produce_listings
    if (!l) return null
    return Array.isArray(l) ? (l[0] ?? null) : l
  }

  // Add THIS harvest to the cart from the table (keyed by harvest id, so two
  // harvests of the same produce are separate cart lines). The row holds the
  // harvest's own stock/date; we fetch price tiers + farmer from the template on
  // tap. requireAuth gates it behind consumer login.
  const addHarvestToCart = (r: HarvestRow) => {
    if (adding[r.id]) return
    requireAuth(async () => {
      setAdding((s) => ({ ...s, [r.id]: true }))
      const { data: listing } = await supabase
        .from('produce_listings')
        .select('id, name, variety, emoji, unit, price_tier_1_qty, price_tier_1_price, price_tier_2_qty, price_tier_2_price, price_tier_3_price, farmer_id')
        .eq('id', r.produce_listing_id)
        .single()
      if (!listing) { setAdding((s) => ({ ...s, [r.id]: false })); return }
      const { data: farmer } = await supabase
        .from('farmers')
        .select('id, name, phone, village, slug, pickup_locations, pickup_slots')
        .eq('id', listing.farmer_id)
        .single()
      setAdding((s) => ({ ...s, [r.id]: false }))
      if (!farmer?.phone || !listing.price_tier_1_price) return
      addItem({
        listingId: listing.id,
        harvestId: r.id,
        harvestedAt: r.harvested_at,
        shelfLifeDays: r.shelf_life_days ?? undefined,
        name: listing.name,
        variety: listing.variety,
        emoji: listing.emoji,
        unit: listing.unit ?? undefined,
        stockQty: r.stock_qty ?? undefined,
        pricePerKg: listing.price_tier_1_price,
        priceTier1Qty: listing.price_tier_1_qty,
        priceTier1Price: listing.price_tier_1_price,
        priceTier2Qty: listing.price_tier_2_qty,
        priceTier2Price: listing.price_tier_2_price,
        priceTier3Price: listing.price_tier_3_price,
        farmerId: farmer.id,
        farmerName: farmer.name,
        farmerPhone: farmer.phone,
        farmerVillage: farmer.village ?? '',
        farmerSlug: farmer.slug,
        farmerPickupLocations: farmer.pickup_locations ?? [],
        farmerPickupSlots: normalizePickupSchedule(farmer.pickup_slots, farmer.pickup_locations ?? []),
      }, 1)
    })
  }

  if (!loaded || rows.length === 0) return null

  const title = variant === 'fresh'
    ? L('Fresh Harvests near you', 'మీ దగ్గర తాజా కోతలు')
    : L('Upcoming Harvests', 'రాబోయే కోతలు')
  const icon = variant === 'fresh' ? '🌾' : '🌱'
  const hint = variant === 'fresh' ? L('Freshest first', 'తాజావి ముందు') : L('Soonest first', 'త్వరలో వచ్చేవి')
  const whenLabel = variant === 'fresh' ? L('When', 'ఎప్పుడు') : L('Expected', 'అంచనా')

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden self-start">
      <div className="px-4 pt-4 pb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-extrabold text-gray-900">
          {icon} {title}
        </h2>
        <span className="text-[11px] text-gray-500 whitespace-nowrap">{hint}</span>
      </div>

      {/* Two columns, with the harvest time stacked under the name rather than
          beside it. Measured at a 390px viewport (a 358px card): real names need
          34–142px of text ("Ladies Finger" 107, "Pasupu / Turmeric" 142) and the
          stepper needs 122px at its widest ("− 100 kg +"). Those don't fit
          alongside a time column too, and the name was the column that lost —
          hence the old "To…". Stacked, the name gets ~188px and always fits.
          table-fixed so the stepper keeps its width instead of the browser
          handing it to whichever cell asks loudest. */}
      <table className="w-full text-left border-collapse table-fixed">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
            <th className="font-bold px-4 py-2">{L('Harvest', 'కోత')}</th>
            <th className="w-[122px]" aria-hidden="true"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const item = listingOf(r)
            if (!item) return null
            const soldOut = isHarvestSoldOut(r)
            return (
              <tr
                key={r.id}
                onClick={() => router.push(`/consumer/harvest/${r.id}`)}
                className={`border-b border-gray-50 last:border-0 cursor-pointer active:bg-green-50 ${soldOut ? 'bg-gray-50/60' : ''}`}
              >
                <td className="pl-4 pr-2 py-3">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-lg shrink-0 ${soldOut ? 'grayscale opacity-60' : ''}`}>{item.emoji || '🌿'}</span>
                    <span className={`text-sm font-bold truncate ${soldOut ? 'text-gray-500' : 'text-gray-900'}`}>
                      {localizeName(item.name, lang)}
                    </span>
                    {soldOut && (
                      <span className="shrink-0 text-[9px] font-black uppercase tracking-wide text-red-600 bg-red-50 rounded-full px-1.5 py-0.5">
                        {L('Sold out', 'అయిపోయింది')}
                      </span>
                    )}
                  </span>
                  {/* Bare relative time ("2 days ago"), not harvestClock's full
                      "Harvested 2 days ago" — this line sits under the name where
                      the prefix reads as noise. The detail page keeps the long
                      form. Indented past the emoji to line up with the name. */}
                  <span className={`block pl-[26px] text-[11px] font-semibold ${soldOut ? 'text-gray-400' : variant === 'fresh' ? 'text-green-700' : 'text-blue-700'}`}>
                    ⏱ {harvestRelTime(r.harvested_at, L)}
                  </span>
                </td>
                {/* Quantity stepper — adds/adjusts THIS harvest (keyed by harvest
                    id, so the fresh and upcoming rows don't mirror each other).
                    Shows a single + until it's in the cart, then − qty +.
                    stopPropagation so taps don't also open the details row. */}
                <td className="pr-2 pl-1 py-3 text-right align-middle">
                  {soldOut ? (
                    // No stepper and no +: the row is here to say the crop
                    // exists and has gone, not to sell it.
                    <span className="text-[11px] font-bold text-gray-400">
                      {L('Sold out', 'అయిపోయింది')}
                    </span>
                  ) : cart[r.id] ? (
                    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setQty(r.id, (cart[r.id]?.qty ?? 1) - 1) }}
                        aria-label={L('Remove one', 'ఒకటి తీసివేయండి')}
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-50 text-green-700 text-base leading-none active:scale-95"
                      >
                        −
                      </button>
                      <EditableQty
                        qty={cart[r.id]?.qty ?? 1}
                        unit="kg"
                        max={cart[r.id]?.stockQty}
                        onChange={(n) => setQty(r.id, n)}
                        inputClassName="text-sm font-bold text-gray-900"
                        unitClassName="text-sm font-bold text-gray-900"
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setQty(r.id, (cart[r.id]?.qty ?? 0) + 1) }}
                        aria-label={L('Add one', 'ఒకటి జోడించండి')}
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-600 text-white text-base leading-none active:scale-95"
                      >
                        +
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void addHarvestToCart(r) }}
                      disabled={!!adding[r.id]}
                      aria-label={L('Add to cart', 'బుట్టలో వేయండి')}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-50 text-green-700 text-lg leading-none active:scale-95 disabled:opacity-50"
                    >
                      {adding[r.id] ? <span className="text-xs leading-none">…</span> : '+'}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Hint so it's clear the rows are tappable. */}
      <p className="px-4 pb-3 pt-1 text-[11px] text-gray-400">
        {L('Tap a harvest to see full details', 'పూర్తి వివరాల కోసం కోతను నొక్కండి')}
      </p>
    </div>
  )
}

export function FreshHarvestsTable() {
  return <HarvestTable variant="fresh" />
}

export function UpcomingHarvestsTable() {
  return <HarvestTable variant="upcoming" />
}

export default FreshHarvestsTable
