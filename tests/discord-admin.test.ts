import { generateKeyPairSync, sign } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import {
  applyDiscordAdminAction,
  canUseDiscordNameStyleActions,
  buildDiscordAuditEmbed,
  DISCORD_AUDIT_CHANNELS,
  DISCORD_ADMIN_ALLOWED_ROLE_IDS,
  DISCORD_ADMIN_CHANNEL_ID,
  DISCORD_QUICK_ROLE_ACTIONS,
  DiscordGuildRoleSyncError,
  DiscordAdminInputError,
  getDiscordAdminAuditStorageAction,
  getDiscordAdminErrorDiagnostics,
  getDiscordAdminErrorResponse,
  hasDiscordAdminRole,
  isDiscordAdminChannel,
  parseNameStyleForm,
  parseQuickRoleUsers,
  parseUserIdentifiers,
  sanitizeCustomTitle,
  syncDiscordGuildRole,
  verifyDiscordInteractionSignature,
} from '@/lib/discord-admin'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

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

  it('defines the one-click role actions with the requested flair and existing badge IDs', () => {
    expect(DISCORD_QUICK_ROLE_ACTIONS).toMatchObject({
      'give-owner': { title: 'Owner', badgeId: null, discordRoleId: '1484079237999624373', operation: 'give' },
      'give-partner': { title: 'Partner', badgeId: 'partner', discordRoleId: '1564325770283982910', operation: 'give' },
      'give-dev': { title: 'Dev', badgeId: 'developer', discordRoleId: '1473658138619281619', operation: 'give' },
      'give-rainbow': { title: null, badgeId: null, discordRoleId: null, operation: 'give' },
      'remove-owner': { title: 'Owner', badgeId: null, discordRoleId: '1484079237999624373', operation: 'remove' },
      'remove-partner': { title: 'Partner', badgeId: 'partner', discordRoleId: '1564325770283982910', operation: 'remove' },
      'remove-dev': { title: 'Dev', badgeId: 'developer', discordRoleId: '1473658138619281619', operation: 'remove' },
      'remove-rainbow': { title: null, badgeId: null, discordRoleId: null, operation: 'remove' },
    })
  })

  it('stores flair actions using audit action values accepted by the existing database constraint', () => {
    expect(getDiscordAdminAuditStorageAction('name_style_set')).toBe('badge_grant')
    expect(getDiscordAdminAuditStorageAction('name_style_remove')).toBe('badge_revoke')
  })

  it('returns a safe, specific response for the production audit-action constraint failure', () => {
    const cause = Object.assign(new Error('violates check constraint "disloop_admin_audit_action_check"'), {
      code: '23514',
      constraint: 'disloop_admin_audit_action_check',
    })
    const error = new Error('Drizzle query failed', { cause })

    expect(getDiscordAdminErrorResponse(error)).toBe(
      'The database rejected the admin audit action. No changes were saved; please contact an administrator.',
    )
    expect(getDiscordAdminErrorDiagnostics(error)).toMatchObject({
      message: 'violates check constraint "disloop_admin_audit_action_check"',
      code: '23514',
      constraint: 'disloop_admin_audit_action_check',
    })
  })

  it('redacts database credentials from logged error diagnostics', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://private-user:private-password@db.example/private')
    const error = new Error('connection failed: postgres://private-user:private-password@db.example/private')
    const diagnostics = getDiscordAdminErrorDiagnostics(error)
    expect(diagnostics.message).not.toContain('private-password')
    expect(diagnostics.message).toContain('[REDACTED]')
  })

  it('adds and removes the configured Discord server role using the bot API', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', 'test-bot-token')
    vi.stubEnv('DISCORD_GUILD_ID', '11111111111111111')
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await syncDiscordGuildRole('22222222222222222', '1484079237999624373', 'give')
    await syncDiscordGuildRole('22222222222222222', '1484079237999624373', 'remove')

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://discord.com/api/v10/guilds/11111111111111111/members/22222222222222222/roles/1484079237999624373',
      expect.objectContaining({ method: 'PUT', headers: { Authorization: 'Bot test-bot-token' } }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://discord.com/api/v10/guilds/11111111111111111/members/22222222222222222/roles/1484079237999624373',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('reports role permission failures without exposing the bot token', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', 'test-bot-token')
    vi.stubEnv('DISCORD_GUILD_ID', '11111111111111111')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })))

    const roleChange = syncDiscordGuildRole('22222222222222222', '1484079237999624373', 'give')
    await expect(roleChange).rejects.toThrow('Discord rejected the role change (HTTP 403).')
  })

  it('requires server-side Discord bot and guild configuration for role sync', async () => {
    vi.stubEnv('DISCORD_BOT_TOKEN', '')
    vi.stubEnv('DISCORD_GUILD_ID', '')
    await expect(syncDiscordGuildRole('22222222222222222', '1484079237999624373', 'give'))
      .rejects.toBeInstanceOf(DiscordGuildRoleSyncError)
  })

  it('parses quick-role modal usernames with the shared identifier parser', () => {
    expect(parseQuickRoleUsers({ users: '@Member.One\n<@12345678901234567>' }))
      .toEqual({ tokens: ['member.one', '12345678901234567'], invalid: [] })
    expect(() => parseQuickRoleUsers({ users: Array.from({ length: 51 }, (_, index) => `member${index}`).join('\n') }))
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
