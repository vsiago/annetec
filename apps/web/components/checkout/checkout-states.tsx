'use client'

import Link from 'next/link'
import { ArrowLeft, HeartHandshake, Landmark, MessageCircle, RefreshCw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function CheckoutSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-12 pt-5 sm:px-6 lg:pt-10" aria-busy="true" aria-label="Carregando o checkout">
      <Skeleton className="h-8 w-full max-w-sm rounded-full" />
      <Skeleton className="mt-4 h-16 rounded-xl lg:hidden" />
      <div className="mt-6 grid gap-8 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_340px] xl:gap-12">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-4 w-80 max-w-full rounded" />
          <Skeleton className="mt-2 h-24 rounded-2xl" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-12 rounded-xl sm:col-span-2" />
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        </div>
        <Skeleton className="hidden h-80 rounded-2xl lg:block" />
      </div>
    </div>
  )
}

/** Inquilino sem nenhum plano ativo: nada para vender — oferece o consultor. */
export function CheckoutEmpty({ slug, tenantName }: { slug: string; tenantName: string }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center sm:py-24">
      <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <HeartHandshake className="size-8" aria-hidden />
      </div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Estamos preparando os planos do {tenantName}
      </h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        A contratação online ainda não está disponível. Fale com um consultor: ele encontra o plano ideal para você e
        para a sua família, sem compromisso.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button asChild size="lg" className="h-12 rounded-xl px-6 text-base">
          <Link href={`/${slug}/cadastro`}>
            <MessageCircle className="size-5" aria-hidden />
            Falar com um consultor
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-6 text-base">
          <Link href={`/${slug}`}>
            <ArrowLeft className="size-5" aria-hidden />
            Voltar ao site
          </Link>
        </Button>
      </div>
    </div>
  )
}

/**
 * Clube com Asaas mas sem conta de recebimento conectada
 * (`checkoutContext.receivingConfigured === false`): a API recusaria a adesão
 * (409 `RECEBIMENTO_NAO_CONFIGURADO`), então a tela avisa antes de a pessoa
 * preencher o formulário — não há botão de assinar para clicar.
 */
export function CheckoutReceivingUnavailable({ slug }: { slug: string }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center sm:py-24">
      <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
        <Landmark className="size-8" aria-hidden />
      </div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        A assinatura online ainda não está disponível
      </h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground" role="status">
        Este clube ainda não configurou o recebimento das mensalidades. Fale com o clube.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button asChild size="lg" className="h-12 rounded-xl px-6 text-base">
          <Link href={`/${slug}/cadastro`}>
            <MessageCircle className="size-5" aria-hidden />
            Falar com o clube
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-6 text-base">
          <Link href={`/${slug}`}>
            <ArrowLeft className="size-5" aria-hidden />
            Voltar ao site
          </Link>
        </Button>
      </div>
    </div>
  )
}

export function CheckoutLoadError({ message, onRetry, slug }: { message: string; onRetry: () => void; slug: string }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center sm:py-24">
      <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
        <WifiOff className="size-8" aria-hidden />
      </div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
        Não conseguimos carregar os planos agora
      </h1>
      <p className="mt-3 text-base text-muted-foreground">{message}</p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button size="lg" className="h-12 rounded-xl px-6 text-base" onClick={onRetry}>
          <RefreshCw className="size-5" aria-hidden />
          Tentar novamente
        </Button>
        <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-6 text-base">
          <Link href={`/${slug}`}>Voltar ao site</Link>
        </Button>
      </div>
    </div>
  )
}

/**
 * Faixa do ambiente de testes (gateway simulado ou Asaas sandbox — regra
 * `isDemoMode`): deixa claro que nada é cobrado. Sem atalho de preenchimento:
 * titular e dependentes nunca são pessoas fictícias. Discreta de propósito.
 */
export function DemoBanner() {
  return (
    <div className="border-b border-border/60 bg-muted/40 print:hidden">
      <div className="mx-auto flex max-w-6xl px-4 py-1.5 text-xs text-muted-foreground sm:px-6 sm:py-1">
        <p className="flex items-start gap-2 leading-5">
          <span className="mt-1.75 size-1.5 shrink-0 rounded-full bg-amber-500 dark:bg-amber-400" aria-hidden />
          <span>
            <span className="font-medium">Ambiente de testes</span> — nenhum valor é cobrado.
          </span>
        </p>
      </div>
    </div>
  )
}
