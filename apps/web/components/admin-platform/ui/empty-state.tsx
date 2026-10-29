import type { LucideIcon } from 'lucide-react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/admin-platform/ui/button'
import { cn } from '@/lib/utils'

/**
 * EmptyState — o estado "sem dados" e "deu erro" de TODA tela do console
 * (/admin). Nunca deixe uma área em branco, uma barra cinza ou um texto solto:
 * mostre o ícone, diga o que está acontecendo e, se houver, o próximo passo.
 *
 * - `icon`: ícone do lucide, desenhado num círculo suave (decorativo).
 * - `title`: frase curta (16–18px). `description`: uma frase de apoio.
 * - `action`: botão opcional (`Button` de `ui/button` — `asChild` + `Link`
 *   para navegar). No máximo uma ação principal.
 * - `tone`: `default` (nada ainda / nenhum resultado), `success` (tudo certo),
 *   `warning` (erro ao carregar, algo pede atenção).
 * - `size`: `sm` dentro de cartões pequenos e listas, `md` (padrão) dentro de
 *   um SectionCard/tabela, `lg` quando é a tela inteira.
 * - `framed`: desenha o próprio cartão (use quando o estado vazio ocupa o
 *   lugar de um cartão inteiro, fora de um SectionCard).
 *
 * Erro de carregamento: use `ErrorState` (já traz o botão "Tentar de novo").
 */

type Tone = 'default' | 'success' | 'warning'
type Size = 'sm' | 'md' | 'lg'

const TONES: Record<Tone, { chip: string; ring: string }> = {
  default: { chip: 'bg-accent text-secondary', ring: 'ring-accent/60' },
  success: { chip: 'bg-[#ECFDF3] text-[#067647]', ring: 'ring-[#ECFDF3]/70' },
  warning: { chip: 'bg-[#FFFAEB] text-[#B54708]', ring: 'ring-[#FFFAEB]/80' },
}

const SIZES: Record<Size, { wrap: string; chip: string; icon: string; title: string; text: string }> = {
  sm: { wrap: 'gap-1 px-4 py-8', chip: 'size-11 ring-4', icon: 'size-5', title: 'text-base', text: 'text-sm' },
  md: { wrap: 'gap-1.5 px-6 py-12', chip: 'size-14 ring-[6px]', icon: 'size-6', title: 'text-[17px]', text: 'text-sm' },
  lg: { wrap: 'gap-2 px-6 py-16', chip: 'size-16 ring-8', icon: 'size-7', title: 'text-lg', text: 'text-[15px]' },
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'default',
  size = 'md',
  framed = false,
  role,
  className,
}: {
  icon: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  tone?: Tone
  size?: Size
  framed?: boolean
  role?: 'alert' | 'status'
  className?: string
}) {
  const t = TONES[tone]
  const s = SIZES[size]
  return (
    <div
      role={role}
      className={cn(
        'flex min-w-0 flex-col items-center justify-center text-center',
        s.wrap,
        framed && 'rounded-2xl border border-border bg-card shadow-sm',
        className,
      )}
    >
      <span
        className={cn('mb-3 inline-flex shrink-0 items-center justify-center rounded-full', s.chip, t.chip, t.ring)}
        aria-hidden="true"
      >
        <Icon className={s.icon} />
      </span>
      <p className={cn('m-0 font-semibold leading-snug text-foreground', s.title)}>{title}</p>
      {description ? (
        <p className={cn('m-0 max-w-md leading-relaxed text-muted-foreground', s.text)}>{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex flex-wrap items-center justify-center gap-3">{action}</div> : null}
    </div>
  )
}

/**
 * ErrorState — falha ao carregar. Mesmo visual do EmptyState em tom de alerta,
 * com o botão "Tentar de novo" quando a tela sabe recarregar (`onRetry`).
 */
export function ErrorState({
  title = 'Não foi possível carregar esta página',
  description = 'Verifique sua internet e tente de novo.',
  onRetry,
  size = 'md',
  framed = true,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  onRetry?: () => void
  size?: Size
  framed?: boolean
  className?: string
}) {
  return (
    <EmptyState
      role="alert"
      tone="warning"
      icon={TriangleAlert}
      title={title}
      description={description}
      size={size}
      framed={framed}
      className={className}
      action={
        onRetry ? (
          <Button type="button" variant="outline" className="h-11 rounded-[10px] px-4 font-semibold" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            Tentar de novo
          </Button>
        ) : undefined
      }
    />
  )
}
