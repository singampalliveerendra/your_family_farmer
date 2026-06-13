import type { SupabaseClient } from '@supabase/supabase-js'

// Maps the three account surfaces to their auth tables. All three store the
// password in a `password_hash` column (scrypt, see src/lib/password.ts).
export type UserType = 'farmer' | 'consumer' | 'rider'

export const USER_TYPES: readonly UserType[] = ['farmer', 'consumer', 'rider']

const TABLE: Record<UserType, string> = {
  farmer: 'farmers',
  consumer: 'consumers_auth',
  rider: 'delivery_boys',
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
  if (userType === 'farmer') {
    const { data } = await supabase
      .from(table)
      .select('id')
      .or(phoneVariants(phone).map((v) => `phone.eq.${v}`).join(','))
      .limit(1)
    return data?.[0] ?? null
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
