// Shrinks a phone photo before upload: longest side to maxPx, re-encoded as
// JPEG. A 4 MB camera shot becomes ~100 KB, which matters on rural 4G.
// Falls back to the original file if the browser can't decode it.
export async function compressImage(file: File, maxPx = 800, quality = 0.7): Promise<File> {
  return (await compressPhoto(file, maxPx, quality)).file
}

// Same, but also says how big the ORIGINAL picture was (0 × 0 if it could not
// be read), so the produce form can turn away tiny thumbnails that would look
// blurry on every phone (2026-11-18).
export async function compressPhoto(
  file: File,
  maxPx = 800,
  quality = 0.7,
): Promise<{ file: File; width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    const blobUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(blobUrl)
      const width = img.naturalWidth
      const height = img.naturalHeight
      const scale = Math.min(1, maxPx / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve({ file, width, height }); return }
      // Smoother downscale than the default, so small print stays readable.
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve({ file, width, height }); return }
          const name = file.name.replace(/\.[^.]+$/, '.jpg')
          resolve({ file: new File([blob], name, { type: 'image/jpeg' }), width, height })
        },
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve({ file, width: 0, height: 0 }) }
    img.src = blobUrl
  })
}
