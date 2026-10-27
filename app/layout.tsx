import { Analytics } from '@vercel/analytics/next'
import { Inter, Tajawal } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import { BRAND_BANNER_URL, BRAND_LOGO_URL } from '@/lib/brand-assets'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const tajawal = Tajawal({ subsets: ['arabic'], weight: ['400', '500', '700'], variable: '--font-tajawal' })

export const metadata: Metadata = {
  title: 'Disloop — A place for what’s happening',
  description: 'A welcoming community hub for Discord members to share news, moments, and ideas in Arabic and English.',
  applicationName: 'Disloop',
  metadataBase: new URL(process.env.SITE_URL ?? 'https://disloop.me'),
  openGraph: {
    title: 'Disloop — A place for what’s happening',
    description: 'A welcoming community hub for Discord members.',
    siteName: 'Disloop',
    type: 'website',
    images: [{ url: BRAND_BANNER_URL, width: 1920, height: 1080, alt: 'Disloop — News, reels and moments for your Discord community' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: [BRAND_BANNER_URL],
  },
  icons: {
    icon: BRAND_LOGO_URL,
    apple: BRAND_LOGO_URL,
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark light',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#111416' },
    { media: '(prefers-color-scheme: light)', color: '#f4f3ef' },
  ],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${tajawal.variable}`}>
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
