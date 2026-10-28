import { desc, sql } from 'drizzle-orm'
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const disloopUsers = pgTable(
  'disloop_users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    discordId: text('discord_id').notNull().unique(),
    discordUsername: text('discord_username').notNull(),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    dateOfBirth: date('date_of_birth', { mode: 'string' }),
    profileAvatarUrl: text('profile_avatar_url'),
    profileBannerUrl: text('profile_banner_url'),
    usernameLower: varchar('username_lower', { length: 20 }).notNull(),
    usernameDisplay: varchar('username_display', { length: 20 }).notNull(),
    bio: varchar('bio', { length: 180 }).notNull().default(''),
    location: varchar('location', { length: 80 }),
    socialLinks: jsonb('social_links').$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    xp: integer('xp').notNull().default(0),
    statusLine: varchar('status_line', { length: 60 }),
    nameColor: varchar('name_color', { length: 7 }),
    isStaffRole: varchar('is_staff_role', { length: 16 }),
    hideLikes: boolean('hide_likes').notNull().default(false),
    hideReposts: boolean('hide_reposts').notNull().default(false),
    publicVisitCount: boolean('public_visit_count').notNull().default(false),
    showStatus: boolean('show_status').notNull().default(true),
    showNameColor: boolean('show_name_color').notNull().default(true),
    showBadges: boolean('show_badges').notNull().default(true),
    isMember: boolean('is_member').notNull().default(false),
    hasCreatedGroup: boolean('has_created_group').notNull().default(false),
    isBanned: boolean('is_banned').notNull().default(false),
    banReason: varchar('ban_reason', { length: 280 }),
    bannedAt: timestamp('banned_at', { withTimezone: true }),
    bannedByDiscordId: text('banned_by_discord_id'),
    isSeed: boolean('is_seed').notNull().default(false),
    presenceStatus: text('presence_status').$type<'online' | 'idle' | 'dnd' | 'invisible'>().notNull().default('online'),
    presenceUpdatedAt: timestamp('presence_updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('disloop_users_username_lower_unique').on(sql`lower(${table.usernameLower})`),
  ],
)

export const disloopNewsPosts = pgTable(
  'disloop_news_posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorId: uuid('author_id').notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    body: text('body').notNull(),
    category: varchar('category', { length: 24 }).notNull(),
    coverUrl: text('cover_url'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    pinned: boolean('pinned').notNull().default(false),
    accentColor: varchar('accent_color', { length: 7 }),
    repliesFromFollowing: boolean('replies_from_following').notNull().default(false),
    pinnedCommentId: uuid('pinned_comment_id'),
    isHidden: boolean('is_hidden').notNull().default(false),
    isSeed: boolean('is_seed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('disloop_news_created_at_idx').on(table.createdAt),
    index('disloop_news_visible_created_idx').on(desc(table.pinned), desc(table.createdAt)).where(sql`${table.isHidden} = false`),
    index('disloop_news_tags_gin_idx').using('gin', table.tags),
  ],
)

export const disloopReels = pgTable(
  'disloop_reels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorId: uuid('author_id').notNull(),
    videoUrl: text('video_url').notNull(),
    caption: varchar('caption', { length: 500 }).notNull().default(''),
    repliesFromFollowing: boolean('replies_from_following').notNull().default(false),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    isHidden: boolean('is_hidden').notNull().default(false),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
    moderatedBy: uuid('moderated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('disloop_reels_visible_created_idx').on(table.createdAt).where(sql`${table.isHidden} = false`),
    index('disloop_reels_visible_created_id_idx').on(desc(table.createdAt), desc(table.id)).where(sql`${table.isHidden} = false`),
    index('disloop_reels_tags_gin_idx').using('gin', table.tags),
  ],
)

export const disloopReelLikes = pgTable(
  'disloop_reel_likes',
  {
    reelId: uuid('reel_id').notNull(),
    userId: uuid('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.reelId, table.userId] })],
)

export const disloopStories = pgTable(
  'disloop_stories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorId: uuid('author_id').notNull(),
    body: varchar('body', { length: 500 }).notNull().default(''),
    mediaUrl: text('media_url'),
    mediaType: varchar('media_type', { length: 16 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull().default(sql`now() + interval '24 hours'`),
  },
  (table) => [index('disloop_stories_expiry_idx').on(table.expiresAt)],
)

export const disloopDailyPosts = pgTable(
  'disloop_daily_posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorId: uuid('author_id').notNull(),
    body: varchar('body', { length: 1000 }).notNull(),
    mediaUrl: text('media_url'),
    repliesFromFollowing: boolean('replies_from_following').notNull().default(false),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    isHidden: boolean('is_hidden').notNull().default(false),
  },
  (table) => [
    index('disloop_daily_posts_visible_created_idx').on(table.createdAt, table.id).where(sql`${table.isHidden} = false`),
    index('disloop_daily_posts_tags_gin_idx').using('gin', table.tags),
  ],
)

export const disloopXpEvents = pgTable(
  'disloop_xp_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    points: integer('points').notNull(),
    reason: varchar('reason', { length: 40 }).notNull(),
    eventKey: varchar('event_key', { length: 180 }).notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('disloop_xp_events_user_created_idx').on(table.userId, table.createdAt)],
)

export const disloopBlocks = pgTable(
  'disloop_blocks',
  {
    blockerId: uuid('blocker_id').notNull(),
    blockedId: uuid('blocked_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.blockerId, table.blockedId] }), index('disloop_blocks_blocked_idx').on(table.blockedId)],
)

export const disloopFollows = pgTable(
  'disloop_follows',
  {
    followerId: uuid('follower_id').notNull(),
    followedId: uuid('followed_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.followerId, table.followedId] })],
)

export const disloopDmConversations = pgTable(
  'disloop_dm_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userA: uuid('user_a').notNull(),
    userB: uuid('user_b').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('disloop_dm_conversations_unique_pair').on(table.userA, table.userB)],
)

export const disloopDmMessages = pgTable('disloop_dm_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull(),
  senderId: uuid('sender_id').notNull(),
  body: varchar('body', { length: 2000 }).notNull(),
  mediaUrl: text('media_url'),
  mediaType: varchar('media_type', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('disloop_dm_messages_conversation_created_idx').on(table.conversationId, table.createdAt, table.id)])

export const disloopComments = pgTable(
  'disloop_comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contentType: varchar('content_type', { length: 16 }).notNull(),
    contentId: uuid('content_id').notNull(),
    authorId: uuid('author_id').notNull(),
    threadRootId: uuid('thread_root_id'),
    body: varchar('body', { length: 1000 }).notNull(),
    isHidden: boolean('is_hidden').notNull().default(false),
    isPinned: boolean('is_pinned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('disloop_comments_content_created_idx').on(table.contentType, table.contentId, table.createdAt, table.id),
    index('disloop_comments_thread_created_idx').on(table.threadRootId, table.createdAt, table.id),
  ],
)

export const disloopReposts = pgTable(
  'disloop_reposts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    contentType: varchar('content_type', { length: 16 }).notNull(),
    contentId: uuid('content_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('disloop_reposts_unique').on(table.userId, table.contentType, table.contentId),
    index('disloop_reposts_user_created_idx').on(table.userId, table.createdAt),
  ],
)

export const disloopGroups = pgTable(
  'disloop_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id').notNull(),
    name: varchar('name', { length: 70 }).notNull(),
    description: varchar('description', { length: 500 }).notNull().default(''),
    tag: varchar('tag', { length: 24 }).notNull(),
    xp: integer('xp').notNull().default(0),
    isPrivate: boolean('is_private').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('disloop_groups_tag_unique').on(table.tag)],
)

export const disloopGroupMembers = pgTable(
  'disloop_group_members',
  {
    groupId: uuid('group_id').notNull(),
    userId: uuid('user_id').notNull(),
    role: varchar('role', { length: 16 }).notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    uniqueIndex('disloop_group_members_user_unique').on(table.userId),
  ],
)

export const disloopGroupInvites = pgTable(
  'disloop_group_invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id').notNull(),
    inviterId: uuid('inviter_id').notNull(),
    inviteeId: uuid('invitee_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull().default(sql`now() + interval '7 days'`),
  },
  (table) => [uniqueIndex('disloop_group_invites_group_invitee_unique').on(table.groupId, table.inviteeId)],
)

export const disloopGroupMessages = pgTable(
  'disloop_group_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id').notNull(),
    senderId: uuid('sender_id').notNull(),
    body: varchar('body', { length: 2000 }).notNull(),
    mediaUrl: text('media_url'),
    mediaType: varchar('media_type', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('disloop_group_messages_group_created_idx').on(table.groupId, table.createdAt, table.id)],
)

export const disloopChatReactions = pgTable(
  'disloop_chat_reactions',
  {
    chatType: varchar('chat_type', { length: 8 }).notNull(),
    messageId: uuid('message_id').notNull(),
    userId: uuid('user_id').notNull(),
    reaction: varchar('reaction', { length: 8 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.chatType, table.messageId, table.userId, table.reaction] }),
    index('disloop_chat_reactions_message_idx').on(table.chatType, table.messageId),
  ],
)

export const disloopLinkedAccounts = pgTable(
  'disloop_linked_accounts',
  {
    ownerUserId: uuid('owner_user_id').notNull(),
    accountUserId: uuid('account_user_id').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.ownerUserId, table.accountUserId] })],
)

export const disloopNotifications = pgTable(
  'disloop_notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    recipientId: uuid('recipient_id').notNull(),
    actorId: uuid('actor_id').notNull(),
    type: varchar('type', { length: 24 }).notNull(),
    targetType: varchar('target_type', { length: 16 }).notNull(),
    targetId: uuid('target_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (table) => [
    index('disloop_notifications_recipient_created_idx').on(table.recipientId, table.createdAt, table.id),
    index('disloop_notifications_unread_idx').on(table.recipientId, table.createdAt).where(sql`${table.readAt} IS NULL`),
  ],
)

export const disloopLikes = pgTable(
  'disloop_likes',
  {
    contentType: varchar('content_type', { length: 16 }).notNull(),
    contentId: uuid('content_id').notNull(),
    userId: uuid('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.contentType, table.contentId, table.userId] }),
    index('disloop_likes_content_created_idx').on(table.contentType, table.contentId, table.createdAt),
    index('disloop_likes_user_created_idx').on(table.userId, table.createdAt),
  ],
)

export const disloopUserBadges = pgTable(
  'disloop_user_badges',
  {
    userId: uuid('user_id').notNull(),
    badgeId: varchar('badge_id', { length: 48 }).notNull(),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
    isEquipped: boolean('is_equipped').notNull().default(false),
    counter: integer('counter').notNull().default(0),
    streak: integer('streak').notNull().default(0),
    lastActiveDate: varchar('last_active_date', { length: 10 }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.badgeId] }),
    index('disloop_user_badges_equipped_idx').on(table.userId, table.isEquipped),
  ],
)

export const disloopUserBadgeRevocations = pgTable(
  'disloop_user_badge_revocations',
  {
    userId: uuid('user_id').notNull(),
    badgeId: varchar('badge_id', { length: 48 }).notNull(),
    actorDiscordId: text('actor_discord_id').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.badgeId] })],
)

export const disloopUserFlair = pgTable('disloop_user_flair', {
  userId: uuid('user_id').primaryKey(),
  nameStyle: text('name_style'),
  customTitle: varchar('custom_title', { length: 24 }),
  updatedBy: text('updated_by').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const disloopReports = pgTable('disloop_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  reporterId: uuid('reporter_id').notNull(),
  targetUserId: uuid('target_user_id').notNull(),
  targetType: varchar('target_type', { length: 16 }).notNull(),
  targetId: uuid('target_id').notNull(),
  category: varchar('category', { length: 24 }).notNull(),
  reason: varchar('reason', { length: 500 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const disloopAdminAudit = pgTable(
  'disloop_admin_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorDiscordId: text('actor_discord_id').notNull(),
    actorUsername: text('actor_username').notNull(),
    targetUserId: uuid('target_user_id').notNull(),
    targetDiscordId: text('target_discord_id').notNull(),
    action: varchar('action', { length: 24 }).notNull(),
    badges: text('badges').array().notNull().default(sql`'{}'::text[]`),
    reason: varchar('reason', { length: 280 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('disloop_admin_audit_actor_created_idx').on(table.actorDiscordId, table.createdAt),
    index('disloop_admin_audit_target_created_idx').on(table.targetUserId, table.createdAt),
  ],
)

export const disloopTopScores = pgTable(
  'disloop_top_scores',
  {
    contentType: varchar('content_type', { length: 16 }).notNull(),
    contentId: uuid('content_id').notNull(),
    authorId: uuid('author_id').notNull(),
    score: doublePrecision('score').notNull(),
    rank: integer('rank').notNull(),
    refreshedAt: timestamp('refreshed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.contentType, table.contentId] }),
    index('disloop_top_scores_rank_idx').on(table.rank, table.score),
    index('disloop_top_scores_author_idx').on(table.authorId),
  ],
)

export const disloopTopMakerAwards = pgTable(
  'disloop_top_maker_awards',
  {
    contentType: varchar('content_type', { length: 16 }).notNull(),
    contentId: uuid('content_id').notNull(),
    awardDate: varchar('award_date', { length: 10 }).notNull(),
    userId: uuid('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.contentType, table.contentId, table.awardDate] }),
    index('disloop_top_maker_user_idx').on(table.userId, table.createdAt),
  ],
)

export const disloopProfileVisits = pgTable(
  'disloop_profile_visits',
  {
    profileId: uuid('profile_id').notNull(),
    visitorId: uuid('visitor_id').notNull(),
    visitDate: varchar('visit_date', { length: 10 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.profileId, table.visitorId, table.visitDate] }),
    index('disloop_profile_visits_profile_date_idx').on(table.profileId, table.visitDate),
  ],
)

export const disloopUserActivity = pgTable(
  'disloop_user_activity',
  {
    userId: uuid('user_id').notNull(),
    activityDate: varchar('activity_date', { length: 10 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.activityDate] }),
    index('disloop_user_activity_date_idx').on(table.activityDate),
  ],
)

export const disloopRateLimits = pgTable(
  'disloop_rate_limits',
  {
    bucketKey: varchar('bucket_key', { length: 160 }).notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    hits: integer('hits').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.bucketKey, table.windowStart] })],
)
