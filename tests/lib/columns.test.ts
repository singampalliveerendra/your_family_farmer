import { describe, it, expect } from 'vitest'
import { FARMER_PUBLIC_COLUMNS } from '@/lib/farmerColumns'
import {
  FARMER_ORDER_COLUMNS,
  FARMER_ORDER_DETAIL_COLUMNS,
  FARMER_ORDER_RESCHEDULE_COLUMNS,
} from '@/lib/orderColumns'

// These two strings are security boundaries, not formatting.
//
// The anon Supabase key ships inside every JS bundle, so ANY column the anon
// role can select is effectively public — a select('*') from a client component
// hands a farmer's password hash and bank details to anyone who opens DevTools.
// FARMER_PUBLIC_COLUMNS is the allow-list that keeps our queries in step with
// the Postgres column grants, and this test is the tripwire on it.

const cols = (list: string) =>
  list.split(',').map((c) => c.trim().split(':')[0].split('(')[0].trim())

describe('FARMER_PUBLIC_COLUMNS', () => {
  // USE: the one that matters. If a future edit adds a secret to this list —
  // or someone "restores" a column the lockdown removed — every farmer's
  // password hash or bank account becomes readable from the browser. Nothing
  // else in the codebase would fail; only this test.
  it('never names a secret column', () => {
    const secrets = [
      'password_hash',
      'bank_account_number',
      'bank_ifsc',
      'activation_code',
      'otp_hash',
      'reset_token',
    ]
    for (const secret of secrets) {
      expect(cols(FARMER_PUBLIC_COLUMNS)).not.toContain(secret)
    }
  })

  // USE: it must still carry what a public profile actually renders, so a
  // careless "tighten the list" edit that breaks the farmer page is caught here
  // rather than by a client noticing blank profiles.
  it('still carries the fields a public farmer profile renders', () => {
    for (const needed of ['id', 'slug', 'name', 'village', 'region_slug', 'photo_url']) {
      expect(cols(FARMER_PUBLIC_COLUMNS)).toContain(needed)
    }
  })

  // USE: supabase-js derives the row TYPE from the literal type of this string.
  // Building it with .join() or + widens it to `string` and silently degrades
  // every consumer to GenericStringError — the app still compiles, and every
  // typed field becomes an error object at runtime.
  it('is a single literal, never a joined or wildcard list', () => {
    expect(typeof FARMER_PUBLIC_COLUMNS).toBe('string')
    expect(FARMER_PUBLIC_COLUMNS).not.toContain('*')
  })
})

describe('the farmer order column lists', () => {
  // USE: the self-pickup handover code. The farmer confirms a pickup by POSTing
  // the code the BUYER reads out, and the server compares it. Shipping the code
  // to the farmer's screen would let any farmer close any of their own orders
  // with no buyer present — collecting payment for produce never handed over.
  it('never sends the handover code to the farmer', () => {
    expect(FARMER_ORDER_COLUMNS).not.toContain('handover_otp')
    expect(FARMER_ORDER_DETAIL_COLUMNS).not.toContain('handover_otp')
  })

  // USE: the two lists feed the SAME FarmerOrder shape, so every field the
  // order card renders has to be in both. A field added to the list and
  // forgotten in the detail route is a silently blank cell on the detail
  // screen, never an error — which is exactly the failure this file exists to
  // catch. (produce_listing_id is deliberately list-only: the detail screen
  // never renders it, and the routes that restock select it themselves.)
  it('carries every rendered field on both the list and the detail screen', () => {
    const detail = cols(FARMER_ORDER_DETAIL_COLUMNS)
    const list = cols(FARMER_ORDER_COLUMNS)
    const rendered = [
      'order_code', 'produce_name', 'quantity', 'unit', 'total_price',
      'delivery_fee', 'platform_fee', 'buyer_name', 'buyer_phone', 'status',
      'payment_method', 'payment_status', 'refund_status', 'refund_amount',
      'delivery_type', 'delivery_status', 'acknowledged_at',
    ]
    for (const c of rendered) {
      expect(list).toContain(c)
      expect(detail).toContain(c)
    }
  })

  // USE: the detail screen exists to let the farmer FULFIL the order, so it
  // must add the buyer's address. Without it a home-delivery order cannot be
  // handed to a rider at all.
  it('adds the delivery address the detail screen needs to fulfil an order', () => {
    const detail = cols(FARMER_ORDER_DETAIL_COLUMNS)
    for (const c of ['delivery_address', 'delivery_pincode', 'delivery_landmark']) {
      expect(detail).toContain(c)
    }
  })

  // USE: reschedule_reason is deliberately NOT inlined. Postgres fails the
  // WHOLE select on one unknown column, so inlining a column whose migration
  // may not have run turns "the reason is blank" into "the order page 500s".
  // The route asks for these separately and retries without them.
  it('keeps the reschedule columns separate so a missing migration cannot 500 the page', () => {
    expect(FARMER_ORDER_DETAIL_COLUMNS).not.toContain('reschedule_reason')
    expect(FARMER_ORDER_RESCHEDULE_COLUMNS.trim().startsWith(',')).toBe(true)
    expect(FARMER_ORDER_RESCHEDULE_COLUMNS).toContain('reschedule_reason')
  })
})
