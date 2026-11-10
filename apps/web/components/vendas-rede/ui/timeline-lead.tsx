import type { LucideIcon } from 'lucide-react'
import {
  ArrowRightLeft,
  CalendarClock,
  CircleDot,
  Handshake,
  Mail,
  MapPinned,
  MessageCircle,
  NotebookPen,
  Phone,
  Sparkles,
  Store,
  UserCheck,
  Undo2,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TONES, type ConsoleTone } from './tokens'
import type { EventoLead, TipoEvento } from './tipos'

const TIPOS: Record<TipoEvento, { icone: LucideIcon; tom: ConsoleTone; rotulo: string }> = {
  criado: { icone: Sparkles, tom: 'blue', rotulo: 'Lead criado' },
  reivindicado: { icone: UserCheck, tom: 'navy', rotulo: 'Reivindicado' },
  atribuido: { icone: Users, tom: 'navy', rotulo: 'Atribuído' },
  devolvido_pool: { icone: Undo2, tom: 'amber', rotulo: 'Voltou ao pool' },
  etapa: { icone: ArrowRightLeft, tom: 'violet', rotulo: 'Mudança de etapa' },
  ligacao: { icone: Phone, tom: 'green', rotulo: 'Ligação' },
  whatsapp: { icone: MessageCircle, tom: 'green', rotulo: 'WhatsApp' },
  email: { icone: Mail, tom: 'blue', rotulo: 'E-mail' },
  reuniao: { icone: Handshake, tom: 'violet', rotulo: 'Reunião' },
  visita: { icone: MapPinned, tom: 'violet', rotulo: 'Visita' },
  nota: { icone: NotebookPen, tom: 'neutral', rotulo: 'Anotação' },
  atendimento_balcao: { icone: Store, tom: 'coral', rotulo: 'Atendimento no balcão' },
  proximo_passo: { icone: CalendarClock, tom: 'amber', rotulo: 'Próximo passo' },
  conversao: { icone: Handshake, tom: 'green', rotulo: 'Conversão' },
  sistema: { icone: CircleDot, tom: 'neutral', rotulo: 'Sistema' },
}

/**
 * Linha do tempo do lead (mais recente primeiro, como vier em `eventos`).
 * Cada evento tem ícone e cor por tipo, o rótulo do tipo em texto, a frase e
 * quando/quem. Vazia, orienta a registrar o primeiro contato.
 */
export function TimelineLead({ eventos, className }: { eventos: EventoLead[]; className?: string }) {
  if (eventos.length === 0) {
    return (
      <p className={cn('m-0 rounded-xl bg-[#F2F4F7] px-4 py-3 text-sm text-muted-foreground', className)}>
        Ainda não há registros. Ligou ou mandou mensagem? Registre o contato para começar o histórico.
      </p>
    )
  }
  return (
    <ol className={cn('m-0 flex list-none flex-col p-0', className)} aria-label="Histórico do lead">
      {eventos.map((e, i) => {
        const { icone: Icone, tom, rotulo } = TIPOS[e.tipo]
        return (
          <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < eventos.length - 1 ? (
              <span aria-hidden="true" className="absolute left-4 top-9 bottom-0 w-px -translate-x-1/2 bg-border" />
            ) : null}
            <span
              aria-hidden="true"
              className={cn('relative inline-flex size-8 shrink-0 items-center justify-center rounded-full', TONES[tom].chip)}
            >
              <Icone className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
              <p className="m-0 text-sm leading-snug text-foreground">
                <span className="font-semibold">{rotulo}</span>
                {e.texto ? <span className="text-muted-foreground"> · {e.texto}</span> : null}
              </p>
              <p className="m-0 text-xs text-muted-foreground">
                {e.quando}
                {e.autor ? ` · ${e.autor}` : ''}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
