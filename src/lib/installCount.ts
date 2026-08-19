import { createClient } from '@supabase/supabase-js'

/* How many devices have installed the app — the figure shown beside the
 * Download button on /home.
 *
 * Server side only: app_installs is service-role-only (see
 * scripts/app-installs-migration.sql), and the browser has no business
 * reading the table when all it needs is one number. Best-effort like
 * purchaseCountsFor — a marketing page must never 500 because a count
 * query hiccuped, so any failure reads as "no count yet" and the badge
 * simply doesn't render. */

export type InstallPlatform = 'android' | 'ios' | 'desktop'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Total installs, or null when the number could not be read. */
export async function installCount(): Promise<number | null> {
  try {
    // head:true — we want the count header, not the rows.
    const { count, error } = await svc()
      .from('app_installs')
      .select('id', { count: 'exact', head: true })
    if (error) {
      console.error('[YFF installs] count failed:', error.message)
      return null
    }
    return count ?? 0
  } catch {
    return null
  }
}

/** Record one install. Idempotent per device — the UNIQUE device_id makes a
 *  repeat report a no-op rather than a second download. Returns the fresh
 *  total, or null if it could not be written. */
export async function recordInstall(
  deviceId: string,
  role: string | null,
  platform: InstallPlatform | null,
): Promise<number | null> {
  try {
    const { error } = await svc()
      .from('app_installs')
      .upsert(
        { device_id: deviceId, role, platform },
        { onConflict: 'device_id', ignoreDuplicates: true },
      )
    if (error) {
      console.error('[YFF installs] insert failed:', error.message)
      return null
    }
  } catch {
    return null
  }
  return installCount()
}
