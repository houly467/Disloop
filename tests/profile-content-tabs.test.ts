import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProfileContentTabs } from '@/components/profile-content-tabs'
import type { PublicProfile } from '@/lib/users'

const profile: PublicProfile = {
  id: 'f2eaf95c-1346-4c01-b595-cfdd67599f60',
  discordId: 'discord-id',
  discordUsername: 'creator',
  displayName: 'Creator',
  avatarUrl: null,
  profileAvatarUrl: null,
  profileBannerUrl: null,
  username: 'creator',
  isMember: false,
  accountCreatedAt: new Date(0).toISOString(),
  isNewAccount: false,
  followerCount: 0,
  followingCount: 0,
  bio: '',
  location: null,
  socialLinks: {},
  publicVisitCount: false,
  hideLikes: false,
  hideReposts: false,
  isStaffRole: null,
  xp: 0,
  nameStyle: null,
  customTitle: null,
}

describe('profile content tabs', () => {
  it('renders accessible tabs with Posts selected by default without requesting video files', () => {
    const markup = renderToStaticMarkup(createElement(ProfileContentTabs, {
      profile,
      locale: 'en',
      editable: false,
      onSignIn: () => undefined,
      followerCount: 0,
      followingCount: 0,
      onOpenRelationship: () => undefined,
      canPinPost: false,
    }))

    expect(markup).toContain('role="tablist"')
    expect(markup).toContain('id="profile-tab-posts"')
    expect(markup).toContain('aria-selected="true"')
    expect(markup.indexOf('id="profile-tab-posts"')).toBeLessThan(markup.indexOf('id="profile-tab-reposts"'))
    expect(markup.indexOf('id="profile-tab-reposts"')).toBeLessThan(markup.indexOf('id="profile-tab-reels"'))
    expect(markup).not.toContain('<video')
  })
})
