export function isNewAccount(createdAt: string | null | undefined) {
  if (!createdAt) return false
  const age = Date.now() - new Date(createdAt).getTime()
  return age >= 0 && age < 3 * 24 * 60 * 60 * 1000
}

export function NewAccountBadge({ createdAt, locale = 'en' }: { createdAt: string | null | undefined; locale?: 'en' | 'ar' }) {
  if (!isNewAccount(createdAt)) return null
  return <span className="new-account-badge">{locale === 'ar' ? 'حساب جديد' : 'New account'}</span>
}
