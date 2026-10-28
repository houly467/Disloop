export type ErrorLocale = 'en' | 'ar'

const messages: Record<ErrorLocale, Record<string, string>> = {
  en: {
    not_logged_in: 'Please log in again.',
    unauthorized: 'Please log in again.',
    not_a_member: 'You are not a member of the server yet.',
    membership_required: 'You are not a member of the server yet.',
    server_membership_required: 'You are not a member of the server yet.',
    banned: 'This account is banned from the community.',
    discord_unavailable: 'Discord is not responding. Try again in a minute.',
    membership_unavailable: 'Discord is not responding. Try again in a minute.',
    invalid_input: 'Check the information and try again.',
    unsupported_file_type: 'Unsupported file type.',
    invalid_image_type: 'Unsupported file type.',
    image_too_large: 'File is too large.',
    file_too_large: 'File is too large.',
    storage_unavailable: 'Uploads are temporarily unavailable. Please retry.',
    upload_unavailable: 'Uploads are temporarily unavailable. Please retry.',
    upload_path_failed: 'Uploads are temporarily unavailable. Please retry.',
    invalid_upload_path: 'Please select the file again and retry.',
    upload_failed: 'The upload failed. Please retry.',
    reel_media_unavailable: 'The uploaded video could not be verified. Please choose it again and retry.',
  },
  ar: {
    not_logged_in: 'يرجى تسجيل الدخول مرة أخرى.',
    unauthorized: 'يرجى تسجيل الدخول مرة أخرى.',
    not_a_member: 'لست عضوًا في السيرفر بعد.',
    membership_required: 'لست عضوًا في السيرفر بعد.',
    server_membership_required: 'لست عضوًا في السيرفر بعد.',
    banned: 'هذا الحساب محظور من المجتمع.',
    discord_unavailable: 'Discord لا يستجيب. حاول مرة أخرى بعد دقيقة.',
    membership_unavailable: 'Discord لا يستجيب. حاول مرة أخرى بعد دقيقة.',
    invalid_input: 'تحقق من البيانات وحاول مرة أخرى.',
    unsupported_file_type: 'نوع الملف غير مدعوم.',
    invalid_image_type: 'نوع الملف غير مدعوم.',
    image_too_large: 'حجم الملف كبير جدًا.',
    file_too_large: 'حجم الملف كبير جدًا.',
    storage_unavailable: 'الرفع غير متاح مؤقتًا. حاول مرة أخرى.',
    upload_unavailable: 'الرفع غير متاح مؤقتًا. حاول مرة أخرى.',
    upload_path_failed: 'الرفع غير متاح مؤقتًا. حاول مرة أخرى.',
    invalid_upload_path: 'اختر الملف مرة أخرى ثم أعد المحاولة.',
    upload_failed: 'تعذر رفع الملف. حاول مرة أخرى.',
    reel_media_unavailable: 'تعذر التحقق من الفيديو المرفوع. اختره مرة أخرى ثم أعد المحاولة.'
  },
}

export function localizedUploadError(code: string, locale: ErrorLocale, fallback: string) {
  const [reason, retryAfter] = code.split(':')
  if (reason === 'rate_limited') {
    const parsedRetryAfter = Number.parseInt(retryAfter ?? '', 10)
    const seconds = Number.isFinite(parsedRetryAfter) && parsedRetryAfter > 0 ? parsedRetryAfter : 300
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return locale === 'ar'
      ? `طلبات كثيرة. حاول مرة أخرى بعد ${minutes} دقيقة و${remainingSeconds} ثانية.`
      : `Too many requests. Try again in ${minutes}m ${remainingSeconds}s.`
  }
  return messages[locale][reason] ?? fallback
}
