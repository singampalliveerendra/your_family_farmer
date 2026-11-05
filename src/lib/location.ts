export type PlaceState = 'AP' | 'TG'
export type Town = { name: string; lat: number; lng: number; state?: PlaceState }

/* Towns and city areas of Andhra Pradesh and Telangana (2026-11-05): names a
 * buyer's area from their location ("Gajuwaka") and tells which state they are
 * in, so produce a farmer transports across AP / TG shows up for them.
 * Approximate centres — good to a few km, which is all a "deliver here?" or a
 * 25 km local radius needs. The first 25 are the original West Godavari-centred
 * list, unchanged. */
export const PLACES: Required<Town>[] = [
  { name: 'Tadepalligudem', lat: 16.8142, lng: 81.5288, state: 'AP' },
  { name: 'Bhimavaram', lat: 16.5444, lng: 81.5216, state: 'AP' },
  { name: 'Eluru', lat: 16.7107, lng: 81.0952, state: 'AP' },
  { name: 'Narsapur', lat: 16.4347, lng: 81.6946, state: 'AP' },
  { name: 'Tanuku', lat: 16.7551, lng: 81.6818, state: 'AP' },
  { name: 'Kovvur', lat: 17.0128, lng: 81.7295, state: 'AP' },
  { name: 'Palakol', lat: 16.5139, lng: 81.7342, state: 'AP' },
  { name: 'Akividu', lat: 16.5826, lng: 81.3968, state: 'AP' },
  { name: 'Chintalapudi', lat: 16.8319, lng: 80.9827, state: 'AP' },
  { name: 'Polavaram', lat: 17.2487, lng: 81.6395, state: 'AP' },
  { name: 'Jangareddygudem', lat: 17.1000, lng: 81.2833, state: 'AP' },
  { name: 'Nidadavole', lat: 16.9000, lng: 81.6500, state: 'AP' },
  { name: 'Undi', lat: 16.6500, lng: 81.6000, state: 'AP' },
  { name: 'Denduluru', lat: 16.8833, lng: 81.4000, state: 'AP' },
  { name: 'Pedavegi', lat: 16.9167, lng: 81.1167, state: 'AP' },
  { name: 'Rajahmundry', lat: 17.0050, lng: 81.7799, state: 'AP' },
  { name: 'Vijayawada', lat: 16.5062, lng: 80.6480, state: 'AP' },
  { name: 'Guntur', lat: 16.3067, lng: 80.4365, state: 'AP' },
  { name: 'Kakinada', lat: 16.9891, lng: 82.2475, state: 'AP' },
  { name: 'Gudivada', lat: 16.4347, lng: 80.9947, state: 'AP' },
  { name: 'Machilipatnam', lat: 16.1875, lng: 81.1389, state: 'AP' },
  { name: 'Visakhapatnam', lat: 17.6868, lng: 83.2185, state: 'AP' },
  { name: 'Tenali', lat: 16.2427, lng: 80.6440, state: 'AP' },
  { name: 'Bapatla', lat: 15.9049, lng: 80.4674, state: 'AP' },
  { name: 'Narasaraopet', lat: 16.2333, lng: 80.0500, state: 'AP' },
  { name: 'Srikakulam', lat: 18.2949, lng: 83.8938, state: 'AP' },
  { name: 'Vizianagaram', lat: 18.1067, lng: 83.3956, state: 'AP' },
  { name: 'Bobbili', lat: 18.5730, lng: 83.3590, state: 'AP' },
  { name: 'Parvathipuram', lat: 18.7833, lng: 83.4250, state: 'AP' },
  { name: 'Palasa', lat: 18.7726, lng: 84.4100, state: 'AP' },
  { name: 'Tekkali', lat: 18.6100, lng: 84.2300, state: 'AP' },
  { name: 'Ichchapuram', lat: 19.1100, lng: 84.6900, state: 'AP' },
  { name: 'Salur', lat: 18.5200, lng: 83.2100, state: 'AP' },
  { name: 'Rajam', lat: 18.4500, lng: 83.6600, state: 'AP' },
  { name: 'Amalapuram', lat: 16.5787, lng: 82.0061, state: 'AP' },
  { name: 'Ramachandrapuram', lat: 16.8500, lng: 82.0167, state: 'AP' },
  { name: 'Peddapuram', lat: 17.0750, lng: 82.1380, state: 'AP' },
  { name: 'Samalkot', lat: 17.0531, lng: 82.1695, state: 'AP' },
  { name: 'Tuni', lat: 17.3590, lng: 82.5460, state: 'AP' },
  { name: 'Mandapeta', lat: 16.8670, lng: 81.9330, state: 'AP' },
  { name: 'Kothapeta', lat: 16.7170, lng: 81.9000, state: 'AP' },
  { name: 'Razole', lat: 16.4700, lng: 81.8400, state: 'AP' },
  { name: 'Rampachodavaram', lat: 17.4450, lng: 81.7760, state: 'AP' },
  { name: 'Anakapalli', lat: 17.6913, lng: 83.0039, state: 'AP' },
  { name: 'Narsipatnam', lat: 17.6670, lng: 82.6130, state: 'AP' },
  { name: 'Chodavaram', lat: 17.8300, lng: 82.9500, state: 'AP' },
  { name: 'Yelamanchili', lat: 17.5500, lng: 82.8500, state: 'AP' },
  { name: 'Paderu', lat: 18.0833, lng: 82.6667, state: 'AP' },
  { name: 'Gajuwaka', lat: 17.6900, lng: 83.2100, state: 'AP' },
  { name: 'Madhurawada', lat: 17.7900, lng: 83.3800, state: 'AP' },
  { name: 'MVP Colony', lat: 17.7400, lng: 83.3350, state: 'AP' },
  { name: 'Pendurthi', lat: 17.8100, lng: 83.2000, state: 'AP' },
  { name: 'Bheemunipatnam', lat: 17.8900, lng: 83.4500, state: 'AP' },
  { name: 'Nuzvid', lat: 16.7880, lng: 80.8460, state: 'AP' },
  { name: 'Jaggayyapeta', lat: 16.8920, lng: 80.0970, state: 'AP' },
  { name: 'Nandigama', lat: 16.7700, lng: 80.2860, state: 'AP' },
  { name: 'Tiruvuru', lat: 17.1000, lng: 80.6100, state: 'AP' },
  { name: 'Gannavaram', lat: 16.5400, lng: 80.8000, state: 'AP' },
  { name: 'Hanuman Junction', lat: 16.6330, lng: 80.9670, state: 'AP' },
  { name: 'Kaikaluru', lat: 16.5500, lng: 81.2170, state: 'AP' },
  { name: 'Bhimadole', lat: 16.8170, lng: 81.2670, state: 'AP' },
  { name: 'Avanigadda', lat: 16.0210, lng: 80.9180, state: 'AP' },
  { name: 'Repalle', lat: 16.0170, lng: 80.8290, state: 'AP' },
  { name: 'Mangalagiri', lat: 16.4300, lng: 80.5680, state: 'AP' },
  { name: 'Amaravati', lat: 16.5131, lng: 80.5165, state: 'AP' },
  { name: 'Sattenapalli', lat: 16.3960, lng: 80.1500, state: 'AP' },
  { name: 'Chilakaluripet', lat: 16.0890, lng: 80.1670, state: 'AP' },
  { name: 'Vinukonda', lat: 16.0530, lng: 79.7390, state: 'AP' },
  { name: 'Ponnur', lat: 16.0700, lng: 80.5500, state: 'AP' },
  { name: 'Chirala', lat: 15.8240, lng: 80.3520, state: 'AP' },
  { name: 'Ongole', lat: 15.5057, lng: 80.0499, state: 'AP' },
  { name: 'Addanki', lat: 15.8100, lng: 79.9700, state: 'AP' },
  { name: 'Markapur', lat: 15.7350, lng: 79.2700, state: 'AP' },
  { name: 'Giddalur', lat: 15.3780, lng: 78.9260, state: 'AP' },
  { name: 'Kandukur', lat: 15.2150, lng: 79.9030, state: 'AP' },
  { name: 'Kavali', lat: 14.9130, lng: 79.9930, state: 'AP' },
  { name: 'Nellore', lat: 14.4426, lng: 79.9865, state: 'AP' },
  { name: 'Gudur', lat: 14.1500, lng: 79.8500, state: 'AP' },
  { name: 'Venkatagiri', lat: 13.9600, lng: 79.5800, state: 'AP' },
  { name: 'Naidupeta', lat: 13.9000, lng: 79.9000, state: 'AP' },
  { name: 'Sullurpeta', lat: 13.7000, lng: 80.0200, state: 'AP' },
  { name: 'Tirupati', lat: 13.6288, lng: 79.4192, state: 'AP' },
  { name: 'Srikalahasti', lat: 13.7490, lng: 79.6980, state: 'AP' },
  { name: 'Puttur', lat: 13.4420, lng: 79.5530, state: 'AP' },
  { name: 'Chittoor', lat: 13.2172, lng: 79.1003, state: 'AP' },
  { name: 'Palamaner', lat: 13.2000, lng: 78.7500, state: 'AP' },
  { name: 'Kuppam', lat: 12.7500, lng: 78.3400, state: 'AP' },
  { name: 'Madanapalle', lat: 13.5500, lng: 78.5000, state: 'AP' },
  { name: 'Piler', lat: 13.6500, lng: 78.9400, state: 'AP' },
  { name: 'Rayachoti', lat: 14.0580, lng: 78.7510, state: 'AP' },
  { name: 'Kadapa', lat: 14.4673, lng: 78.8242, state: 'AP' },
  { name: 'Proddatur', lat: 14.7500, lng: 78.5500, state: 'AP' },
  { name: 'Jammalamadugu', lat: 14.8500, lng: 78.3800, state: 'AP' },
  { name: 'Mydukur', lat: 14.7300, lng: 78.7400, state: 'AP' },
  { name: 'Pulivendula', lat: 14.4220, lng: 78.2260, state: 'AP' },
  { name: 'Badvel', lat: 14.7450, lng: 79.0620, state: 'AP' },
  { name: 'Rajampet', lat: 14.1900, lng: 79.1600, state: 'AP' },
  { name: 'Kurnool', lat: 15.8281, lng: 78.0373, state: 'AP' },
  { name: 'Nandyal', lat: 15.4770, lng: 78.4830, state: 'AP' },
  { name: 'Allagadda', lat: 15.1300, lng: 78.5100, state: 'AP' },
  { name: 'Adoni', lat: 15.6280, lng: 77.2750, state: 'AP' },
  { name: 'Yemmiganur', lat: 15.7700, lng: 77.4800, state: 'AP' },
  { name: 'Dhone', lat: 15.4000, lng: 77.8700, state: 'AP' },
  { name: 'Anantapur', lat: 14.6819, lng: 77.6006, state: 'AP' },
  { name: 'Tadipatri', lat: 14.9091, lng: 78.0092, state: 'AP' },
  { name: 'Guntakal', lat: 15.1670, lng: 77.3830, state: 'AP' },
  { name: 'Hindupur', lat: 13.8290, lng: 77.4910, state: 'AP' },
  { name: 'Dharmavaram', lat: 14.4140, lng: 77.7210, state: 'AP' },
  { name: 'Kadiri', lat: 14.1120, lng: 78.1600, state: 'AP' },
  { name: 'Puttaparthi', lat: 14.1650, lng: 77.8110, state: 'AP' },
  { name: 'Penukonda', lat: 14.0800, lng: 77.6000, state: 'AP' },
  { name: 'Kalyandurg', lat: 14.5500, lng: 77.1000, state: 'AP' },
  { name: 'Rayadurg', lat: 14.7000, lng: 76.8500, state: 'AP' },
  { name: 'Hyderabad', lat: 17.3850, lng: 78.4867, state: 'TG' },
  { name: 'Secunderabad', lat: 17.4399, lng: 78.4983, state: 'TG' },
  { name: 'Kukatpally', lat: 17.4948, lng: 78.3996, state: 'TG' },
  { name: 'LB Nagar', lat: 17.3457, lng: 78.5522, state: 'TG' },
  { name: 'Gachibowli', lat: 17.4401, lng: 78.3489, state: 'TG' },
  { name: 'Uppal', lat: 17.4058, lng: 78.5591, state: 'TG' },
  { name: 'Dilsukhnagar', lat: 17.3688, lng: 78.5247, state: 'TG' },
  { name: 'Mehdipatnam', lat: 17.3950, lng: 78.4400, state: 'TG' },
  { name: 'Ameerpet', lat: 17.4375, lng: 78.4483, state: 'TG' },
  { name: 'Madhapur', lat: 17.4483, lng: 78.3915, state: 'TG' },
  { name: 'Miyapur', lat: 17.4968, lng: 78.3614, state: 'TG' },
  { name: 'Kompally', lat: 17.5360, lng: 78.4870, state: 'TG' },
  { name: 'Shamshabad', lat: 17.2603, lng: 78.3969, state: 'TG' },
  { name: 'Medchal', lat: 17.6290, lng: 78.4810, state: 'TG' },
  { name: 'Ghatkesar', lat: 17.4500, lng: 78.6850, state: 'TG' },
  { name: 'Warangal', lat: 17.9689, lng: 79.5941, state: 'TG' },
  { name: 'Hanamkonda', lat: 18.0072, lng: 79.5583, state: 'TG' },
  { name: 'Karimnagar', lat: 18.4386, lng: 79.1288, state: 'TG' },
  { name: 'Nizamabad', lat: 18.6725, lng: 78.0941, state: 'TG' },
  { name: 'Khammam', lat: 17.2473, lng: 80.1514, state: 'TG' },
  { name: 'Nalgonda', lat: 17.0575, lng: 79.2671, state: 'TG' },
  { name: 'Mahbubnagar', lat: 16.7488, lng: 77.9855, state: 'TG' },
  { name: 'Adilabad', lat: 19.6641, lng: 78.5320, state: 'TG' },
  { name: 'Siddipet', lat: 18.1018, lng: 78.8520, state: 'TG' },
  { name: 'Suryapet', lat: 17.1405, lng: 79.6236, state: 'TG' },
  { name: 'Miryalaguda', lat: 16.8720, lng: 79.5630, state: 'TG' },
  { name: 'Ramagundam', lat: 18.7550, lng: 79.4740, state: 'TG' },
  { name: 'Peddapalli', lat: 18.6150, lng: 79.3820, state: 'TG' },
  { name: 'Mancherial', lat: 18.8710, lng: 79.4440, state: 'TG' },
  { name: 'Jagtial', lat: 18.7940, lng: 78.9130, state: 'TG' },
  { name: 'Kamareddy', lat: 18.3200, lng: 78.3400, state: 'TG' },
  { name: 'Sangareddy', lat: 17.6140, lng: 78.0820, state: 'TG' },
  { name: 'Zaheerabad', lat: 17.6810, lng: 77.6070, state: 'TG' },
  { name: 'Medak', lat: 18.0450, lng: 78.2600, state: 'TG' },
  { name: 'Vikarabad', lat: 17.3380, lng: 77.9040, state: 'TG' },
  { name: 'Tandur', lat: 17.2500, lng: 77.5800, state: 'TG' },
  { name: 'Shadnagar', lat: 17.0700, lng: 78.2000, state: 'TG' },
  { name: 'Bhongir', lat: 17.5100, lng: 78.8900, state: 'TG' },
  { name: 'Jangaon', lat: 17.7220, lng: 79.1520, state: 'TG' },
  { name: 'Mahabubabad', lat: 17.6000, lng: 80.0000, state: 'TG' },
  { name: 'Kothagudem', lat: 17.5500, lng: 80.6200, state: 'TG' },
  { name: 'Bhadrachalam', lat: 17.6690, lng: 80.8930, state: 'TG' },
  { name: 'Sathupally', lat: 17.2500, lng: 80.8300, state: 'TG' },
  { name: 'Wanaparthy', lat: 16.3600, lng: 78.0600, state: 'TG' },
  { name: 'Nagarkurnool', lat: 16.4800, lng: 78.3100, state: 'TG' },
  { name: 'Gadwal', lat: 16.2350, lng: 77.8000, state: 'TG' },
  { name: 'Narayanpet', lat: 16.7450, lng: 77.4960, state: 'TG' },
  { name: 'Kodad', lat: 16.9980, lng: 79.9650, state: 'TG' },
  { name: 'Huzurnagar', lat: 16.9000, lng: 79.8800, state: 'TG' },
  { name: 'Devarakonda', lat: 16.6900, lng: 78.9200, state: 'TG' },
  { name: 'Sircilla', lat: 18.3900, lng: 78.8300, state: 'TG' },
  { name: 'Nirmal', lat: 19.1000, lng: 78.3500, state: 'TG' },
  { name: 'Bodhan', lat: 18.6600, lng: 77.8900, state: 'TG' },
  { name: 'Armoor', lat: 18.7900, lng: 78.2900, state: 'TG' },
  { name: 'Bhupalpally', lat: 18.4300, lng: 79.8600, state: 'TG' },
  { name: 'Mulugu', lat: 18.1900, lng: 79.9400, state: 'TG' },
  { name: 'Narsampet', lat: 17.9300, lng: 79.9000, state: 'TG' },
  { name: 'Asifabad', lat: 19.3600, lng: 79.2800, state: 'TG' },
  { name: 'Bellampalli', lat: 19.0600, lng: 79.4900, state: 'TG' },
]

/** Kept for older callers: it is the whole AP + TG list now. */
export const AP_TOWNS: Town[] = PLACES

/** AP or TG from a 6-digit pincode (Telangana 500–509, Andhra 515–535); null otherwise. */
export function stateOfPincode(pin: string | null | undefined): PlaceState | null {
  const p = String(pin ?? '').trim()
  if (!/^\d{6}$/.test(p)) return null
  const n = Number(p.slice(0, 3))
  if (n >= 500 && n <= 509) return 'TG'
  if (n >= 515 && n <= 535) return 'AP'
  return null
}

/** The nearest place, with its state — "Gajuwaka", AP. */
export function nearestPlace(lat: number, lng: number): Required<Town> {
  let best = PLACES[0]
  let bestDist = Infinity
  for (const t of PLACES) {
    const d = haversineKm(lat, lng, t.lat, t.lng)
    if (d < bestDist) { bestDist = d; best = t }
  }
  return best
}

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

// The unit is part of the label a buyer reads, so it follows the language too.
// `L` defaults to English so existing callers that don't pass one still work.
export function formatDistance(km: number, L: (en: string, te: string) => string = (en) => en): string {
  if (km < 1) return `${Math.round(km * 1000)} ${L('m', 'మీ')}`
  if (km < 10) return `${km.toFixed(1)} ${L('km', 'కి.మీ')}`
  return `${Math.round(km)} ${L('km', 'కి.మీ')}`
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
