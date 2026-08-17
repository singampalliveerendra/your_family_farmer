'use client'

import { useLang } from '@/lib/LanguageContext'
import { useInstallState, runInstall, DownloadIcon } from '@/lib/installPrompt'

/* The compact "Get App" pill that sits beside the location chip in the hero.
 *
 * Kept deliberately plain: one tap goes straight to Chrome's install dialog,
 * with no popover of its own. The floating ball is the surface that explains
 * itself; this is the shortcut for someone who already knows what they want.
 *
 * Only rendered when a real install dialog is waiting. On iOS there is no
 * dialog to raise — a pill that silently did nothing would be worse than no
 * pill, so iOS is left to the ball, which can show the Share → Add to Home
 * Screen steps properly.
 *
 * Shares its dismissed state with the ball via the installPrompt store, so
 * "Don't show again" there hides this too. */
export default function InstallAppBar() {
  const { L } = useLang()
  const { canPrompt } = useInstallState()

  if (!canPrompt) return null

  return (
    <button
      onClick={() => { void runInstall() }}
      aria-label={L('Download Go Grameen App', 'గో గ్రామీణ్ యాప్ డౌన్‌లోడ్')}
      // shrink-0 so the location chip beside it keeps giving up its own width
      // to truncation first — at 390px this row is tight.
      className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-green-900 bg-green-300 active:bg-green-400 rounded-full px-3 py-2 leading-tight"
    >
      <DownloadIcon className="h-4 w-4" />
      <span>{L('Get App', 'యాప్')}</span>
    </button>
  )
}
