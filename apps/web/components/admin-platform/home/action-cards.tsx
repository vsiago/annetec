import Link from 'next/link'
import { ArrowRight, CircleCheck, ClipboardCheck, Landmark, Receipt, type LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { SectionHeading } from '@/components/admin-platform/ui/section-card'
import { cn } from '@/lib/utils'
import type { ActionItem } from './derive'

/** Ícone de cada pendência (a chave vem de `buildActionItems`). */
const ITEM_ICONS: Record<ActionItem['key'], LucideIcon> = {
  approvals: ClipboardCheck,
  billing: Receipt,
  clubs: Landmark,
}

/** Cor do ícone conforme a situação: âmbar pede atenção, vermelho está atrasado. */
const CHIP_TONES: Record<ActionItem['tone'], string> = {
  warning: 'bg-[#FFFAEB] text-[#B54708]',
  danger: 'bg-[#FEF3F2] text-[#B42318]',
}

/**
 * "Precisa de você": um cartão por pendência, só dos que têm algo a fazer.
 * Sem pendência nenhuma, um único cartão diz que está tudo em dia.
 */
export function ActionSection({ items }: { items: ActionItem[] }) {
  return (
    <section aria-labelledby="home-pendencias" className="flex flex-col gap-4">
      <SectionHeading id="home-pendencias" title="Precisa de você" />
      {items.length === 0 ? (
        <EmptyState
          framed
          tone="success"
          size="md"
          icon={CircleCheck}
          title="Tudo em dia por aqui."
          description="Nenhum clube esperando aprovação, nenhuma fatura em atraso e todos os clubes recebem as mensalidades."
          className="py-10"
        />
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4 p-0">
          {items.map(item => {
            const Icon = ITEM_ICONS[item.key]
            return (
              <li
                key={item.key}
                className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card px-6 pb-3 pt-[22px] shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn('inline-flex size-11 shrink-0 items-center justify-center rounded-full', CHIP_TONES[item.tone])}
                    aria-hidden="true"
                  >
                    <Icon className="size-5" />
                  </span>
                  <p className="m-0 text-[13px] font-medium text-muted-foreground">{item.area}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <strong className="text-[19px] leading-snug text-foreground">{item.title}</strong>
                  <span className="text-sm leading-relaxed text-muted-foreground">{item.detail}</span>
                </div>
                <Link
                  href={item.href}
                  className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start rounded-md text-sm font-semibold text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
                >
                  {item.cta}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
