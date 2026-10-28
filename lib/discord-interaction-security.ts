import { createPublicKey, verify as verifyEd25519Signature } from 'node:crypto'

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

export const DISCORD_ADMIN_CHANNEL_ID = '1564324879761674311'
export const DISCORD_ADMIN_ALLOWED_ROLE_IDS = [
  '1484079237999624373',
  '1473658138619281619',
  '1564325770283982910',
] as const

export function verifyDiscordInteractionSignature(
  body: string,
  signature: string | null,
  timestamp: string | null,
  publicKey: string,
  now = Date.now(),
) {
  if (getDiscordInteractionSignatureFailure(signature, timestamp, publicKey, now) !== null || !signature || !timestamp) return false
  return verifySignature(body, signature, timestamp, publicKey)
}

export function getDiscordInteractionSignatureFailure(
  signature: string | null,
  timestamp: string | null,
  publicKey: string,
  now = Date.now(),
): 'missing_signature' | 'invalid_signature_format' | 'invalid_timestamp' | 'stale_timestamp' | 'invalid_public_key' | null {
  if (!signature) return 'missing_signature'
  if (!/^[a-f\d]{128}$/i.test(signature)) return 'invalid_signature_format'
  if (!timestamp || !/^\d+$/.test(timestamp)) return 'invalid_timestamp'
  const timestampMs = Number(timestamp) * 1000
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 5 * 60 * 1000) return 'stale_timestamp'
  if (!/^[a-f\d]{64}$/i.test(publicKey)) return 'invalid_public_key'
  return null
}

function verifySignature(body: string, signature: string, timestamp: string, publicKey: string) {
  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKey, 'hex')]),
      format: 'der',
      type: 'spki',
    })
    return verifyEd25519Signature(null, Buffer.from(`${timestamp}${body}`, 'utf8'), key, Buffer.from(signature, 'hex'))
  } catch {
    return false
  }
}

export function hasDiscordAdminRole(roleIds: string[]) {
  return DISCORD_ADMIN_ALLOWED_ROLE_IDS.some((roleId) => roleIds.includes(roleId))
}

export function canUseDiscordNameStyleActions(roleIds: string[]) {
  return hasDiscordAdminRole(roleIds)
}

export function isDiscordAdminChannel(channelId: string | undefined) {
  return channelId === DISCORD_ADMIN_CHANNEL_ID
}
