const DISCORD_API = 'https://discord.com/api/v10'

function botHeaders() {
  const token = process.env.DISCORD_BOT_TOKEN
  if (!token) throw new Error('discord_bot_not_configured')
  return { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' }
}

function configuredIds(value: string | undefined) {
  return (value ?? '').split(',').map((id) => id.trim()).filter((id) => /^\d{17,20}$/.test(id))
}

export async function getDiscordMemberRoles(discordId: string): Promise<string[] | null> {
  const guildId = process.env.DISCORD_GUILD_ID
  if (!guildId || !process.env.DISCORD_BOT_TOKEN) return null

  try {
    const response = await fetch(`${DISCORD_API}/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordId)}`, {
      headers: botHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) return null
    const member = (await response.json()) as { roles?: unknown }
    return Array.isArray(member.roles) ? member.roles.filter((role): role is string => typeof role === 'string') : null
  } catch {
    return null
  }
}

export async function isDiscordModerator(discordId: string) {
  const allowedRoles = configuredIds(process.env.DISCORD_MODERATOR_ROLE_IDS)
  if (!allowedRoles.length) return false
  const memberRoles = await getDiscordMemberRoles(discordId)
  return memberRoles ? memberRoles.some((role) => allowedRoles.includes(role)) : false
}

export async function syncDiscordXpRole(discordId: string, xp: number) {
  const guildId = process.env.DISCORD_GUILD_ID
  const mappedRoles = (process.env.DISCORD_XP_ROLE_MAP ?? '').split(',').flatMap((entry) => {
    const [thresholdValue, roleId] = entry.split(':').map((part) => part.trim())
    const threshold = Number(thresholdValue)
    return Number.isSafeInteger(threshold) && threshold > 0 && /^\d{17,20}$/.test(roleId ?? '') ? [{ threshold, roleId: roleId! }] : []
  }).sort((left, right) => left.threshold - right.threshold)
  if (!guildId || !mappedRoles.length) return

  const roles = await getDiscordMemberRoles(discordId)
  if (!roles) return
  const managedRoleIds = new Set(mappedRoles.map(({ roleId }) => roleId))
  const eligible = mappedRoles.filter(({ threshold }) => xp >= threshold)
  const desiredRole = eligible.at(-1)?.roleId
  const nextRoles = roles.filter((roleId) => !managedRoleIds.has(roleId))
  if (desiredRole) nextRoles.push(desiredRole)
  if (nextRoles.length === roles.length && nextRoles.every((roleId, index) => roleId === roles[index])) return

  await fetch(`${DISCORD_API}/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordId)}`, {
    method: 'PATCH',
    headers: botHeaders(),
    body: JSON.stringify({ roles: nextRoles }),
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  }).then((response) => {
    if (!response.ok) throw new Error(`discord_role_sync_${response.status}`)
  })
}

export async function publishDiscordEmbed(input: { title: string; description: string; url: string; category: string; tags: string[] }) {
  const channelId = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID
  if (!channelId || !process.env.DISCORD_BOT_TOKEN) return

  const response = await fetch(`${DISCORD_API}/channels/${encodeURIComponent(channelId)}/messages`, {
    method: 'POST',
    headers: botHeaders(),
    body: JSON.stringify({
      embeds: [{
        title: input.title.slice(0, 256),
        description: input.description.slice(0, 4000),
        url: input.url,
        color: 0x879c8c,
        fields: [
          { name: 'Category', value: input.category.slice(0, 100), inline: true },
          ...(input.tags.length ? [{ name: 'Topics', value: input.tags.slice(0, 10).map((tag) => `#${tag}`).join(' ').slice(0, 1024), inline: true }] : []),
        ],
        footer: { text: 'Disloop community' },
      }],
      allowed_mentions: { parse: [] },
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error(`discord_embed_${response.status}`)
}
