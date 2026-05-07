import type { Metadata } from 'next'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const ibmPlexSans = IBM_Plex_Sans({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-sans',
})

const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'Afet Hasar Analizi',
  description: 'Uydu görüntüsü tabanlı afet hasar analiz sistemi',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body
        className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} font-sans bg-slate-900 text-slate-100 min-h-screen antialiased`}
      >
        {children}
      </body>
    </html>
  )
}
