'use client'

// Produce photos, shared by the farmer form and the moderator listing form.
// Empty: two buttons — Camera (opens the back camera straight away via
// capture="environment") and Gallery (multi-select, so three photos is one
// trip). After the first photo: big cover + thumbnails + a "+" tile that
// offers the same two choices. Tap a thumbnail to make it the cover.

import { useEffect, useRef, useState } from 'react'
import { useLang } from '@/lib/LanguageContext'
import { compressImage } from '@/lib/compressImage'
import { makeCover, newPhoto, removePhoto, screenPhotoFiles, type PhotoItem } from '@/lib/photoList'

export default function PhotoPicker({
  photos,
  onChange,
  onError,
  hint,
}: {
  photos: PhotoItem[]
  onChange: (next: PhotoItem[]) => void
  onError: (msg: string) => void
  hint?: string
}) {
  const { tx, L } = useLang()
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)

  // Revoke any unsaved previews when the form goes away.
  const latest = useRef(photos)
  useEffect(() => { latest.current = photos }, [photos])
  useEffect(() => () => {
    latest.current.forEach((p) => { if (p.file) URL.revokeObjectURL(p.url) })
  }, [])

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // allow picking the same file again
    if (!files.length) return
    const { ok, problem } = screenPhotoFiles(files)
    onError(problem === 'type' ? tx.pickImageFile : problem === 'size' ? tx.imageTooLarge : '')
    if (!ok.length) return
    setBusy(true)
    const added: PhotoItem[] = []
    for (const f of ok) {
      const c = await compressImage(f)
      added.push(newPhoto(c, URL.createObjectURL(c)))
    }
    setBusy(false)
    setAdding(false)
    onChange([...photos, ...added])
  }

  const remove = (p: PhotoItem) => {
    if (p.file) URL.revokeObjectURL(p.url)
    onChange(removePhoto(photos, p.key))
  }

  const choices = (compact: boolean) => (
    <div className="grid grid-cols-2 gap-2">
      <label className={`flex items-center justify-center gap-2 border-2 border-dashed border-green-300 rounded-xl ${compact ? 'py-3' : 'py-4'} px-3 text-green-700 text-sm font-bold cursor-pointer active:bg-green-50`}>
        <span className="text-lg leading-none">📷</span>
        {L('Camera', 'కెమెరా')}
        <input type="file" accept="image/*" capture="environment" onChange={onPick} className="hidden" />
      </label>
      <label className={`flex items-center justify-center gap-2 border-2 border-dashed border-green-300 rounded-xl ${compact ? 'py-3' : 'py-4'} px-3 text-green-700 text-sm font-bold cursor-pointer active:bg-green-50`}>
        <span className="text-lg leading-none">🖼</span>
        {L('Gallery', 'గ్యాలరీ')}
        <input type="file" accept="image/*" multiple onChange={onPick} className="hidden" />
      </label>
    </div>
  )

  const cover = photos[0]
  const rest = photos.slice(1)

  return (
    <div className="space-y-2">
      {!cover ? choices(false) : (
        <>
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover.url}
              alt={L('Cover photo', 'కవర్ ఫోటో')}
              className="w-full max-h-64 object-cover rounded-xl border border-gray-200 bg-gray-50"
            />
            <span className="absolute bottom-2 left-2 bg-green-700 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
              {L('Cover', 'కవర్')}
            </span>
            <button
              type="button"
              onClick={() => remove(cover)}
              className="absolute top-2 right-2 bg-white/90 text-gray-700 rounded-full w-8 h-8 flex items-center justify-center text-base font-bold shadow"
              aria-label={L('Remove photo', 'ఫోటో తీసివేయి')}
            >×</button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {rest.map((p) => (
              <div key={p.key} className="relative w-20 h-20">
                <button
                  type="button"
                  onClick={() => onChange(makeCover(photos, p.key))}
                  className="block w-20 h-20"
                  aria-label={L('Make this the cover', 'దీన్ని కవర్ చేయి')}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="w-20 h-20 object-cover rounded-xl border border-gray-200" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(p)}
                  className="absolute -top-1.5 -right-1.5 bg-white text-gray-700 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold shadow border"
                  aria-label={L('Remove photo', 'ఫోటో తీసివేయి')}
                >×</button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setAdding((a) => !a)}
              className={`w-20 h-20 rounded-xl border-2 border-dashed flex items-center justify-center text-3xl font-light ${adding ? 'border-green-500 bg-green-50 text-green-700' : 'border-green-300 text-green-600'} active:bg-green-50`}
              aria-label={L('Add photos', 'ఫోటోలు జోడించు')}
              aria-expanded={adding}
            >{adding ? '×' : '+'}</button>
          </div>
          {adding && choices(true)}
        </>
      )}
      {busy && <p className="text-[11px] text-gray-500">{L('Adding photos…', 'ఫోటోలు జోడిస్తోంది…')}</p>}
      <p className="text-[11px] text-gray-500">
        {hint ?? (photos.length > 1
          ? L('Tap a small photo to make it the cover.', 'కవర్‌గా పెట్టడానికి చిన్న ఫోటోను నొక్కండి.')
          : tx.buyersSeeCard)}
      </p>
    </div>
  )
}
