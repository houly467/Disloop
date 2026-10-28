import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
    execute: vi.fn(),
  },
  getCurrentUser: vi.fn(),
  getCurrentUserResult: vi.fn(),
  rateLimitResponse: vi.fn(),
  checkDiscordMembership: vi.fn(),
  isDiscordModerator: vi.fn(),
  getModerationQueue: vi.fn(),
  syncDiscordXpRole: vi.fn(),
  blobHead: vi.fn(),
  blobDelete: vi.fn(),
  blobUploadHandler: vi.fn(),
  validateUploadedMedia: vi.fn(),
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/session', () => ({ getCurrentUser: mocks.getCurrentUser, getCurrentUserResult: mocks.getCurrentUserResult }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitResponse: mocks.rateLimitResponse }))
vi.mock('@/lib/discord', () => ({ checkDiscordMembership: mocks.checkDiscordMembership }))
vi.mock('@/lib/discord-community', () => ({
  isDiscordModerator: mocks.isDiscordModerator,
  syncDiscordXpRole: mocks.syncDiscordXpRole,
}))
vi.mock('@/lib/moderation', () => ({ getModerationQueue: mocks.getModerationQueue }))
vi.mock('@vercel/blob', () => ({ head: mocks.blobHead, del: mocks.blobDelete }))
vi.mock('@vercel/blob/client', () => ({ handleUpload: mocks.blobUploadHandler }))
vi.mock('@/lib/media-validation', () => ({ validateUploadedMedia: mocks.validateUploadedMedia }))
vi.mock('@/lib/upstash', () => ({ redis: mocks.redis }))

import { GET as getModerationQueue } from '@/app/api/moderation/route'
import { PATCH as updateProfile } from '@/app/api/profile/route'
import { GET as checkUsernameAvailability } from '@/app/api/profile/username/route'
import { POST as createGroup } from '@/app/api/groups/route'
import { POST as joinGroup } from '@/app/api/groups/[id]/join/route'
import { GET as getGroupDetail } from '@/app/api/groups/[id]/route'
import { GET as getGroupMessages } from '@/app/api/groups/[id]/messages/route'
import { DELETE as kickGroupMember } from '@/app/api/groups/[id]/members/[userId]/route'
import { GET as getMedia } from '@/app/api/media/route'
import { canManageGroupInvites, inviteEligibilityError, resolveInviteAction } from '@/lib/group-invites'
import { PATCH as pinComment } from '@/app/api/social/comments/[id]/route'
import { awardXp } from '@/lib/gamification'
import { buildUploadToken } from '@/lib/blob-uploads'
import { RichText } from '@/components/mention-textarea'
import { generateInitialUsernameBase, getPublicUserByUsername, normalizeUsername, normalizeUsernameForLookup } from '@/lib/users'
import { requireLoggedInServerMember } from '@/lib/server-member'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'
const CONTENT_ID = '33333333-3333-4333-8333-333333333333'
const COMMENT_ID = '44444444-4444-4444-8444-444444444444'

function request(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: {
      origin: 'http://localhost:3000',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

function selectResult(result: unknown[]) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  query.from = vi.fn(() => query)
  query.leftJoin = vi.fn(() => query)
  query.where = vi.fn(() => query)
  query.limit = vi.fn().mockResolvedValue(result)
  return query
}

function prepareProfileUsernameUpdate(options: { currentUsername?: string; verified?: boolean; updateError?: Error } = {}) {
  const currentUsername = options.currentUsername ?? 'current.user'
  mocks.getCurrentUser.mockResolvedValue({
    id: USER_ID,
    discordId: 'discord-user',
    isMember: true,
    username: currentUsername,
  })
  mocks.db.select.mockImplementation(() => selectResult(options.verified ? [{ userId: USER_ID }] : []))
  const returnedProfile = {
    username: currentUsername,
    displayName: 'Member One',
    dateOfBirth: '2000-01-01',
  }
  const returning = vi.fn().mockImplementation(() => options.updateError
    ? Promise.reject(options.updateError)
    : Promise.resolve([returnedProfile]))
  const where = vi.fn(() => ({ returning }))
  const set = vi.fn(() => ({ where }))
  mocks.db.update.mockReturnValue({ set })
  const tx = {
    select: vi.fn(),
    insert: vi.fn(),
    update: mocks.db.update,
  }
  mocks.db.transaction.mockImplementation((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx))
  return { set, returning, tx }
}

function profileUpdateBody(username: string) {
  return {
    username,
    displayName: 'Member One',
    bio: '',
    location: '',
    socialLinks: {},
    publicVisitCount: false,
    hideLikes: false,
  }
}

function makeXpTransaction(eventAlreadyRecorded: () => boolean, markRecorded: () => void, xpAfter = 3) {
  let selectCount = 0
  let insertCount = 0
  const insertValues: unknown[] = []
  const tx = {
    select: vi.fn(() => {
      const query: Record<string, ReturnType<typeof vi.fn>> = {}
      query.from = vi.fn(() => query)
      const currentSelect = selectCount++
      if (currentSelect === 0) {
        query.where = vi.fn(() => query)
        query.for = vi.fn().mockResolvedValue([{ id: USER_ID }])
      } else {
        query.where = vi.fn().mockResolvedValue(currentSelect === 1 ? [{ points: 0 }] : [])
      }
      return query
    }),
    insert: vi.fn(() => {
      const currentInsert = insertCount++
      return {
        values: vi.fn((values: unknown) => {
          insertValues.push(values)
          return {
            onConflictDoNothing: vi.fn(() => currentInsert === 0 ? {
              returning: vi.fn().mockImplementation(async () => {
                if (eventAlreadyRecorded()) return []
                markRecorded()
                return [{ id: 'xp-event-id' }]
              }),
            } : Promise.resolve(undefined)),
          }
        }),
      }
    }),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ discordId: 'discord-user', xp: xpAfter }]),
        })),
      })),
    })),
    insertValues,
  }
  return tx
}

describe('security regression checks', () => {
  it('enforces a 3-character minimum for non-verified usernames and a 2-character minimum for verified usernames', () => {
    expect(normalizeUsername('abc')).toBe('abc')
    expect(normalizeUsername('ab')).toBeNull()
    expect(normalizeUsername('abc', true)).toBe('abc')
    expect(normalizeUsername('ab', true)).toBe('ab')
    expect(normalizeUsername('a')).toBeNull()
    expect(normalizeUsername('1', true)).toBeNull()
    expect(normalizeUsername('a..b', true)).toBeNull()
    expect(normalizeUsername('admin', true)).toBeNull()
    expect(normalizeUsername('MiXeD')).toBe('mixed')
    expect(normalizeUsernameForLookup('1')).toBe('1')
    expect(normalizeUsernameForLookup('LL')).toBe('ll')
  })

  it('falls back to a valid initial username when Discord names are shorter than four characters', () => {
    for (const shortName of ['a', '7', 'ab']) {
      const generated = generateInitialUsernameBase({
        id: '123456789012345678',
        username: shortName,
        global_name: shortName,
      })
      expect(generated.length).toBeGreaterThanOrEqual(3)
      expect(generated.length).toBeLessThanOrEqual(20)
      expect(generated).toMatch(/^[a-z0-9][a-z0-9._]*[a-z0-9]$/)
    }
  })

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getCurrentUser.mockResolvedValue({
      id: USER_ID,
      discordId: 'discord-user',
      isMember: true,
      username: 'current.user',
      dateOfBirth: null,
    })
    mocks.getCurrentUserResult.mockImplementation(async () => ({ status: 'ok', user: await mocks.getCurrentUser() }))
    process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token'
    mocks.rateLimitResponse.mockResolvedValue(null)
    mocks.checkDiscordMembership.mockResolvedValue(true)
    mocks.isDiscordModerator.mockResolvedValue(false)
    mocks.syncDiscordXpRole.mockResolvedValue(undefined)
    mocks.redis.get.mockResolvedValue(null)
    mocks.redis.set.mockResolvedValue('OK')
    mocks.redis.del.mockResolvedValue(1)
    mocks.blobDelete.mockResolvedValue(undefined)
    mocks.validateUploadedMedia.mockResolvedValue(undefined)
  })

  it('allows authenticated access by default without checking Discord membership', async () => {
    mocks.checkDiscordMembership.mockResolvedValue(false)
    const notMember = await requireLoggedInServerMember(request('http://localhost:3000/api/protected', 'POST'))
    expect(notMember.ok).toBe(true)
    expect(mocks.checkDiscordMembership).not.toHaveBeenCalled()
  })

  it('rejects nonmembers only when Discord membership is explicitly required', async () => {
    mocks.checkDiscordMembership.mockResolvedValue(false)
    const notMember = await requireLoggedInServerMember(request('http://localhost:3000/api/protected', 'POST'), { requireDiscordMembership: true })
    expect(notMember.ok).toBe(false)
    if (!notMember.ok) {
      expect(notMember.response.status).toBe(403)
      expect(await notMember.response.json()).toMatchObject({ error: 'DISCORD_MEMBERSHIP_REQUIRED', reason: 'DISCORD_MEMBERSHIP_REQUIRED' })
    }

    mocks.checkDiscordMembership.mockRejectedValue(new Error('Discord rate limited'))
    const unavailable = await requireLoggedInServerMember(request('http://localhost:3000/api/protected', 'POST'), { requireDiscordMembership: true })
    expect(unavailable.ok).toBe(false)
    if (!unavailable.ok) {
      expect(unavailable.response.status).toBe(503)
      expect(await unavailable.response.json()).toMatchObject({ error: 'discord_unavailable', reason: 'discord_unavailable' })
    }
  })

  it('allows confirmed members on content-creation routes', async () => {
    mocks.checkDiscordMembership.mockResolvedValue(true)
    const member = await requireLoggedInServerMember(
      request('http://localhost:3000/api/protected', 'POST'),
      { requireDiscordMembership: true },
    )
    expect(member.ok).toBe(true)
    expect(mocks.checkDiscordMembership).toHaveBeenCalledWith('discord-user')
  })

  it('returns 401 with a reason when no session exists', async () => {
    mocks.getCurrentUserResult.mockResolvedValue({ status: 'not_logged_in' })
    const result = await requireLoggedInServerMember(request('http://localhost:3000/api/protected', 'POST'))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(401)
      expect(await result.response.json()).toMatchObject({ error: 'not_logged_in', reason: 'not_logged_in' })
    }
  })

  it('rejects profile mass assignment instead of accepting role or XP fields', async () => {
    const response = await updateProfile(request('http://localhost:3000/api/profile', 'PATCH', {
      username: 'member.one',
      displayName: 'Member One',
      bio: '',
      location: '',
      socialLinks: {},
      publicVisitCount: false,
      hideLikes: false,
      isStaffRole: 'admin',
      xp: 999999,
    }))

    expect(response.status).toBe(400)
    expect(mocks.db.update).not.toHaveBeenCalled()
  })

  it.each([false, true])('rejects one-character usernames even when verified=%s', async (verified) => {
    prepareProfileUsernameUpdate({ verified })
    const response = await updateProfile(request('http://localhost:3000/api/profile', 'PATCH', profileUpdateBody('x')))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: 'username_minimum_length',
      message: 'Usernames need at least 2 characters',
    })
    expect(mocks.db.update).not.toHaveBeenCalled()
  })

  it('rejects a new two-character username for a member without the verified badge', async () => {
    prepareProfileUsernameUpdate()
    const response = await updateProfile(request('http://localhost:3000/api/profile', 'PATCH', profileUpdateBody('xy')))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: 'username_verification_required',
      message: 'Usernames need at least 3 characters',
    })
    expect(mocks.db.update).not.toHaveBeenCalled()
  })

  it('accepts a two-character username for a verified member', async () => {
    const { set } = prepareProfileUsernameUpdate({ verified: true })
    const response = await updateProfile(request('http://localhost:3000/api/profile', 'PATCH', profileUpdateBody('xy')))

    expect(response.status).toBe(200)
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ usernameLower: 'xy', usernameDisplay: 'xy' }))
  })

  it('accepts and lowercases usernames of at least three characters', async () => {
    const { set } = prepareProfileUsernameUpdate()
    const response = await updateProfile(request('http://localhost:3000/api/profile', 'PATCH', profileUpdateBody('MiXeD')))

    expect(response.status).toBe(200)
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ usernameLower: 'mixed', usernameDisplay: 'MiXeD' }))
  })

  it('releases the old username immediately without reading or writing username history', async () => {
    const { tx } = prepareProfileUsernameUpdate()
    const response = await updateProfile(request('http://localhost:3000/api/profile', 'PATCH', profileUpdateBody('new.name')))

    expect(response.status).toBe(200)
    expect(tx.select).not.toHaveBeenCalled()
    expect(tx.insert).not.toHaveBeenCalled()
    expect(mocks.rateLimitResponse).toHaveBeenNthCalledWith(2, `username-change:${USER_ID}`, 1, 7 * 24 * 60 * 60)
  })

  it('reports a concurrent case-insensitive username claim conflict from the unique index', async () => {
    const duplicateError = Object.assign(new Error('duplicate username'), { code: '23505' })
    prepareProfileUsernameUpdate({ updateError: duplicateError })
    const response = await updateProfile(request('http://localhost:3000/api/profile', 'PATCH', profileUpdateBody('MiXeD')))

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'username_taken' })
  })

  it('returns a clear retry response when the seven-day username-change limit is reached', async () => {
    prepareProfileUsernameUpdate()
    mocks.rateLimitResponse
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'rate_limited', retryAfter: 3600 }), {
        status: 429,
        headers: { 'Retry-After': '3600' },
      }))

    const response = await updateProfile(request('http://localhost:3000/api/profile', 'PATCH', profileUpdateBody('new.name')))

    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ error: 'username_change_limited', retryAfter: 3600 })
    expect(mocks.db.transaction).not.toHaveBeenCalled()
  })

  it('treats a released username as available when no current account owns it', async () => {
    mocks.db.select.mockImplementation(() => selectResult([]))
    const response = await checkUsernameAvailability(request('http://localhost:3000/api/profile/username?username=502', 'GET'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ valid: true, available: true })
    expect(mocks.db.select).toHaveBeenCalledTimes(1)
  })

  it('marks a username unavailable when another current account owns it', async () => {
    mocks.db.select.mockImplementation(() => selectResult([{ id: OTHER_USER_ID }]))
    const response = await checkUsernameAvailability(request('http://localhost:3000/api/profile/username?username=somebody', 'GET'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ valid: true, available: false })
    expect(mocks.db.select).toHaveBeenCalledTimes(1)
  })

  it('does not resolve a former /u username to its previous owner', async () => {
    mocks.db.select.mockImplementation(() => selectResult([]))

    await expect(getPublicUserByUsername('former.handle')).resolves.toBeNull()
    expect(mocks.db.select).toHaveBeenCalledTimes(1)
  })

  it('preserves an existing short username when the user does not change it', async () => {
    const { set } = prepareProfileUsernameUpdate({ currentUsername: 'ss' })
    const response = await updateProfile(request('http://localhost:3000/api/profile', 'PATCH', profileUpdateBody('ss')))

    expect(response.status).toBe(200)
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ usernameLower: 'ss', usernameDisplay: 'ss' }))
    expect(mocks.db.select).not.toHaveBeenCalled()
  })

  it('allows an authenticated nonmember to complete a profile while date of birth is unset', async () => {
    const { set } = prepareProfileUsernameUpdate()
    mocks.getCurrentUser.mockResolvedValue({
      id: USER_ID,
      discordId: 'discord-user',
      isMember: false,
      username: 'current.user',
      dateOfBirth: null,
    })
    mocks.checkDiscordMembership.mockResolvedValue(false)

    const response = await updateProfile(request('http://localhost:3000/api/profile', 'PATCH', {
      ...profileUpdateBody('new.member'),
      dateOfBirth: '2000-01-01',
    }))

    expect(response.status).toBe(200)
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      usernameLower: 'new.member',
      displayName: 'Member One',
      dateOfBirth: '2000-01-01',
    }))
    expect(mocks.checkDiscordMembership).not.toHaveBeenCalled()
  })

  it('allows profile edits for authenticated nonmembers after onboarding', async () => {
    const { set } = prepareProfileUsernameUpdate()
    mocks.getCurrentUser.mockResolvedValue({
      id: USER_ID,
      discordId: 'discord-user',
      isMember: false,
      username: 'current.user',
      dateOfBirth: '2000-01-01',
    })
    mocks.checkDiscordMembership.mockResolvedValue(false)

    const response = await updateProfile(request('http://localhost:3000/api/profile', 'PATCH', profileUpdateBody('new.member')))

    expect(response.status).toBe(200)
    expect(set).toHaveBeenCalled()
    expect(mocks.checkDiscordMembership).not.toHaveBeenCalled()
  })

  it('allows group creation without requiring Discord server membership', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: USER_ID, discordId: 'discord-user', isMember: false })
    mocks.db.update.mockReturnValue({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })
    mocks.db.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      let insertCount = 0
      const transaction = {
        execute: vi.fn().mockResolvedValue(undefined),
        select: vi.fn(() => {
          const query: Record<string, ReturnType<typeof vi.fn>> = {}
          query.from = vi.fn(() => query)
          query.where = vi.fn(() => query)
          query.for = vi.fn().mockResolvedValue([{ hasCreatedGroup: false }])
          query.limit = vi.fn().mockResolvedValue([])
          return query
        }),
        update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
        insert: vi.fn(() => {
          const current = insertCount++
          return current === 0
            ? { values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: CONTENT_ID, name: 'A circle', tag: 'circle' }]) })) }
            : { values: vi.fn().mockResolvedValue(undefined) }
        }),
      }
      return callback(transaction)
    })

    const response = await createGroup(request('http://localhost:3000/api/groups', 'POST', {
      name: 'A circle',
      description: '',
      tag: 'circle',
    }))

    expect(response.status).toBe(201)
    expect(mocks.checkDiscordMembership).not.toHaveBeenCalled()
    expect(mocks.db.transaction).toHaveBeenCalledOnce()
  })

  it('blocks a second group creation after the account creation flag is set', async () => {
    mocks.db.update.mockReturnValue({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })
    mocks.db.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => {
        const query: Record<string, ReturnType<typeof vi.fn>> = {}
        query.from = vi.fn(() => query)
        query.where = vi.fn(() => query)
        query.for = vi.fn().mockResolvedValue([{ hasCreatedGroup: true }])
        return query
      }),
      insert: vi.fn(),
    }))

    const response = await createGroup(request('http://localhost:3000/api/groups', 'POST', {
      name: 'Another circle',
      description: '',
      tag: 'another',
    }))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'group_limit_reached' })
  })

  it('blocks every self-join through the API, even for an existing public group', async () => {
    const response = await joinGroup(request(`http://localhost:3000/api/groups/${CONTENT_ID}/join`, 'POST'), {
      params: Promise.resolve({ id: CONTENT_ID }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'invite_required' })
    expect(mocks.db.transaction).not.toHaveBeenCalled()
  })

  it('does not expose group member lists or messages to non-members', async () => {
    const groupResults = [
      [{ id: CONTENT_ID, name: 'Private group', description: '', tag: 'private', ownerId: OTHER_USER_ID }],
      [],
    ]
    mocks.db.select.mockImplementation(() => selectResult(groupResults.shift() ?? []))
    const detail = await getGroupDetail(request(`http://localhost:3000/api/groups/${CONTENT_ID}`, 'GET'), {
      params: Promise.resolve({ id: CONTENT_ID }),
    })
    expect(detail.status).toBe(403)
    expect(await detail.json()).toEqual({ error: 'group_membership_required' })

    mocks.db.select.mockImplementation(() => selectResult([]))
    const messages = await getGroupMessages(request(`http://localhost:3000/api/groups/${CONTENT_ID}/messages`, 'GET'), {
      params: Promise.resolve({ id: CONTENT_ID }),
    })
    expect(messages.status).toBe(403)
    expect(await messages.json()).toEqual({ error: 'group_membership_required' })
  })

  it('does not serve group media to users without group membership', async () => {
    mocks.db.execute.mockResolvedValue({ rows: [{ allowed: false }] })
    const response = await getMedia(request(
      'http://localhost:3000/api/media?pathname=chat-media/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg',
      'GET',
    ))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'media_not_found' })
  })

  it('blocks member-level access to the kick endpoint', async () => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {}
    query.from = vi.fn(() => query)
    query.where = vi.fn(() => query)
    query.for = vi.fn().mockResolvedValue([{ role: 'member' }])
    const transaction = { select: vi.fn(() => query), delete: vi.fn() }
    mocks.db.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback(transaction))

    const response = await kickGroupMember(request(
      `http://localhost:3000/api/groups/${CONTENT_ID}/members/${OTHER_USER_ID}`,
      'DELETE',
    ), { params: Promise.resolve({ id: CONTENT_ID, userId: OTHER_USER_ID }) })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'group_member_permission_required' })
    expect(transaction.delete).not.toHaveBeenCalled()
  })

  it('allows only owners and admins to manage group invitations', () => {
    expect(canManageGroupInvites('owner')).toBe(true)
    expect(canManageGroupInvites('admin')).toBe(true)
    expect(canManageGroupInvites('member')).toBe(false)
    expect(canManageGroupInvites(undefined)).toBe(false)
  })

  it('blocks duplicate, current-member, and cross-group invitations', () => {
    expect(inviteEligibilityError({ blocked: false, memberGroupId: CONTENT_ID, hasPendingInvite: false }, CONTENT_ID)).toBe('already_member')
    expect(inviteEligibilityError({ blocked: false, memberGroupId: OTHER_USER_ID, hasPendingInvite: false }, CONTENT_ID)).toBe('group_membership_exists')
    expect(inviteEligibilityError({ blocked: false, memberGroupId: null, hasPendingInvite: true }, CONTENT_ID)).toBe('invite_exists')
  })

  it('accepts and declines invitations, while an expired invitation cannot be used', () => {
    const accept = resolveInviteAction({
      action: 'accept', inviteeMatchesSession: true, inviteExists: true, existingStatus: null,
      groupExists: true, inviteGroupId: CONTENT_ID, memberGroupId: null, groupFull: false,
    })
    const decline = resolveInviteAction({
      action: 'reject', inviteeMatchesSession: true, inviteExists: true, existingStatus: null,
      groupExists: true, inviteGroupId: CONTENT_ID, memberGroupId: null, groupFull: false,
    })
    const expired = resolveInviteAction({
      action: 'accept', inviteeMatchesSession: true, inviteExists: false, existingStatus: null,
      groupExists: false, inviteGroupId: '', memberGroupId: null, groupFull: false,
    })
    expect(accept).toMatchObject({ status: 'accepted', repeated: false })
    expect(decline).toMatchObject({ status: 'rejected', repeated: false })
    expect(expired).toEqual({ error: 'invite_unavailable' })
  })

  it('blocks a member from pinning a comment on another author’s post', async () => {
    const results = [
      [{ id: COMMENT_ID, contentType: 'news', contentId: CONTENT_ID, threadRootId: null }],
      [{ authorId: OTHER_USER_ID }],
    ]
    mocks.db.select.mockImplementation(() => selectResult(results.shift() ?? []))

    const response = await pinComment(request(`http://localhost:3000/api/social/comments/${COMMENT_ID}`, 'PATCH', { pinned: true }), {
      params: Promise.resolve({ id: COMMENT_ID }),
    })

    expect(response.status).toBe(403)
    expect(mocks.db.transaction).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated moderation requests before reading the queue', async () => {
    mocks.getCurrentUser.mockResolvedValue(null)

    const response = await getModerationQueue()

    expect(response.status).toBe(403)
    expect(mocks.isDiscordModerator).not.toHaveBeenCalled()
    expect(mocks.getModerationQueue).not.toHaveBeenCalled()
  })

  it('renders hostile rich-text input as text rather than executable markup', () => {
    const payload = '<script>alert(1)</script><img src=x onerror=alert(2)>'
    const html = renderToStaticMarkup(React.createElement(RichText, { text: payload }))

    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;img')
  })

  it('does not consume daily upload quota for a completed blob that fails validation', async () => {
    const uploadId = '22222222-2222-4222-8222-222222222222'
    const pathname = `reels/${USER_ID}/${uploadId}.mp4`
    const reservationKey = `disloop:upload:${pathname}`
    const blob = { pathname, url: 'https://blob.example/upload.mp4' }
    const uploadBody = { type: 'blob.upload-completed', payload: {} }
    mocks.redis.get.mockImplementation(async (key: string) => key === reservationKey
      ? JSON.stringify({ userId: USER_ID, kind: 'reel', contentType: 'video/mp4' })
      : null)
    mocks.blobHead.mockResolvedValue({ pathname, contentType: 'video/mp4', size: 40 * 1024 * 1024 + 1 })
    mocks.blobUploadHandler.mockImplementation(async (value) => {
      const options = value as {
        onUploadCompleted: (event: { blob: typeof blob; tokenPayload: string }) => Promise<void>
      }
      await options.onUploadCompleted({ blob, tokenPayload: JSON.stringify({ userId: USER_ID, pathname, kind: 'reel' }) })
      return { url: blob.url }
    })

    const response = await buildUploadToken({
      request: request('http://localhost:3000/api/reels/upload', 'POST', uploadBody),
      body: uploadBody,
      userId: null,
      kind: 'reel',
    })

    expect(response.status).toBe(400)
    expect(mocks.blobDelete).toHaveBeenCalledWith(blob.url)
    expect(mocks.rateLimitResponse).not.toHaveBeenCalled()
    expect(mocks.redis.set).not.toHaveBeenCalled()
  })

  it('uses the authenticated user key for generous token-request throttling', async () => {
    const body = { type: 'blob.prepare-upload', contentType: 'video/mp4', sizeBytes: 100, durationSeconds: 30 }
    const response = await buildUploadToken({
      request: request('http://localhost:3000/api/reels/upload', 'POST', body),
      body,
      userId: USER_ID,
      kind: 'reel',
    })

    expect(response.status).toBe(200)
    expect(mocks.rateLimitResponse).toHaveBeenCalledWith(`upload-token:${USER_ID}`, 30, 300)
    expect(mocks.rateLimitResponse).not.toHaveBeenCalledWith(`upload-completed:reel:${USER_ID}`, expect.any(Number), expect.any(Number))
    expect(mocks.redis.set.mock.calls[0][0]).toMatch(new RegExp(`^disloop:upload:reels/${USER_ID}/`))
  })

  it('keeps upload token limits scoped to each authenticated user', async () => {
    const userIds = [USER_ID, '33333333-3333-4333-8333-333333333333']
    const body = { type: 'blob.prepare-upload', contentType: 'video/mp4', sizeBytes: 100, durationSeconds: 30 }

    for (const userId of userIds) {
      const response = await buildUploadToken({
        request: request('http://localhost:3000/api/reels/upload', 'POST', body),
        body,
        userId,
        kind: 'reel',
      })
      expect(response.status).toBe(200)
    }

    expect(mocks.rateLimitResponse.mock.calls.map(([key]) => key)).toEqual(userIds.map((userId) => `upload-token:${userId}`))
  })

  it('does not apply the daily completed-upload quota to reels', async () => {
    const uploadId = '33333333-3333-4333-8333-333333333333'
    const pathname = `reels/${USER_ID}/${uploadId}.mp4`
    const reservationKey = `disloop:upload:${pathname}`
    const blob = { pathname, url: 'https://blob.example/upload.mp4' }
    const uploadBody = { type: 'blob.upload-completed', payload: {} }
    mocks.redis.get.mockImplementation(async (key: string) => key === reservationKey
      ? JSON.stringify({ userId: USER_ID, kind: 'reel', contentType: 'video/mp4' })
      : null)
    mocks.blobHead.mockResolvedValue({ pathname, contentType: 'video/mp4', size: 100 })
    mocks.blobUploadHandler.mockImplementation(async (value) => {
      const options = value as { onUploadCompleted: (event: { blob: typeof blob; tokenPayload: string }) => Promise<void> }
      await options.onUploadCompleted({ blob, tokenPayload: JSON.stringify({ userId: USER_ID, pathname, kind: 'reel' }) })
      return { url: blob.url }
    })

    const response = await buildUploadToken({
      request: request('http://localhost:3000/api/reels/upload', 'POST', uploadBody),
      body: uploadBody,
      userId: null,
      kind: 'reel',
    })

    expect(response.status).toBe(200)
    expect(mocks.rateLimitResponse).not.toHaveBeenCalledWith(`upload-completed:reel:${USER_ID}`, expect.any(Number), expect.any(Number))
  })

  it('rejects an oversized reel before reserving an upload', async () => {
    const body = { type: 'blob.prepare-upload', contentType: 'video/mp4', sizeBytes: 40 * 1024 * 1024 + 1, durationSeconds: 60 }
    const response = await buildUploadToken({
      request: request('http://localhost:3000/api/reels/upload', 'POST', body),
      body,
      userId: USER_ID,
      kind: 'reel',
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'file_too_large', reason: 'file_too_large' })
    expect(mocks.redis.set).not.toHaveBeenCalled()
  })

  it('rejects a reel duration above the server limit before reserving an upload', async () => {
    const body = { type: 'blob.prepare-upload', contentType: 'video/mp4', sizeBytes: 100, durationSeconds: 60.1 }
    const response = await buildUploadToken({
      request: request('http://localhost:3000/api/reels/upload', 'POST', body),
      body,
      userId: USER_ID,
      kind: 'reel',
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid_input', reason: 'invalid_input' })
    expect(mocks.redis.set).not.toHaveBeenCalled()
  })

  it('rejects negative XP and deduplicates repeat event claims', async () => {
    const invalid = await awardXp(USER_ID, -1, 'news_published', 'negative-points')
    expect(invalid).toBeNull()
    expect(mocks.db.transaction).not.toHaveBeenCalled()

    let eventRecorded = false
    mocks.db.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback(
      makeXpTransaction(() => eventRecorded, () => { eventRecorded = true }),
    ))

    const first = await awardXp(USER_ID, 3, 'news_published', 'post:unique-event')
    const duplicate = await awardXp(USER_ID, 3, 'news_published', 'post:unique-event')

    expect(first).toBe(3)
    expect(duplicate).toBeNull()
    expect(mocks.syncDiscordXpRole).toHaveBeenCalledTimes(1)
  })

  it('persists every level badge and Top Maker when XP reaches level 50', async () => {
    let eventRecorded = false
    const transaction = makeXpTransaction(() => eventRecorded, () => { eventRecorded = true }, 2510)
    mocks.db.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback(transaction))

    const xp = await awardXp(USER_ID, 20, 'news_published', 'post:level-50')

    expect(xp).toBe(2510)
    expect(transaction.insertValues[1]).toEqual([
      { userId: USER_ID, badgeId: 'level-1-newcomer' },
      { userId: USER_ID, badgeId: 'level-5-member' },
      { userId: USER_ID, badgeId: 'level-10-active' },
      { userId: USER_ID, badgeId: 'level-25-elite' },
      { userId: USER_ID, badgeId: 'level-50-legend' },
      { userId: USER_ID, badgeId: 'top-maker' },
    ])
  })
})
