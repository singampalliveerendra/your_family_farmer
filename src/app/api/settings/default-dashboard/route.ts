import { NextRequest, NextResponse } from 'next/server'
import { getConsumerSessionFromRequest } from '@/lib/session'
import { getFarmerSessionFromRequest } from '@/lib/farmer-session'
import { parseDefaultDashboard } from '@/lib/defaultDashboard'
import {
  accountPhoneFor,
  readDefaultDashboard,
  writeDefaultDashboard,
} from '@/lib/defaultDashboardStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* The Settings → Default dashboard control, for either kind of account.
 *
 * Accepts a seller OR a buyer session: the setting lives in both the farmer
 * dashboard and the shop's ⚙️ menu, and it is the same setting in both places
 * because it is filed under the phone (see src/lib/defaultDashboard.ts). The
 * session is re-derived from the HTTP-only cookies — the body never names an
 * account — so nobody can set another person's default. */

async function phoneFromRequest(req: NextRequest): Promise<string | null> {
  return accountPhoneFor({
    farmerId: getFarmerSessionFromRequest(req)?.farmerId,
    consumerId: getConsumerSessionFromRequest(req)?.consumerId,
  })
}

export async function GET(req: NextRequest) {
  try {
    const phone = await phoneFromRequest(req)
    if (!phone) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })
    return NextResponse.json({ defaultDashboard: await readDefaultDashboard(phone) })
  } catch (e) {
    console.error('[default-dashboard] GET failed', e)
    return NextResponse.json({ error: 'Could not load your setting.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const raw = body && typeof body === 'object' ? (body as { defaultDashboard?: unknown }).defaultDashboard : undefined
  // null is a deliberate "no default" — it restores the normal landing page.
  const pref = raw === null ? null : parseDefaultDashboard(raw)
  if (raw !== null && pref === null) {
    return NextResponse.json({ error: 'Choose Farmer or Consumer.' }, { status: 400 })
  }

  try {
    const phone = await phoneFromRequest(req)
    if (!phone) return NextResponse.json({ error: 'Please log in.' }, { status: 401 })
    await writeDefaultDashboard(phone, pref)
    return NextResponse.json({ defaultDashboard: pref })
  } catch (e) {
    console.error('[default-dashboard] PUT failed', e)
    return NextResponse.json({ error: 'Could not save your setting.' }, { status: 500 })
  }
}
