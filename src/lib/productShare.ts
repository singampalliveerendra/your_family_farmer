// Sharing ONE product (the share icon on a card, the Share pill on a produce or
// harvest page). Two things carry the photo to WhatsApp:
//
// 1. The share itself attaches the product photo as an image file, with the
//    message as its caption (src/components/consumer/ShareButton.tsx).
// 2. The shared link's page carries Open Graph tags with the same photo, so
//    wherever only the link travels (WhatsApp Web, a copied link, a phone that
//    can't share files) the chat still shows the product picture as the
//    preview (src/app/consumer/produce/[id]/layout.tsx).
//
// The farmer's multi-product catalogue images are a different feature:
// src/lib/produceShare.ts.

import type { Metadata } from 'next'

export const SITE_NAME = 'Go Grameen'

type WithPhotos = { image_urls?: string[] | null; image_url?: string | null }

/** The product's cover photo — the same one its card shows. */
export function coverImageUrl(item: WithPhotos): string | null {
  const first = item.image_urls?.find((u) => typeof u === 'string' && u.trim() !== '')
  return first ?? (item.image_url?.trim() ? item.image_url : null)
}

/** File name for the attached photo, e.g. "orange.jpg". */
export function shareImageFileName(name: string, mime: string): string {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return `${base || 'produce'}.${ext}`
}

const METHOD_EN: Record<string, string> = {
  natural: 'Natural',
  organic: 'Organic',
  low_chemical: 'Semi-Organic',
  chemical: 'Chemical',
}

export type ProductMetaInput = WithPhotos & {
  name: string
  variety?: string | null
  method?: string | null
  price_tier_1_price?: number | null
  unit?: string | null
  farmer?: { name?: string | null; village?: string | null } | null
}

/**
 * Link-preview tags for a product page. English only: the preview is built
 * once on the server for everyone, before anyone's language is known.
 */
export function productMetadata(p: ProductMetaInput): Metadata {
  const title = `${p.name}${p.variety ? ` (${p.variety})` : ''}${p.price_tier_1_price != null ? ` — ₹${p.price_tier_1_price}/${p.unit || 'kg'}` : ''}`
  const method = p.method ? METHOD_EN[p.method.toLowerCase()] : undefined
  const farmer = p.farmer?.name
    ? `${p.farmer.name}${p.farmer.village ? `, ${p.farmer.village}` : ''}`
    : null
  const description = [
    method ? `${method} farming` : null,
    farmer ? `Grown by ${farmer}` : null,
    'Order fresh, straight from the farmer.',
  ].filter(Boolean).join(' · ')
  const image = coverImageUrl(p)
  return {
    title: `${title} | ${SITE_NAME}`,
    description,
    openGraph: {
      title,
      description,
      siteName: SITE_NAME,
      type: 'website',
      ...(image ? { images: [{ url: image, alt: p.name }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}
