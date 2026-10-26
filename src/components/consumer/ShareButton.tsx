'use client'

import { useEffect, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { shareImageFileName } from '@/lib/productShare'
import { shareTextWithFiles } from '@/lib/produceShare'

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
  /** The product's cover photo; attached to the share so the chat shows it. */
  imageUrl?: string | null
}

// The photo is fetched once per URL and reused. Started on the first touch of
// the button (and on page load for the product pages' Share pill), so by the
// time the tap lands it is usually ready — the share sheet must open while the
// tap is still "live", and a slow download can outlast that.
const photoCache = new Map<string, Promise<File | null>>()
function loadPhoto(url: string, name: string): Promise<File | null> {
  let p = photoCache.get(url)
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b && b.type.startsWith('image/') ? new File([b], shareImageFileName(name, b.type), { type: b.type }) : null))
      .catch(() => null)
    p.then((f) => { if (!f) photoCache.delete(url) })
    photoCache.set(url, p)
  }
  return p
}

// How long a tap waits for the photo before sharing the text alone.
const PHOTO_WAIT_MS = 2500
const within = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))])

const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError'

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
  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  const warmPhoto = () => { if (info.imageUrl) void loadPhoto(info.imageUrl, info.name) }
  // The pill sits on the product's own page, where its photo is already on
  // screen — fetch it up front. Cards wait for a touch: a feed of 15 doesn't
  // need 15 downloads nobody asked for.
  useEffect(() => {
    if (variant === 'pill') warmPhoto()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, info.imageUrl])

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
      // With the product photo attached: WhatsApp sends the picture with the
      // message as its caption, so the chat shows the orange, not just a link.
      if (info.imageUrl && navigator.canShare) {
        // iPhone WhatsApp drops the photo when text rides along, so there the
        // photo goes alone and the message is copied for pasting. Copy starts
        // now, while the tap is live — not after the photo wait.
        const withText = shareTextWithFiles(navigator.userAgent, navigator.maxTouchPoints)
        const copied = withText
          ? null
          : (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(() => true, () => false)
        const file = await within(loadPhoto(info.imageUrl, info.name), PHOTO_WAIT_MS)
        if (file && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share(withText ? { files: [file], text } : { files: [file] })
            if (copied && (await copied)) {
              flash(L('Message copied — paste it in the chat too', 'మెసేజ్ కాపీ అయింది — చాట్‌లో కూడా పేస్ట్ చేయండి'))
            }
            return
          } catch (err) {
            if (isAbort(err)) return
            // Fall through to the text-only share.
          }
        }
      }
      // Text + link. The link's own preview still shows the product photo
      // (Open Graph tags on the produce page).
      try {
        await navigator.share({ title: info.name, text })
        return
      } catch (err) {
        if (isAbort(err)) return
        // Share failed (not dismissed) — fall through to WhatsApp.
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
      flash(L('Link copied — paste anywhere to share', 'లింక్ కాపీ అయింది — ఎక్కడైనా పేస్ట్ చేయండి'))
    } catch {
      flash(L('Could not share on this device', 'ఈ పరికరంలో షేర్ చేయలేకపోయాం'))
    }
  }

  return (
    <>
      {variant === 'pill' ? (
        <button
          type="button"
          onClick={onShare}
          onPointerDown={warmPhoto}
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
          onPointerDown={warmPhoto}
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
