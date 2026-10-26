export type LinkedAccountRelationship = {
  ownerUserId: string
  accountUserId: string
}

export function mergeLinkedAccountRelationships(
  currentAccountId: string,
  targetAccountId: string,
  relationships: readonly LinkedAccountRelationship[],
) {
  if (currentAccountId === targetAccountId) throw new Error('same_account')

  const ownerByAccount = new Map(relationships.map(({ ownerUserId, accountUserId }) => [accountUserId, ownerUserId]))
  function getRoot(accountId: string) {
    let root = accountId
    const visited = new Set<string>()
    while (ownerByAccount.has(root)) {
      if (visited.has(root)) throw new Error('linked_accounts_cycle')
      visited.add(root)
      root = ownerByAccount.get(root)!
    }
    return root
  }

  const canonicalOwnerId = getRoot(currentAccountId)
  const targetOwnerId = getRoot(targetAccountId)
  const childrenByOwner = new Map<string, string[]>()
  for (const { ownerUserId, accountUserId } of relationships) {
    const children = childrenByOwner.get(ownerUserId) ?? []
    children.push(accountUserId)
    childrenByOwner.set(ownerUserId, children)
  }

  const accounts = new Set<string>()
  const pendingOwners = [canonicalOwnerId, targetOwnerId]
  while (pendingOwners.length) {
    const ownerId = pendingOwners.pop()!
    if (accounts.has(ownerId)) continue
    accounts.add(ownerId)
    pendingOwners.push(...(childrenByOwner.get(ownerId) ?? []))
  }

  return {
    ownerUserId: canonicalOwnerId,
    relationships: [...accounts]
      .filter((accountUserId) => accountUserId !== canonicalOwnerId)
      .sort()
      .map((accountUserId) => ({ ownerUserId: canonicalOwnerId, accountUserId })),
  }
}
