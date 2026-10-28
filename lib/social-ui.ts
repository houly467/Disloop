export function formatSocialCount(count: number, locale: 'en' | 'ar' = 'en') {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar' : 'en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(count)
}

export function getOptimisticLikeState(current: { count?: number; likedByMe?: boolean } | null | undefined) {
  const liked = Boolean(current?.likedByMe)
  return {
    count: Math.max(0, (current?.count ?? 0) + (liked ? -1 : 1)),
    likedByMe: !liked,
  }
}
