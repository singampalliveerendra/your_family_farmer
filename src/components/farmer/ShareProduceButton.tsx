'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLang } from '@/lib/LanguageContext'
import { localizeName } from '@/lib/localizeName'
import {
  SHARE_COLS,
  SHARE_PER_PAGE,
  chunkForShare,
  displayUrl,
  farmerShareUrl,
  optimizedImageUrl,
  pickShareItems,
  shareCaption,
  shareFileName,
  shareTextWithFiles,
  sharePriceLabel,
  type ShareListing,
} from '@/lib/produceShare'

// "Share my produce": draws the farmer's in-stock produce onto 1080×1350
// catalogue images in the browser (no server, works on the farmer's phone),
// then hands them to the share sheet with the farmer-page link as the caption.
// Mounted on the farmer dashboard and the moderator's farmer list (parity).
//
// Generating is one tap and sharing is a second: loading photos can outlast
// the browser's few-second user-activation window, after which
// navigator.share() refuses. The preview sheet's Share button is a fresh tap.

export type ShareFarmer = {
  id: string
  slug: string
  name: string | null
  village?: string | null
}

type Page = { blob: Blob; url: string; file: File }

const W = 1080
const H = 1350
const PAD = 40
const GAP = 20
const HEADER_H = 190
const FOOTER_H = 230
const GREEN = '#14532d'
const GREEN_TEXT = '#166534'

export default function ShareProduceButton({
  farmer,
  className,
  label,
}: {
  farmer: ShareFarmer
  className?: string
  label?: string
}) {
  const { L, lang } = useLang()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [pages, setPages] = useState<Page[]>([])
  const [caption, setCaption] = useState('')

  // Free the blob URLs once the preview closes or the component goes away.
  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.url)), [pages])

  const flash = (text: string) => {
    setMsg(text)
    setTimeout(() => setMsg(''), 3500)
  }

  const generate = async () => {
    if (busy) return
    setBusy(true)
    try {
      const { data: listings } = await supabase
        .from('produce_listings')
        .select('id, name, emoji, status, price_tier_1_price, unit, stock_qty, sale_step, image_url')
        .eq('farmer_id', farmer.id)
        .order('created_at', { ascending: false })
      const rows = (listings ?? []) as ShareListing[]

      // Harvests are the stock authority once logged — same read as the
      // public Produce tab, so the image never offers what the page won't sell.
      const harvestsByListing: Record<string, Array<{ stock_qty: number | null }>> = {}
      if (rows.length) {
        try {
          const { data: hv } = await supabase
            .from('harvests')
            .select('produce_listing_id, stock_qty')
            .in('produce_listing_id', rows.map((r) => r.id))
            .eq('paused', false)
          for (const h of (hv ?? []) as Array<{ produce_listing_id: string; stock_qty: number | null }>) {
            ;(harvestsByListing[h.produce_listing_id] ??= []).push({ stock_qty: h.stock_qty ?? null })
          }
        } catch { /* no harvests table — templates judge themselves */ }
      }

      const items = pickShareItems(rows, harvestsByListing)
      if (!items.length) {
        flash(L('No produce in stock to share. Add a harvest first.', 'పంచుకోవడానికి స్టాక్‌లో పంట లేదు. ముందు కోత జోడించండి.'))
        return
      }

      const url = farmerShareUrl(window.location.origin, farmer.slug)
      const chunks = chunkForShare(items)
      const [photos, qr] = await Promise.all([
        Promise.all(items.map((it) => (it.image_url ? loadPhoto(it.image_url) : Promise.resolve(null)))),
        makeQr(url),
      ])
      const photoById = new Map(items.map((it, i) => [it.id, photos[i]]))
      try { await document.fonts?.ready } catch { /* fonts API missing */ }
      const font = getComputedStyle(document.body).fontFamily || 'sans-serif'

      const out: Page[] = []
      for (let i = 0; i < chunks.length; i++) {
        const blob = await drawPage({
          tiles: chunks[i].map((it) => ({
            name: localizeName(it.name, lang) || it.name,
            price: sharePriceLabel(it),
            emoji: it.emoji || '🌿',
            photo: photoById.get(it.id) ?? null,
          })),
          farmerName: farmer.name?.trim() || '',
          village: farmer.village?.trim() || '',
          pageNo: i + 1,
          pageCount: chunks.length,
          url,
          qr,
          font,
          L,
        })
        const name = shareFileName(farmer.slug, i, chunks.length)
        out.push({ blob, url: URL.createObjectURL(blob), file: new File([blob], name, { type: 'image/png' }) })
      }
      setCaption(shareCaption(farmer.name || '', url, L))
      setPages(out)
    } catch {
      flash(L('Could not make the images. Please try again.', 'చిత్రాలు తయారు కాలేదు. మళ్ళీ ప్రయత్నించండి.'))
    } finally {
      setBusy(false)
    }
  }

  const close = () => setPages([])

  const files = pages.map((p) => p.file)
  const canShareFiles =
    typeof navigator !== 'undefined' && !!navigator.canShare && files.length > 0 && navigator.canShare({ files })

  const shareAll = async () => {
    // The link always goes on the clipboard too: if the receiving app drops
    // the caption, the farmer pastes it. Started, not awaited — Safari only
    // allows share() while the tap is still "live", and an await before it can
    // end that.
    const copied = (navigator.clipboard?.writeText(caption) ?? Promise.reject()).then(() => true, () => false)
    const withText = shareTextWithFiles(navigator.userAgent, navigator.maxTouchPoints)
    try {
      await navigator.share(withText ? { files, text: caption } : { files })
      if (!withText && (await copied)) {
        flash(L('Link copied — paste it in the WhatsApp message too.', 'లింక్ కాపీ అయింది — వాట్సాప్ మెసేజ్‌లో కూడా పేస్ట్ చేయండి.'))
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        flash(L('Sharing failed — use Download instead.', 'పంపడం విఫలమైంది — డౌన్‌లోడ్ వాడండి.'))
      }
    }
  }

  const downloadAll = () => {
    for (const p of pages) {
      const a = document.createElement('a')
      a.href = p.url
      a.download = p.file.name
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
  }

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption)
      flash(L('Link copied', 'లింక్ కాపీ అయింది'))
    } catch {
      flash(caption)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className={className ?? 'bg-amber-400 text-amber-950 text-xs font-bold px-3 py-2 rounded-xl disabled:opacity-60'}
      >
        {busy ? L('Making images…', 'చిత్రాలు తయారవుతున్నాయి…') : label ?? `📤 ${L('Share produce', 'పంట పంచుకోండి')}`}
      </button>

      {msg && !pages.length && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] bg-gray-900 text-white text-sm px-4 py-2 rounded-xl shadow-lg max-w-[90vw] text-center">
          {msg}
        </div>
      )}

      {pages.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" onClick={close}>
          <div
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">
                {pages.length > 1
                  ? L(`${pages.length} images ready`, `${pages.length} చిత్రాలు సిద్ధం`)
                  : L('Image ready', 'చిత్రం సిద్ధం')}
              </h2>
              <button onClick={close} className="text-gray-500 text-2xl leading-none px-2" aria-label={L('Close', 'మూసివేయి')}>
                ×
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-3 space-y-3">
              {pages.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.url} src={p.url} alt={p.file.name} className="w-full rounded-xl border border-gray-200" />
              ))}
              <p className="text-xs text-gray-500">
                {L(
                  'Your page link is copied when you share — paste it in the message so buyers can tap it. They can also scan the QR code on the image.',
                  'పంపేటప్పుడు మీ పేజీ లింక్ కాపీ అవుతుంది — కొనుగోలుదారులు నొక్కేలా మెసేజ్‌లో పేస్ట్ చేయండి. చిత్రంపై ఉన్న QR కోడ్ కూడా స్కాన్ చేయవచ్చు.',
                )}
              </p>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 space-y-2">
              {msg && <p className="text-xs text-center text-gray-700">{msg}</p>}
              {canShareFiles && (
                <button onClick={shareAll} className="w-full bg-green-700 text-white font-bold py-3 rounded-xl">
                  📤 {L('Share on WhatsApp & more', 'వాట్సాప్ & ఇతరాల్లో పంపండి')}
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={downloadAll} className="flex-1 border border-green-700 text-green-800 font-semibold py-2.5 rounded-xl text-sm">
                  ⬇️ {L('Download', 'డౌన్‌లోడ్')}
                </button>
                <button onClick={copyCaption} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl text-sm">
                  🔗 {L('Copy link', 'లింక్ కాపీ')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── drawing ──────────────────────────────────────────────────────────────────

type Tile = { name: string; price: string; emoji: string; photo: HTMLImageElement | null }

// A produce photo, or null if it can't be loaded within a few seconds or can't
// be drawn without tainting the canvas (no CORS) — the tile falls back to its
// emoji rather than holding up or breaking the whole image.
// Our own optimiser first (same-origin, small); the original file as a
// fallback, cache-busted so a copy cached without CORS headers can't block it.
async function loadPhoto(src: string): Promise<HTMLImageElement | null> {
  const viaOptimizer = await loadImage(optimizedImageUrl(src), false)
  if (viaOptimizer) return viaOptimizer
  return loadImage(`${src}${src.includes('?') ? '&' : '?'}share=${Date.now()}`, true)
}

function loadImage(src: string, cors: boolean, timeoutMs = 8000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    if (cors) img.crossOrigin = 'anonymous'
    const timer = setTimeout(() => resolve(null), timeoutMs)
    img.onload = () => { clearTimeout(timer); resolve(img) }
    img.onerror = () => { clearTimeout(timer); resolve(null) }
    img.src = src
  })
}

// QR code as a canvas, imported on demand so the dashboard doesn't pay for it.
async function makeQr(text: string): Promise<HTMLCanvasElement | null> {
  try {
    const { default: qrcode } = await import('qrcode-generator')
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const n = qr.getModuleCount()
    const c = document.createElement('canvas')
    c.width = n
    c.height = n
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, n, n)
    ctx.fillStyle = '#000'
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) ctx.fillRect(col, r, 1, 1)
    return c
  } catch {
    return null
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Draw text no wider than maxW: shrink the font down to minSize, then cut with "…".
function fitText(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number,
  weight: string, size: number, minSize: number, font: string,
) {
  let s = size
  ctx.font = `${weight} ${s}px ${font}`
  while (s > minSize && ctx.measureText(text).width > maxW) {
    s -= 2
    ctx.font = `${weight} ${s}px ${font}`
  }
  let t = text
  if (ctx.measureText(t).width > maxW) {
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
    t += '…'
  }
  ctx.fillText(t, x, y)
}

// Cover-crop an image into a box (like CSS object-fit: cover).
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const sw = w / scale
  const sh = h / scale
  const sx = (img.naturalWidth - sw) / 2
  const sy = (img.naturalHeight - sh) / 2
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

async function drawPage(o: {
  tiles: Tile[]
  farmerName: string
  village: string
  pageNo: number
  pageCount: number
  url: string
  qr: HTMLCanvasElement | null
  font: string
  L: (en: string, te: string) => string
}): Promise<Blob> {
  const { font, L } = o
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.textBaseline = 'alphabetic'

  // Background
  ctx.fillStyle = '#f7f5ee'
  ctx.fillRect(0, 0, W, H)

  // Header — brand, farmer, village, page counter
  ctx.fillStyle = GREEN
  ctx.fillRect(0, 0, W, HEADER_H)
  ctx.fillStyle = '#86efac'
  ctx.font = `700 28px ${font}`
  ctx.textAlign = 'left'
  ctx.fillText('🌾 GO GRAMEEN', PAD, 58)
  ctx.fillStyle = '#ffffff'
  fitText(ctx, o.farmerName || L('Fresh from the farm', 'పొలం నుండి తాజాగా'), PAD, 118, W - PAD * 2 - 140, '800', 54, 34, font)
  ctx.fillStyle = '#bbf7d0'
  fitText(ctx, o.village ? `📍 ${o.village}` : L('Fresh from the farm', 'పొలం నుండి తాజాగా'), PAD, 164, W - PAD * 2 - 140, '500', 30, 22, font)
  if (o.pageCount > 1) {
    ctx.textAlign = 'right'
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 30px ${font}`
    ctx.fillText(`${o.pageNo}/${o.pageCount}`, W - PAD, 58)
    ctx.textAlign = 'left'
  }

  // Grid
  const rows = Math.ceil(SHARE_PER_PAGE / SHARE_COLS)
  const tileW = (W - PAD * 2 - GAP * (SHARE_COLS - 1)) / SHARE_COLS
  const gridTop = HEADER_H + 30
  const gridH = H - FOOTER_H - gridTop - 10
  const tileH = (gridH - GAP * (rows - 1)) / rows
  const photoH = Math.round(tileH * 0.62)

  o.tiles.forEach((t, i) => {
    const x = PAD + (i % SHARE_COLS) * (tileW + GAP)
    const y = gridTop + Math.floor(i / SHARE_COLS) * (tileH + GAP)

    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.08)'
    ctx.shadowBlur = 12
    ctx.shadowOffsetY = 4
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, x, y, tileW, tileH, 22)
    ctx.fill()
    ctx.restore()

    // Photo (clipped to the tile's rounded top) or the emoji on soft green
    ctx.save()
    roundRect(ctx, x, y, tileW, tileH, 22)
    ctx.clip()
    if (t.photo) {
      drawCover(ctx, t.photo, x, y, tileW, photoH)
    } else {
      ctx.fillStyle = '#dcfce7'
      ctx.fillRect(x, y, tileW, photoH)
      ctx.font = `110px ${font}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(t.emoji, x + tileW / 2, y + photoH / 2 + 6)
      ctx.textBaseline = 'alphabetic'
      ctx.textAlign = 'left'
    }
    ctx.restore()

    const tx = x + 16
    const maxW = tileW - 32
    ctx.fillStyle = '#111827'
    fitText(ctx, t.name, tx, y + photoH + 44, maxW, '700', 32, 22, font)
    ctx.fillStyle = GREEN_TEXT
    fitText(ctx, t.price, tx, y + photoH + 88, maxW, '800', 32, 20, font)
  })

  // Footer — the link in words + QR, since the image itself can't be tapped
  const fy = H - FOOTER_H
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, fy, W, FOOTER_H)
  ctx.fillStyle = '#e5e7eb'
  ctx.fillRect(0, fy, W, 2)
  const qrSize = 170
  const textMax = W - PAD * 2 - (o.qr ? qrSize + 30 : 0)
  ctx.fillStyle = '#374151'
  fitText(ctx, L('Order fresh, straight from the farmer', 'రైతు నుండి నేరుగా తాజాగా ఆర్డర్ చేయండి'), PAD, fy + 70, textMax, '600', 32, 22, font)
  ctx.fillStyle = GREEN_TEXT
  fitText(ctx, displayUrl(o.url), PAD, fy + 128, textMax, '800', 36, 20, font)
  if (o.qr) {
    ctx.fillStyle = '#6b7280'
    fitText(ctx, L('Scan the QR code to open', 'తెరవడానికి QR కోడ్ స్కాన్ చేయండి'), PAD, fy + 180, textMax, '500', 26, 18, font)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(o.qr, W - PAD - qrSize, fy + (FOOTER_H - qrSize) / 2, qrSize, qrSize)
    ctx.imageSmoothingEnabled = true
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  )
}
