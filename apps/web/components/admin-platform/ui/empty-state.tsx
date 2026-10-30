import type { LucideIcon } from 'lucide-react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/admin-platform/ui/button'
import { CARD_SURFACE } from '@/components/admin-platform/ui/tone'
import { cn } from '@/lib/utils'

/**
 * EmptyState — o estado "sem dados" e "deu erro" de TODA tela do console
 * (/admin). Nunca deixe uma área em branco, uma barra cinza ou um texto solto:
 * mostre o ícone, diga o que está acontecendo e, se houver, o próximo passo.
 *
 * - `icon`: ícone do lucide, desenhado num círculo na cor do tom, com anéis
 *   suaves em volta (decorativo).
 * - `satellites` (opcional): até 2 ícones pequenos em tom claro orbitando o
 *   principal — dão contexto ("faturas", "clubes") sem virar ilustração.
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

const TONES: Record<Tone, { core: string; halo: string }> = {
  default: { core: 'bg-[#E5EDF5] text-secondary', halo: 'bg-[#E5EDF5]/55' },
  success: { core: 'bg-[#DCFAE6] text-[#067647]', halo: 'bg-[#ECFDF3]/80' },
  warning: { core: 'bg-[#FEF0C7] text-[#B54708]', halo: 'bg-[#FFFAEB]/90' },
}

const SIZES: Record<
  Size,
  {
    wrap: string
    stage: string
    halo: string
    core: string
    icon: string
    sat: string
    satIcon: string
    title: string
    text: string
  }
> = {
  sm: {
    wrap: 'gap-1 px-4 py-7',
    stage: 'size-20',
    halo: 'inset-[14%]',
    core: 'size-11 ring-4',
    icon: 'size-5',
    sat: 'size-7',
    satIcon: 'size-3.5',
    title: 'text-base',
    text: 'text-sm',
  },
  md: {
    wrap: 'gap-1.5 px-6 py-10',
    stage: 'size-28',
    halo: 'inset-[15%]',
    core: 'size-14 ring-[6px]',
    icon: 'size-6',
    sat: 'size-8',
    satIcon: 'size-4',
    title: 'text-[17px]',
    text: 'text-sm',
  },
  lg: {
    wrap: 'gap-2 px-6 py-14',
    stage: 'size-32',
    halo: 'inset-[15%]',
    core: 'size-16 ring-8',
    icon: 'size-7',
    sat: 'size-9',
    satIcon: 'size-[18px]',
    title: 'text-lg',
    text: 'text-[15px]',
  },
}

/** Ícone principal com anéis suaves e, se houver, os satélites (tudo decorativo). */
function EmptyArt({
  icon: Icon,
  tone,
  size,
  satellites,
}: {
  icon: LucideIcon
  tone: Tone
  size: Size
  satellites?: LucideIcon[]
}) {
  const t = TONES[tone]
  const s = SIZES[size]
  const [first, second] = satellites ?? []
  return (
    <span className={cn('relative mb-3 inline-flex shrink-0 items-center justify-center', s.stage)} aria-hidden="true">
      {/* anel externo, bem fino */}
      <span className="absolute inset-0 rounded-full border border-[#E4E9F0]" />
      {/* halo do tom */}
      <span className={cn('absolute rounded-full', s.halo, t.halo)} />
      {/* círculo principal */}
      <span
        className={cn(
          'relative inline-flex items-center justify-center rounded-full ring-white shadow-[0_1px_3px_rgba(16,24,40,0.08)]',
          s.core,
          t.core,
        )}
      >
        <Icon className={s.icon} />
      </span>
      {first ? <Satellite icon={first} className={cn(s.sat, 'left-0 top-[8%]')} iconClass={s.satIcon} /> : null}
      {second ? <Satellite icon={second} className={cn(s.sat, 'bottom-[6%] right-0')} iconClass={s.satIcon} /> : null}
    </span>
  )
}

function Satellite({ icon: Icon, className, iconClass }: { icon: LucideIcon; className: string; iconClass: string }) {
  return (
    <span
      className={cn(
        'absolute inline-flex items-center justify-center rounded-full border border-[#E4E9F0] bg-white text-[#98A2B3] shadow-[0_1px_2px_rgba(16,24,40,0.06)]',
        className,
      )}
    >
      <Icon className={iconClass} />
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'default',
  size = 'md',
  framed = false,
  satellites,
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
  /** Até 2 ícones pequenos ao redor do principal (decorativos). */
  satellites?: LucideIcon[]
  role?: 'alert' | 'status'
  className?: string
}) {
  const s = SIZES[size]
  return (
    <div
      role={role}
      className={cn(
        'flex min-w-0 flex-col items-center justify-center text-center',
        s.wrap,
        framed && CARD_SURFACE,
        className,
      )}
    >
      <EmptyArt icon={icon} tone={tone} size={size} satellites={satellites?.slice(0, 2)} />
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
