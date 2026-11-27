import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bodyFromForm, cargoReady, formFromSettings, forModerator, isCargoProfileError, localReady, missingFor,
  settingsFromRow, settingsSummary, validateSettings, EMPTY_SETTINGS, type DeliverySettings,
} from '@/lib/deliverySettings'

// Client card 2026-11-27: cargo services, who pays, the local charge and
// radius are set ONCE on the farmer's profile; each produce only picks
// Local / Cargo / Both.

const FULL: DeliverySettings = { cargoServices: ['VRL Logistics', 'Sri Durga Parcels'], cargoPaidBy: 'buyer', localPaidBy: 'buyer', localCharge: 40, localRadiusKm: 12 }
const errOf = (r: ReturnType<typeof validateSettings>) => (r.ok ? '' : r.error.en)

describe('validateSettings', () => {
  it('saves a full profile, cleaned', () => {
    const r = validateSettings({ cargo_services: [' VRL  Logistics', 'vrl logistics', 'Sri Durga Parcels'], cargo_paid_by: 'buyer', local_paid_by: 'buyer', local_delivery_charge: '40', local_radius_km: '12' })
    expect(r).toEqual({ ok: true, settings: FULL, columns: {
      cargo_services: ['VRL Logistics', 'Sri Durga Parcels'], cargo_paid_by: 'buyer', local_paid_by: 'buyer', local_delivery_charge: 40, local_radius_km: 12,
    } })
  })
  it('every part is optional: a farmer who never sends by cargo leaves it empty', () => {
    expect(validateSettings({ local_paid_by: 'farmer' })).toMatchObject({ ok: true, settings: { cargoServices: [], cargoPaidBy: null, localPaidBy: 'farmer', localCharge: null } })
    expect(validateSettings({})).toMatchObject({ ok: true, settings: EMPTY_SETTINGS })
  })
  it('farmer pays local: any typed charge is dropped', () => {
    expect(validateSettings({ local_paid_by: 'farmer', local_delivery_charge: '99' })).toMatchObject({ ok: true, settings: { localCharge: null } })
  })
  it('no cargo services: the cargo payer is cleared too', () => {
    expect(validateSettings({ cargo_services: [], cargo_paid_by: 'buyer' })).toMatchObject({ ok: true, settings: { cargoPaidBy: null } })
  })
  it.each([
    [{ cargo_services: ['VRL Logistics'] }, /Who pays for cargo/],
    [{ local_paid_by: 'buyer' }, /Enter the local delivery charge/],
    [{ local_paid_by: 'buyer', local_delivery_charge: '0' }, /above 0/],
    [{ local_radius_km: '0' }, /1 to 500 km/],
    [{ local_radius_km: '9999' }, /1 to 500 km/],
  ])('refuses %o', (body, msg) => {
    const r = validateSettings(body)
    expect(errOf(r)).toMatch(msg)
    if (!r.ok) expect(r.error.te).toMatch(/[ఀ-౿]/)
  })
  it('what existing produce rely on cannot be emptied', () => {
    expect(errOf(validateSettings({ local_paid_by: 'farmer' }, { cargo: true, local: false }))).toMatch(/keep at least one cargo service/)
    expect(errOf(validateSettings({ cargo_services: ['SRMT'], cargo_paid_by: 'buyer' }, { cargo: false, local: true }))).toMatch(/who pays for local delivery/)
  })
})

describe('ready checks', () => {
  it('cargo needs services and a payer; local needs a payer (and a charge if the buyer pays)', () => {
    expect(cargoReady(FULL)).toBe(true)
    expect(cargoReady({ ...FULL, cargoPaidBy: null })).toBe(false)
    expect(localReady(FULL)).toBe(true)
    expect(localReady({ ...FULL, localPaidBy: 'farmer', localCharge: null })).toBe(true)
    expect(localReady({ ...FULL, localCharge: null })).toBe(false)
    expect(localReady(EMPTY_SETTINGS)).toBe(false)
  })
  it('missingFor names what the chosen type still needs', () => {
    expect(missingFor('both', FULL)).toBeNull()
    expect(missingFor('cargo', EMPTY_SETTINGS)?.en).toMatch(/cargo services/)
    expect(missingFor('local', EMPTY_SETTINGS)?.en).toMatch(/local delivery/)
    expect(missingFor('both', { ...FULL, localPaidBy: null })?.en).toMatch(/local delivery/)
  })
})

describe('form ↔ settings ↔ row', () => {
  it('known services ticked, others in the Other box, and back', () => {
    const f = formFromSettings(FULL)
    expect(f).toEqual({ cargoServices: ['VRL Logistics'], otherCargo: 'Sri Durga Parcels', cargoPaidBy: 'buyer', localPaidBy: 'buyer', localCharge: '40', localRadius: '12' })
    expect(validateSettings(bodyFromForm(f))).toMatchObject({ ok: true, settings: FULL })
  })
  it('a farmers row → settings', () => {
    expect(settingsFromRow({ cargo_services: ['SRMT'], cargo_paid_by: 'farmer', local_paid_by: null, local_delivery_charge: null, local_radius_km: null }))
      .toEqual({ cargoServices: ['SRMT'], cargoPaidBy: 'farmer', localPaidBy: null, localCharge: null, localRadiusKm: null })
    expect(settingsFromRow(null)).toEqual(EMPTY_SETTINGS)
  })
  it('summary lines for the produce form', () => {
    const s = settingsSummary(FULL, (en) => en)
    expect(s.cargo).toBe('VRL Logistics, Sri Durga Parcels · ToPay (buyer pays)')
    expect(s.local).toBe('Within 12 km · ₹40 per order')
    expect(settingsSummary({ ...FULL, localPaidBy: 'farmer', localRadiusKm: null }, (en) => en).local).toBe('Within 25 km · free for the buyer')
    expect(settingsSummary(EMPTY_SETTINGS, (en) => en)).toEqual({ cargo: null, local: null })
  })
  it('moderator wording and the trigger’s error', () => {
    expect(forModerator('Add your cargo services in your profile first (Delivery settings).')).toBe('Add your cargo services in the farmer’s profile first (Delivery settings).')
    expect(isCargoProfileError('CARGO_PROFILE_REQUIRED: add your cargo services in your profile first.')).toBe(true)
    expect(isCargoProfileError('duplicate key')).toBe(false)
  })
})

describe('scripts/delivery-settings-migration.sql', () => {
  const sql = readFileSync(join(process.cwd(), 'scripts/delivery-settings-migration.sql'), 'utf8').replace(/--.*$/gm, '')
  it('adds the five profile columns with their CHECK', () => {
    for (const c of ['cargo_services jsonb', 'cargo_paid_by text', 'local_paid_by text', 'local_delivery_charge numeric', 'local_radius_km integer']) expect(sql).toContain(c)
    expect(sql).toMatch(/farmers_delivery_settings_check/)
  })
  it('allows Both, and Cargo / Both need at least one service', () => {
    expect(sql).toMatch(/courier_type IN \('local', 'cargo', 'both'\)/)
    expect(sql).toMatch(/courier_type IN \('cargo', 'both'\) AND jsonb_array_length\(cargo_services\) >= 1/)
  })
  it('back-fills the profile from existing produce', () => {
    expect(sql).toMatch(/jsonb_agg\(DISTINCT s\.svc/)
    expect(sql).toMatch(/p\.courier_type = 'local'/)
  })
  it('copies the profile onto a produce only when its delivery is saved — never on stock updates', () => {
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF courier_type, cargo_services, delivery_paid_by, delivery_charge, delivery_radius_km, delivery_mode/)
    expect(sql).not.toMatch(/OF[^;]*stock_qty[^;]*produce_listings_delivery_from_profile/)
    expect(sql).toMatch(/RAISE EXCEPTION 'CARGO_PROFILE_REQUIRED:/)
  })
  it('re-copies onto every produce when the profile changes', () => {
    expect(sql).toMatch(/AFTER UPDATE OF cargo_services, cargo_paid_by, local_paid_by, local_delivery_charge, local_radius_km/)
    expect(sql).toMatch(/UPDATE public\.produce_listings SET courier_type = courier_type/)
  })
  it('definer functions are not callable from the browser', () => {
    for (const fn of ['produce_listings_delivery_from_profile', 'farmers_delivery_settings_sync']) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated`))
    }
  })
  it('is mirrored in staging-schema.sql and the prod check', () => {
    const schema = readFileSync(join(process.cwd(), 'scripts/staging-schema.sql'), 'utf8')
    expect(schema).toMatch(/CREATE TRIGGER produce_listings_delivery_profile/)
    expect(schema).toMatch(/CREATE TRIGGER farmers_delivery_settings_sync/)
    expect(schema).toMatch(/courier_type IN \('local', 'cargo', 'both'\)/)
    expect(readFileSync(join(process.cwd(), 'scripts/CHECK-prod-migrations.sql'), 'utf8')).toMatch(/'delivery-settings', 'farmers\.cargo_paid_by'/)
  })
})
