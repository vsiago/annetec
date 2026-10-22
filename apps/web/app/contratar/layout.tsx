import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Contratar a plataforma | ANNETEC',
  description:
    'Lance o clube de benefícios da sua empresa, entidade ou organização com a ANNETEC: contratação 100% online, análise cadastral e ativação automática após a aprovação.',
  robots: { index: true, follow: true },
}

export default function ContratarLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-background">{children}</div>
}
