import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Hash, Video } from 'lucide-react'
import { getTagContent } from '@/lib/search'
import { RichText } from '@/components/mention-textarea'

type TagPageProps = { params: Promise<{ tag: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

function normalizeTag(value: string) {
  const tag = value.toLocaleLowerCase('en-US').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
  return /^[\p{L}\p{N}_-]{2,30}$/u.test(tag) ? tag : null
}

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { tag: rawTag } = await params
  const tag = normalizeTag(rawTag)
  if (!tag) return { title: 'Topic not found — Disloop' }
  return { title: `#${tag} — Disloop`, description: `Community news and Reels tagged #${tag}.` }
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const [{ tag: rawTag }, query] = await Promise.all([params, searchParams])
  const tag = normalizeTag(rawTag)
  if (!tag) notFound()
  const locale = query.lang === 'ar' ? 'ar' : 'en'
  const labels = locale === 'ar'
    ? { kicker: 'موضوع في ديسلوب', description: 'أخبار ومقاطع قصيرة ولحظات يومية حول هذا الموضوع.', news: 'الأخبار', reels: 'ريلز', daily: 'لحظات يومية', communityReel: 'ريلز المجتمع', empty: 'لا توجد منشورات حول هذا الموضوع بعد.', back: 'العودة إلى ديسلوب' }
    : { kicker: 'DISLOOP TOPIC', description: 'News, short videos, and daily moments shared around this topic.', news: 'News', reels: 'Reels', daily: 'Daily moments', communityReel: 'Community Reel', empty: 'No posts for this topic yet.', back: 'Back to Disloop' }
  const { posts, reels, dailyPosts } = await getTagContent(tag)

  return <main className="disloop-shell public-profile-page" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale}><section className="section-view" aria-labelledby="tag-title"><div className="section-heading"><span className="section-kicker"><Hash aria-hidden="true" />{labels.kicker}</span><h1 id="tag-title" dir="ltr">#{tag}</h1><p>{labels.description}</p></div>
    {posts.length > 0 && <section className="profile-posts"><div className="result-group-heading"><h2>{labels.news}</h2><span>{posts.length}</span></div><div className="news-list">{posts.map((post) => <article className="search-post" key={post.id}><span className="category-pill" dir="auto">{post.category}</span><h2 dir="auto">{post.title}</h2><p dir="auto">{post.body}</p>{post.authorName !== 'Disloop Community' && <a className="tag-author-link" href={`/u/${encodeURIComponent(post.authorUsername)}`}>@{post.authorUsername}</a>}</article>)}</div></section>}
    {reels.length > 0 && <section className="profile-posts tag-reel-results"><div className="result-group-heading"><h2>{labels.reels}</h2><span>{reels.length}</span></div><div className="reel-list">{reels.map((reel) => <article className="reel-card" key={reel.id}><video className="reel-video" controls playsInline preload="metadata" src={reel.videoUrl} aria-label={reel.caption || labels.communityReel} /><div className="reel-card-content"><h2>{reel.caption || labels.communityReel}</h2>{reel.authorName !== 'Disloop Community' && <a className="tag-author-link" href={`/u/${encodeURIComponent(reel.authorUsername)}`}>@{reel.authorUsername}</a>}<span className="tag-reel-likes"><Video aria-hidden="true" />{reel.likeCount}</span></div></article>)}</div></section>}
    {dailyPosts.length > 0 && <section className="profile-posts tag-reel-results"><div className="result-group-heading"><h2>{labels.daily}</h2><span>{dailyPosts.length}</span></div><div className="news-list">{dailyPosts.map((post) => <article className="search-post" key={post.id}><p dir="auto"><RichText text={post.body} /></p>{post.mediaUrl && <img className="daily-post-media" src={post.mediaUrl} alt={locale === 'ar' ? 'لحظة من المجتمع' : 'Community moment'} />}{post.authorUsername !== 'community-member' && <a className="tag-author-link" href={`/u/${encodeURIComponent(post.authorUsername)}`} dir="ltr">@{post.authorUsername}</a>}</article>)}</div></section>}
    {!posts.length && !reels.length && !dailyPosts.length && <div className="section-empty"><span className="section-empty-icon"><Hash aria-hidden="true" /></span><h2>{labels.empty}</h2></div>}
    <a className="section-secondary-button tag-back-link" href="/">{labels.back}</a>
  </section></main>
}
