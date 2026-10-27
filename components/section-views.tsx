'use client'

import { useMemo, useState } from 'react'
import { ArrowUpRight, Check, Compass, Copy, Hash, Search, UserRound, Video } from 'lucide-react'
import type { NewsPost } from '@/lib/news'
import type { CurrentUser } from '@/lib/session'
import type { CommunityMember } from '@/lib/users'
import { UserName } from '@/components/user-name'

type Locale = 'en' | 'ar'
type SearchFilter = 'all' | 'members' | 'news' | 'reels' | 'hashtags'

type SearchSectionProps = {
  posts: NewsPost[]
  members: CommunityMember[]
  currentUser: CurrentUser | null
  query: string
  onQueryChange: (value: string) => void
  locale: Locale
}

const searchLabels = {
  en: {
    title: 'Find your people and stories',
    description: 'Search community members, news, and hashtags.',
    placeholder: 'Search people, posts, or topics',
    all: 'All', members: 'Members', news: 'News', reels: 'Reels', hashtags: 'Hashtags',
    emptyTitle: 'No matches yet', emptyBody: 'Try another name, phrase, or hashtag.',
    reelsEmpty: 'There are no reels to search yet.', posts: 'posts',
  },
  ar: {
    title: 'اعثر على الأشخاص والقصص',
    description: 'ابحث عن أعضاء المجتمع والأخبار والوسوم.',
    placeholder: 'ابحث عن أشخاص أو منشورات أو مواضيع',
    all: 'الكل', members: 'الأعضاء', news: 'الأخبار', reels: 'ريلز', hashtags: 'الوسوم',
    emptyTitle: 'لا توجد نتائج بعد', emptyBody: 'جرّب اسمًا أو عبارة أو وسمًا آخر.',
    reelsEmpty: 'لا توجد ريلز للبحث عنها بعد.', posts: 'منشورات',
  },
} satisfies Record<Locale, Record<string, string>>

export function SearchSection({ posts, members: directory, currentUser, query, onQueryChange, locale }: SearchSectionProps) {
  const [filter, setFilter] = useState<SearchFilter>('all')
  const labels = searchLabels[locale]
  const normalized = query.trim().toLocaleLowerCase(locale === 'ar' ? 'ar' : 'en')
  const matchingPosts = useMemo(() => posts.filter((post) => {
    const haystack = `${post.title} ${post.body} ${post.authorName} ${post.authorUsername} ${post.tags.join(' ')}`.toLocaleLowerCase(locale === 'ar' ? 'ar' : 'en')
    return !normalized || haystack.includes(normalized.replace(/^#/, ''))
  }), [locale, normalized, posts])

  const matchingMembers = useMemo(() => {
    const members = new Map<string, CommunityMember>()
    for (const member of directory) members.set(member.id, member)
    if (currentUser) {
      members.set(currentUser.id, {
        id: currentUser.id,
        discordId: currentUser.discordId,
        discordUsername: currentUser.discordUsername,
        displayName: currentUser.displayName,
        avatarUrl: currentUser.avatarUrl,
        username: currentUser.username,
      })
    }
    const term = normalized.replace(/^@/, '')
    return [...members.values()].filter((member) => `${member.displayName} ${member.username} ${member.discordUsername} ${member.discordId}`.toLocaleLowerCase().includes(term))
  }, [currentUser, directory, normalized])

  const matchingTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const post of posts) {
      for (const tag of post.tags) {
        if (!normalized || tag.toLocaleLowerCase().includes(normalized.replace(/^#/, ''))) {
          counts.set(tag, (counts.get(tag) ?? 0) + 1)
        }
      }
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1])
  }, [normalized, posts])

  const filters: SearchFilter[] = ['all', 'members', 'news', 'reels', 'hashtags']
  const showPosts = filter === 'all' || filter === 'news'
  const showMembers = filter === 'all' || filter === 'members'
  const showTags = filter === 'all' || filter === 'hashtags'
  const hasResults = (showPosts && matchingPosts.length > 0) || (showMembers && matchingMembers.length > 0) || (showTags && matchingTags.length > 0)

  return (
    <section className="section-view" aria-labelledby="search-title">
      <div className="section-heading">
        <span className="section-kicker"><Search aria-hidden="true" />{labels.all}</span>
        <h1 id="search-title">{labels.title}</h1>
        <p>{labels.description}</p>
      </div>
      <label className="section-search">
        <Search aria-hidden="true" />
        <input aria-label={labels.placeholder} placeholder={labels.placeholder} value={query} onChange={(event) => onQueryChange(event.target.value)} autoFocus />
        {query && <button type="button" onClick={() => onQueryChange('')} aria-label={locale === 'ar' ? 'مسح البحث' : 'Clear search'}>×</button>}
      </label>
      <div className="section-tabs" role="group" aria-label={locale === 'ar' ? 'تصفية البحث' : 'Search filters'}>
        {filters.map((key) => <button key={key} type="button" aria-pressed={filter === key} className={filter === key ? 'section-tab section-tab-active' : 'section-tab'} onClick={() => setFilter(key)}>{labels[key]}</button>)}
      </div>

      {filter === 'reels' ? (
        <div className="section-empty"><span className="section-empty-icon"><Video aria-hidden="true" /></span><h2>{labels.reelsEmpty}</h2></div>
      ) : hasResults ? (
        <div className="search-results">
          {showMembers && matchingMembers.length > 0 && (
            <section className="search-result-group" aria-labelledby="member-results-title">
              <div className="result-group-heading"><h2 id="member-results-title">{labels.members}</h2><span>{matchingMembers.length}</span></div>
              <div className="member-result-list">
                {matchingMembers.slice(0, 8).map((member) => (
                  <a className="member-result" key={member.username} href={`/u/${encodeURIComponent(member.username)}`}>
                    {member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : <span className="member-result-fallback"><UserRound aria-hidden="true" /></span>}
                    <UserName userId={member.id} name={member.displayName} username={member.username} nameStyle={member.nameStyle} customTitle={member.customTitle} locale={locale} />
                    <ArrowUpRight aria-hidden="true" />
                  </a>
                ))}
              </div>
            </section>
          )}
          {showTags && matchingTags.length > 0 && (
            <section className="search-result-group" aria-labelledby="tag-results-title">
              <div className="result-group-heading"><h2 id="tag-results-title">{labels.hashtags}</h2><span>{matchingTags.length}</span></div>
              <div className="search-tags">
                {matchingTags.slice(0, 12).map(([tag, count]) => <button key={tag} type="button" className="search-tag" onClick={() => onQueryChange(`#${tag}`)}><Hash aria-hidden="true" /><strong>{tag}</strong><small>{count} {labels.posts}</small></button>)}
              </div>
            </section>
          )}
          {showPosts && matchingPosts.length > 0 && (
            <section className="search-result-group" aria-labelledby="news-results-title">
              <div className="result-group-heading"><h2 id="news-results-title">{labels.news}</h2><span>{matchingPosts.length}</span></div>
              <div className="news-list">
                {matchingPosts.slice(0, 20).map((post) => (
                  <article className="search-post" key={post.id}>
                    <span className="category-pill">{post.category}</span>
                    <h3>{post.title}</h3>
                    <p>{post.body}</p>
                    {post.tags.length > 0 && <div className="tag-row">{post.tags.map((tag) => <button type="button" className="post-tag" key={tag} onClick={() => onQueryChange(`#${tag}`)}>#{tag}</button>)}</div>}
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="section-empty"><span className="section-empty-icon"><Search aria-hidden="true" /></span><h2>{labels.emptyTitle}</h2><p>{labels.emptyBody}</p></div>
      )}
    </section>
  )
}

type ProfileSectionProps = {
  currentUser: CurrentUser | null
  posts: NewsPost[]
  locale: Locale
  onSignIn: () => void
}

const profileLabels = {
  en: {
    title: 'Community profile', description: 'A Discord identity and the updates shared with this community.',
    signInTitle: 'Your profile starts with Discord', signInBody: 'Sign in to see your community identity and posts.',
    signIn: 'Log in with Discord', verified: 'Discord connected', posts: 'News posts',
    discordHandle: 'Discord handle', discordId: 'Discord ID', copy: 'Copy profile link', copied: 'Profile link copied',
    emptyTitle: 'Your posts will show up here', emptyBody: 'When you share news with the community, it will be collected on your profile.',
    member: 'Community member',
  },
  ar: {
    title: 'ملفك في المجتمع', description: 'هويتك على Discord والتحديثات التي شاركتها.',
    signInTitle: 'ابدأ ملفك بتسجيل الدخول عبر Discord', signInBody: 'سجّل الدخول لعرض هويتك ومنشوراتك في المجتمع.',
    signIn: 'تسجيل الدخول عبر Discord', verified: 'Discord متصل', posts: 'منشورات الأخبار',
    discordHandle: 'اسم Discord', discordId: 'معرّف Discord', copy: 'نسخ رابط الملف', copied: 'تم نسخ رابط الملف',
    emptyTitle: 'ستظهر منشوراتك هنا', emptyBody: 'ستُجمع الأخبار التي تشاركها مع المجتمع في ملفك الشخصي.',
    member: 'عضو في المجتمع',
  },
} satisfies Record<Locale, Record<string, string>>

export function ProfileSection({ currentUser, posts, locale, onSignIn }: ProfileSectionProps) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const labels = profileLabels[locale]
  const authoredPosts = currentUser ? posts.filter((post) => post.authorUsername.toLocaleLowerCase() === currentUser.username.toLocaleLowerCase()) : []

  async function copyProfileLink() {
    if (!currentUser) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/u/${encodeURIComponent(currentUser.username)}`)
      setCopied(true)
      setCopyError(false)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      setCopyError(true)
    }
  }

  if (!currentUser) {
    return (
      <section className="section-view" aria-labelledby="profile-title">
        <div className="section-heading"><span className="section-kicker"><UserRound aria-hidden="true" />{labels.member}</span><h1 id="profile-title">{labels.signInTitle}</h1><p>{labels.signInBody}</p></div>
        <button className="section-primary-button" type="button" onClick={onSignIn}>{labels.signIn}<ArrowUpRight aria-hidden="true" /></button>
      </section>
    )
  }

  return (
    <section className="section-view" aria-labelledby="profile-title">
      <div className="profile-banner" />
      <div className="profile-overview">
        {currentUser.avatarUrl ? <img className="profile-avatar" src={currentUser.avatarUrl} alt="" /> : <span className="profile-avatar profile-avatar-fallback"><UserRound aria-hidden="true" /></span>}
        <div className="profile-identity"><span className="profile-verified"><Check aria-hidden="true" />{labels.verified}</span><h1 id="profile-title">{currentUser.displayName}</h1><p>@{currentUser.username}</p></div>
        <button className="profile-copy-button" type="button" onClick={copyProfileLink}><Copy aria-hidden="true" />{copied ? labels.copied : labels.copy}</button>
      </div>
      {copyError && <p className="profile-copy-error" role="status">{locale === 'ar' ? 'تعذر نسخ الرابط. حاول مرة أخرى.' : 'Could not copy the link. Please try again.'}</p>}
      <p className="section-description">{labels.description}</p>
      <div className="profile-details">
        <div><span>{labels.discordHandle}</span><strong>@{currentUser.discordUsername}</strong></div>
        <div><span>{labels.discordId}</span><strong dir="ltr">{currentUser.discordId}</strong></div>
      </div>
      <section className="profile-posts" aria-labelledby="profile-posts-title">
        <div className="result-group-heading"><h2 id="profile-posts-title">{labels.posts}</h2><span>{authoredPosts.length}</span></div>
        {authoredPosts.length ? (
          <div className="news-list">{authoredPosts.map((post) => <article className="search-post" key={post.id}><span className="category-pill">{post.category}</span><h3>{post.title}</h3><p>{post.body}</p></article>)}</div>
        ) : (
          <div className="section-empty profile-empty"><span className="section-empty-icon"><Compass aria-hidden="true" /></span><h2>{labels.emptyTitle}</h2><p>{labels.emptyBody}</p></div>
        )}
      </section>
    </section>
  )
}

type ReelsSectionProps = { locale: Locale; onBrowseNews: () => void }

const reelLabels = {
  en: { title: 'Reels', description: 'Short videos from the Disloop community.', empty: 'No reels have been posted yet.', body: 'Once community members share a reel, it will appear here.', action: 'Back to News' },
  ar: { title: 'ريلز', description: 'مقاطع قصيرة من مجتمع Disloop.', empty: 'لم تُنشر أي ريلز بعد.', body: 'ستظهر مقاطع المجتمع هنا عند مشاركتها.', action: 'العودة إلى الأخبار' },
} satisfies Record<Locale, Record<string, string>>

export function ReelsSection({ locale, onBrowseNews }: ReelsSectionProps) {
  const labels = reelLabels[locale]
  return (
    <section className="section-view" aria-labelledby="reels-title">
      <div className="section-heading"><span className="section-kicker"><Video aria-hidden="true" />{labels.title}</span><h1 id="reels-title">{labels.title}</h1><p>{labels.description}</p></div>
      <div className="section-empty reels-empty"><span className="section-empty-icon"><Video aria-hidden="true" /></span><h2>{labels.empty}</h2><p>{labels.body}</p><button className="section-secondary-button" type="button" onClick={onBrowseNews}><Compass aria-hidden="true" />{labels.action}</button></div>
    </section>
  )
}
