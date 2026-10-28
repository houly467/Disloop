import { NextRequest, NextResponse } from 'next/server'
import { getProfileMusicProvider, normalizeProfileMusicUrl } from '@/lib/profile-music'

type MusicMetadata = { title: string; artist: string | null; thumbnailUrl: string | null }
const metadataCache = new Map<string, { expiresAt: number; value: MusicMetadata }>()
const cacheDurationMs = 60 * 60 * 1000

function safeHttpsUrl(value: unknown) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const requestedUrl = request.nextUrl.searchParams.get('url') ?? ''
  const normalizedUrl = normalizeProfileMusicUrl(requestedUrl)
  if (!normalizedUrl) return NextResponse.json({ error: 'unsupported_music_url' }, { status: 400 })

  const cached = metadataCache.get(normalizedUrl)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.value, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
  }

  const provider = getProfileMusicProvider(normalizedUrl)
  let metadata: MusicMetadata = {
    title: new URL(normalizedUrl).hostname.replace(/^www\./, ''),
    artist: null,
    thumbnailUrl: null,
  }
  try {
    let endpoint: string | null = null
    if (provider === 'youtube') {
      endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(normalizedUrl)}`
    } else if (provider === 'spotify') {
      endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(normalizedUrl)}`
    } else if (provider === 'soundcloud') {
      endpoint = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(normalizedUrl)}`
    } else if (provider === 'apple') {
      const appleUrl = new URL(normalizedUrl)
      const id = appleUrl.searchParams.get('i') ?? appleUrl.pathname.split('/').find((part) => /^\d+$/.test(part))
      if (id) endpoint = `https://itunes.apple.com/lookup?id=${id}&entity=song`
    }

    if (endpoint) {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(4000), redirect: 'error' })
      if (response.ok) {
        const result = await response.json() as Record<string, unknown>
        if (provider === 'apple') {
          const item = (result.results as Record<string, unknown>[] | undefined)?.[0]
          if (typeof item?.trackName === 'string') metadata.title = item.trackName
          if (typeof item?.artistName === 'string') metadata.artist = item.artistName
          metadata.thumbnailUrl = safeHttpsUrl(item?.artworkUrl100)
        } else {
          if (typeof result.title === 'string' && result.title.trim()) metadata.title = result.title.trim()
          if (typeof result.author_name === 'string' && result.author_name.trim()) metadata.artist = result.author_name.trim()
          metadata.thumbnailUrl = safeHttpsUrl(result.thumbnail_url)
        }
      }
    }
  } catch {
    // Unsupported or unavailable provider metadata falls back to the validated hostname.
  }

  if (metadataCache.size >= 500) {
    const oldestKey = metadataCache.keys().next().value
    if (oldestKey) metadataCache.delete(oldestKey)
  }
  metadataCache.set(normalizedUrl, { expiresAt: Date.now() + cacheDurationMs, value: metadata })
  return NextResponse.json(metadata, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
}
