export function formatSocialCount(count: number, locale: 'en' | 'ar' = 'en') {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar' : 'en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(count)
}
