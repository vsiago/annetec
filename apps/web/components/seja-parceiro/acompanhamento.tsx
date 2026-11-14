'use client'

import Link from 'next/link'
import { ArrowLeft, Check, CircleX, Clock, LogIn, Send } from 'lucide-react'
import {
  CANDIDATURA_ATUACAO_LABELS,
  CANDIDATURA_STATUS_LABELS,
  type CandidaturaPublica,
} from '@annetec/contracts'
import { Notice, Panel, Pill } from '@/components/contratar/ui'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/adapters/contratacao'
import { cn } from '@/lib/utils'
import { homePath, loginPath, type Escopo } from './escopo'

type Etapa = { titulo: string; detalhe?: string; estado: 'feito' | 'atual' | 'pendente' | 'recusado' }

function etapas(view: CandidaturaPublica): Etapa[] {
  const decidida = view.status === 'aprovada' || view.status === 'recusada'
  return [
    {
      titulo: 'Candidatura recebida',
      detalhe: view.enviadaEm ? formatDateTime(view.enviadaEm) : undefined,
      estado: 'feito',
    },
    {
      titulo: 'Em análise',
      detalhe: decidida ? undefined : 'Nossa equipe está conferindo seus dados e documentos.',
      estado: decidida ? 'feito' : 'atual',
    },
    {
      titulo: view.status === 'aprovada' ? 'Aprovada' : view.status === 'recusada' ? 'Recusada' : 'Decisão',
      detalhe: view.decididaEm ? formatDateTime(view.decididaEm) : 'Você será avisado por e-mail.',
      estado: view.status === 'aprovada' ? 'feito' : view.status === 'recusada' ? 'recusado' : 'pendente',
    },
  ]
}

/** Candidatura já enviada: linha do tempo e o desfecho (acesso liberado ou motivo da recusa). */
export function Acompanhamento({ escopo, view }: { escopo: Escopo; view: CandidaturaPublica }) {
  const tone = view.status === 'aprovada' ? 'success' : view.status === 'recusada' ? 'danger' : 'info'
  return (
    <div className="space-y-6">
      <Panel className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Acompanhamento</p>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              {view.status === 'aprovada'
                ? 'Candidatura aprovada'
                : view.status === 'recusada'
                  ? 'Candidatura não aprovada'
                  : 'Candidatura em análise'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {view.nome} · {CANDIDATURA_ATUACAO_LABELS[view.atuacao]}
            </p>
          </div>
          <Pill tone={tone}>{CANDIDATURA_STATUS_LABELS[view.status]}</Pill>
        </div>

        <ol className="space-y-4" aria-label="Andamento da candidatura">
          {etapas(view).map(etapa => (
            <li key={etapa.titulo} className="flex gap-3" aria-current={etapa.estado === 'atual' ? 'step' : undefined}>
              <span
                className={cn(
                  'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2',
                  etapa.estado === 'feito' && 'border-primary bg-primary text-primary-foreground',
                  etapa.estado === 'atual' && 'border-primary bg-background text-primary',
                  etapa.estado === 'pendente' && 'border-border bg-background text-muted-foreground',
                  etapa.estado === 'recusado' && 'border-destructive bg-destructive text-white',
                )}
                aria-hidden
              >
                {etapa.estado === 'feito' ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : etapa.estado === 'recusado' ? (
                  <CircleX className="size-4" />
                ) : etapa.estado === 'atual' ? (
                  <Clock className="size-4" />
                ) : (
                  <Send className="size-3.5" />
                )}
              </span>
              <div>
                <p className="font-semibold text-foreground">{etapa.titulo}</p>
                {etapa.detalhe ? <p className="text-sm text-muted-foreground">{etapa.detalhe}</p> : null}
              </div>
            </li>
          ))}
        </ol>

        <div role="status">
          {view.status === 'recebida' ? (
            <Notice tone="info" title="Recebemos sua candidatura">
              A análise acontece pela equipe comercial. Guarde este link: é por ele que você acompanha o resultado.
            </Notice>
          ) : null}
          {view.status === 'aprovada' ? (
            <Notice tone="success" title="Candidatura aprovada">
              Seus dados de acesso são enviados por e-mail para {view.email}. Se não receber em alguns minutos,
              verifique o spam ou fale com a equipe.
            </Notice>
          ) : null}
          {view.status === 'recusada' ? (
            <Notice tone="error" title="Sua candidatura não foi aprovada">
              {view.motivoRecusa ? <p>Motivo: {view.motivoRecusa}</p> : null}
            </Notice>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          {view.status === 'aprovada' ? (
            <Button asChild className="h-11 gap-2 rounded-full px-6">
              <Link href={view.loginPath ?? loginPath(escopo)}>
                <LogIn className="size-4" aria-hidden />
                Entrar
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" className="h-11 gap-2 rounded-full px-6">
            <Link href={homePath(escopo)}>
              <ArrowLeft className="size-4" aria-hidden />
              Voltar ao site
            </Link>
          </Button>
        </div>
      </Panel>
    </div>
  )
}
