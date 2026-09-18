import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from './empty-state'
import { PageHeader } from './page-header'
import { cn } from '@/lib/utils'

/**
 * Marca um bloco cujos números ainda não saem do banco — tela desenhada,
 * backend pendente. Fica sempre no canto superior direito do card ou da
 * página para o time varrer o painel e achar num relance o que falta ligar
 * de ponta a ponta.
 */
export function MockBadge({ className }: { className?: string }) {
  return (
    <span
      title="Tela pronta, dados ainda não integrados"
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700',
        className,
      )}
    >
      Mock
    </span>
  )
}

/**
 * Casca das páginas que existem só para a navegação do protótipo funcionar.
 * Mantém cabeçalho, espaçamento e o selo de Mock iguais aos das telas reais,
 * então trocar este corpo pela tela de verdade não mexe no enquadramento.
 */
export function MockPage({
  title,
  description,
  icon,
  note = 'Esta área já está mapeada na navegação. A tela e a integração com os dados entram em uma próxima etapa.',
}: {
  title: string
  description: string
  icon?: LucideIcon
  note?: string
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description}>
        <MockBadge />
      </PageHeader>
      <Card className="border-dashed bg-card/60 shadow-none">
        <CardContent className="p-0">
          <EmptyState icon={icon} title="Em construção" description={note} />
        </CardContent>
      </Card>
    </div>
  )
}
