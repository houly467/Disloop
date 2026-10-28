export function canManageCloseFriend(ownerId: string, friendId: string, isRelated: boolean, blocked: boolean) {
  return ownerId !== friendId && isRelated && !blocked
}
