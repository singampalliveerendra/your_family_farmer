import type { ReactNode } from 'react'

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

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
