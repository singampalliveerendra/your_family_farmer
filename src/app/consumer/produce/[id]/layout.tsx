import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import { productMetadata } from '@/lib/productShare'

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
  const { data } = await supabase
    .from('produce_listings')
    .select('name, variety, method, unit, price_tier_1_price, image_url, image_urls, farmer:farmers!farmer_id(name, village)')
    .eq('id', id)
    .maybeSingle()
  // Missing, or hidden from the public by RLS: keep the site's default preview.
  if (!data) return {}
  const farmer = Array.isArray(data.farmer) ? data.farmer[0] : data.farmer
  return productMetadata({ ...data, farmer })
}

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
