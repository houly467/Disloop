export function NewAccountBadge({ isNew, locale = 'en' }: { isNew: boolean; locale?: 'en' | 'ar' }) {
  if (!isNew) return null
  return <span className="new-account-badge">{locale === 'ar' ? 'حساب جديد' : 'New account'}</span>
}
