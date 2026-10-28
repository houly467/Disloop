export type ProfileMusicProvider = 'youtube' | 'spotify' | 'soundcloud' | 'apple'

const providerHosts: Record<ProfileMusicProvider, string[]> = {
  youtube: ['youtube.com', 'www.youtube.com', 'music.youtube.com', 'youtu.be'],
  spotify: ['open.spotify.com'],
  soundcloud: ['soundcloud.com', 'www.soundcloud.com'],
  apple: ['music.apple.com'],
}

export function getProfileMusicProvider(value: string): ProfileMusicProvider | null {
  let hostname: string
  try {
    hostname = new URL(value).hostname.toLowerCase()
  } catch {
    return null
  }
  return (Object.entries(providerHosts).find(([, hosts]) => hosts.includes(hostname))?.[0] as ProfileMusicProvider | undefined) ?? null
}

export function normalizeProfileMusicUrl(value: string): string | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null

  const provider = getProfileMusicProvider(url.toString())
  if (!provider) return null

  if (provider === 'youtube') {
    const videoId = url.hostname === 'youtu.be'
      ? url.pathname.split('/').filter(Boolean)[0]
      : url.searchParams.get('v') ?? url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1]
    if (!videoId || !/^[\w-]{11}$/.test(videoId)) return null
    return `https://www.youtube.com/watch?v=${videoId}`
  }

  const segments = url.pathname.split('/').filter(Boolean)
  if (provider === 'spotify') {
    if (segments.length < 2 || !['track', 'album', 'playlist', 'episode', 'show'].includes(segments[0])) return null
    if (!/^[A-Za-z0-9]+$/.test(segments[1])) return null
    return `https://open.spotify.com/${segments[0]}/${segments[1]}`
  }
  if (provider === 'soundcloud') {
    if (segments.length < 2) return null
    url.hostname = 'soundcloud.com'
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  }
  const appleTrackId = url.searchParams.get('i')
  if (!segments.some((segment) => /^\d+$/.test(segment)) && !appleTrackId?.match(/^\d+$/)) return null
  url.search = appleTrackId?.match(/^\d+$/) ? `?i=${appleTrackId}` : ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

export function getProfileMusicEmbedUrl(value: string): string | null {
  const normalized = normalizeProfileMusicUrl(value)
  if (!normalized) return null
  const url = new URL(normalized)
  const provider = getProfileMusicProvider(normalized)

  if (provider === 'youtube') {
    const videoId = url.searchParams.get('v')
    return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&enablejsapi=1` : null
  }
  if (provider === 'spotify') {
    return `${url.origin}/embed${url.pathname}?utm_source=generator&autoplay=1`
  }
  if (provider === 'soundcloud') {
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(normalized)}&auto_play=true&visual=true`
  }
  if (provider === 'apple') {
    return `https://embed.music.apple.com${url.pathname}?itsct=music_box_player&itscg=30200&at=1000lHKX&ct=profile`
  }
  return null
}

export function getProfileMusicFallbackTitle(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
