import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { applyReelAudioPreference, getActiveReelIndex, getReelProgress, ReelsSection, unmuteReelVideo } from '@/components/community-sections'
import { resetReelFeedPosition } from '@/lib/reel-feed-position'

describe('Reels viewer loading metadata', () => {
  it('resets the feed scroll position and active reel index to the first reel', () => {
    const feed = { scrollTop: 640, scrollTo: vi.fn() } as unknown as HTMLElement
    const setActiveIndex = vi.fn()

    resetReelFeedPosition(feed, setActiveIndex)

    expect(feed.scrollTop).toBe(0)
    expect(feed.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
    expect(setActiveIndex).toHaveBeenCalledWith(0)
  })

  it('selects the most visible reel only when it crosses the intersection threshold', () => {
    expect(getActiveReelIndex([0.3, 0.62, 0.81, 0.1])).toBe(2)
    expect(getActiveReelIndex([0.59, 0.2])).toBe(-1)
  })

  it('renders safely with a null video ref and duration metadata not yet available', () => {
    const markup = renderToStaticMarkup(createElement(ReelsSection, {
      locale: 'en',
      viewer: null,
      initialReels: [{
        id: 'reel-loading',
        authorId: 'author-1',
        videoUrl: 'https://example.invalid/reel.mp4',
        caption: 'Loading metadata',
        tags: [],
        createdAt: new Date().toISOString(),
        authorName: 'Creator',
        authorUsername: 'creator',
        authorAvatar: null,
        authorCreatedAt: null,
        authorIsNewAccount: false,
        likeCount: 0,
        likedByMe: false,
        authorNameStyle: null,
        authorCustomTitle: null,
      }],
      onSignIn: () => undefined,
      onCreateContent: async () => false,
      onMembershipRequired: () => undefined,
      onReelPublished: () => undefined,
    }))

    expect(markup).toContain('class="reel-video"')
    expect(markup).toContain('width:0%')
    expect(getReelProgress(null)).toBe(0)
    expect(getReelProgress({ isConnected: true, duration: Number.NaN, currentTime: 0 } as HTMLVideoElement)).toBe(0)
  })

  it('preloads only the active reel and next reel metadata, leaving distant videos unloaded', () => {
    const reels = ['active', 'next', 'distant'].map((id) => ({
      id,
      authorId: 'author-1',
      videoUrl: `https://example.invalid/${id}.mp4`,
      caption: id,
      tags: [],
      createdAt: new Date().toISOString(),
      authorName: 'Creator',
      authorUsername: 'creator',
      authorAvatar: null,
      authorCreatedAt: null,
      authorIsNewAccount: false,
      likeCount: 0,
      likedByMe: false,
      authorNameStyle: null,
      authorCustomTitle: null,
    }))
    const markup = renderToStaticMarkup(createElement(ReelsSection, {
      locale: 'en',
      viewer: null,
      initialReels: reels,
      onSignIn: () => undefined,
      onCreateContent: async () => false,
      onMembershipRequired: () => undefined,
      onReelPublished: () => undefined,
    }))

    expect(markup).toContain('preload="auto" src="https://example.invalid/active.mp4"')
    expect(markup).toContain('preload="metadata" src="https://example.invalid/next.mp4"')
    expect(markup).toContain('preload="none" aria-label="distant"')
    expect(markup).not.toContain('src="https://example.invalid/distant.mp4"')
  })

  it('unmutes the active video from the user gesture and lets the next reel inherit the preference', async () => {
    const activeVideo = {
      isConnected: true,
      muted: true,
      volume: 0.2,
      play: vi.fn().mockResolvedValue(undefined),
    } as unknown as HTMLVideoElement

    await expect(unmuteReelVideo(activeVideo)).resolves.toBe(true)
    expect(activeVideo.muted).toBe(false)
    expect(activeVideo.volume).toBe(1)
    expect(activeVideo.play).toHaveBeenCalledOnce()

    const nextVideo = {
      isConnected: true,
      muted: true,
      volume: 0.2,
    } as HTMLVideoElement
    expect(applyReelAudioPreference(nextVideo, false)).toBe(true)
    expect(nextVideo.muted).toBe(false)
    expect(nextVideo.volume).toBe(1)
  })

  it('falls back to muted playback if the browser rejects unmuted autoplay', async () => {
    const video = {
      isConnected: true,
      muted: true,
      volume: 0.2,
      play: vi.fn()
        .mockRejectedValueOnce(new Error('autoplay_blocked'))
        .mockResolvedValueOnce(undefined),
    } as unknown as HTMLVideoElement

    await expect(unmuteReelVideo(video)).resolves.toBe(false)
    expect(video.muted).toBe(true)
    expect(video.play).toHaveBeenCalledTimes(2)
  })
})
