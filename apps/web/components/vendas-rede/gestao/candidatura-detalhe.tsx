'use client'

import { useState, type ReactNode } from 'react'
import { CheckCircle2, ExternalLink, FileText, TriangleAlert, UserCheck, UserX } from 'lucide-react'
import {
  CANDIDATURA_ATUACAO_LABELS,
  CANDIDATURA_DOCUMENTO_KIND_LABELS,
  CANDIDATURA_DOCUMENTOS_OBRIGATORIOS,
  CANDIDATURA_STATUS_LABELS,
  CANDIDATURA_TIPO_PESSOA_LABELS,
  PAPEL_COMERCIAL_LABELS,
  type CandidaturaDetalhe as Detalhe,
  type CandidaturaStatus,
} from '@annetec/contracts'
import { LoadError, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { StatusPill, type StatusPillTone } from '@/components/admin-platform/ui/status-pill'
import { Notice } from '@/components/admin-platform/ui/wizard'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { detalharCandidaturaAction } from '@/lib/actions/vendas-candidaturas-gestao-api'
import { CampoFicha, NaoInformado, TextoQuebravel, ValorLongo } from '../ui/campo-ficha'
import { formatarCelular, formatarCnpj, formatarCpf } from '../ui/mascaras'
import { AprovarCandidaturaDialog, RecusarCandidaturaDialog } from './candidatura-decisao-dialogs'
import type { EscopoRede } from './tipos'

/**
 * Ficha da candidatura: dados do candidato, documentos (abrem em nova aba pelo
 * proxy do admin), aceite do termo, vínculo sugerido e, enquanto está em
 * análise, as ações Aprovar e Recusar. `CandidaturaDetalheSheet` põe tudo numa gaveta.
 */

export const TOM_STATUS: Record<CandidaturaStatus, StatusPillTone> = {
  rascunho: 'neutral',
  recebida: 'warning',
  aprovada: 'success',
  recusada: 'danger',
}

export function StatusCandidatura({ status }: { status: CandidaturaStatus }) {
  return <StatusPill tone={TOM_STATUS[status]}>{CANDIDATURA_STATUS_LABELS[status]}</StatusPill>
}

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function dataSimples(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR')
}

function tamanho(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="m-0 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      {children}
    </section>
  )
}

function Grade({ children }: { children: ReactNode }) {
  return <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
}

function Linha({ rotulo, largo, children }: { rotulo: string; largo?: boolean; children?: ReactNode }) {
  return (
    <CampoFicha rotulo={rotulo} largo={largo}>
      {children || <NaoInformado />}
    </CampoFicha>
  )
}

export function CandidaturaDetalheConteudo({
  escopo,
  candidatura,
  aoDecidir,
}: {
  escopo: EscopoRede
  candidatura: Detalhe
  aoDecidir: (c: Detalhe) => void
}) {
  const [aprovando, setAprovando] = useState(false)
  const [recusando, setRecusando] = useState(false)
  const c = candidatura
  const pj = c.tipoPessoa === 'pj'
  const e = c.endereco
  const obrigatorios = CANDIDATURA_DOCUMENTOS_OBRIGATORIOS[c.tipoPessoa]
  const enviados = new Set(c.documentos.map(d => d.kind))
  const faltantes = obrigatorios.filter(k => !enviados.has(k))
  const sufixo = escopo.kind === 'tenant' ? `?tenant=${encodeURIComponent(escopo.slug)}` : ''
  const linkDoc = (docId: string) => `/api/comercial/candidaturas/${encodeURIComponent(c.id)}/documentos/${encodeURIComponent(docId)}${sufixo}`
  const emAnalise = c.status === 'recebida'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusCandidatura status={c.status} />
        <span className="text-sm text-muted-foreground">
          {CANDIDATURA_TIPO_PESSOA_LABELS[c.tipoPessoa]} · {CANDIDATURA_ATUACAO_LABELS[c.atuacao]}
        </span>
      </div>

      {c.status === 'aprovada' ? (
        <Notice tone="success" icon={UserCheck} title="Candidatura aprovada">
          {c.decididaPor ? `Por ${c.decididaPor.nome}` : 'Aprovada'}
          {c.decididaEm ? ` em ${dataHora(c.decididaEm)}` : ''}.{c.observacoesDecisao ? ` Observações: ${c.observacoesDecisao}` : ''}
        </Notice>
      ) : null}
      {c.status === 'recusada' ? (
        <Notice tone="danger" icon={UserX} title="Candidatura recusada">
          {c.decididaPor ? `Por ${c.decididaPor.nome}` : 'Recusada'}
          {c.decididaEm ? ` em ${dataHora(c.decididaEm)}` : ''}. Motivo enviado ao candidato: {c.motivoRecusa ?? 'não informado'}
        </Notice>
      ) : null}

      <Secao titulo={pj ? 'Responsável' : 'Dados pessoais'}>
        <Grade>
          <Linha rotulo="Nome" largo>
            {c.nome}
          </Linha>
          <Linha rotulo="E-mail" largo>
            <ValorLongo texto={c.email} href={`mailto:${c.email}`} />
          </Linha>
          <Linha rotulo="Telefone">{c.telefone ? formatarCelular(c.telefone) : ''}</Linha>
          <Linha rotulo={pj ? 'CPF do representante' : 'CPF'}>{c.cpf ? formatarCpf(c.cpf) : ''}</Linha>
          {!pj ? <Linha rotulo="Nascimento">{dataSimples(c.dataNascimento)}</Linha> : null}
        </Grade>
      </Secao>

      {pj ? (
        <Secao titulo="Empresa">
          <Grade>
            <Linha rotulo="Razão social" largo>
              {c.razaoSocial}
            </Linha>
            <Linha rotulo="Nome fantasia">{c.nomeFantasia}</Linha>
            <Linha rotulo="CNPJ">{c.cnpj ? formatarCnpj(c.cnpj) : ''}</Linha>
          </Grade>
        </Secao>
      ) : null}

      <Secao titulo="Endereço">
        <Grade>
          <Linha rotulo="Endereço" largo>
            {e ? (
              <TextoQuebravel>
                {[e.logradouro, e.numero, e.complemento].filter(Boolean).join(', ')} · {e.bairro} · {e.cidade}/{e.uf} · CEP {e.cep}
              </TextoQuebravel>
            ) : null}
          </Linha>
        </Grade>
      </Secao>

      <Secao titulo="Atuação">
        <Grade>
          <Linha rotulo="Região de atuação">{c.regiaoAtuacao}</Linha>
          <Linha rotulo="Como conheceu">{c.comoConheceu}</Linha>
          <Linha rotulo="Indicado por">{c.indicadoPor ? `${c.indicadoPor.nome} (${PAPEL_COMERCIAL_LABELS[c.indicadoPor.papel]})` : ''}</Linha>
          <Linha rotulo="Código de indicação">{c.codigoIndicacao}</Linha>
          <Linha rotulo="Experiência" largo>
            {c.experiencia ? <TextoQuebravel>{c.experiencia}</TextoQuebravel> : null}
          </Linha>
        </Grade>
      </Secao>

      <Secao titulo="Documentos">
        {faltantes.length > 0 ? (
          <Notice tone="warning" icon={TriangleAlert} title="Documentos obrigatórios faltando">
            {faltantes.map(k => CANDIDATURA_DOCUMENTO_KIND_LABELS[k]).join(', ')}.
          </Notice>
        ) : null}
        {c.documentos.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Nenhum documento enviado.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {c.documentos.map(d => (
              <li key={d.id} className="flex items-center gap-3 rounded-xl border border-border bg-white p-3">
                <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-sm font-semibold">{CANDIDATURA_DOCUMENTO_KIND_LABELS[d.kind]}</p>
                  <p className="m-0 truncate text-xs text-muted-foreground" title={d.fileName}>
                    {d.fileName} · {tamanho(d.sizeBytes)}
                    {obrigatorios.includes(d.kind) ? ' · obrigatório' : ''}
                  </p>
                </div>
                <a
                  href={linkDoc(d.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold text-secondary hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40"
                >
                  Visualizar
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  <span className="sr-only"> (abre em nova aba)</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {faltantes.length === 0 && c.documentos.length > 0 ? (
          <p className="m-0 flex items-center gap-1.5 text-xs text-[#067647]">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Todos os documentos obrigatórios foram enviados.
          </p>
        ) : null}
      </Secao>

      <Secao titulo="Aceite do termo">
        {c.aceite ? (
          <Grade>
            <Linha rotulo="Versão do termo">{c.aceite.termosVersao}</Linha>
            <Linha rotulo="Aceito em">{dataHora(c.aceite.aceitoEm)}</Linha>
            <Linha rotulo="Assinado por" largo>
              {c.aceite.nomeAssinatura}
            </Linha>
          </Grade>
        ) : (
          <p className="m-0 text-sm text-muted-foreground">Sem aceite registrado.</p>
        )}
      </Secao>

      <Secao titulo="Vínculo sugerido">
        <p className="m-0 text-sm">
          <span className="font-semibold">{PAPEL_COMERCIAL_LABELS[c.vinculoSugerido.papel]}</span>
          {c.vinculoSugerido.motivo ? ` · ${c.vinculoSugerido.motivo}` : ' · sem vínculo sugerido, escolha na aprovação.'}
        </p>
      </Secao>

      <Secao titulo="Registro">
        <Grade>
          <Linha rotulo="Enviada em">{dataHora(c.enviadaEm)}</Linha>
          <Linha rotulo="Iniciada em">{dataHora(c.createdAt)}</Linha>
          <Linha rotulo="IP de origem">{c.origemIp}</Linha>
        </Grade>
      </Secao>

      {emAnalise ? (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-3 border-t border-border bg-background px-4 py-3">
          <Button type="button" variant="outline" onClick={() => setRecusando(true)}>
            Recusar
          </Button>
          <Button type="button" onClick={() => setAprovando(true)}>
            Aprovar
          </Button>
        </div>
      ) : null}

      {/* Sempre montados: o de aprovação segue aberto mostrando o convite depois que o status muda. */}
      <AprovarCandidaturaDialog escopo={escopo} candidatura={c} aberto={aprovando} aoMudarAberto={setAprovando} aoDecidir={aoDecidir} />
      <RecusarCandidaturaDialog escopo={escopo} candidatura={c} aberto={recusando} aoMudarAberto={setRecusando} aoDecidir={aoDecidir} />

    </div>
  )
}

/** Gaveta lateral. `id = null` mantém fechada. */
export function CandidaturaDetalheSheet({
  escopo,
  id,
  aoFechar,
  aoDecidir,
}: {
  escopo: EscopoRede
  id: string | null
  aoFechar: () => void
  /** Após aprovar ou recusar: a lista recarrega. */
  aoDecidir: () => void
}) {
  const chave = escopo.kind === 'platform' ? 'platform' : escopo.slug
  const { data, error, loading, reload } = useConsoleData<Detalhe>(id ? () => detalharCandidaturaAction(escopo, id) : null, [chave, id])
  const [local, setLocal] = useState<Detalhe | null>(null)
  const atual = local && local.id === id ? local : data && data.id === id ? data : null

  return (
    <Sheet
      open={id !== null}
      onOpenChange={aberto => {
        if (!aberto) {
          setLocal(null)
          aoFechar()
        }
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{atual?.nome ?? 'Candidatura'}</SheetTitle>
          <SheetDescription>Confira os dados e documentos antes de decidir.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {loading && !atual ? (
            <TableSkeleton rows={4} />
          ) : !atual ? (
            <LoadError message={error ?? 'Não foi possível carregar a candidatura.'} onRetry={() => void reload()} />
          ) : (
            <CandidaturaDetalheConteudo
              escopo={escopo}
              candidatura={atual}
              aoDecidir={nova => {
                setLocal(nova)
                aoDecidir()
              }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
