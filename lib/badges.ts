export type BadgeDefinition = {
  id: string
  name: string
  nameAr: string
  description: string
  descriptionAr: string
  image: string
  threshold?: number
}

const blob = 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/'

export const BADGES: BadgeDefinition[] = [
  { id: 'booster', name: 'Booster', nameAr: 'الداعم', description: 'Boosted the Disloop Discord server.', descriptionAr: 'ساهم في دعم خادم Discord الخاص بـ Disloop.', image: `${blob}badge-booster-DI2r0yCQBTop4ERiEoHZsnq1OO5aXm.png` },
  { id: 'bug-hunter', name: 'Bug Hunter', nameAr: 'صائد الأخطاء', description: 'Helped find and report a product bug.', descriptionAr: 'ساعد في اكتشاف خطأ والإبلاغ عنه.', image: `${blob}badge-bug-hunter-o737UDXiztRkTOY4Iqh5DWtPm6BH6i.png` },
  { id: 'creator', name: 'Creator', nameAr: 'صانع المحتوى', description: 'Published a community post or Reel.', descriptionAr: 'نشر منشورًا أو ريلز للمجتمع.', image: `${blob}badge-creator-VWDD4eZdePMqqc5WrbkE9WSlhkE5lK.png` },
  { id: 'developer', name: 'Developer', nameAr: 'مطوّر', description: 'Contributed to building Disloop.', descriptionAr: 'ساهم في تطوير Disloop.', image: `${blob}badge-developer-aqQ7ATH4y8jAVzgj3PVQMQiFR3tbd5.png` },
  { id: 'early-supporter', name: 'Early Supporter', nameAr: 'داعم مبكر', description: 'Joined during the early community launch.', descriptionAr: 'انضم إلى المجتمع في بدايته.', image: `${blob}badge-early-supporter-OkOp9W4g0TLEaMqU1O9GZU6YhHG6BL.png` },
  { id: 'event-winner', name: 'Event Winner', nameAr: 'فائز الفعالية', description: 'Won a Disloop community event.', descriptionAr: 'فاز بفعالية مجتمعية في Disloop.', image: `${blob}badge-event-winner-oqYcaEmVXylayaGAH28uZp46RcaPFX.png` },
  { id: 'level-1-newcomer', name: 'Level 1 · Newcomer', nameAr: 'المستوى ١ · عضو جديد', description: 'Reach 25 XP.', descriptionAr: 'اجمع ٢٥ نقطة خبرة.', image: `${blob}badge-level-1-newcomer-GIByXu3w7j4zOfoBTUshGgiNKtcMGd.png`, threshold: 25 },
  { id: 'level-5-member', name: 'Level 5 · Member', nameAr: 'المستوى ٥ · عضو', description: 'Reach 100 XP.', descriptionAr: 'اجمع ١٠٠ نقطة خبرة.', image: `${blob}badge-level-5-member-UUct2zegxr7MT09t6M78r14rQ5hkzR.png`, threshold: 100 },
  { id: 'level-10-active', name: 'Level 10 · Active', nameAr: 'المستوى ١٠ · نشط', description: 'Reach 250 XP.', descriptionAr: 'اجمع ٢٥٠ نقطة خبرة.', image: `${blob}badge-level-10-active-AMe9gtLB9YWM2x4oPTolBKspcrp9uf.png`, threshold: 250 },
  { id: 'level-25-elite', name: 'Level 25 · Elite', nameAr: 'المستوى ٢٥ · مميز', description: 'Reach 1,000 XP.', descriptionAr: 'اجمع ١٬٠٠٠ نقطة خبرة.', image: `${blob}badge-level-25-elite-nX3QId37Csnza4W2T5cJH8t9rUQ4C8.png`, threshold: 1000 },
  { id: 'level-50-legend', name: 'Level 50 · Legend', nameAr: 'المستوى ٥٠ · أسطوري', description: 'Reach 2,500 XP.', descriptionAr: 'اجمع ٢٬٥٠٠ نقطة خبرة.', image: `${blob}badge-level-50-legend-MKIpY9pEClFvHc5gqeedHdc1ZPTPsN.png`, threshold: 2500 },
  { id: 'moderator', name: 'Moderator', nameAr: 'مشرف', description: 'A community moderator.', descriptionAr: 'مشرف في المجتمع.', image: `${blob}badge-moderator-PWkgJR0pzQbQPyDlayWtBuycJI3Cbj.png` },
  { id: 'og-member', name: 'OG Member', nameAr: 'عضو قديم', description: 'Part of the original Disloop community.', descriptionAr: 'من أعضاء مجتمع Disloop الأوائل.', image: `${blob}badge-og-member-88ZAnOZMm9my4OYKpE3EgTHYEYZlle.png` },
  { id: 'partner', name: 'Partner', nameAr: 'شريك', description: 'An official Disloop community partner.', descriptionAr: 'شريك رسمي لمجتمع Disloop.', image: `${blob}badge-partner-mfYsL207LYQCqkJIjPVUcZxQ7r53M6.png` },
  { id: 'staff', name: 'Staff', nameAr: 'فريق العمل', description: 'A member of the Disloop team.', descriptionAr: 'أحد أعضاء فريق Disloop.', image: `${blob}badge-staff-Wb9bivEfq7kOlmoRMrA9NafjOeZRhU.png` },
  { id: 'verified', name: 'Verified', nameAr: 'موثّق', description: 'Verified through the Disloop community.', descriptionAr: 'تم التحقق منه عبر مجتمع Disloop.', image: `${blob}badge-verified-q0RZoHVs5Bxw5LC5KrIoSe4QSoKnHo.png` },
  { id: 'daily-loop', name: 'Daily Loop', nameAr: 'حلقة يومية', description: 'Stay active on consecutive days.', descriptionAr: 'حافظ على نشاطك لأيام متتالية.', image: `${blob}badge-level-10-active-AMe9gtLB9YWM2x4oPTolBKspcrp9uf.png` },
  { id: 'top-maker', name: 'Top Maker', nameAr: 'صانع الأبرز', description: 'Earned each time a post enters the daily Top 3 or when you reach Level 50.', descriptionAr: 'تُكتسب عند دخول أحد منشوراتك ضمن أبرز ٣ منشورات يومية أو عند بلوغ المستوى ٥٠.', image: '/badges/badge-top-maker.png' },
]

export const BADGE_BY_ID = new Map(BADGES.map((badge) => [badge.id, badge]))
export const XP_LEVEL_BADGES: Array<BadgeDefinition & { threshold: number }> = BADGES.filter(
  (badge): badge is BadgeDefinition & { threshold: number } => typeof badge.threshold === 'number',
)
export const BADGE_LEVEL_THRESHOLDS = XP_LEVEL_BADGES.map((badge) => badge.threshold)
