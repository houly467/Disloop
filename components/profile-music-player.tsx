'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Music2, Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getProfileMusicEmbedUrl, getProfileMusicFallbackTitle, getProfileMusicProvider } from '@/lib/profile-music'

type Locale = 'en' | 'ar'
type Metadata = { title: string; artist: string | null; thumbnailUrl: string | null }

const labels = {
  en: { nowPlaying: 'Now playing', play: 'Play', pause: 'Pause', volume: 'Volume', mute: 'Mute', unmute: 'Unmute', remove: 'Remove song', loading: 'Loading player…', metadataError: 'Music details are unavailable.', nativeVolume: 'Use the embedded player controls to adjust volume for this service.' },
  ar: { nowPlaying: 'يُشغّل الآن', play: 'تشغيل', pause: 'إيقاف مؤقت', volume: 'مستوى الصوت', mute: 'كتم الصوت', unmute: 'إلغاء كتم الصوت', remove: 'إزالة الأغنية', loading: 'جارٍ تحميل المشغّل…', metadataError: 'تفاصيل الأغنية غير متاحة.', nativeVolume: 'استخدم عناصر التحكم في المشغّل لضبط مستوى الصوت لهذه الخدمة.' },
} satisfies Record<Locale, Record<string, string>>

const volumeStorageKey = 'disloop-profile-music-volume'

function readSavedVolume() {
  try {
    const saved = Number(window.localStorage.getItem(volumeStorageKey))
    return Number.isFinite(saved) && saved >= 0 && saved <= 100 ? saved : 25
  } catch {
    return 25
  }
}

export function ProfileMusicPlayer({ url, locale, onRemove }: { url: string; locale: Locale; onRemove?: () => void }) {
  const text = labels[locale]
  const normalized = url
  const embedUrl = getProfileMusicEmbedUrl(normalized)
  const provider = getProfileMusicProvider(normalized)
  const supportsRemoteVolume = provider === 'youtube' || provider === 'soundcloud'
  const frameRef = useRef<HTMLIFrameElement>(null)
  const playerId = useId()
  const [metadata, setMetadata] = useState<Metadata>({
    title: getProfileMusicFallbackTitle(normalized),
    artist: null,
    thumbnailUrl: null,
  })
  const [playing, setPlaying] = useState(false)
  const [embedLoaded, setEmbedLoaded] = useState(false)
  const [volume, setVolume] = useState(25)
  const [muted, setMuted] = useState(false)
  const [metadataFailed, setMetadataFailed] = useState(false)

  useEffect(() => {
    setVolume(readSavedVolume())
  }, [])

  useEffect(() => {
    let active = true
    fetch(`/api/profile/music/metadata?url=${encodeURIComponent(normalized)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('music_metadata_unavailable')
        return response.json() as Promise<Metadata>
      })
      .then((result) => {
        if (active) setMetadata(result)
      })
      .catch(() => {
        if (active) setMetadataFailed(true)
      })
    return () => { active = false }
  }, [normalized])

  useEffect(() => {
    function stopIfAnotherPlayerStarted(event: Event) {
      if ((event as CustomEvent<string>).detail !== playerId) setPlaying(false)
    }
    window.addEventListener('disloop:profile-music-play', stopIfAnotherPlayerStarted)
    return () => window.removeEventListener('disloop:profile-music-play', stopIfAnotherPlayerStarted)
  }, [playerId])

  useEffect(() => {
    if (!playing || !frameRef.current?.contentWindow || !provider) return
    const syncVolume = () => {
      const target = frameRef.current?.contentWindow
      if (!target) return
      if (provider === 'youtube') {
        target.postMessage(JSON.stringify({ event: 'command', func: muted ? 'mute' : 'unMute', args: [] }), 'https://www.youtube.com')
        if (!muted) target.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [volume] }), 'https://www.youtube.com')
      } else if (provider === 'soundcloud') {
        target.postMessage(JSON.stringify({ method: 'setVolume', value: muted ? 0 : volume }), 'https://w.soundcloud.com')
      }
    }
    syncVolume()
    const retryTimers = [window.setTimeout(syncVolume, 400), window.setTimeout(syncVolume, 1200)]
    return () => retryTimers.forEach((timer) => window.clearTimeout(timer))
  }, [muted, playing, provider, volume])

  function togglePlayback() {
    if (playing) {
      setPlaying(false)
      setEmbedLoaded(false)
      return
    }
    window.dispatchEvent(new CustomEvent('disloop:profile-music-play', { detail: playerId }))
    setEmbedLoaded(false)
    setPlaying(true)
  }

  function updateVolume(next: number) {
    setVolume(next)
    setMuted(next === 0)
    try {
      window.localStorage.setItem(volumeStorageKey, String(next))
    } catch {
      // The in-memory volume preference remains usable when storage is disabled.
    }
  }

  if (!embedUrl) return null

  return <section className="profile-music-card" aria-label={text.nowPlaying} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    {onRemove && <Button
      className="profile-music-remove"
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={text.remove}
      title={text.remove}
      onClick={onRemove}
    ><X aria-hidden="true" /></Button>}
    <div className="profile-music-cover">
      {metadata.thumbnailUrl ? <img src={metadata.thumbnailUrl} alt="" /> : <Music2 aria-hidden="true" />}
    </div>
    <div className={`profile-music-info${onRemove ? ' has-remove' : ''}`}>
      <span className="profile-music-kicker">{text.nowPlaying}</span>
      <strong title={metadata.title}>{metadata.title}</strong>
      <small>{metadata.artist || getProfileMusicFallbackTitle(normalized)}</small>
      {metadataFailed && <small className="profile-music-fallback">{text.metadataError}</small>}
    </div>
    <div className="profile-music-controls">
      <Button type="button" variant="secondary" size="icon" aria-label={playing ? text.pause : text.play} title={playing ? text.pause : text.play} aria-pressed={playing} onClick={togglePlayback}>
        {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </Button>
      <Button type="button" variant="ghost" size="icon" aria-label={muted ? text.unmute : text.mute} title={muted ? text.unmute : text.mute} disabled={!supportsRemoteVolume} onClick={() => setMuted((value) => !value)}>
        {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      </Button>
      <label className="profile-music-volume">
        <span className="sr-only">{text.volume}</span>
        <input type="range" min="0" max="100" value={muted ? 0 : volume} disabled={!supportsRemoteVolume} onChange={(event) => updateVolume(Number(event.target.value))} aria-label={text.volume} title={supportsRemoteVolume ? text.volume : text.nativeVolume} />
      </label>
    </div>
    {playing && <div className={`profile-music-embed is-${provider}${provider === 'youtube' || provider === 'soundcloud' ? ' is-visually-hidden-player' : ''}`}>
      <iframe ref={frameRef} src={embedUrl} title={metadata.title} allow="autoplay; encrypted-media; clipboard-write; fullscreen" loading="eager" onLoad={() => setEmbedLoaded(true)} />
      {!embedLoaded && <p>{text.loading}</p>}
    </div>}
  </section>
}
