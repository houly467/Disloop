import { describe, expect, it, vi } from 'vitest'
import { shouldTrackReelView } from '@/lib/reel-view-session'

function createStorage(initialValue: string | null = null) {
  let value = initialValue
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, nextValue: string) => { value = nextValue }),
  }
}

describe('reel view session deduplication', () => {
  it('tracks a reel once per mounted session', () => {
    const trackedIds = new Set<string>()
    const storage = createStorage()

    expect(shouldTrackReelView('reel-1', 'user-1', trackedIds, storage)).toBe(true)
    expect(shouldTrackReelView('reel-1', 'user-1', trackedIds, storage)).toBe(false)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
  })

  it('preserves session deduplication when the component remounts', () => {
    const storage = createStorage(JSON.stringify(['reel-1']))

    expect(shouldTrackReelView('reel-1', 'user-1', new Set(), storage)).toBe(false)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('continues tracking when session storage is unavailable', () => {
    const trackedIds = new Set<string>()

    expect(shouldTrackReelView('reel-1', 'user-1', trackedIds, null)).toBe(true)
    expect(shouldTrackReelView('reel-1', 'user-1', trackedIds, null)).toBe(false)
  })

  it('bounds persisted view IDs to the most recent 500 reels', () => {
    const existing = Array.from({ length: 500 }, (_, index) => `reel-${index}`)
    const storage = createStorage(JSON.stringify(existing))

    expect(shouldTrackReelView('new-reel', 'user-1', new Set(), storage)).toBe(true)
    const savedIds = JSON.parse(String(storage.setItem.mock.calls[0][1])) as string[]
    expect(savedIds).toHaveLength(500)
    expect(savedIds[0]).toBe('reel-1')
    expect(savedIds.at(-1)).toBe('new-reel')
  })
})
