import { NextRequest, NextResponse } from 'next/server'
import { installCount, recordInstall, type InstallPlatform } from '@/lib/installCount'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* GET  /api/installs — the public download count.
 * POST /api/installs — record that this device installed the app.
 *
 * The count is rendered on the server for /home, so GET exists only for a
 * surface that wants to refresh the figure without a reload. POST is open
 * (there is no session at install time) but harmless: the device_id is
 * UNIQUE, so the worst a caller can do is add rows for ids it invents —
 * which the IP rate limit below keeps to a trickle. */

const ROLES = new Set(['consumer', 'seller'])
const PLATFORMS = new Set<InstallPlatform>(['android', 'ios', 'desktop'])

export async function GET() {
  return NextResponse.json({ count: await installCount() })
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  // A device reports its install once. Ten an hour per IP still covers a
  // family sharing one connection, or a demo on a handful of phones.
  if (!rateLimit(`install:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ count: await installCount() })
  }

  let body: { deviceId?: unknown; role?: unknown; platform?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : ''
  // Client-minted uuid; bound the length so nothing daft lands in the column.
  if (deviceId.length < 8 || deviceId.length > 64) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const role = typeof body.role === 'string' && ROLES.has(body.role) ? body.role : null
  const platform =
    typeof body.platform === 'string' && PLATFORMS.has(body.platform as InstallPlatform)
      ? (body.platform as InstallPlatform)
      : null

  return NextResponse.json({ count: await recordInstall(deviceId, role, platform) })
}
