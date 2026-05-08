export type Town = { name: string; lat: number; lng: number }

export const AP_TOWNS: Town[] = [
  { name: 'Tadepalligudem', lat: 16.8142, lng: 81.5288 },
  { name: 'Bhimavaram', lat: 16.5444, lng: 81.5216 },
  { name: 'Eluru', lat: 16.7107, lng: 81.0952 },
  { name: 'Narsapur', lat: 16.4347, lng: 81.6946 },
  { name: 'Tanuku', lat: 16.7551, lng: 81.6818 },
  { name: 'Kovvur', lat: 17.0128, lng: 81.7295 },
  { name: 'Palakol', lat: 16.5139, lng: 81.7342 },
  { name: 'Akividu', lat: 16.5826, lng: 81.3968 },
  { name: 'Chintalapudi', lat: 16.8319, lng: 80.9827 },
  { name: 'Polavaram', lat: 17.2487, lng: 81.6395 },
  { name: 'Jangareddygudem', lat: 17.1000, lng: 81.2833 },
  { name: 'Nidadavole', lat: 16.9000, lng: 81.6500 },
  { name: 'Undi', lat: 16.6500, lng: 81.6000 },
  { name: 'Denduluru', lat: 16.8833, lng: 81.4000 },
  { name: 'Pedavegi', lat: 16.9167, lng: 81.1167 },
  { name: 'Rajahmundry', lat: 17.0050, lng: 81.7799 },
  { name: 'Vijayawada', lat: 16.5062, lng: 80.6480 },
  { name: 'Guntur', lat: 16.3067, lng: 80.4365 },
  { name: 'Kakinada', lat: 16.9891, lng: 82.2475 },
  { name: 'Gudivada', lat: 16.4347, lng: 80.9947 },
  { name: 'Machilipatnam', lat: 16.1875, lng: 81.1389 },
  { name: 'Visakhapatnam', lat: 17.6868, lng: 83.2185 },
  { name: 'Tenali', lat: 16.2427, lng: 80.6440 },
  { name: 'Bapatla', lat: 15.9049, lng: 80.4674 },
  { name: 'Narasaraopet', lat: 16.2333, lng: 80.0500 },
]

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function nearestTown(lat: number, lng: number): string {
  let best = AP_TOWNS[0]
  let bestDist = haversineKm(lat, lng, best.lat, best.lng)
  for (const town of AP_TOWNS) {
    const d = haversineKm(lat, lng, town.lat, town.lng)
    if (d < bestDist) { bestDist = d; best = town }
  }
  return best.name
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

// Look up a town in AP_TOWNS by name. Case-insensitive, also matches when the
// user-entered name contains a town name (e.g. "Tadepalligudem Rural" → matches
// "Tadepalligudem"). Returns null if no town matches.
export function townByName(name: string | null | undefined): Town | null {
  if (!name) return null
  const q = name.toLowerCase().trim()
  if (!q) return null
  // Exact match first, then substring match
  const exact = AP_TOWNS.find((t) => t.name.toLowerCase() === q)
  if (exact) return exact
  return AP_TOWNS.find(
    (t) => q.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(q),
  ) ?? null
}

// Resolve coordinates for a farmer in this priority:
//   1. farmer.lat / farmer.lng if both are valid finite numbers
//   2. nearest town match against farmer.location_name, then village
// Returns null if neither yields coordinates.
//
// Why this exists: many farmers save their profile without using GPS — they
// only type the village name. Without a fallback, the consumer's distance
// filter drops them entirely, so 5km searches return zero results even for
// farmers in the same town.
export function farmerCoords(farmer: {
  lat?: number | string | null
  lng?: number | string | null
  location_name?: string | null
  village?: string | null
}): { lat: number; lng: number; approximate: boolean } | null {
  // Defensive Number cast — Supabase numeric(10,7) can serialize as string
  const lat = farmer.lat == null ? NaN : Number(farmer.lat)
  const lng = farmer.lng == null ? NaN : Number(farmer.lng)
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    return { lat, lng, approximate: false }
  }
  const town = townByName(farmer.location_name) ?? townByName(farmer.village)
  if (town) return { lat: town.lat, lng: town.lng, approximate: true }
  return null
}
