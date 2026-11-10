import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import { isRetailVisible, readWithSaleMode } from '@/lib/wholesaleVisibility'
import { productMetadata, type ProductMetaInput } from '@/lib/productShare'

// The page under this layout is a client component: the server only sends its
// empty shell, and the phone loads the produce itself. That shell is the same
// for every id, yet without this it was rendered on the server on every visit
// — and these are the links shared most on WhatsApp. An empty
// generateStaticParams lets each id's shell be built once on first visit and
// then served from Vercel's cache. (A 'use client' page cannot export this
// itself, which is why it lives in a layout.)
export async function generateStaticParams() {
  return []
}

// The shell now carries this produce's link preview (below), so it is rebuilt
// at most every 5 minutes: a new photo or price reaches WhatsApp previews
// within that, for one small query per product per window.
export const revalidate = 300

// WhatsApp, Telegram etc. read these tags to draw the preview card under a
// shared link — this is what puts the orange's photo, name and price in the
// chat instead of the generic site card. See src/lib/productShare.ts.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const cols = 'name, variety, method, unit, price_tier_1_price, retail_pack_size, retail_pack_price, image_url, image_urls, farmer:farmers!farmer_id(name, village)'
  const { data } = await readWithSaleMode((withMode) =>
    supabase.from('produce_listings').select(withMode ? `${cols}, sale_mode` : cols).eq('id', id).maybeSingle())
  // Missing, hidden from the public by RLS, or wholesale-only (never previewed
  // for household buyers): keep the site's default preview.
  // The column list is built at runtime, so supabase-js can't type the row.
  const row = data as unknown as (Omit<ProductMetaInput, 'farmer'> & {
    sale_mode?: unknown
    farmer: ProductMetaInput['farmer'] | ProductMetaInput['farmer'][]
  }) | null
  if (!row || !isRetailVisible(row)) return {}
  const farmer = Array.isArray(row.farmer) ? row.farmer[0] : row.farmer
  return productMetadata({ ...row, farmer })
}

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
