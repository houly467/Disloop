import { generateKeyPairSync, sign } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/discord/interactions/route'
import {
  DISCORD_ADMIN_ALLOWED_ROLE_IDS,
  DISCORD_ADMIN_CHANNEL_ID,
  getDiscordInteractionSignatureFailure,
} from '@/lib/discord-interaction-security'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Discord interactions route', () => {
  it('classifies signature rejection causes without exposing signatures or keys', () => {
    expect(getDiscordInteractionSignatureFailure(null, null, 'invalid')).toBe('missing_signature')
    expect(getDiscordInteractionSignatureFailure('bad', '123', 'invalid')).toBe('invalid_signature_format')
    expect(getDiscordInteractionSignatureFailure('a'.repeat(128), '123', 'a'.repeat(64), 1_000_000)).toBe('stale_timestamp')
    expect(getDiscordInteractionSignatureFailure('a'.repeat(128), '1000', 'invalid', 1_000_000)).toBe('invalid_public_key')
  })

  it('immediately acknowledges the signed admin slash command with the panel', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const publicKeyHex = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex')
    const timestamp = String(Math.floor(Date.now() / 1000))
    vi.stubEnv('DISCORD_PUBLIC_KEY', publicKeyHex)
    vi.stubEnv('DISCORD_CLIENT_ID', '12345678901234567')
    vi.stubEnv('DISCORD_GUILD_ID', '12345678901234568')

    const body = JSON.stringify({
      type: 2,
      application_id: '12345678901234567',
      channel_id: DISCORD_ADMIN_CHANNEL_ID,
      guild_id: '12345678901234568',
      token: 'interaction-token',
      member: { roles: [DISCORD_ADMIN_ALLOWED_ROLE_IDS[0]], user: { id: '12345678901234569', username: 'admin' } },
      data: { name: 'disloop-admin' },
    })
    const signature = sign(null, Buffer.from(`${timestamp}${body}`), privateKey).toString('hex')
    const response = await POST(new Request('https://disloop.me/api/discord/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature-ed25519': signature,
        'x-signature-timestamp': timestamp,
      },
      body,
    }))

    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result).toMatchObject({
      type: 4,
      data: {
        flags: 64,
        content: expect.stringContaining('Disloop admin panel'),
      },
    })
    expect(result.data.components).toHaveLength(4)
  })
})
