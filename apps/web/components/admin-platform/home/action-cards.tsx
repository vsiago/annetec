import Link from 'next/link'
import { ArrowRight, CircleCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActionItem } from './derive'

const DOT_TONES: Record<ActionItem['tone'], string> = {
  warning: 'bg-[#F79009]',
  danger: 'bg-[#B42318]',
}

/**
 * "Precisa de você": um cartão por pendência, só dos que têm algo a fazer.
 * Sem pendência nenhuma, um único cartão diz que está tudo em dia.
 */
export function ActionSection({ items }: { items: ActionItem[] }) {
  return (
    <section aria-labelledby="home-pendencias" className="flex flex-col gap-4">
      <h2 id="home-pendencias" className="m-0 text-lg font-bold text-foreground">
        Precisa de você
      </h2>
      {items.length === 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-white px-6 py-[22px]">
          <CircleCheck className="mt-0.5 size-6 shrink-0 text-[#067647]" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <strong className="text-[19px] leading-snug text-foreground">Tudo em dia por aqui.</strong>
            <span className="text-sm leading-relaxed text-muted-foreground">
              Nenhum clube esperando aprovação, nenhuma fatura em atraso e todos os clubes recebem as mensalidades.
            </span>
          </div>
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4 p-0">
          {items.map(item => (
            <li
              key={item.key}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-white px-6 pb-3 pt-[22px]"
            >
              <div className="flex items-center gap-2">
                <span className={cn('size-2.5 shrink-0 rounded-full', DOT_TONES[item.tone])} aria-hidden="true" />
                <p className="m-0 text-[13px] font-medium text-muted-foreground">{item.area}</p>
              </div>
              <strong className="text-[19px] leading-snug text-foreground">{item.title}</strong>
              <span className="text-sm leading-relaxed text-muted-foreground">{item.detail}</span>
              <Link
                href={item.href}
                className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start rounded-md text-sm font-semibold text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
              >
                {item.cta}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
