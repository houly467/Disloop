process.loadEnvFile('.env.local')
import { getDatabaseConnectionString } from './lib/db/connection-url'

async function main() {
  const [{ Pool }, { list }] = await Promise.all([import('pg'), import('@vercel/blob')])
  const pool = new Pool({ connectionString: getDatabaseConnectionString(), max: 1 })
  const client = await pool.connect()
  try {
    await client.query('BEGIN READ ONLY')
    const counts = await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.disloop_groups) AS groups,
        (SELECT count(*)::int FROM public.disloop_group_members) AS memberships,
        (SELECT count(*)::int FROM public.disloop_group_messages) AS messages,
        (SELECT count(*)::int FROM public.disloop_chat_reactions r
          JOIN public.disloop_group_messages m ON m.id = r.message_id
          WHERE r.chat_type = 'group') AS group_message_reactions,
        (SELECT count(*)::int FROM public.disloop_group_invites) AS invitations,
        (SELECT count(*)::int FROM public.disloop_group_invites WHERE expires_at > now()) AS unexpired_invitations,
        (SELECT count(*)::int FROM public.disloop_group_invite_responses) AS invitation_responses
    `)
    const partner = await client.query(`
      SELECT id, name, tag, is_private, owner_id,
        (SELECT count(*)::int FROM public.disloop_group_members m WHERE m.group_id = g.id) AS member_count
      FROM public.disloop_groups g
      WHERE lower(g.name) = 'partner' OR lower(g.tag) = 'partner'
    `)
    const mediaRefs = await client.query(`
      SELECT DISTINCT media_url AS url
      FROM public.disloop_group_messages
      WHERE media_url IS NOT NULL
    `)
    const dmRefs = await client.query(`
      SELECT DISTINCT media_url AS url
      FROM public.disloop_dm_messages
      WHERE media_url IS NOT NULL
    `)
    const foreignKeys = await client.query(`
      SELECT tc.table_name, kcu.column_name, ccu.table_name AS referenced_table,
        ccu.column_name AS referenced_column, tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.constraint_schema = kcu.constraint_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND (tc.table_name LIKE 'disloop_group%' OR tc.table_name = 'disloop_chat_reactions')
      ORDER BY tc.table_name, kcu.column_name
    `)
    await client.query('COMMIT')

    const groupPaths = new Set<string>()
    const dmPaths = new Set<string>()
    const pathname = (url: string) => {
      try {
        const parsed = new URL(url, 'https://media.disloop.invalid')
        return parsed.origin === 'https://media.disloop.invalid' && parsed.pathname === '/api/media'
          ? parsed.searchParams.get('pathname')
          : parsed.protocol === 'https:' && parsed.hostname.endsWith('.public.blob.vercel-storage.com')
            ? parsed.pathname.slice(1)
            : null
      } catch {
        return null
      }
    }
    for (const row of mediaRefs.rows) {
      const path = pathname(row.url)
      if (path) groupPaths.add(path)
    }
    for (const row of dmRefs.rows) {
      const path = pathname(row.url)
      if (path) dmPaths.add(path)
    }

    let blobCount = 0
    let cursor: string | undefined
    let blobsSharedWithDmRefs = 0
    let groupMessageBlobCount = 0
    let groupMessageBlobMissingCount = 0
    let unreferencedChatMediaBlobCount = 0
    const blobPaths = new Set<string>()
    do {
      const page = await list({ prefix: 'chat-media/', limit: 1000, ...(cursor ? { cursor } : {}) })
      blobCount += page.blobs.length
      for (const blob of page.blobs) {
        blobPaths.add(blob.pathname)
        const groupRef = groupPaths.has(blob.pathname)
        const dmRef = dmPaths.has(blob.pathname)
        if (groupRef) groupMessageBlobCount += 1
        else unreferencedChatMediaBlobCount += 1
        if (groupRef && dmRef) blobsSharedWithDmRefs += 1
      }
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor)
    for (const path of groupPaths) {
      if (!blobPaths.has(path)) groupMessageBlobMissingCount += 1
    }

    console.log(JSON.stringify({
      database: counts.rows[0],
      partnerGroups: partner.rows,
      groupMedia: {
        uniqueGroupMessageMediaUrls: mediaRefs.rowCount,
        groupMessageBlobPaths: [...groupPaths],
        matchedBlobObjects: groupMessageBlobCount,
        missingBlobObjects: groupMessageBlobMissingCount,
        allChatMediaBlobObjects: blobCount,
        blobsAlsoReferencedByDmMessages: blobsSharedWithDmRefs,
        unreferencedChatMediaObjects: unreferencedChatMediaBlobCount,
        orphanGroupMediaCanBeDistinguishedFromDmMedia: false,
      },
      foreignKeys: foreignKeys.rows,
    }, null, 2))
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'read_only_group_inspection_failed')
  process.exitCode = 1
})
