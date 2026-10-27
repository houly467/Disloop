import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import {
  applyDiscordAdminAction,
  canUseDiscordNameStyleActions,
  buildDiscordAuditEmbed,
  DISCORD_AUDIT_CHANNELS,
  DISCORD_ADMIN_ALLOWED_ROLE_IDS,
  DISCORD_ADMIN_CHANNEL_ID,
  DiscordAdminInputError,
  hasDiscordAdminRole,
  isDiscordAdminChannel,
  parseNameStyleForm,
  parseUserIdentifiers,
  sanitizeCustomTitle,
  verifyDiscordInteractionSignature,
} from '@/lib/discord-admin'

describe('Discord moderation security', () => {
  it('verifies signed interaction bodies and rejects replay or tampering', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const publicKeyHex = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex')
    const now = Date.now()
    const timestamp = String(Math.floor(now / 1000))
    const body = '{"type":1}'
    const signature = sign(null, Buffer.from(`${timestamp}${body}`), privateKey).toString('hex')

    expect(verifyDiscordInteractionSignature(body, signature, timestamp, publicKeyHex, now)).toBe(true)
    expect(verifyDiscordInteractionSignature(`${body} `, signature, timestamp, publicKeyHex, now)).toBe(false)
    expect(verifyDiscordInteractionSignature(body, signature, String(Number(timestamp) - 600), publicKeyHex, now)).toBe(false)
  })

  it('rejects batches larger than 50 before any user lookup', async () => {
    const users = Array.from({ length: 51 }, (_, index) => `member${index}`).join(', ')
    await expect(applyDiscordAdminAction('user_ban', { users }, { discordId: '12345678901234567', username: 'moderator' }))
      .rejects.toBeInstanceOf(DiscordAdminInputError)
  })

  it('rejects unknown badge IDs before any user lookup', async () => {
    await expect(applyDiscordAdminAction('badge_grant', { users: 'member.one', badges: 'not-a-badge' }, { discordId: '12345678901234567', username: 'moderator' }))
      .rejects.toBeInstanceOf(DiscordAdminInputError)
  })

  it('allows all supplied admin roles and rejects roles outside the allowlist', () => {
    for (const roleId of DISCORD_ADMIN_ALLOWED_ROLE_IDS) {
      expect(hasDiscordAdminRole([roleId])).toBe(true)
    }
    expect(hasDiscordAdminRole(['11111111111111111'])).toBe(false)
  })

  it('uses the existing admin role allowlist for name-style panel actions', () => {
    expect(canUseDiscordNameStyleActions([DISCORD_ADMIN_ALLOWED_ROLE_IDS[0]])).toBe(true)
    expect(canUseDiscordNameStyleActions(['11111111111111111'])).toBe(false)
  })

  it('parses website names, @usernames, Discord IDs, and mentions with the existing 50-user limit', () => {
    const parsed = parseUserIdentifiers('@Member.One, <@12345678901234567>, 12345678901234568')
    expect(parsed).toEqual({ tokens: ['member.one', '12345678901234567', '12345678901234568'], invalid: [] })
    expect(() => parseUserIdentifiers(Array.from({ length: 51 }, (_, index) => `member${index}`).join(', ')))
      .toThrow(DiscordAdminInputError)
  })

  it('validates style values and sanitizes optional titles to plain text within 24 characters', () => {
    expect(parseNameStyleForm({ users: 'member.one', style: 'rainbow', title: 'Founder @all' }))
      .toEqual({ tokens: ['member.one'], invalid: [], style: 'rainbow', customTitle: 'Founder' })
    expect(parseNameStyleForm({ users: 'member.one', style: 'none' }).style).toBeNull()
    expect(sanitizeCustomTitle('Founder <@12345678901234567> www.example.test discord.gg/invite mailto:admin@example.com')).toBe('Founder')
    expect(() => parseNameStyleForm({ users: 'member.one', style: 'purple' })).toThrow(DiscordAdminInputError)
    expect(() => parseNameStyleForm({ users: 'member.one', style: 'gold', title: 'a title that exceeds twenty-four' })).toThrow(DiscordAdminInputError)
  })

  it('builds timestamped, color-coded audit embeds with both Discord tags and IDs', () => {
    const embed = buildDiscordAuditEmbed('user_ban', [{
      id: '22222222-2222-4222-8222-222222222222',
      discordId: '12345678901234567',
      discordUsername: 'target.user',
      username: 'target',
    }], { discordId: '76543210987654321', username: 'moderator' }, [], 'Policy violation', new Date('2026-10-27T12:00:00.000Z'))

    expect(DISCORD_AUDIT_CHANNELS.user_ban).toBe('1564362108819472384')
    expect(embed.color).toBe(0xed4245)
    expect(embed.timestamp).toBe('2026-10-27T12:00:00.000Z')
    expect(embed.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Admin / Moderator', value: expect.stringContaining('76543210987654321') }),
      expect.objectContaining({ name: 'Banned user', value: expect.stringContaining('target.user') }),
      expect.objectContaining({ name: 'Reason', value: 'Policy violation' }),
    ]))
  })

  it('only accepts interactions from the designated admin channel', () => {
    expect(isDiscordAdminChannel(DISCORD_ADMIN_CHANNEL_ID)).toBe(true)
    expect(isDiscordAdminChannel('1564324879761674312')).toBe(false)
    expect(isDiscordAdminChannel(undefined)).toBe(false)
  })
})
