import { NewsApp } from '@/components/news-app'
import { getNewsPosts, getNewsPostsByAuthor } from '@/lib/news'
import { getReels } from '@/lib/reels'
import { getCurrentUser } from '@/lib/session'
import { isDiscordModerator } from '@/lib/discord-community'
import { getUserNameFlair } from '@/lib/users'

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function HomePage({ searchParams }: PageProps) {
  const [params, initialPosts, initialSession] = await Promise.all([
    searchParams,
    getNewsPosts(),
    getCurrentUser(),
  ])
  const [initialReels, initialProfilePosts, initialProfileReels, initialModerator, initialProfileFlair] = await Promise.all([
    getReels(initialSession?.id),
    initialSession ? getNewsPostsByAuthor(initialSession.id) : Promise.resolve([]),
    initialSession ? getReels(initialSession.id, undefined, initialSession.id) : Promise.resolve([]),
    initialSession ? isDiscordModerator(initialSession.discordId) : Promise.resolve(false),
    initialSession ? getUserNameFlair(initialSession.id) : Promise.resolve({ nameStyle: null, customTitle: null }),
  ])

  return (
    <NewsApp
      initialPosts={initialPosts}
      initialSession={initialSession}
      initialReels={initialReels}
      initialProfilePosts={initialProfilePosts}
      initialProfileReels={initialProfileReels}
      initialModerator={initialModerator}
      initialProfileFlair={initialProfileFlair}
      initialComposerOpen={params.compose === 'news'}
      inviteUrl={process.env.DISCORD_INVITE_URL ?? null}
      authNotice={typeof params.auth === 'string' ? params.auth : null}
    />
  )
}
