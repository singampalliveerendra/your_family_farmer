import { redirect } from 'next/navigation'

// The farmer onboarding form now lives at /moderator/register-farmer (with bank
// details, soil organic carbon, and the shareable activation code). This old
// path is kept as a permanent redirect so existing links/bookmarks still work.
export default function NewFarmerRedirect() {
  redirect('/moderator/register-farmer')
}
