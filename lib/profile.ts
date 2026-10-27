export type SocialLinks = {
  website?: string
  instagram?: string
  youtube?: string
  github?: string
  twitch?: string
}

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible'

export type ProfileDetails = {
  bio: string
  location: string | null
  socialLinks: SocialLinks
  publicVisitCount: boolean
  hideLikes: boolean
  isStaffRole: string | null
  xp: number
}

export const PROFILE_LINK_FIELDS = ['website', 'instagram', 'youtube', 'github', 'twitch'] as const
export type ProfileLinkField = (typeof PROFILE_LINK_FIELDS)[number]
