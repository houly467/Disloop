'use client'

import { ArrowUpRight, X } from 'lucide-react'
import { ModalPortal } from '@/components/modal-portal'

export function DiscordJoinModal({ open, inviteUrl, locale, onClose }: {
  open: boolean
  inviteUrl: string | null
  locale: 'en' | 'ar'
  onClose: () => void
}) {
  if (!open) return null

  const isArabic = locale === 'ar'
  return (
    <ModalPortal
      backdropClassName="social-composer-modal-backdrop"
      dialogClassName="social-composer-modal discord-join-modal"
      labelId="discord-join-modal-title"
      onClose={onClose}
    >
      <div className="social-composer-modal-heading">
        <h2 id="discord-join-modal-title">
          {isArabic ? 'انضم إلى Discord حتى تتمكن من نشر الريلز والأخبار والقصص' : 'Join Our Discord So you can post reels, news, story'}
        </h2>
        <button className="icon-button" type="button" onClick={onClose} aria-label={isArabic ? 'إغلاق' : 'Close'}>
          <X aria-hidden="true" />
        </button>
      </div>
      <p>{isArabic ? 'انضم إلى مجتمع Disloop للنشر.' : 'Join the Disloop Discord community to publish content.'}</p>
      {inviteUrl && (
        <a className="section-primary-button" href={inviteUrl} target="_blank" rel="noreferrer">
          {isArabic ? 'انضم إلى Discord' : 'Join Disloop Discord'} <ArrowUpRight aria-hidden="true" />
        </a>
      )}
    </ModalPortal>
  )
}
