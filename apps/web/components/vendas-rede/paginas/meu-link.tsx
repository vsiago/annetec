'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, MessageCircle, Share2 } from 'lucide-react'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { chaveDoEscopo } from '@/lib/vendas-rede/escopo'
import type { PlanoVendavel } from '@/lib/vendas-rede/tipos'
import { listarPlanosAction } from '@/lib/actions/vendas-rede-api'
import { useVendasRede } from '../provider'
import { Conteudo } from '../shell/base'
import { CopiarBotao } from '../ui/copiar-botao'
import { EstadoVazio } from '../ui/estado-vazio'
import { QrCode } from '../ui/qr-code'
import { FOCUS_RING } from '../ui/tokens'
import { montarWaLink } from '../ui/wa-link'
import { Chips } from '../lead/campos'

/**
 * Meu link: o código de indicação e o link para o cliente contratar sozinho.
 * Plataforma: link de contratação (`/contratar?ref=`). Clube: link de adesão,
 * geral ou por plano (`/<clube>/assinar?plano=&ref=`). Sempre com QR, copiar e
 * WhatsApp. A venda de quem compra pelo seu link fica registrada no seu nome.
 */
export function MeuLinkPage() {
  const { escopo, eu } = useVendasRede()
  const chave = chaveDoEscopo(escopo)
  const codigo = eu.agente?.codigoIndicacao ?? null
  const [origem, setOrigem] = useState('')
  const [planos, setPlanos] = useState<PlanoVendavel[] | null>(escopo.kind === 'tenant' ? null : [])
  const [planoId, setPlanoId] = useState<string>('geral')

  useEffect(() => {
    setOrigem(window.location.origin)
  }, [])

  useEffect(() => {
    if (escopo.kind !== 'tenant') return
    let cancelado = false
    void listarPlanosAction(escopo).then(r => {
      if (!cancelado) setPlanos(r.success ? r.data : [])
    })
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  const plano = planos?.find(p => p.id === planoId) ?? null

  const url = useMemo(() => {
    if (!codigo || !origem) return ''
    if (escopo.kind === 'platform') return `${origem}/contratar?ref=${encodeURIComponent(codigo)}`
    const q = new URLSearchParams()
    if (plano) q.set('plano', plano.id)
    q.set('ref', codigo)
    return `${origem}/${encodeURIComponent(escopo.slug)}/assinar?${q.toString()}`
  }, [codigo, origem, escopo, plano])

  // Mesmo tom dos modelos de Regras: link em linha própria, sem pontuação colada a ele.
  const assinatura = eu.agente?.nome ? ` ${eu.agente.nome}` : ''
  const texto =
    escopo.kind === 'platform'
      ? `Olá! Segue o link para contratar a plataforma ANNETEC:
${url}
Qualquer dúvida, fico por aqui.${assinatura}`
      : `Olá! Segue o link para você conhecer ${plano ? `o plano ${plano.nome}` : 'os nossos planos'} e aderir:
${url}
Qualquer dúvida, fico por aqui.${assinatura}`
  const compartilharWa = url ? `https://wa.me/?text=${encodeURIComponent(texto)}` : null

  return (
    <Conteudo>
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-bold leading-tight tracking-tight text-foreground">Meu link</h1>
        <p className="m-0 text-base text-[#475467]">
          {escopo.kind === 'platform'
            ? 'A venda de quem contratar pelo seu link fica registrada no seu nome.'
            : 'Quem assinar pelo seu link já entra na sua carteira.'}
        </p>
      </header>

      {!codigo ? (
        <EstadoVazio
          moldura
          ilustracao="equipe"
          titulo="Seu perfil não tem código de indicação"
          descricao="O código nasce com o cadastro de agente. Se você é gestor sem perfil de vendedor, use o link de cada lead para indicar um plano."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <SectionCard title="Seu código" description="A venda de quem informar este código fica registrada no seu nome." className="lg:self-start">
            <div className="flex flex-col items-start gap-4">
              <p className="m-0 select-all break-all rounded-xl bg-[#F8F9FB] px-4 py-3 font-mono text-2xl font-bold tracking-wider text-[#1E2A4A]">{codigo}</p>
              <CopiarBotao texto={codigo} rotulo="Copiar código" mensagem="Código copiado" />
            </div>
          </SectionCard>

          <SectionCard
            title={escopo.kind === 'platform' ? 'Link de contratação' : 'Link de adesão'}
            description={escopo.kind === 'platform' ? 'Para operadoras e clubes contratarem a ANNETEC.' : 'Para a pessoa assinar sozinha, no celular.'}
          >
            <div className="flex flex-col gap-5">
              {escopo.kind === 'tenant' ? (
                planos === null ? (
                  <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Carregando planos…
                  </div>
                ) : planos.length > 0 ? (
                  <Chips
                    rotulo="Para qual plano?"
                    valor={planoId}
                    aoMudar={setPlanoId}
                    opcoes={[{ id: 'geral', rotulo: 'O cliente escolhe' }, ...planos.map(p => ({ id: p.id, rotulo: p.nome }))]}
                  />
                ) : null
              ) : null}

              {!url ? (
                <Skeleton className="h-40 rounded-2xl" />
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col items-center gap-2">
                    <QrCode valor={url} tamanho={192} titulo="QR code do seu link" />
                    <p className="m-0 text-center text-xs text-muted-foreground">Mostre a tela ou imprima: a câmera do celular abre o link.</p>
                  </div>
                  <p className="m-0 break-all rounded-xl bg-[#F8F9FB] px-3 py-2 text-xs text-[#344054]">{url}</p>
                  <div className="flex flex-wrap gap-2">
                    <CopiarBotao texto={url} rotulo="Copiar link" mensagem="Link copiado" />
                    {compartilharWa ? (
                      <a
                        href={compartilharWa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          'inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--vr-accent,#1E2A4A)] px-4 text-sm font-semibold text-[var(--vr-accent-fg,#FFFFFF)] hover:brightness-110',
                          FOCUS_RING,
                        )}
                      >
                        <MessageCircle className="size-4" aria-hidden="true" /> Enviar no WhatsApp
                      </a>
                    ) : null}
                    {typeof navigator !== 'undefined' && 'share' in navigator ? (
                      <button
                        type="button"
                        onClick={() => void navigator.share({ title: 'Meu link', text: texto, url }).catch(() => undefined)}
                        className={cn('inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold hover:bg-[#F2F4F7]', FOCUS_RING)}
                      >
                        <Share2 className="size-4" aria-hidden="true" /> Compartilhar
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      )}
    </Conteudo>
  )
}
