import { redirect } from 'next/navigation'
import { ModerationPanel } from '@/components/community-sections'
import { isDiscordModerator } from '@/lib/discord-community'
import { getModerationQueue } from '@/lib/moderation'
import { getCurrentUser } from '@/lib/session'
import { BackButton } from '@/components/back-button'

export default async function ModerationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const locale = params.lang === 'ar' ? 'ar' : 'en'
  const user = await getCurrentUser()
  if (!user || !(await isDiscordModerator(user.discordId))) redirect('/')
  const items = await getModerationQueue()
  return <main className="disloop-shell public-profile-page" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale}><BackButton locale={locale} /><ModerationPanel initialItems={items} locale={locale} /></main>
}
