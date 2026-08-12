import type { SupabaseClient } from '@supabase/supabase-js'

// Maps the account surfaces to their auth tables. All of them store the
// password in a `password_hash` column (scrypt, see src/lib/password.ts).
//
// 'farmer' and 'aggregator' share the `farmers` table and are told apart by
// account_type. They are separate surfaces here, not one, because the same
// phone may hold BOTH — a farmer who also runs a collection shop — and a
// password reset has to land on the account the person is actually resetting.
export type UserType = 'farmer' | 'aggregator' | 'consumer' | 'rider'

export const USER_TYPES: readonly UserType[] = ['farmer', 'aggregator', 'consumer', 'rider']

const TABLE: Record<UserType, string> = {
  farmer: 'farmers',
  aggregator: 'farmers',
  consumer: 'consumers_auth',
  rider: 'delivery_boys',
}

/** The two surfaces backed by `farmers`, keyed by the account_type they select. */
const SELLER_ACCOUNT_TYPE: Partial<Record<UserType, 'farmer' | 'aggregator'>> = {
  farmer: 'farmer',
  aggregator: 'aggregator',
}

// Historic farmer rows store the phone in mixed formats (0XXX, +91XXX, 91XXX).
// Match every variant so forgot-password works for them too.
function phoneVariants(phone: string): string[] {
  return [phone, `0${phone}`, `+91${phone}`, `91${phone}`]
}

/** Returns the account id for a phone within a surface, or null if none. */
export async function findAccount(
  supabase: SupabaseClient,
  userType: UserType,
  phone: string,
): Promise<{ id: string } | null> {
  const table = TABLE[userType]
  const wantType = SELLER_ACCOUNT_TYPE[userType]
  if (wantType) {
    // One phone can own a farmer row AND an aggregator row, so fetch every
    // seller row for the number and pick the surface being reset. Filtering in
    // JS rather than SQL because account_type is absent on rows created before
    // aggregators existed, and an absent value means 'farmer'.
    const { data } = await supabase
      .from(table)
      .select('id, account_type')
      .or(phoneVariants(phone).map((v) => `phone.eq.${v}`).join(','))
      .limit(4)
    const match = (data ?? []).find(
      (r) => (r.account_type === 'aggregator' ? 'aggregator' : 'farmer') === wantType,
    )
    return match ? { id: match.id as string } : null
  }
  const { data } = await supabase.from(table).select('id').eq('phone', phone).maybeSingle()
  return data ?? null
}

/** Sets a new password_hash for the matching account. Returns false if no account. */
export async function updatePasswordHash(
  supabase: SupabaseClient,
  userType: UserType,
  phone: string,
  passwordHash: string,
): Promise<{ ok: boolean; error?: string }> {
  const account = await findAccount(supabase, userType, phone)
  if (!account) return { ok: false }
  const { error } = await supabase
    .from(TABLE[userType])
    .update({ password_hash: passwordHash })
    .eq('id', account.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
