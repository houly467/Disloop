import { createHash } from 'node:crypto'
import { list } from '@vercel/blob'
import { sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkDiscordGuildHealth } from '@/lib/discord'
import { getDiscordMemberRoles } from '@/lib/discord-community'
import { hasDiscordAdminRole } from '@/lib/discord-admin'
import { getCurrentUserResult } from '@/lib/session'
import { rateLimitResponse } from '@/lib/rate-limit'
import { logApiException, safeApiFailureReason } from '@/lib/api-errors'
import { UPLOAD_CONFIG } from '@/lib/upload-config'
import { redis } from '@/lib/upstash'

const EXPECTED_TABLE_COLUMNS = {
  disloop_users: ['id', 'discord_id', 'discord_username', 'display_name', 'avatar_url', 'date_of_birth', 'profile_avatar_url', 'profile_banner_url', 'username_lower', 'username_display', 'bio', 'location', 'social_links', 'xp', 'status_line', 'name_color', 'is_staff_role', 'hide_likes', 'public_visit_count', 'show_status', 'show_name_color', 'show_badges', 'is_member', 'has_created_group', 'is_banned', 'ban_reason', 'banned_at', 'banned_by_discord_id', 'is_seed', 'presence_status', 'presence_updated_at', 'created_at', 'updated_at'],
  disloop_username_history: ['username_lower', 'user_id', 'created_at'],
  disloop_groups: ['id', 'owner_id', 'name', 'description', 'tag', 'xp', 'is_private', 'created_at'],
  disloop_group_members: ['group_id', 'user_id', 'role', 'joined_at'],
  disloop_group_invites: ['id', 'group_id', 'inviter_id', 'invitee_id', 'created_at', 'expires_at'],
  disloop_group_messages: ['id', 'group_id', 'sender_id', 'body', 'media_url', 'media_type', 'created_at'],
  disloop_notifications: ['id', 'recipient_id', 'actor_id', 'type', 'target_type', 'target_id', 'created_at', 'read_at', 'dismissed_at'],
  disloop_news_posts: ['id', 'author_id', 'title', 'body', 'category', 'cover_url', 'tags', 'pinned', 'accent_color', 'replies_from_following', 'pinned_comment_id', 'is_hidden', 'is_seed', 'created_at', 'updated_at'],
  disloop_daily_posts: ['id', 'author_id', 'body', 'media_url', 'replies_from_following', 'tags', 'created_at', 'is_hidden'],
  disloop_stories: ['id', 'author_id', 'body', 'media_url', 'created_at', 'expires_at'],
  disloop_reels: ['id', 'author_id', 'video_url', 'caption', 'replies_from_following', 'tags', 'is_hidden', 'moderated_at', 'moderated_by', 'created_at', 'updated_at'],
  disloop_likes: ['content_type', 'content_id', 'user_id', 'created_at'],
  disloop_reel_likes: ['reel_id', 'user_id', 'created_at'],
  disloop_comments: ['id', 'content_type', 'content_id', 'author_id', 'thread_root_id', 'body', 'is_hidden', 'is_pinned', 'created_at'],
  disloop_reposts: ['id', 'user_id', 'content_type', 'content_id', 'created_at'],
  disloop_user_badges: ['user_id', 'badge_id', 'earned_at', 'is_equipped', 'counter', 'streak', 'last_active_date'],
  disloop_user_badge_revocations: ['user_id', 'badge_id', 'actor_discord_id', 'revoked_at'],
  disloop_admin_audit: ['id', 'actor_discord_id', 'actor_username', 'target_user_id', 'target_discord_id', 'action', 'badges', 'reason', 'created_at'],
  disloop_top_scores: ['content_type', 'content_id', 'author_id', 'score', 'rank', 'refreshed_at'],
  disloop_top_maker_awards: ['content_type', 'content_id', 'award_date', 'user_id', 'created_at'],
  disloop_rate_limits: ['bucket_key', 'window_start', 'hits'],
  disloop_dm_conversations: ['id', 'user_a', 'user_b', 'created_at', 'last_message_at'],
  disloop_dm_messages: ['id', 'conversation_id', 'sender_id', 'body', 'media_url', 'media_type', 'created_at'],
  disloop_xp_events: ['id', 'user_id', 'points', 'reason', 'event_key', 'created_at'],
  disloop_profile_visits: ['profile_id', 'visitor_id', 'visit_date', 'created_at'],
  disloop_user_activity: ['user_id', 'activity_date'],
} as const

const EXPECTED_TABLES = Object.keys(EXPECTED_TABLE_COLUMNS) as Array<keyof typeof EXPECTED_TABLE_COLUMNS>

const EXPECTED_INDEXES = [
  'disloop_users_username_lower_unique',
  'disloop_news_created_at_idx', 'disloop_news_visible_created_idx', 'disloop_news_tags_gin_idx',
  'disloop_reels_visible_created_idx', 'disloop_reels_visible_created_id_idx', 'disloop_reels_tags_gin_idx',
  'disloop_stories_expiry_idx',
  'disloop_daily_posts_visible_created_idx', 'disloop_daily_posts_tags_gin_idx',
  'disloop_xp_events_user_created_idx', 'disloop_dm_conversations_unique_pair', 'disloop_dm_messages_conversation_created_idx',
  'disloop_comments_content_created_idx', 'disloop_comments_thread_created_idx',
  'disloop_reposts_unique', 'disloop_reposts_user_created_idx', 'disloop_groups_tag_unique',
  'disloop_group_members_user_unique', 'disloop_group_invites_group_invitee_unique', 'disloop_group_messages_group_created_idx',
  'disloop_notifications_recipient_created_idx', 'disloop_notifications_unread_idx',
  'disloop_likes_content_created_idx', 'disloop_likes_user_created_idx', 'disloop_user_badges_equipped_idx',
  'disloop_admin_audit_actor_created_idx', 'disloop_admin_audit_target_created_idx',
  'disloop_top_scores_rank_idx', 'disloop_top_scores_author_idx', 'disloop_top_maker_user_idx',
  'disloop_profile_visits_profile_date_idx', 'disloop_user_activity_date_idx',
] as const

function fingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function maskHost(hostname: string) {
  return hostname.replace(/^([^.]{2})[^.]*/, '$1…')
}

function maskDatabaseName(name: string) {
  return name.length < 2 ? '***' : `${name[0]}…${name.at(-1)}`
}

export async function GET(request: NextRequest) {
  const session = await getCurrentUserResult()
  if (session.status === 'unavailable') return NextResponse.json({ error: 'session_unavailable' }, { status: 503 })
  if (session.status !== 'ok') {
    const status = session.status === 'banned' ? 403 : 401
    return NextResponse.json({ error: session.status }, { status })
  }

  let isAdmin = session.user.isStaffRole === 'admin'
  if (!isAdmin) {
    try {
      const roles = await getDiscordMemberRoles(session.user.discordId)
      isAdmin = Boolean(roles && hasDiscordAdminRole(roles))
    } catch (error) {
      logApiException('GET /api/admin/health admin authorization lookup', error)
    }
  }
  if (!isAdmin) return NextResponse.json({ error: 'admin_required' }, { status: 403 })

  const rateLimit = await rateLimitResponse(`admin-health:${session.user.id}`, 10, 60)
  if (rateLimit) return rateLimit

  const environment = {
    discordClientId: Boolean(process.env.DISCORD_CLIENT_ID),
    discordClientSecret: Boolean(process.env.DISCORD_CLIENT_SECRET),
    discordBotToken: Boolean(process.env.DISCORD_BOT_TOKEN),
    discordGuildId: Boolean(process.env.DISCORD_GUILD_ID),
    sessionSecret: Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32),
    databaseUrl: Boolean(process.env.DATABASE_URL),
    blobReadWriteToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    cronSecret: Boolean(process.env.CRON_SECRET),
    kvRestApiUrl: Boolean(process.env.KV_REST_API_URL),
    kvRestApiToken: Boolean(process.env.KV_REST_API_TOKEN),
  }

  let databaseReachable = false
  let host: string | null = null
  let hostFingerprint: string | null = null
  let databaseName: string | null = null
  let databaseFingerprint: string | null = null
  let neonBranch: string | null = null
  let tables: Array<{ name: string; exists: boolean; missingColumns: string[]; rowCount: number | null; reason?: string }> = EXPECTED_TABLES.map((name) => ({ name, exists: false, missingColumns: [...EXPECTED_TABLE_COLUMNS[name]], rowCount: null }))
  let groupsQuery: { ok: boolean; rowCounts?: { groups: number; topGroups: number }; reason?: string } = { ok: false, reason: 'db_connection' }
  let missingIndexes: string[] = [...EXPECTED_INDEXES]

  try {
    const databaseUrl = process.env.DATABASE_URL
    if (databaseUrl) {
      const parsedUrl = new URL(databaseUrl)
      host = maskHost(parsedUrl.hostname)
      hostFingerprint = fingerprint(parsedUrl.hostname)
    }

    const identityResult = await db.execute(sql`
      select
        current_database() as database_name,
        current_setting('neon.branch_id', true) as neon_branch_id,
        current_setting('neon.branch_name', true) as neon_branch_name
    `)
    const identity = identityResult.rows[0] as {
      database_name: string
      neon_branch_id: string | null
      neon_branch_name: string | null
    }
    databaseReachable = true
    databaseName = maskDatabaseName(identity.database_name)
    databaseFingerprint = fingerprint(identity.database_name)
    neonBranch = identity.neon_branch_name || identity.neon_branch_id || process.env.NEON_BRANCH_ID || null

    const columnsResult = await db.execute(sql`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name in (${sql.join(EXPECTED_TABLES.map((table) => sql`${table}`), sql`, `)})
    `)
    const existingColumns = new Map<string, Set<string>>()
    for (const row of columnsResult.rows as Array<{ table_name: string; column_name: string }>) {
      const columns = existingColumns.get(row.table_name) ?? new Set<string>()
      columns.add(row.column_name)
      existingColumns.set(row.table_name, columns)
    }

    tables = await Promise.all(EXPECTED_TABLES.map(async (name) => {
      const columns = existingColumns.get(name)
      if (!columns) return { name, exists: false, missingColumns: [...EXPECTED_TABLE_COLUMNS[name]], rowCount: null, reason: 'missing_table' }
      const missingColumns = EXPECTED_TABLE_COLUMNS[name].filter((column) => !columns.has(column))
      try {
        const countResult = await db.execute(sql`
          select count(*)::int as row_count
          from ${sql.identifier('public')}.${sql.identifier(name)}
        `)
        return {
          name,
          exists: true,
          missingColumns: [...missingColumns],
          rowCount: Number((countResult.rows[0] as { row_count: number }).row_count),
          ...(missingColumns.length ? { reason: 'missing_column' } : {}),
        }
      } catch (error) {
        logApiException(`GET /api/admin/health table count ${name}`, error)
        return { name, exists: true, missingColumns: [...missingColumns], rowCount: null, reason: safeApiFailureReason(error) }
      }
    }))

    const indexesResult = await db.execute(sql`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and indexname in (${sql.join(EXPECTED_INDEXES.map((indexName) => sql`${indexName}`), sql`, `)})
    `)
    const existingIndexes = new Set((indexesResult.rows as Array<{ indexname: string }>).map((row) => row.indexname))
    missingIndexes = EXPECTED_INDEXES.filter((indexName) => !existingIndexes.has(indexName))

    try {
      const groupsResult = await db.execute(sql`
        select g.id, g.name, g.description, g.tag, g.owner_id, g.xp,
          row_number() over (order by g.xp desc, g.created_at asc, g.id asc)::int as rank,
          (select count(*)::int from public.disloop_group_members m where m.group_id = g.id) as member_count
        from public.disloop_groups g
        where g.is_private = false
        order by g.xp desc, g.created_at asc, g.id asc
        limit 30
      `)
      const groups = groupsResult.rows as Array<{ rank: number }>
      groupsQuery = { ok: true, rowCounts: { groups: groups.length, topGroups: groups.filter((group) => group.rank <= 5).length } }
    } catch (error) {
      logApiException('GET /api/admin/health groups query', error)
      groupsQuery = { ok: false, reason: safeApiFailureReason(error) }
    }
  } catch (error) {
    logApiException('GET /api/admin/health database diagnostic', error)
    groupsQuery = { ok: false, reason: safeApiFailureReason(error) }
  }

  const discordGuild = await checkDiscordGuildHealth()
  let rateLimitStoreWorks = false
  if (redis) {
    try {
      await redis.ping()
      rateLimitStoreWorks = true
    } catch (error) {
      logApiException('GET /api/admin/health rate-limit store diagnostic', error)
    }
  }
  let storageTokenWorks = false
  if (environment.blobReadWriteToken) {
    try {
      await list({ limit: 1 })
      storageTokenWorks = true
    } catch (error) {
      logApiException('GET /api/admin/health storage diagnostic', error)
    }
  }

  const uploads = Object.fromEntries(Object.entries(UPLOAD_CONFIG).map(([kind, config]) => [kind, {
    folder: config.folder,
    allowedContentTypes: [...config.allowedContentTypes],
    maximumSizeInBytes: config.maximumSizeInBytes,
    ...('maximumDurationSeconds' in config ? { maximumDurationSeconds: config.maximumDurationSeconds } : {}),
    ...('dailyLimit' in config ? { dailyLimit: config.dailyLimit } : {}),
  }]))

  return NextResponse.json({
    environment,
    database: {
      reachable: databaseReachable,
      host,
      hostFingerprint,
      name: databaseName,
      nameFingerprint: databaseFingerprint,
      neonBranch,
      tables,
      indexes: { expected: EXPECTED_INDEXES.length, missing: missingIndexes },
      groupsQuery,
    },
    discord: {
      guildReachable: discordGuild.ok,
      reason: discordGuild.ok ? null : discordGuild.reason,
      serverMembersIntent: 'must_be_confirmed_in_discord_developer_portal',
    },
    storage: { tokenWorks: storageTokenWorks },
    rateLimitStore: { reachable: rateLimitStoreWorks },
    uploads,
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
