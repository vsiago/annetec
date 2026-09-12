import type { Metadata } from 'next'
import { Inter, Saira } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Providers } from '@/components/providers'
import './globals.css'

const inter = Inter({ 
  subsets: ["latin"],
  variable: '--font-inter',
  display: 'swap',
})

/**
 * Fonte dos títulos. Variável em peso E em largura (eixo `wdth`), então um
 * único arquivo cobre de 100 a 900 e de condensada a expandida — a Barlow,
 * alternativa considerada, só existe em versões estáticas (9 arquivos).
 */
const saira = Saira({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-saira',
  display: 'swap',
  axes: ['wdth'],
})

export const metadata: Metadata = {
  title: 'Annetec | Plano de Assistência Familiar - Saúde & Bem-Estar',
  description: 'A Annetec é o primeiro Plano de Assistência com benefícios incríveis para cuidar da Saúde & Bem-Estar de toda a família. Consultas, odontologia, farmácia e muito mais por apenas R$ 14,90/mês.',
  keywords: ['plano de assistência', 'saúde', 'bem-estar', 'clube de benefícios', 'odontologia', 'consultas médicas', 'teleorientação'],
  authors: [{ name: 'ANNETEC' }],
  openGraph: {
    title: 'Annetec | Plano de Assistência Familiar',
    description: 'Benefícios incríveis para cuidar da Saúde & Bem-Estar de toda a família.',
    type: 'website',
    locale: 'pt_BR',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${saira.variable} bg-background`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>
          {children}
        </Providers>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
