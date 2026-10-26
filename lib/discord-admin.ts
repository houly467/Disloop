import { createPublicKey, verify as verifyEd25519Signature } from 'node:crypto'
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { BADGE_BY_ID } from '@/lib/badges'
import { db } from '@/lib/db'
import {
  disloopAdminAudit,
  disloopUserBadgeRevocations,
  disloopUserBadges,
  disloopUsers,
} from '@/lib/db/schema'

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
const DISCORD_SNOWFLAKE = /^\d{17,20}$/
export const DISCORD_ADMIN_CHANNEL_ID = '1564324879761674311'
export const DISCORD_ADMIN_ALLOWED_ROLE_IDS = [
  '1484079237999624373',
  '1473658138619281619',
  '1564325770283982910',
] as const
const websiteUsernamePattern = /^(?:[a-z0-9]|[a-z0-9][a-z0-9._]{0,18}[a-z0-9])$/
const discordUsernamePattern = /^[a-z0-9._]{2,32}$/

type AdminAction = 'badge_grant' | 'badge_revoke' | 'user_ban' | 'user_unban'
type AdminActor = { discordId: string; username: string }
type ResolvedTarget = { id: string; discordId: string; username: string; discordUsername: string }

export const DISCORD_AUDIT_CHANNELS: Record<AdminAction, string> = {
  user_ban: '1564362108819472384',
  user_unban: '1564362160442835025',
  badge_grant: '1564362131540021248',
  badge_revoke: '1564362193678639124',
}

const DISCORD_API = 'https://discord.com/api/v10'
const auditLogTitles: Record<AdminAction, string> = {
  user_ban: 'User Banned',
  user_unban: 'User Unbanned',
  badge_grant: 'Badge Awarded',
  badge_revoke: 'Badge Revoked',
}
const auditLogColors: Record<AdminAction, number> = {
  user_ban: 0xed4245,
  user_unban: 0x57f287,
  badge_grant: 0xfee75c,
  badge_revoke: 0x747f8d,
}

function cleanAuditText(value: string, maxLength: number) {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

export function buildDiscordAuditEmbed(
  action: AdminAction,
  targets: ResolvedTarget[],
  actor: AdminActor,
  badgeIds: string[],
  reason: string | null,
  timestamp = new Date(),
) {
  const targetLabel = action === 'user_ban' ? 'Banned user' : action === 'user_unban' ? 'Unbanned user' : action === 'badge_grant' ? 'Recipient' : 'Target user'
  const targetLines = targets.map((target) => {
    const discordUsername = cleanAuditText(target.discordUsername, 80).replace(/`/g, '')
    return `<@${target.discordId}> (ID: \`${target.discordId}\`) · @${discordUsername}`
  })
  const targetFields: Array<{ name: string; value: string }> = []
  let targetChunk = ''
  let targetChunkStart = 1
  for (let index = 0; index < targetLines.length; index += 1) {
    const nextLine = targetLines[index]
    if (targetChunk && (targetChunk.length + nextLine.length + 1 > 950 || index - targetChunkStart >= 12)) {
      targetFields.push({ name: targets.length === 1 ? targetLabel : `${targetLabel}s ${targetChunkStart}–${index}`, value: targetChunk })
      targetChunk = ''
      targetChunkStart = index + 1
    }
    targetChunk = targetChunk ? `${targetChunk}\n${nextLine}` : nextLine
  }
  if (targetChunk) {
    targetFields.push({ name: targets.length === 1 ? targetLabel : `${targetLabel}s ${targetChunkStart}–${targetLines.length}`, value: targetChunk })
  }

  const fields = [
    { name: 'Admin / Moderator', value: `<@${actor.discordId}> (ID: \`${actor.discordId}\`) · \`${cleanAuditText(actor.username, 80).replace(/`/g, '')}\`` },
    ...targetFields,
    ...(action === 'user_ban' ? [{ name: 'Reason', value: cleanAuditText(reason || 'No reason provided.', 1000) }] : []),
    ...(action === 'badge_grant' || action === 'badge_revoke' ? [{
      name: 'Badge Details',
      value: badgeIds.map((badgeId) => `${BADGE_BY_ID.get(badgeId)?.name ?? badgeId} (\`${badgeId}\`)`).join(', ').slice(0, 1000),
    }] : []),
  ]

  return {
    title: auditLogTitles[action],
    color: auditLogColors[action],
    timestamp: timestamp.toISOString(),
    fields,
  }
}

async function sendDiscordAuditLog(action: AdminAction, embed: ReturnType<typeof buildDiscordAuditEmbed>) {
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!botToken) return false

  try {
    const response = await fetch(`${DISCORD_API}/channels/${DISCORD_AUDIT_CHANNELS[action]}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    return response.ok
  } catch {
    return false
  }
}

export class DiscordAdminInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscordAdminInputError'
  }
}

export function verifyDiscordInteractionSignature(
  body: string,
  signature: string | null,
  timestamp: string | null,
  publicKey: string,
  now = Date.now(),
) {
  if (!signature || !timestamp || !/^\d+$/.test(timestamp) || !/^[a-f\d]{128}$/i.test(signature) || !/^[a-f\d]{64}$/i.test(publicKey)) return false
  const timestampMs = Number(timestamp) * 1000
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 5 * 60 * 1000) return false

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

export function isDiscordAdminChannel(channelId: string | undefined) {
  return channelId === DISCORD_ADMIN_CHANNEL_ID
}

function parseUserIdentifiers(value: unknown) {
  const parsed = z.string().trim().min(1).max(2500).safeParse(value)
  if (!parsed.success) throw new DiscordAdminInputError('Enter at least one username or Discord ID.')

  const rawTokens = parsed.data.split(/[\r\n,]+/).map((token) => token.trim()).filter(Boolean)
  if (!rawTokens.length) throw new DiscordAdminInputError('Enter at least one username or Discord ID.')
  if (rawTokens.length > 50) throw new DiscordAdminInputError('A single action can include up to 50 users.')

  const tokens: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()

  for (const rawToken of rawTokens) {
    const mention = rawToken.match(/^<@!?(\d{17,20})>$/)
    const candidate = mention?.[1] ?? rawToken.replace(/^@/, '')
    const normalized = DISCORD_SNOWFLAKE.test(candidate) ? candidate : candidate.toLowerCase()
    if (!DISCORD_SNOWFLAKE.test(normalized) && !websiteUsernamePattern.test(normalized) && !discordUsernamePattern.test(normalized)) {
      invalid.push(`${rawToken.slice(0, 40)} (invalid format)`)
      continue
    }
    if (!seen.has(normalized)) {
      seen.add(normalized)
      tokens.push(normalized)
    }
  }

  return { tokens, invalid }
}

function parseBadgeIds(value: unknown) {
  const parsed = z.string().trim().min(1).max(600).safeParse(value)
  if (!parsed.success) throw new DiscordAdminInputError('Enter one or more badge IDs.')

  const badgeIds = [...new Set(parsed.data.split(/[\r\n,]+/).map((badgeId) => badgeId.trim().toLowerCase()).filter(Boolean))]
  if (!badgeIds.length || badgeIds.some((badgeId) => !BADGE_BY_ID.has(badgeId))) {
    throw new DiscordAdminInputError(`Use valid badge IDs: ${[...BADGE_BY_ID.keys()].join(', ')}`)
  }
  return badgeIds
}

async function resolveTargets(tokens: string[]) {
  const discordIds = tokens.filter((token) => DISCORD_SNOWFLAKE.test(token))
  const usernames = tokens.filter((token) => !DISCORD_SNOWFLAKE.test(token))
  const conditions = []
  if (discordIds.length) conditions.push(inArray(disloopUsers.discordId, discordIds))
  if (usernames.length) {
    conditions.push(inArray(disloopUsers.usernameLower, usernames))
    conditions.push(inArray(sql`lower(${disloopUsers.discordUsername})`, usernames))
  }
  if (!conditions.length) return { targets: [], unresolved: tokens }

  const users = await db
    .select({
      id: disloopUsers.id,
      discordId: disloopUsers.discordId,
      username: disloopUsers.usernameDisplay,
      usernameLower: disloopUsers.usernameLower,
      discordUsername: disloopUsers.discordUsername,
    })
    .from(disloopUsers)
    .where(and(eq(disloopUsers.isSeed, false), or(...conditions)))
    .limit(1000)

  const targets: ResolvedTarget[] = []
  const unresolved: string[] = []
  const selectedIds = new Set<string>()
  for (const token of tokens) {
    const matches = users.filter((user) => DISCORD_SNOWFLAKE.test(token)
      ? user.discordId === token
      : user.usernameLower === token || user.discordUsername.toLowerCase() === token)
    const uniqueMatches = [...new Map(matches.map((user) => [user.id, user])).values()]
    if (uniqueMatches.length !== 1) {
      unresolved.push(`${token}${uniqueMatches.length > 1 ? ' (ambiguous)' : ' (not found)'}`)
      continue
    }
    const user = uniqueMatches[0]
    if (selectedIds.has(user.id)) continue
    selectedIds.add(user.id)
    targets.push({ id: user.id, discordId: user.discordId, username: user.username, discordUsername: user.discordUsername })
  }
  return { targets, unresolved }
}

const badgeFormSchema = z.object({
  users: z.string().trim().min(1).max(2500),
  badges: z.string().trim().min(1).max(600),
}).strict()

const userFormSchema = z.object({
  users: z.string().trim().min(1).max(2500),
  reason: z.string().trim().max(280).optional(),
}).strict()

export async function applyDiscordAdminAction(
  action: AdminAction,
  fields: Record<string, string>,
  actor: AdminActor,
) {
  const isBadgeAction = action === 'badge_grant' || action === 'badge_revoke'
  const parsed = (isBadgeAction ? badgeFormSchema : userFormSchema).safeParse(fields)
  if (!parsed.success) throw new DiscordAdminInputError('The submitted form is incomplete or too long.')

  const usersValue = parsed.data.users
  const { tokens, invalid } = parseUserIdentifiers(usersValue)
  const badgeIds = isBadgeAction ? parseBadgeIds((parsed.data as z.infer<typeof badgeFormSchema>).badges) : []
  const { targets: resolvedTargets, unresolved } = await resolveTargets(tokens)
  const targets = action === 'user_ban'
    ? resolvedTargets.filter((target) => {
      if (target.discordId !== actor.discordId) return true
      unresolved.push(`${target.username} (you cannot ban yourself)`)
      return false
    })
    : resolvedTargets

  if (!targets.length) return { updated: 0, skipped: [...invalid, ...unresolved] }

  const now = new Date()
  const reason = isBadgeAction ? null : ((parsed.data as z.infer<typeof userFormSchema>).reason?.slice(0, 280) || null)
  const auditRows = (entries: ResolvedTarget[], appliedAction: AdminAction) => entries.map((target) => ({
    actorDiscordId: actor.discordId,
    actorUsername: actor.username.slice(0, 100),
    targetUserId: target.id,
    targetDiscordId: target.discordId,
    action: appliedAction,
    badges: badgeIds,
    reason,
  }))

  const result = await db.transaction(async (tx) => {
    if (action === 'badge_grant') {
      const userIds = targets.map((target) => target.id)
      await tx.delete(disloopUserBadgeRevocations).where(and(
        inArray(disloopUserBadgeRevocations.userId, userIds),
        inArray(disloopUserBadgeRevocations.badgeId, badgeIds),
      ))
      await tx.insert(disloopUserBadges).values(userIds.flatMap((userId) => badgeIds.map((badgeId) => ({ userId, badgeId }))))
        .onConflictDoNothing()
      await tx.insert(disloopAdminAudit).values(auditRows(targets, action))
      return { updated: targets.length, loggedTargets: targets }
    }

    if (action === 'badge_revoke') {
      const userIds = targets.map((target) => target.id)
      await tx.delete(disloopUserBadges).where(and(
        inArray(disloopUserBadges.userId, userIds),
        inArray(disloopUserBadges.badgeId, badgeIds),
      ))
      await tx.insert(disloopUserBadgeRevocations).values(userIds.flatMap((userId) => badgeIds.map((badgeId) => ({
        userId,
        badgeId,
        actorDiscordId: actor.discordId,
        revokedAt: now,
      })))).onConflictDoUpdate({
        target: [disloopUserBadgeRevocations.userId, disloopUserBadgeRevocations.badgeId],
        set: { actorDiscordId: actor.discordId, revokedAt: now },
      })
      await tx.insert(disloopAdminAudit).values(auditRows(targets, action))
      return { updated: targets.length, loggedTargets: targets }
    }

    const userIds = targets.map((target) => target.id)
    const changedUsers = await tx.update(disloopUsers).set(action === 'user_ban'
      ? {
        isBanned: true,
        banReason: reason,
        bannedAt: now,
        bannedByDiscordId: actor.discordId,
        updatedAt: now,
      }
      : { isBanned: false, banReason: null, bannedAt: null, bannedByDiscordId: null, updatedAt: now })
      .where(and(inArray(disloopUsers.id, userIds), eq(disloopUsers.isSeed, false)))
      .returning({ id: disloopUsers.id })
    const changedIds = new Set(changedUsers.map((user) => user.id))
    const changedTargets = targets.filter((target) => changedIds.has(target.id))
    await tx.insert(disloopAdminAudit).values(auditRows(changedTargets, action))
    return { updated: changedTargets.length, loggedTargets: changedTargets }
  })

  const auditEmbed = buildDiscordAuditEmbed(action, result.loggedTargets, actor, badgeIds, reason, now)
  const auditLogSent = await sendDiscordAuditLog(action, auditEmbed)
  if (!auditLogSent) console.error('[discord-admin] Audit log delivery failed.', { action, channelId: DISCORD_AUDIT_CHANNELS[action] })

  return { updated: result.updated, skipped: [...invalid, ...unresolved], auditLogFailed: !auditLogSent }
}
