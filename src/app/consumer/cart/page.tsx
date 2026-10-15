'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { CartSheet, useCart } from '@/components/consumer/Cart'
import { cartSignature, CART_SEEN_KEY } from '@/lib/bottomNav'

// Full-screen cart / checkout page. The cart used to be a bottom-sheet overlay
// on the consumer home; it now has its own route so it reads like a proper
// checkout flow (Flipkart / Blinkit style) with a back arrow and full-height
// sections. All the checkout logic lives in CartSheet — here we just mount it
// in fullPage mode and send the back arrow home.
export default function ConsumerCartPage() {
  const router = useRouter()
  const { items, cart } = useCart()

  // Being here is "looking at the cart": the bottom bar's cart button stops
  // glowing until something new goes in. Kept in step with edits made here.
  useEffect(() => {
    try { localStorage.setItem(CART_SEEN_KEY, cartSignature(cart)) } catch { /* blocked */ }
  }, [cart])

  return (
    <main className="min-h-screen bg-gray-50">
      <CartSheet items={items} fullPage onClose={() => router.push('/consumer')} />
    </main>
  )
}
