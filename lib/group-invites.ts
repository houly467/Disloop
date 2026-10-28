export const GROUP_MEMBER_LIMIT = 100

export type InviteAction = 'accept' | 'reject'
export type InviteEligibility = {
  blocked: boolean
  memberGroupId: string | null
  hasPendingInvite: boolean
}

export function canManageGroupInvites(role: string | null | undefined) {
  return role === 'owner' || role === 'admin'
}

export function inviteEligibilityError(eligibility: InviteEligibility, groupId: string) {
  if (eligibility.blocked) return 'blocked'
  if (eligibility.memberGroupId) return eligibility.memberGroupId === groupId ? 'already_member' : 'group_membership_exists'
  if (eligibility.hasPendingInvite) return 'invite_exists'
  return null
}

export function resolveInviteAction(input: {
  action: InviteAction
  inviteeMatchesSession: boolean
  inviteExists: boolean
  existingStatus: 'accepted' | 'rejected' | null
  groupExists: boolean
  inviteGroupId: string
  memberGroupId: string | null
  groupFull: boolean
}) {
  if (!input.inviteeMatchesSession) return { error: 'invitee_required' } as const
  const nextStatus = input.action === 'accept' ? 'accepted' : 'rejected'
  if (!input.inviteExists) {
    if (input.existingStatus === nextStatus) return { status: nextStatus, repeated: true } as const
    if (input.existingStatus) return { error: 'invite_already_responded' } as const
    return { error: 'invite_unavailable' } as const
  }
  if (input.action === 'reject') return { status: 'rejected', repeated: false } as const
  if (!input.groupExists) return { error: 'group_not_found' } as const
  if (input.memberGroupId && input.memberGroupId !== input.inviteGroupId) return { error: 'group_membership_exists' } as const
  if (input.groupFull && input.memberGroupId !== input.inviteGroupId) return { error: 'group_full' } as const
  return { status: 'accepted', repeated: false } as const
}
