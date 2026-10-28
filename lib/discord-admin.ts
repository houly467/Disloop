import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { BADGE_BY_ID } from '@/lib/badges'
import { db } from '@/lib/db'
import {
  disloopAdminAudit,
  disloopUserFlair,
  disloopUserBadgeRevocations,
  disloopUserBadges,
  disloopUsers,
} from '@/lib/db/schema'

const DISCORD_SNOWFLAKE = /^\d{17,20}$/
export {
  canUseDiscordNameStyleActions,
  DISCORD_ADMIN_ALLOWED_ROLE_IDS,
  DISCORD_ADMIN_CHANNEL_ID,
  hasDiscordAdminRole,
  isDiscordAdminChannel,
  verifyDiscordInteractionSignature,
} from '@/lib/discord-interaction-security'
import { canUseDiscordNameStyleActions } from '@/lib/discord-interaction-security'
const websiteUsernamePattern = /^(?:[a-z0-9]|[a-z0-9][a-z0-9._]{0,18}[a-z0-9])$/
const discordUsernamePattern = /^[a-z0-9._]{2,32}$/

type AdminAction = 'badge_grant' | 'badge_revoke' | 'user_ban' | 'user_unban' | 'name_style_set' | 'name_style_remove'
type AdminActor = { discordId: string; username: string }
type ResolvedTarget = { id: string; discordId: string; username: string; discordUsername: string }

export const DISCORD_QUICK_ROLE_ACTIONS = {
  'give-owner': { label: 'For Owner', title: 'Owner', badgeId: null, discordRoleId: '1484079237999624373', operation: 'give' },
  'give-partner': { label: 'For Partner', title: 'Partner', badgeId: 'partner', discordRoleId: '1564325770283982910', operation: 'give' },
  'give-dev': { label: 'For Dev', title: 'Dev', badgeId: 'developer', discordRoleId: '1473658138619281619', operation: 'give' },
  'give-rainbow': { label: 'Rainbow', title: null, badgeId: null, discordRoleId: null, operation: 'give' },
  'remove-owner': { label: 'Remove Owner', title: 'Owner', badgeId: null, discordRoleId: '1484079237999624373', operation: 'remove' },
  'remove-partner': { label: 'Remove Partner', title: 'Partner', badgeId: 'partner', discordRoleId: '1564325770283982910', operation: 'remove' },
  'remove-dev': { label: 'Remove Dev', title: 'Dev', badgeId: 'developer', discordRoleId: '1473658138619281619', operation: 'remove' },
  'remove-rainbow': { label: 'Remove Rainbow', title: null, badgeId: null, discordRoleId: null, operation: 'remove' },
} as const

export type DiscordQuickRoleAction = keyof typeof DISCORD_QUICK_ROLE_ACTIONS

export class DiscordGuildRoleSyncError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscordGuildRoleSyncError'
  }
}

export async function syncDiscordGuildRole(
  discordUserId: string,
  roleId: string,
  operation: 'give' | 'remove',
) {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const guildId = process.env.DISCORD_GUILD_ID
  if (!botToken || !guildId) {
    throw new DiscordGuildRoleSyncError('Discord role sync is not configured (missing bot token or guild ID).')
  }

  const response = await fetch(
    `${DISCORD_API}/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordUserId)}/roles/${encodeURIComponent(roleId)}`,
    {
      method: operation === 'give' ? 'PUT' : 'DELETE',
      headers: { Authorization: `Bot ${botToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    },
  )
  if (!response.ok) {
    throw new DiscordGuildRoleSyncError(`Discord rejected the role change (HTTP ${response.status}). Check the bot's Manage Roles permission and role hierarchy.`)
  }
}

export const DISCORD_AUDIT_CHANNELS: Record<AdminAction, string> = {
  user_ban: '1564362108819472384',
  user_unban: '1564362160442835025',
  badge_grant: '1564362131540021248',
  badge_revoke: '1564362193678639124',
  name_style_set: '1564362131540021248',
  name_style_remove: '1564362193678639124',
}

const DISCORD_API = 'https://discord.com/api/v10'
const auditLogTitles: Record<AdminAction, string> = {
  user_ban: 'User Banned',
  user_unban: 'User Unbanned',
  badge_grant: 'Badge Awarded',
  badge_revoke: 'Badge Revoked',
  name_style_set: 'Name Style Updated',
  name_style_remove: 'Name Style Removed',
}
const auditLogColors: Record<AdminAction, number> = {
  user_ban: 0xed4245,
  user_unban: 0x57f287,
  badge_grant: 0xfee75c,
  badge_revoke: 0x747f8d,
  name_style_set: 0x9b59b6,
  name_style_remove: 0x747f8d,
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

function getErrorCause(error: unknown): Error | null {
  if (!(error instanceof Error)) return null
  let current = error
  const seen = new Set<Error>([current])
  while (current.cause instanceof Error && !seen.has(current.cause)) {
    current = current.cause
    seen.add(current)
  }
  return current
}

function redactErrorSecrets(value: string) {
  let safeValue = value
  for (const key of [
    'PREVIEW_DATABASE_URL',
    'DATABASE_URL',
    'DATABASE_URL_UNPOOLED',
    'POSTGRES_URL',
    'POSTGRES_URL_NON_POOLING',
    'POSTGRES_PRISMA_URL',
    'POSTGRES_HOST',
    'POSTGRES_DATABASE',
    'PGHOST',
    'PGDATABASE',
    'PGUSER',
    'PGPASSWORD',
    'DISCORD_BOT_TOKEN',
    'DISCORD_PUBLIC_KEY',
    'DISCORD_CLIENT_SECRET',
    'SESSION_SECRET',
    'BLOB_READ_WRITE_TOKEN',
  ]) {
    const secret = process.env[key]
    if (secret && secret.length >= 8) safeValue = safeValue.split(secret).join('[REDACTED]')
  }
  return safeValue
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, 'postgres://[REDACTED]@')
    .replace(/(Authorization:\s*Bot\s+)[^\s]+/gi, '$1[REDACTED]')
}

export function getDiscordAdminErrorDiagnostics(error: unknown) {
  const cause = getErrorCause(error)
  if (!cause) {
    return { name: 'UnknownError', message: 'Unknown admin action failure.', stack: undefined, code: undefined, constraint: undefined }
  }
  const dbError = cause as Error & { code?: string; constraint?: string }
  return {
    name: cause.name,
    message: redactErrorSecrets(cause.message),
    stack: cause.stack ? redactErrorSecrets(cause.stack) : undefined,
    code: dbError.code,
    constraint: dbError.constraint,
  }
}

export function getDiscordAdminErrorResponse(error: unknown) {
  const cause = getErrorCause(error) as (Error & { code?: string; constraint?: string }) | null
  if (cause?.code === '23514' && cause.constraint === 'disloop_admin_audit_action_check') {
    return 'The database rejected the admin audit action. No changes were saved; please contact an administrator.'
  }
  if (cause?.code?.startsWith('23')) {
    return 'A database constraint rejected this action. No changes were saved; please contact an administrator.'
  }
  return 'A database error prevented this action. No changes were saved; please try again later.'
}

export function getDiscordAdminAuditStorageAction(action: 'name_style_set' | 'name_style_remove') {
  return action === 'name_style_set' ? 'badge_grant' : 'badge_revoke'
}

export function sanitizeCustomTitle(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/<@!?[\d]{17,20}>/g, '')
    .replace(/\bmailto:\S+/gi, '')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/\b(?:[\w-]+\.)+(?:com|net|org|io|gg|dev|app|co|me|tv|xyz|link|ly)(?:\/\S*)?/gi, '')
    .replace(/@[\w.-]+/g, '')
    .replace(/[<>[\]()*_`~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseUserIdentifiers(value: unknown) {
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

export function parseQuickRoleUsers(fields: Record<string, string>) {
  const parsed = z.object({ users: z.string().trim().min(1).max(2500) }).strict().safeParse(fields)
  if (!parsed.success) throw new DiscordAdminInputError('Enter at least one username or Discord ID.')
  return parseUserIdentifiers(parsed.data.users)
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

const nameStyleFormSchema = z.object({
  users: z.string().trim().min(1).max(2500),
  style: z.enum(['rainbow', 'gold', 'none']),
  title: z.string().max(24).optional(),
}).strict()

export function parseNameStyleForm(fields: Record<string, string>) {
  const parsed = nameStyleFormSchema.safeParse(fields)
  if (!parsed.success) throw new DiscordAdminInputError('Enter users and a style of rainbow, gold, or none.')
  const customTitle = sanitizeCustomTitle(parsed.data.title ?? '')
  if (customTitle.length > 24) throw new DiscordAdminInputError('The custom title must be 24 characters or fewer after removing mentions and links.')
  const { tokens, invalid } = parseUserIdentifiers(parsed.data.users)
  return { tokens, invalid, style: parsed.data.style === 'none' ? null : parsed.data.style, customTitle: customTitle || null }
}

export async function applyDiscordNameStyle(
  action: 'name_style_set' | 'name_style_remove',
  fields: Record<string, string>,
  actor: AdminActor,
) {
  const parsed = action === 'name_style_set' ? parseNameStyleForm(fields) : null
  const { tokens, invalid } = parsed ?? (() => {
    const users = z.string().trim().min(1).max(2500).safeParse(fields.users)
    if (!users.success) throw new DiscordAdminInputError('Enter at least one username or Discord ID.')
    return parseUserIdentifiers(users.data)
  })()
  const { targets, unresolved } = await resolveTargets(tokens)
  if (!targets.length) return { updated: 0, skipped: [...invalid, ...unresolved] }

  const style = action === 'name_style_set' ? parsed!.style : null
  const customTitle = action === 'name_style_set' ? parsed!.customTitle ?? '' : ''
  const now = new Date()
  await db.transaction(async (tx) => {
    if (action === 'name_style_remove') {
      await tx.delete(disloopUserFlair).where(inArray(disloopUserFlair.userId, targets.map((target) => target.id)))
    } else {
      await tx.insert(disloopUserFlair).values(targets.map((target) => ({
        userId: target.id,
        nameStyle: style,
        customTitle: customTitle || null,
        updatedBy: actor.discordId,
        updatedAt: now,
      }))).onConflictDoUpdate({
        target: disloopUserFlair.userId,
        set: { nameStyle: style, customTitle: customTitle || null, updatedBy: actor.discordId, updatedAt: now },
      })
    }
    await tx.insert(disloopAdminAudit).values(targets.map((target) => ({
      actorDiscordId: actor.discordId,
      actorUsername: actor.username.slice(0, 100),
      targetUserId: target.id,
      targetDiscordId: target.discordId,
      action: getDiscordAdminAuditStorageAction(action),
      badges: [],
      reason: action === 'name_style_remove'
        ? 'Removed custom name style and title.'
        : `Name style: ${style ?? 'none'}; custom title: ${customTitle || '(none)'}`,
    })))
  })

  for (const target of targets) {
    console.info('[discord-admin] Name flair changed.', {
      action,
      actorDiscordId: actor.discordId,
      targetDiscordId: target.discordId,
      nameStyle: style,
      customTitle: action === 'name_style_set' ? customTitle || null : null,
    })
  }
  return { updated: targets.length, skipped: [...invalid, ...unresolved] }
}

export async function applyDiscordQuickRoleAction(
  action: DiscordQuickRoleAction,
  fields: Record<string, string>,
  actor: AdminActor,
) {
  const definition = DISCORD_QUICK_ROLE_ACTIONS[action]
  const { tokens, invalid } = parseQuickRoleUsers(fields)
  const { targets, unresolved } = await resolveTargets(tokens)
  if (!targets.length) return { updatedUsers: [], skipped: [...invalid, ...unresolved], auditLogFailed: false }

  const now = new Date()
  const userIds = targets.map((target) => target.id)
  const badgeId = definition.badgeId
  const isGiving = definition.operation === 'give'
  const isRemovingOwner = action === 'remove-owner'
  const needsCurrentFlair = !isGiving && action !== 'remove-rainbow'
  let auditLogFailed = false

  await db.transaction(async (tx) => {
    const currentFlair = needsCurrentFlair
      ? await tx.select({
        userId: disloopUserFlair.userId,
        nameStyle: disloopUserFlair.nameStyle,
        customTitle: disloopUserFlair.customTitle,
      }).from(disloopUserFlair).where(inArray(disloopUserFlair.userId, userIds))
      : []
    const flairByUser = new Map(currentFlair.map((flair) => [flair.userId, flair]))
    const currentBadges = isRemovingOwner
      ? await tx.select({
        userId: disloopUserBadges.userId,
        badgeId: disloopUserBadges.badgeId,
      }).from(disloopUserBadges).where(inArray(disloopUserBadges.userId, userIds))
      : []
    const badgeIdsByUser = new Map<string, Set<string>>()
    for (const badge of currentBadges) {
      const userBadges = badgeIdsByUser.get(badge.userId) ?? new Set<string>()
      userBadges.add(badge.badgeId)
      badgeIdsByUser.set(badge.userId, userBadges)
    }

    if (isGiving || action === 'remove-rainbow') {
      await tx.insert(disloopUserFlair).values(targets.map((target) => ({
        userId: target.id,
        nameStyle: isGiving ? 'rainbow' : null,
        customTitle: isGiving ? definition.title : null,
        updatedBy: actor.discordId,
        updatedAt: now,
      }))).onConflictDoUpdate({
        target: disloopUserFlair.userId,
        set: {
          nameStyle: isGiving ? 'rainbow' : null,
          ...(isGiving ? { customTitle: definition.title } : {}),
          updatedBy: actor.discordId,
          updatedAt: now,
        },
      })
    } else {
      const flairUpdates = targets.flatMap((target) => {
        const flair = flairByUser.get(target.id)
        const shouldClearTitle = flair?.customTitle?.toLowerCase() === definition.title?.toLowerCase()
        if (!flair || !shouldClearTitle) return []

        const hasOtherTitle = Boolean(flair.customTitle && !shouldClearTitle)
        const hasOtherRole = (badgeIdsByUser.get(target.id)?.size ?? 0) > 0
        const shouldClearRainbow = isRemovingOwner
          && flair.nameStyle === 'rainbow'
          && !hasOtherTitle
          && !hasOtherRole
        return [{
          userId: target.id,
          nameStyle: shouldClearRainbow ? null : flair.nameStyle,
          customTitle: null,
          updatedBy: actor.discordId,
          updatedAt: now,
        }]
      })
      if (flairUpdates.length) {
        for (const update of flairUpdates) {
          await tx.update(disloopUserFlair).set({
            nameStyle: update.nameStyle,
            customTitle: update.customTitle,
            updatedBy: update.updatedBy,
            updatedAt: update.updatedAt,
          }).where(eq(disloopUserFlair.userId, update.userId))
        }
      }
    }

    if (badgeId && isGiving) {
      await tx.delete(disloopUserBadgeRevocations).where(and(
        inArray(disloopUserBadgeRevocations.userId, userIds),
        eq(disloopUserBadgeRevocations.badgeId, badgeId),
      ))
      await tx.insert(disloopUserBadges).values(userIds.map((userId) => ({ userId, badgeId }))).onConflictDoNothing()
    } else if (badgeId) {
      await tx.delete(disloopUserBadges).where(and(
        inArray(disloopUserBadges.userId, userIds),
        eq(disloopUserBadges.badgeId, badgeId),
      ))
      await tx.insert(disloopUserBadgeRevocations).values(userIds.map((userId) => ({
        userId,
        badgeId,
        actorDiscordId: actor.discordId,
        revokedAt: now,
      }))).onConflictDoUpdate({
        target: [disloopUserBadgeRevocations.userId, disloopUserBadgeRevocations.badgeId],
        set: { actorDiscordId: actor.discordId, revokedAt: now },
      })
    }

    const storageAction: AdminAction = isGiving ? 'badge_grant' : 'badge_revoke'
    await tx.insert(disloopAdminAudit).values(targets.map((target) => ({
      actorDiscordId: actor.discordId,
      actorUsername: actor.username.slice(0, 100),
      targetUserId: target.id,
      targetDiscordId: target.discordId,
      action: storageAction,
      badges: badgeId ? [badgeId] : [],
      reason: `Quick role action: ${action}.`,
    })))
  })

  const styleAuditAction: AdminAction = isGiving ? 'name_style_set' : 'name_style_remove'
  auditLogFailed = !(await sendDiscordAuditLog(
    styleAuditAction,
    buildDiscordAuditEmbed(styleAuditAction, targets, actor, badgeId ? [badgeId] : [], `Quick role action: ${action}.`, now),
  ))
  if (badgeId) {
    const badgeAuditAction: AdminAction = isGiving ? 'badge_grant' : 'badge_revoke'
    const badgeAuditSent = await sendDiscordAuditLog(
      badgeAuditAction,
      buildDiscordAuditEmbed(badgeAuditAction, targets, actor, [badgeId], null, now),
    )
    auditLogFailed = !badgeAuditSent || auditLogFailed
  }
  if (auditLogFailed) {
    console.error('[discord-admin] Quick role audit log delivery failed.', { action })
  }
  const roleFailures: string[] = []
  if (definition.discordRoleId) {
    for (const target of targets) {
      try {
        await syncDiscordGuildRole(target.discordId, definition.discordRoleId, definition.operation)
      } catch (error) {
        const reason = error instanceof DiscordGuildRoleSyncError
          ? error.message
          : 'Discord role change failed unexpectedly.'
        roleFailures.push(`${target.username} (${reason})`)
        console.error('[discord-admin] Discord guild role change failed.', {
          action,
          targetDiscordId: target.discordId,
          message: reason,
        })
      }
    }
  }
  for (const target of targets) {
    console.info('[discord-admin] Quick role action applied.', {
      action,
      actorDiscordId: actor.discordId,
      targetDiscordId: target.discordId,
    })
  }

  return {
    updatedUsers: targets.map((target) => target.username),
    skipped: [...invalid, ...unresolved],
    roleFailures,
    auditLogFailed,
  }
}

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
