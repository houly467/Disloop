export function buildContentSecurityPolicy(nonce: string, isDevelopment = process.env.NODE_ENV === 'development') {
  const developmentScriptSource = isDevelopment ? " 'unsafe-eval'" : ''

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentScriptSource}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https://*.vercel-storage.com https://vercel.com",
    "frame-src https://www.youtube.com https://open.spotify.com https://w.soundcloud.com https://embed.music.apple.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}
