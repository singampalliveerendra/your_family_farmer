'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import ModeratorShell, { useModeratorAuth } from '../../../ModeratorShell'
import ModeratorFarmerForm, { type FarmerInitial } from '@/components/moderator/ModeratorFarmerForm'
import { normalizePickupSchedule } from '@/lib/pickup-slots'

// Raw farmer row from GET /api/moderator/farmers/[id].
type FarmerRow = {
  id: string
  slug: string
  name: string | null
  phone: string | null
  village: string | null
  district: string | null
  method: string | null
  story_quote: string | null
  farm_size_acres: number | null
  farming_since_year: number | null
  farm_address: string | null
  soil_organic_carbon: number | null
  soil_ph: number | null
  water_source: string | null
  upi_id: string | null
  cod_enabled: boolean | null
  bank_account_number: string | null
  bank_ifsc: string | null
  pickup_locations: string[] | null
  pickup_slots: unknown
  cover_photo_url: string | null
  photo_url: string | null
  pesticide_cert_url: string | null
  upi_qr_code_url: string | null
  lat: number | null
  lng: number | null
  location_name: string | null
}

const str = (v: string | number | null | undefined) => (v == null ? '' : String(v))

function toInitial(f: FarmerRow): FarmerInitial {
  return {
    name: str(f.name),
    phone: str(f.phone),
    village: str(f.village),
    district: str(f.district),
    method: f.method || 'natural',
    farm_size_acres: str(f.farm_size_acres),
    farming_since_year: str(f.farming_since_year),
    story_quote: str(f.story_quote),
    farm_address: str(f.farm_address),
    upi_id: str(f.upi_id),
    soil_organic_carbon: str(f.soil_organic_carbon),
    soil_ph: str(f.soil_ph),
    water_source: str(f.water_source),
    bank_account_number: str(f.bank_account_number),
    bank_ifsc: str(f.bank_ifsc),
    pickup_locations: Array.isArray(f.pickup_locations) ? f.pickup_locations : [],
    pickup_slots: normalizePickupSchedule(
      f.pickup_slots,
      Array.isArray(f.pickup_locations) ? f.pickup_locations : [],
    ),
    cod_enabled: f.cod_enabled === true,
    lat: typeof f.lat === 'number' ? f.lat : null,
    lng: typeof f.lng === 'number' ? f.lng : null,
    location_name: str(f.location_name),
    cover_photo_url: f.cover_photo_url ?? null,
    photo_url: f.photo_url ?? null,
    pesticide_cert_url: f.pesticide_cert_url ?? null,
    upi_qr_code_url: f.upi_qr_code_url ?? null,
  }
}

export default function EditFarmerPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id
  const { zone, checked } = useModeratorAuth()
  const [farmer, setFarmer] = useState<FarmerRow | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const r = await fetch(`/api/moderator/farmers/${id}`, { credentials: 'same-origin' }).catch(() => null)
    setLoading(false)
    if (!r) { setError('Network error.'); return }
    const json = await r.json().catch(() => ({}))
    if (!r.ok) { setError(json?.error ?? 'Could not load farmer.'); return }
    setFarmer(json.farmer as FarmerRow)
  }, [id])

  useEffect(() => { if (checked && zone) void load() }, [checked, zone, load])

  if (!checked || !zone) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-700 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <ModeratorShell
      title="Edit farmer profile"
      subtitle={farmer?.name ? `Editing ${farmer.name}` : 'Update an existing farmer'}
      zone={zone}
    >
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm font-semibold mb-4">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
      ) : farmer ? (
        <ModeratorFarmerForm
          mode="edit"
          farmerId={farmer.id}
          initial={toInitial(farmer)}
          onSaved={() => router.push('/moderator/farmers')}
          onCancel={() => router.push('/moderator/farmers')}
        />
      ) : !error ? (
        <p className="text-sm text-gray-400 py-10 text-center">Farmer not found.</p>
      ) : null}
    </ModeratorShell>
  )
}
