const MAX_STORED_REEL_VIEWS = 500

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem'>

export function shouldTrackReelView(
  reelId: string,
  sessionKey: string,
  trackedIds: Set<string>,
  storage: SessionStorageLike | null,
) {
  if (trackedIds.has(reelId)) return false
  trackedIds.add(reelId)

  if (!storage) return true

  try {
    const stored = JSON.parse(storage.getItem(sessionKey) ?? '[]') as unknown
    const storedIds = Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []
    if (storedIds.includes(reelId)) return false

    storage.setItem(sessionKey, JSON.stringify([...storedIds, reelId].slice(-MAX_STORED_REEL_VIEWS)))
  } catch {
    // Keep view tracking in-memory if session storage is unavailable.
  }

  return true
}
