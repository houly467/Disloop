const NEW_ACCOUNT_WINDOW_MS = 72 * 60 * 60 * 1000

export function isNewAccount(createdAt: string | Date | null | undefined, now: number | Date = Date.now()) {
  if (!createdAt) return false
  const createdTime = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime()
  const nowTime = now instanceof Date ? now.getTime() : now
  if (!Number.isFinite(createdTime) || !Number.isFinite(nowTime)) return false
  const age = nowTime - createdTime
  return age >= 0 && age < NEW_ACCOUNT_WINDOW_MS
}
