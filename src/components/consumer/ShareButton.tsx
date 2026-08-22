'use client'

import { useState } from 'react'
import { useLang } from '@/lib/LanguageContext'

// Everything we need to build a rich share message for one harvest/produce.
export type ShareInfo = {
  id: string
  name: string
  variety?: string | null
  emoji?: string | null
  method?: string | null
  pricePerUnit?: number | null
  unit?: string | null
  farmerName?: string | null
  farmerVillage?: string | null
}

type Tr = (en: string, te: string) => string

const METHOD_LABEL: Record<string, { en: string; te: string }> = {
  natural:      { en: 'Natural',      te: 'సహజ' },
  organic:      { en: 'Organic',      te: 'సేంద్రీయ' },
  low_chemical: { en: 'Semi-Organic', te: 'సెమీ ఆర్గానిక్' },
  chemical:     { en: 'Chemical',     te: 'రసాయన' },
}

// Build the "this is where & how your food is grown" message — the share itself
// advertises freshness + farmer + method, so it doubles as marketing.
function buildMessage(info: ShareInfo, url: string, L: Tr): string {
  const emoji = info.emoji || '🌾'
  const pair = info.method ? METHOD_LABEL[info.method.toLowerCase()] : null
  const method = pair ? L(pair.en, pair.te) : null
  const lines: string[] = []
  lines.push(`${emoji} ${info.name}${info.variety ? ` (${info.variety})` : ''}${method ? ` — ${method} ${L('farming', 'వ్యవసాయం')}` : ''}`)
  if (info.farmerName) {
    lines.push(`👨‍🌾 ${info.farmerName}${info.farmerVillage ? `, ${info.farmerVillage}` : ''}`)
  }
  if (info.pricePerUnit != null) {
    lines.push(`₹${info.pricePerUnit}/${info.unit || 'kg'}`)
  }
  lines.push('Order fresh, straight from the farmer 👇')
  lines.push(url)
  return lines.join('\n')
}

export default function ShareButton({
  info,
  variant = 'icon',
}: {
  info: ShareInfo
  variant?: 'icon' | 'pill'
}) {
  const { L } = useLang()
  const [toast, setToast] = useState('')

  const onShare = async (e: React.MouseEvent) => {
    // Cards wrap content in links — never let a share tap navigate.
    e.preventDefault()
    e.stopPropagation()

    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/consumer/produce/${info.id}`
        : `/consumer/produce/${info.id}`
    const text = buildMessage(info, url, L)

    // 1) Native share sheet (Android shows WhatsApp/SMS/etc. right here).
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: info.name, text })
        return
      } catch {
        // User dismissed the sheet, or share failed — fall through to copy.
        return
      }
    }

    // 2) WhatsApp deep link (the dominant channel for our users).
    if (typeof window !== 'undefined') {
      const wa = `https://wa.me/?text=${encodeURIComponent(text)}`
      const win = window.open(wa, '_blank')
      if (win) return
    }

    // 3) Copy-to-clipboard fallback.
    try {
      await navigator.clipboard.writeText(text)
      setToast(L('Link copied — paste anywhere to share', 'లింక్ కాపీ అయింది — ఎక్కడైనా పేస్ట్ చేయండి'))
      setTimeout(() => setToast(''), 2200)
    } catch {
      setToast(L('Could not share on this device', 'ఈ పరికరంలో షేర్ చేయలేకపోయాం'))
      setTimeout(() => setToast(''), 2200)
    }
  }

  return (
    <>
      {variant === 'pill' ? (
        <button
          type="button"
          onClick={onShare}
          aria-label={L('Share', 'షేర్')}
          className="flex items-center gap-1.5 text-green-100 text-sm font-semibold active:opacity-70"
        >
          <ShareIcon className="w-4 h-4" />
          {L('Share', 'షేర్')}
        </button>
      ) : (
        <button
          type="button"
          onClick={onShare}
          aria-label={L('Share this produce', 'ఈ ఉత్పత్తిని షేర్ చేయండి')}
          className="w-8 h-8 rounded-full bg-white/90 shadow-sm flex items-center justify-center text-green-800 active:scale-90 transition-transform"
        >
          <ShareIcon className="w-4 h-4" />
        </button>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] bg-gray-900 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-lg max-w-[90vw] text-center">
          {toast}
        </div>
      )}
    </>
  )
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  )
}
