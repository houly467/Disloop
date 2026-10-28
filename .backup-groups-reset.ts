import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getDatabaseConnectionString } from './lib/db/connection-url'

process.loadEnvFile('.env.local')

async function main() {
  const [{ Pool }] = await Promise.all([import('pg')])
  const pool = new Pool({ connectionString: getDatabaseConnectionString(), max: 1 })
  const client = await pool.connect()
  const directory = 'C:/Users/turki/.copilot/session-state/771c8854-cc93-4cc7-ba54-8c627889dcb1/files'
  try {
    await client.query('BEGIN READ ONLY')
    const [groups, memberships, messages, reactions, invitations, responses] = await Promise.all([
      client.query('SELECT * FROM public.disloop_groups ORDER BY id'),
      client.query('SELECT * FROM public.disloop_group_members ORDER BY group_id, user_id'),
      client.query('SELECT * FROM public.disloop_group_messages ORDER BY group_id, created_at, id'),
      client.query(`SELECT r.* FROM public.disloop_chat_reactions r
        JOIN public.disloop_group_messages m ON m.id = r.message_id
        WHERE r.chat_type = 'group' ORDER BY r.message_id, r.user_id`),
      client.query('SELECT * FROM public.disloop_group_invites ORDER BY id'),
      client.query('SELECT * FROM public.disloop_group_invite_responses ORDER BY invite_id'),
    ])
    await client.query('COMMIT')

    const backup = {
      createdAt: new Date().toISOString(),
      source: 'read-only production group reset backup',
      tables: {
        groups: groups.rows,
        memberships: memberships.rows,
        messages: messages.rows,
        groupMessageReactions: reactions.rows,
        invitations: invitations.rows,
        invitationResponses: responses.rows,
      },
    }
    await mkdir(directory, { recursive: true })
    const filename = `groups-reset-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    const path = join(directory, filename)
    await writeFile(path, JSON.stringify(backup, null, 2), { flag: 'wx', mode: 0o600 })
    console.log(JSON.stringify({
      path,
      counts: {
        groups: groups.rowCount,
        memberships: memberships.rowCount,
        messages: messages.rowCount,
        groupMessageReactions: reactions.rowCount,
        invitations: invitations.rowCount,
        invitationResponses: responses.rowCount,
      },
    }, null, 2))
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'group_backup_failed')
  process.exitCode = 1
})
