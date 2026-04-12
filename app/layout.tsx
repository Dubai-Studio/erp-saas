import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Next-ERP.PRO',
  description: 'ERP SaaS Européen',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
