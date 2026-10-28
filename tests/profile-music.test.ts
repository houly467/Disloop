import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProfileMusicPlayer } from '@/components/profile-music-player'
import { getProfileMusicEmbedUrl, normalizeProfileMusicUrl } from '@/lib/profile-music'

describe('profile music links', () => {
  it('normalizes supported links and builds provider-owned embed URLs', () => {
    expect(normalizeProfileMusicUrl('https://youtu.be/dQw4w9WgXcQ?t=10')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(getProfileMusicEmbedUrl('https://open.spotify.com/track/1abc234def567890ghi123')).toBe(
      'https://open.spotify.com/embed/track/1abc234def567890ghi123?utm_source=generator&autoplay=1',
    )
    expect(getProfileMusicEmbedUrl('https://soundcloud.com/artist/track')).toContain('https://w.soundcloud.com/player/?url=')
    expect(getProfileMusicEmbedUrl('https://music.apple.com/us/album/song/123456789')).toContain('https://embed.music.apple.com/us/album/song/123456789')
  })

  it('rejects insecure, unsupported, credentialed, and malformed provider links', () => {
    expect(normalizeProfileMusicUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(normalizeProfileMusicUrl('https://youtube.com.attacker.example/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(normalizeProfileMusicUrl('https://user:pass@open.spotify.com/track/1abc234def567890ghi123')).toBeNull()
    expect(normalizeProfileMusicUrl('https://open.spotify.com.evil.example/track/1abc234def567890ghi123')).toBeNull()
    expect(normalizeProfileMusicUrl('https://music.apple.com/us/album/song/no-id')).toBeNull()
  })

  it('does not create an external player until the visitor activates play', () => {
    const markup = renderToStaticMarkup(createElement(ProfileMusicPlayer, {
      url: 'https://youtu.be/dQw4w9WgXcQ',
      locale: 'en',
    }))
    expect(markup).toContain('Now playing')
    expect(markup).toContain('aria-label="Play"')
    expect(markup).toContain('value="25"')
    expect(markup).not.toContain('<iframe')
    expect(markup).not.toContain('autoplay=1')
  })
})
