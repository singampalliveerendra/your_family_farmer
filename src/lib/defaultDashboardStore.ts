import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  parseDefaultDashboard,
  resolveAccountPhone,
  type DefaultDashboard,
  type SessionIds,
} from './defaultDashboard'

/* Server-only persistence for the default-dashboard preference
 * (scripts/default-dashboard-migration.sql). `dashboard_preferences` is
 * service-role only: RLS on, no policies, no anon grants. Every read and write
 * goes through a route that has already verified a session cookie. */

const TABLE = 'dashboard_preferences'

function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function accountPhoneFor(ids: SessionIds, db: SupabaseClient = serviceClient()) {
  return resolveAccountPhone(ids, {
    farmerPhone: async (id) =>
      (await db.from('farmers').select('phone').eq('id', id).maybeSingle()).data?.phone,
    consumerPhone: async (id) =>
      (await db.from('consumers_auth').select('phone').eq('id', id).maybeSingle()).data?.phone,
  })
}

export async function readDefaultDashboard(
  phone: string,
  db: SupabaseClient = serviceClient(),
): Promise<DefaultDashboard | null> {
  const { data, error } = await db
    .from(TABLE)
    .select('default_dashboard')
    .eq('phone', phone)
    .maybeSingle()
  if (error) throw error
  return parseDefaultDashboard(data?.default_dashboard)
}

/** `null` clears it, which puts `/` back on its normal landing behaviour. */
export async function writeDefaultDashboard(
  phone: string,
  pref: DefaultDashboard | null,
  db: SupabaseClient = serviceClient(),
): Promise<void> {
  const { error } =
    pref === null
      ? await db.from(TABLE).delete().eq('phone', phone)
      : await db
          .from(TABLE)
          .upsert({ phone, default_dashboard: pref, updated_at: new Date().toISOString() })
  if (error) throw error
}

/**
 * The saved preference for whoever is signed in on this request, or null.
 *
 * Swallows errors on purpose: `/` calls this on every launch of the app, and a
 * missing table (migration not yet run in this environment) or a Supabase
 * blip must degrade to the ordinary landing, never to an error page on the
 * app's front door.
 */
export async function defaultDashboardForSessions(ids: SessionIds): Promise<DefaultDashboard | null> {
  if (!ids.farmerId && !ids.consumerId) return null
  try {
    const db = serviceClient()
    const phone = await accountPhoneFor(ids, db)
    return phone ? await readDefaultDashboard(phone, db) : null
  } catch (e) {
    console.error('[default-dashboard] lookup failed', e)
    return null
  }
}
