import { after } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { BADGES, XP_LEVEL_BADGES } from '@/lib/badges'
import {
  canUseDiscordNameStyleActions,
  getDiscordInteractionSignatureFailure,
  isDiscordAdminChannel,
  verifyDiscordInteractionSignature,
} from '@/lib/discord-interaction-security'

export const runtime = 'nodejs'

const DISCORD_API = 'https://discord.com/api/v10'
const EPHEMERAL_FLAG = 64

const actionDefinitions = {
  'badge-grant': { capability: 'badges', action: 'badge_grant', label: 'Award badges', title: 'Award badges' },
  'badge-revoke': { capability: 'badges', action: 'badge_revoke', label: 'Remove badges', title: 'Remove badges' },
  'name-style-set': { capability: 'badges', action: 'name_style_set', label: 'Set name style', title: 'Set name style' },
  'name-style-remove': { capability: 'badges', action: 'name_style_remove', label: 'Remove name style', title: 'Remove name style' },
  'user-ban': { capability: 'bans', action: 'user_ban', label: 'Ban from Disloop', title: 'Ban from Disloop' },
  'user-unban': { capability: 'bans', action: 'user_unban', label: 'Unban from Disloop', title: 'Unban from Disloop' },
  'give-owner': { capability: 'badges', action: 'quick_role', label: 'For Owner', title: 'For Owner' },
  'give-partner': { capability: 'badges', action: 'quick_role', label: 'For Partner', title: 'For Partner' },
  'give-dev': { capability: 'badges', action: 'quick_role', label: 'For Dev', title: 'For Dev' },
  'give-rainbow': { capability: 'badges', action: 'quick_role', label: 'Rainbow', title: 'Rainbow' },
  'remove-owner': { capability: 'badges', action: 'quick_role', label: 'Remove Owner', title: 'Remove Owner' },
  'remove-partner': { capability: 'badges', action: 'quick_role', label: 'Remove Partner', title: 'Remove Partner' },
  'remove-dev': { capability: 'badges', action: 'quick_role', label: 'Remove Dev', title: 'Remove Dev' },
  'remove-rainbow': { capability: 'badges', action: 'quick_role', label: 'Remove Rainbow', title: 'Remove Rainbow' },
} as const

type ActionKey = keyof typeof actionDefinitions
type AdminAction = typeof actionDefinitions[ActionKey]['action']
const discordInteractionSchema = z.object({
  type: z.number().int(),
  application_id: z.string().regex(/^\d{17,20}$/),
  channel_id: z.string().optional(),
  guild_id: z.string().optional(),
  token: z.string().optional(),
  member: z.object({
    roles: z.array(z.string()).optional(),
    user: z.object({ id: z.string(), username: z.string().optional() }).passthrough().optional(),
  }).passthrough().nullable().optional(),
  user: z.object({ id: z.string(), username: z.string().optional() }).passthrough().optional(),
  data: z.object({
    name: z.string().optional(),
    custom_id: z.string().optional(),
    components: z.array(z.unknown()).optional(),
    options: z.array(z.object({ name: z.string(), value: z.string().optional(), options: z.array(z.object({ name: z.string(), value: z.string().optional() }).passthrough()).optional() }).passthrough()).optional(),
  }).passthrough().optional(),
}).passthrough()

type DiscordInteraction = z.infer<typeof discordInteractionSchema>
type Capability = 'badges' | 'bans'

function discordResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function ephemeralMessage(content: string) {
  return discordResponse({ type: 4, data: { content: content.slice(0, 1900), flags: EPHEMERAL_FLAG, allowed_mentions: { parse: [] } } })
}

function getActor(interaction: DiscordInteraction) {
  const user = interaction.member?.user ?? interaction.user
  if (!user?.id) return null
  return { discordId: user.id, username: user.username || `Discord user ${user.id}` }
}

function isGuildInteraction(interaction: DiscordInteraction) {
  return Boolean(process.env.DISCORD_GUILD_ID && interaction.guild_id === process.env.DISCORD_GUILD_ID)
}

function allowedCapabilities(roleIds: string[]): Capability[] {
  return canUseDiscordNameStyleActions(roleIds) ? ['badges', 'bans'] : []
}

function panelResponse(roleIds: string[]) {
  const capabilities = allowedCapabilities(roleIds)
  if (!capabilities.length) return ephemeralMessage('You do not have permission to use Disloop admin tools.')

  const rows: ActionKey[][] = [
    ['badge-grant', 'badge-revoke', 'user-ban', 'user-unban'],
    ['name-style-set', 'name-style-remove'],
    ['give-owner', 'give-partner', 'give-dev', 'give-rainbow'],
    ['remove-owner', 'remove-partner', 'remove-dev', 'remove-rainbow'],
  ]
  const components = rows.map((row) => ({
    type: 1,
    components: row
      .filter((key) => capabilities.includes(actionDefinitions[key].capability))
      .map((key) => ({
        type: 2,
        style: 1,
        custom_id: `disloop:open:${key}`,
        label: actionDefinitions[key].label,
      })),
  })).filter((row) => row.components.length > 0)

  const badgeList = BADGES.map((badge) => `\`${badge.id}\``).join(', ')
  const content = [
    '**Disloop admin panel**',
    'Choose an action below, then fill in its form. Enter website usernames, @usernames, Discord IDs, or Discord mentions. Separate users with commas or new lines (up to 50).',
    ...(capabilities.includes('badges') ? [`Badge IDs (comma/newline separated): ${badgeList}`, 'Example: enter `member.one` for one user, or `member.one, member.two` for a bulk action; enter `verified, creator` to apply two badges.'] : []),
    ...(capabilities.includes('badges') ? ['Name styles: `rainbow`, `gold`, or `none`. Custom titles are optional and limited to 24 plain-text characters.'] : []),
    ...(capabilities.includes('badges') ? ['Quick roles: Give applies the title and rainbow style; Partner and Dev also apply their existing badges. Remove clears that title and removes its badge when applicable. Rainbow changes only the name style.'] : []),
    'Ban actions apply to the Disloop website only; they do not ban a member from this Discord server.',
  ].join('\n')

  return discordResponse({
    type: 4,
    data: {
      content,
      flags: EPHEMERAL_FLAG,
      allowed_mentions: { parse: [] },
      components,
    },
  })
}

function actionModal(key: ActionKey) {
  const definition = actionDefinitions[key]
  const components: Record<string, unknown>[] = [
    {
      type: 1,
      components: [{
        type: 4,
        custom_id: 'users',
        label: 'Website usernames or Discord IDs',
        style: 2,
        min_length: 1,
        max_length: 2500,
        placeholder: 'member.one, member.two\nOr paste Discord IDs / mentions',
        required: true,
      }],
    },
  ]

  if (key === 'name-style-set') {
    components.push({
      type: 1,
      components: [{
        type: 4,
        custom_id: 'style',
        label: 'Style: rainbow, gold, or none',
        style: 1,
        min_length: 1,
        max_length: 7,
        placeholder: 'rainbow',
        required: true,
      }],
    }, {
      type: 1,
      components: [{
        type: 4,
        custom_id: 'title',
        label: 'Custom title (optional)',
        style: 1,
        max_length: 24,
        placeholder: 'Founder',
        required: false,
      }],
    })
  } else if (definition.action === 'quick_role') {
    components.length = 1
  } else if (definition.capability === 'badges' && key !== 'name-style-remove') {
    components.push({
      type: 1,
      components: [{
        type: 4,
        custom_id: 'badges',
        label: 'Badge IDs (comma separated)',
        style: 1,
        min_length: 1,
        max_length: 600,
        placeholder: 'verified, creator, early-supporter',
        required: true,
      }],
    })
  } else if (key === 'user-ban') {
    components.push({
      type: 1,
      components: [{
        type: 4,
        custom_id: 'reason',
        label: 'Reason (optional)',
        style: 2,
        max_length: 280,
        placeholder: 'Reason shown to staff in the audit log',
        required: false,
      }],
    })
  }

  return discordResponse({
    type: 9,
    data: { custom_id: `disloop:submit:${key}`, title: definition.title, components },
  })
}

function modalFields(components: unknown[]) {
  const fields: Record<string, string> = {}
  for (const row of components) {
    if (!row || typeof row !== 'object' || !('components' in row) || !Array.isArray(row.components)) continue
    for (const component of row.components) {
      if (!component || typeof component !== 'object' || !('custom_id' in component) || !('value' in component)) continue
      if (typeof component.custom_id === 'string' && typeof component.value === 'string') {
        fields[component.custom_id] = component.value
      }
    }
  }
  return fields
}

function resultMessage(result: {
  updated?: number
  skipped: string[]
  auditLogFailed?: boolean
  updatedUsers?: string[]
  roleFailures?: string[]
}, key: ActionKey) {
  if (actionDefinitions[key].action === 'quick_role') {
    const roleName = key.includes('owner') ? 'Owner'
      : key.includes('partner') ? 'Partner'
      : key.includes('-dev') ? 'Dev'
      : 'Rainbow'
    const verb = key.startsWith('give-') ? 'given to' : 'removed from'
    const lines = [`${roleName} ${verb}: ${result.updatedUsers?.join(', ') || 'no registered users'}`]
    if (result.auditLogFailed) lines.push('The action was saved, but its Discord audit embed could not be delivered.')
    if (result.roleFailures?.length) {
      lines.push(`Discord role not changed for: ${result.roleFailures.slice(0, 10).join(', ')}`)
      if (result.roleFailures.length > 10) lines.push(`And ${result.roleFailures.length - 10} more Discord role failures.`)
    }
    const notRegistered = result.skipped.filter((item) => item.includes('(not found)') || item.includes('(ambiguous)'))
    const invalid = result.skipped.filter((item) => !notRegistered.includes(item))
    if (notRegistered.length) lines.push(`Not registered on Disloop: ${notRegistered.map((item) => item.replace(/ \(not found\)| \(ambiguous\)/, '')).join(', ')}`)
    if (invalid.length) lines.push(`Invalid: ${invalid.join(', ')}`)
    return lines.join('\n').slice(0, 1900)
  }

  const lines = [`${actionDefinitions[key].label} completed for ${result.updated ?? 0} user(s).`]
  if (result.auditLogFailed) lines.push('The action was saved, but its Discord audit embed could not be delivered.')
  if (result.skipped.length) {
    lines.push(`Skipped ${result.skipped.length}: ${result.skipped.slice(0, 18).join(', ')}`)
    if (result.skipped.length > 18) lines.push(`And ${result.skipped.length - 18} more.`)
  }
  return lines.join('\n').slice(0, 1900)
}

function getActionKey(customId: string | undefined, action: 'open' | 'submit'): ActionKey | null {
  const match = customId?.match(new RegExp(`^disloop:${action}:(.+)$`))
  const key = match?.[1]
  return key && Object.hasOwn(actionDefinitions, key) ? key as ActionKey : null
}

async function updateOriginalResponse(interaction: DiscordInteraction, content: string) {
  const token = interaction.token
  if (!token) return
  const response = await fetch(`${DISCORD_API}/webhooks/${encodeURIComponent(interaction.application_id)}/${encodeURIComponent(token)}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: [] } }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error(`Discord follow-up returned ${response.status}.`)
}

async function registerAdminCommand() {
  const appId = process.env.DISCORD_CLIENT_ID
  const guildId = process.env.DISCORD_GUILD_ID
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!appId || !guildId || !botToken) return

  const commandUrl = `${DISCORD_API}/applications/${encodeURIComponent(appId)}/guilds/${encodeURIComponent(guildId)}/commands`
  const headers = { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' }
  const existingResponse = await fetch(commandUrl, { headers, cache: 'no-store', signal: AbortSignal.timeout(5_000) })
  if (!existingResponse.ok) throw new Error(`Discord command lookup returned ${existingResponse.status}.`)
  const existingCommands = await existingResponse.json() as { id?: string; name?: string }[]
  const commands = [
    { name: 'disloop-admin', description: 'Open the Disloop badge and moderation panel', type: 1 },
    { name: 'profile', description: 'Show a Disloop member profile', type: 1, options: [{ type: 3, name: 'username', description: 'Website username (defaults to you)', required: false }] },
    { name: 'verification', description: 'Review a member verification request', type: 1, options: [
      { type: 3, name: 'action', description: 'Approve or reject the request', required: true, choices: [{ name: 'Approve', value: 'approve' }, { name: 'Reject', value: 'reject' }] },
      { type: 3, name: 'request_id', description: 'Verification request ID', required: true },
    ] },
  ]
  for (const command of commands) {
    const existingCommand = Array.isArray(existingCommands) ? existingCommands.find((existing) => existing.name === command.name) : undefined
    const response = await fetch(existingCommand?.id ? `${commandUrl}/${encodeURIComponent(existingCommand.id)}` : commandUrl, {
      method: existingCommand?.id ? 'PATCH' : 'POST',
      headers,
      body: JSON.stringify(command),
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`Discord command registration returned ${response.status}.`)
  }
}

async function profileCommand(interaction: DiscordInteraction) {
  if (!isGuildInteraction(interaction)) return ephemeralMessage('This command is only available in the configured Discord server.')
  const actor = getActor(interaction)
  if (!actor) return ephemeralMessage('Could not identify your Discord account.')
  const username = interaction.data?.options?.find((option) => option.name === 'username')?.value?.trim().replace(/^@/, '')
  try {
    const [{ db }, { disloopUsers, disloopUserBadges }, { getPublicUserByUsername }, { areUsersBlocked }] = await Promise.all([
      import('@/lib/db'),
      import('@/lib/db/schema'),
      import('@/lib/users'),
      import('@/lib/relationship-access'),
    ])
    const [requester] = await db.select({ id: disloopUsers.id, username: disloopUsers.usernameDisplay }).from(disloopUsers)
      .where(eq(disloopUsers.discordId, actor.discordId)).limit(1)
    const targetUsername = username ?? requester?.username
    if (!targetUsername) return ephemeralMessage('No Disloop profile was found.')
    const profile = await getPublicUserByUsername(targetUsername)
    if (!profile || (requester && await areUsersBlocked(requester.id, profile.id))) {
      return ephemeralMessage('No Disloop profile was found.')
    }
    const badgeRows = await db.select({ badgeId: disloopUserBadges.badgeId }).from(disloopUserBadges)
      .where(eq(disloopUserBadges.userId, profile.id))
    const badges = badgeRows.map(({ badgeId }) => BADGES.find((badge) => badge.id === badgeId)?.name).filter((name): name is string => Boolean(name))
    const level = [...XP_LEVEL_BADGES].reverse().find((badge) => profile.xp >= badge.threshold)?.name ?? 'Newcomer'
    const baseUrl = process.env.SITE_URL?.replace(/\/+$/, '') || 'https://disloop.me'
    return discordResponse({
      type: 4,
      data: {
        flags: EPHEMERAL_FLAG,
        allowed_mentions: { parse: [] },
        embeds: [{
          title: profile.displayName,
          url: `${baseUrl}/u/${encodeURIComponent(profile.username)}`,
          description: `@${profile.username}`,
          ...(profile.avatarUrl ? { thumbnail: { url: profile.avatarUrl } } : {}),
          fields: [
            { name: 'XP / Level', value: `${profile.xp} XP · ${level}`, inline: true },
            { name: 'Followers', value: String(profile.followerCount), inline: true },
            { name: 'Badges', value: badges.length ? badges.join(', ').slice(0, 1000) : 'None', inline: false },
          ],
        }],
      },
    })
  } catch (error) {
    console.error('[discord-profile] command failed', { error: error instanceof Error ? error.message : 'Unknown error' })
    return ephemeralMessage('The profile could not be loaded right now.')
  }
}

async function verificationCommand(interaction: DiscordInteraction) {
  const context = validateGuildAndActor(interaction)
  if ('error' in context) return ephemeralMessage(context.error ?? 'Could not verify this Discord interaction.')
  if (!canUseDiscordNameStyleActions(context.roleIds)) return ephemeralMessage('Your Discord roles do not allow that action.')
  const action = interaction.data?.options?.find((option) => option.name === 'action')?.value
  const requestId = interaction.data?.options?.find((option) => option.name === 'request_id')?.value
  if ((action !== 'approve' && action !== 'reject') || !requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return ephemeralMessage('Provide a valid request ID and choose approve or reject.')
  }
  if (!interaction.token) return ephemeralMessage('Discord did not provide a response token.')
  after(async () => {
    let content = 'The verification request could not be updated.'
    try {
      const [{ db }, { disloopUserBadges, disloopVerificationRequests }] = await Promise.all([
        import('@/lib/db'),
        import('@/lib/db/schema'),
      ])
      const { and, eq } = await import('drizzle-orm')
      const [updated] = await db.update(disloopVerificationRequests)
        .set({ status: action, resolvedAt: new Date() })
        .where(and(eq(disloopVerificationRequests.id, requestId), eq(disloopVerificationRequests.status, 'open')))
        .returning({ userId: disloopVerificationRequests.userId })
      if (!updated) {
        content = 'That request is already resolved or does not exist.'
      } else {
        if (action === 'approve') {
          await db.insert(disloopUserBadges).values({ userId: updated.userId, badgeId: 'verified' }).onConflictDoNothing()
        }
        console.info('[discord-verification] Request reviewed.', { requestId, userId: updated.userId, action, actorDiscordId: context.actor.discordId })
        content = `Verification request ${action === 'approve' ? 'approved' : 'rejected'}.`
      }
    } catch (error) {
      console.error('[discord-verification] Request review failed.', { requestId, action, error: error instanceof Error ? error.message : 'Unknown error' })
    }
    try {
      await updateOriginalResponse(interaction, content)
    } catch (error) {
      console.error('[discord-verification] Could not update the ephemeral response.', error instanceof Error ? error.message : 'Unknown error')
    }
  })
  return discordResponse({ type: 5, data: { flags: EPHEMERAL_FLAG } })
}

type GuildActorContext =
  | { error: string; actor?: never; roleIds?: never }
  | { error?: never; actor: { discordId: string; username: string }; roleIds: string[] }

function validateGuildAndActor(interaction: DiscordInteraction): GuildActorContext {
  if (!isDiscordAdminChannel(interaction.channel_id)) return { error: 'This command can only be used in the designated admin channel.' }
  if (!isGuildInteraction(interaction)) return { error: 'These admin tools are only available in the configured Discord server.' }
  const actor = getActor(interaction)
  const roleIds = interaction.member?.roles ?? []
  if (!actor) return { error: 'Could not identify your Discord account.' }
  return { actor, roleIds }
}

export async function POST(request: Request) {
  const startedAt = Date.now()
  const publicKey = process.env.DISCORD_PUBLIC_KEY
  if (!publicKey) return new Response('Discord interaction verification is not configured.', { status: 503 })

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > 100_000) return new Response('Request too large.', { status: 413 })
  const body = await request.text()
  if (body.length > 100_000) return new Response('Request too large.', { status: 413 })

  const signature = request.headers.get('x-signature-ed25519')
  const timestamp = request.headers.get('x-signature-timestamp')
  const signatureFailure = getDiscordInteractionSignatureFailure(signature, timestamp, publicKey)
  if (signatureFailure || !verifyDiscordInteractionSignature(body, signature, timestamp, publicKey)) {
    console.warn('[discord-interactions] Rejected an interaction during signature verification.', {
      reason: signatureFailure ?? 'signature_mismatch',
    })
    return new Response('Invalid Discord signature.', { status: 401 })
  }

  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return new Response('Invalid JSON.', { status: 400 })
  }
  const parsed = discordInteractionSchema.safeParse(json)
  if (!parsed.success) return new Response('Invalid Discord interaction.', { status: 400 })
  const interaction = parsed.data
  if (interaction.application_id !== process.env.DISCORD_CLIENT_ID) return new Response('Unknown Discord application.', { status: 403 })

  if (interaction.type === 1) {
    after(async () => {
      try {
        await registerAdminCommand()
      } catch (error) {
        console.error('[discord-admin] Command registration failed.', error instanceof Error ? error.message : 'Unknown error')
      }
    })
    return discordResponse({ type: 1 })
  }

  if (interaction.type === 2 && interaction.data?.name === 'profile') return profileCommand(interaction)
  if (interaction.type === 2 && interaction.data?.name === 'verification') return verificationCommand(interaction)

  if (interaction.type === 2 && interaction.data?.name === 'disloop-admin') {
    const context = validateGuildAndActor(interaction)
    if ('error' in context) return ephemeralMessage(context.error ?? 'Could not verify this Discord interaction.')
    const response = panelResponse(context.roleIds)
    console.info('[discord-interactions] Admin panel acknowledged.', { durationMs: Date.now() - startedAt })
    return response
  }

  if (interaction.type === 3) {
    const context = validateGuildAndActor(interaction)
    if ('error' in context) return ephemeralMessage(context.error ?? 'Could not verify this Discord interaction.')
    const key = getActionKey(interaction.data?.custom_id, 'open')
    if (!key) return ephemeralMessage('That admin-panel action is no longer available. Run `/disloop-admin` again.')
    if (!canUseDiscordNameStyleActions(context.roleIds)) return ephemeralMessage('Your Discord roles do not allow that action.')
    return actionModal(key)
  }

  if (interaction.type === 5) {
    const context = validateGuildAndActor(interaction)
    if ('error' in context) return ephemeralMessage(context.error ?? 'Could not verify this Discord interaction.')
    const key = getActionKey(interaction.data?.custom_id, 'submit')
    if (!key) return ephemeralMessage('That admin-panel form has expired. Run `/disloop-admin` again.')
    const definition = actionDefinitions[key]
    if (!canUseDiscordNameStyleActions(context.roleIds)) return ephemeralMessage('Your Discord roles do not allow that action.')
    if (!interaction.token) return ephemeralMessage('Discord did not provide a response token. Please try again.')

    const fields = modalFields(interaction.data?.components ?? [])
    after(async () => {
      let content: string
      try {
        const {
          applyDiscordAdminAction,
          applyDiscordNameStyle,
          applyDiscordQuickRoleAction,
          getDiscordAdminErrorDiagnostics,
          getDiscordAdminErrorResponse,
        } = await import('@/lib/discord-admin')
        const result = definition.action === 'quick_role'
          ? await applyDiscordQuickRoleAction(key as keyof typeof import('@/lib/discord-admin').DISCORD_QUICK_ROLE_ACTIONS, fields, context.actor)
          : definition.action === 'name_style_set' || definition.action === 'name_style_remove'
          ? await applyDiscordNameStyle(definition.action, fields, context.actor)
          : await applyDiscordAdminAction(definition.action, fields, context.actor)
        const updatedUsers = 'updatedUsers' in result ? result.updatedUsers : undefined
        const roleFailures = 'roleFailures' in result ? result.roleFailures : undefined
        content = resultMessage({ ...result, updatedUsers, roleFailures }, key)
      } catch (error) {
        if (error instanceof Error && error.name === 'DiscordAdminInputError') content = error.message
        else {
          const { getDiscordAdminErrorDiagnostics, getDiscordAdminErrorResponse } = await import('@/lib/discord-admin')
          const diagnostics = getDiscordAdminErrorDiagnostics(error)
          console.error('[discord-admin] Action failed.', diagnostics)
          content = getDiscordAdminErrorResponse(error)
        }
      }

      try {
        await updateOriginalResponse(interaction, content)
      } catch (error) {
        console.error('[discord-admin] Could not update the ephemeral interaction response.', error instanceof Error ? error.message : 'Unknown error')
      }
    })
    return discordResponse({ type: 5, data: { flags: EPHEMERAL_FLAG } })
  }

  return ephemeralMessage('Unsupported Discord interaction.')
}
