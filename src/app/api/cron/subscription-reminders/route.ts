import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendSubscriptionReminders } from '@/lib/subscriptionReminders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Daily (vercel.json, 09:00 India): WhatsApp aggregators whose plan ends within
// 3 days. CRON_SECRET is required and checked exactly like
// /api/cron/reconcile-payments — a missing secret refuses to run rather than
// publishing an endpoint that messages people.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[YFF cron/subscription-reminders] CRON_SECRET is not set — refusing to run.')
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const r = await sendSubscriptionReminders(supabase)
  return NextResponse.json({ ok: true, due: r.due.length, sent: r.sent })
}
