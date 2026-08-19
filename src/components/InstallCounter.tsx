'use client'

import { useEffect } from 'react'
import { reportInstall, runningStandalone } from '@/lib/installPrompt'

/* Counts an install the first time the app is opened from the home screen.
 *
 * Lives in the root layout because the installed app never opens on /home —
 * it launches at `/`, which sends it straight to the buyer or farmer surface.
 * This is also the ONLY signal iOS gives us: Safari fires no `appinstalled`
 * event, so without this an iPhone install would never be counted.
 *
 * Renders nothing, does nothing in a normal browser tab, and reports at most
 * once per device (see reportInstall). */
export default function InstallCounter() {
  useEffect(() => {
    if (!runningStandalone()) return
    void reportInstall()
  }, [])

  return null
}
