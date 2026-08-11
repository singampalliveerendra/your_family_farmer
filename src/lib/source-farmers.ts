import type { SupabaseClient } from '@supabase/supabase-js'

// The farmers an aggregator sources from. Contact records, not accounts — no
// slug, no password, no dashboard, no login.
//
// Both the aggregator's own dashboard and the moderator screens go through this
// module, so the two surfaces cannot drift apart on validation or on the rules
// about what may be deleted. The only difference between them is how
// aggregatorId is resolved: from the farmer session cookie in one case, from a
// zone-checked query parameter in the other.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const SOURCE_FARMER_COLUMNS = 'id, name, village, address, phone, created_at'

export type SourceFarmerInput = {
  name: string
  village: string | null
  address: string | null
  phone: string | null
}

/**
 * Name and phone are required: the buyer-facing promise is that they can see who
 * grew the produce and reach them. Address and village are optional — a village
 * alone is often the whole address in rural AP — but village is what the consumer
 * card title uses, so it is worth asking for.
 */
export function validateSourceFarmer(raw: {
  name?: unknown
  village?: unknown
  address?: unknown
  phone?: unknown
}): { ok: true; value: SourceFarmerInput } | { ok: false; error: string } {
  const name = String(raw.name ?? '').trim().slice(0, 100)
  const village = String(raw.village ?? '').trim().slice(0, 100)
  const address = String(raw.address ?? '').trim().slice(0, 300)
  const phone = String(raw.phone ?? '').replace(/\D/g, '').slice(-10)

  if (!name) {
    return { ok: false, error: "Please enter the farmer's name." }
  }
  if (phone.length !== 10) {
    return { ok: false, error: 'Enter a valid 10-digit phone number.' }
  }

  return {
    ok: true,
    value: {
      name,
      village: village || null,
      address: address || null,
      phone,
    },
  }
}

export async function listSourceFarmers(svc: SupabaseClient, aggregatorId: string) {
  return svc
    .from('source_farmers')
    .select(SOURCE_FARMER_COLUMNS)
    .eq('aggregator_id', aggregatorId)
    .order('name', { ascending: true })
}

export async function createSourceFarmer(
  svc: SupabaseClient,
  aggregatorId: string,
  value: SourceFarmerInput,
) {
  return svc
    .from('source_farmers')
    .insert({ aggregator_id: aggregatorId, ...value })
    .select(SOURCE_FARMER_COLUMNS)
    .single()
}

/**
 * Scoped to aggregatorId on the WHERE clause, so neither an aggregator nor a
 * moderator can edit a record belonging to a different aggregator by guessing an
 * id.
 */
export async function updateSourceFarmer(
  svc: SupabaseClient,
  aggregatorId: string,
  id: string,
  value: SourceFarmerInput,
) {
  return svc
    .from('source_farmers')
    .update({ ...value, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('aggregator_id', aggregatorId)
    .select(SOURCE_FARMER_COLUMNS)
    .maybeSingle()
}

/**
 * Deleting a farmer who has harvests on record would erase the attribution that
 * is the whole point of the feature. harvests.source_farmer_id is ON DELETE
 * RESTRICT so the database refuses it regardless; this check exists to turn that
 * into a sentence a human can act on.
 */
export async function deleteSourceFarmer(
  svc: SupabaseClient,
  aggregatorId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { count } = await svc
    .from('harvests')
    .select('id', { count: 'exact', head: true })
    .eq('source_farmer_id', id)

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      status: 409,
      error:
        `This farmer has ${count} harvest${count === 1 ? '' : 's'} on record and cannot be removed. ` +
        'Buyers need to see who grew what they bought.',
    }
  }

  const { data, error } = await svc
    .from('source_farmers')
    .delete()
    .eq('id', id)
    .eq('aggregator_id', aggregatorId)
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, status: 500, error: error.message }
  if (!data) return { ok: false, status: 404, error: 'Farmer not found.' }
  return { ok: true }
}
