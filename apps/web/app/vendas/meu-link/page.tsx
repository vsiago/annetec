'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, FileSignature, KanbanSquare, Link2, MessageCircle, MousePointerClick, TriangleAlert, Wallet } from 'lucide-react'
import { copyToClipboard } from '@/components/admin-platform/billing/console-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { ErrorState } from '@/components/admin-platform/ui/empty-state'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { Notice } from '@/components/admin-platform/ui/wizard'
import { absoluteReferralUrl, useSellerProfile } from '@/contexts/seller-profile-context'
import { cn } from '@/lib/utils'

const STEPS = [
  {
    icon: MousePointerClick,
    title: 'O cliente abre o seu link',
    text: 'E faz a contratação pelo site da ANNETEC, escolhendo um dos planos da vitrine.',
  },
  {
    icon: KanbanSquare,
    title: 'A proposta fica com você',
    text: 'Ela aparece em Propostas e no seu Funil, com a origem "Site (código do vendedor)".',
  },
  {
    icon: Wallet,
    title: 'Clube no ar, comissão a cada fatura paga',
    text: 'Quando a ANNETEC aprova e o clube paga as faturas, a sua parte entra em Comissões.',
  },
]

/**
 * "Meu link": o link de indicação do vendedor (`/contratar?ref=código`), no
 * domínio que ele está usando agora, com "Copiar" e como funciona.
 */
export default function SellerReferralPage() {
  const { profile, loading, error, reload } = useSellerProfile()
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')

  useEffect(() => {
    setUrl(absoluteReferralUrl(profile))
  }, [profile])

  const copy = async () => {
    const ok = await copyToClipboard(url)
    setCopied(ok ? 'ok' : 'fail')
    if (ok) window.setTimeout(() => setCopied('idle'), 2500)
  }

  const whatsapp = url
    ? `https://wa.me/?text=${encodeURIComponent(`Contrate a plataforma ANNETEC para o seu clube de benefícios: ${url}`)}`
    : ''

  return (
    <PageContainer>
      <PageHeader
        icon={Link2}
        title="Meu link de indicação"
        description="Envie para operadoras e clubes. Quem contratar por ele fica atribuído a você."
      />

      {error && !profile ? (
        <ErrorState title={error} onRetry={() => reload()} />
      ) : loading && !profile ? (
        <SectionCard>
          <SectionSkeleton rows={3} />
        </SectionCard>
      ) : profile ? (
        <>
          <SectionCard title="Seu link" description={`Código de indicação: ${profile.referralCode}`} icon={Link2}>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <code
                  className="min-w-0 flex-1 select-all break-all rounded-xl border border-border bg-[#F9FAFB] px-4 py-3 font-mono text-[15px] font-semibold text-foreground"
                  aria-label="Link de indicação"
                >
                  {url || profile.referralUrl}
                </code>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={copy}
                    className={cn('h-11 rounded-[10px] px-4 font-semibold', copied === 'ok' && 'bg-[#067647] hover:bg-[#067647]/90')}
                  >
                    {copied === 'ok' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    {copied === 'ok' ? 'Link copiado' : 'Copiar link'}
                  </Button>
                  {whatsapp ? (
                    <Button asChild variant="outline" className="h-11 rounded-[10px] px-4 font-semibold">
                      <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                        <MessageCircle aria-hidden="true" />
                        Enviar pelo WhatsApp
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
              <p className="sr-only" aria-live="polite">
                {copied === 'ok' ? 'Link copiado para a área de transferência.' : ''}
              </p>
              {copied === 'fail' ? (
                <p role="alert" className="m-0 text-sm font-medium text-[#B42318]">
                  Não foi possível copiar. Selecione o link acima e copie com Ctrl+C.
                </p>
              ) : null}
              {!profile.active ? (
                <Notice tone="warning" icon={TriangleAlert}>
                  Seu perfil está inativo: quem contratar pelo link agora não fica atribuído a você.
                </Notice>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Como funciona" icon={MousePointerClick} iconTone="blue">
            <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
              {STEPS.map((step, index) => {
                const Icon = step.icon
                return (
                  <li key={step.title} className="flex gap-3 rounded-2xl border border-border bg-[#FCFCFD] p-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#E5EDF5] text-secondary" aria-hidden="true">
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="m-0 text-sm font-semibold text-foreground">
                        {index + 1}. {step.title}
                      </p>
                      <p className="m-0 mt-1 text-sm text-muted-foreground">{step.text}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
            <div className="mt-5 flex flex-col gap-3">
              <Notice tone="neutral" icon={FileSignature} title="Quer oferecer um plano fora do site ou um desconto?">
                Use o link de contratação do Funil: lá você escolhe qualquer plano ANNETEC e pode pedir uma condição especial. O link vai
                direto para o e-mail do cliente.
              </Notice>
              <div>
                <Button asChild variant="outline" className="h-11 rounded-[10px] px-4 font-semibold">
                  <Link href="/vendas/funil">
                    <KanbanSquare aria-hidden="true" />
                    Abrir o funil
                  </Link>
                </Button>
              </div>
            </div>
          </SectionCard>
        </>
      ) : null}
    </PageContainer>
  )
}
