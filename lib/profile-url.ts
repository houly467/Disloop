export function getProfileUrl(origin: string, userId: string, username: string | null | undefined) {
  const path = username?.trim()
    ? `/u/${encodeURIComponent(username.trim())}`
    : `/profile/${encodeURIComponent(userId)}`
  return new URL(path, origin).toString()
}
