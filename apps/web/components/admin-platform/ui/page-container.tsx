import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * PageContainer — o contêiner de TODA tela do console da plataforma (/admin).
 *
 * Padrão (uma regra só, vale para todas as telas):
 *  - Largura e margem: ficam no `app/admin/layout.tsx` (`p-4 lg:p-6`, sem
 *    largura máxima). A tela ocupa toda a área ao lado do menu. NUNCA ponha
 *    `max-w-*` / `mx-auto` na raiz de uma página: foi o que deixava o Início
 *    mais estreito que as outras telas.
 *  - Ritmo vertical: `gap-6` entre as seções da página (cabeçalho, filtros,
 *    cartões, tabelas). Dentro de uma seção use `gap-4`.
 *
 * Use como raiz de cada `page.tsx`:
 *
 *   <PageContainer>
 *     <PageHeader title="..." />
 *     <SectionCard>...</SectionCard>
 *   </PageContainer>
 *
 * `size="form"` é só para telas de formulário (cadastro), onde linhas de
 * campo muito largas atrapalham a leitura; continua alinhado à esquerda.
 */
export function PageContainer({
  children,
  size = 'full',
  className,
}: {
  children: ReactNode
  size?: 'full' | 'form'
  className?: string
}) {
  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-6', size === 'form' && 'max-w-4xl', className)}>
      {children}
    </div>
  )
}
