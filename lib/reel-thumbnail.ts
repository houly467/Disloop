export async function createReelThumbnail(videoFile: File): Promise<File> {
  const sourceUrl = URL.createObjectURL(videoFile)
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'metadata'
  video.playsInline = true
  video.src = sourceUrl

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('thumbnail_timeout')), 10_000)
      video.addEventListener('loadedmetadata', () => {
        window.clearTimeout(timeout)
        resolve()
      }, { once: true })
      video.addEventListener('error', () => {
        window.clearTimeout(timeout)
        reject(new Error('thumbnail_decode_failed'))
      }, { once: true })
    })

    if (!video.videoWidth || !video.videoHeight) throw new Error('thumbnail_decode_failed')
    video.currentTime = Math.min(1, Math.max(0, video.duration / 3))
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('thumbnail_timeout')), 10_000)
      video.addEventListener('seeked', () => {
        window.clearTimeout(timeout)
        resolve()
      }, { once: true })
      video.addEventListener('error', () => {
        window.clearTimeout(timeout)
        reject(new Error('thumbnail_decode_failed'))
      }, { once: true })
    })

    const scale = Math.min(1, 480 / video.videoWidth, 854 / video.videoHeight)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('thumbnail_encode_failed')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    const thumbnail = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('thumbnail_encode_failed')), 'image/webp', 0.75)
    })
    return new File([thumbnail], 'reel-thumbnail.webp', { type: 'image/webp' })
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(sourceUrl)
  }
}
