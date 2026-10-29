import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/admin-platform/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const CARD = 'rounded-2xl border border-border bg-white'

/** Esqueleto discreto enquanto os dados chegam: mesma grade da tela pronta. */
export function HomeLoading() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando o resumo do negócio</span>

      <section className="flex flex-col gap-4">
        <h2 className="m-0 text-lg font-bold text-foreground">Precisa de você</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
          {[0, 1, 2].map(index => (
            <div key={index} className={`${CARD} flex flex-col gap-3 px-6 py-[22px]`}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <Skeleton className="h-6 w-44" />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          {[0, 1, 2, 3].map(index => (
            <div key={index} className={`${CARD} flex flex-col gap-3 px-6 py-[22px]`}>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-4">
        <div className={`${CARD} flex min-w-0 flex-[1.5_1_440px] flex-col gap-5 p-6`}>
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-[240px] w-full" />
        </div>
        <div className={`${CARD} flex min-w-0 flex-[1_1_320px] flex-col gap-4 p-6`}>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-full rounded-full" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  )
}

export function HomeError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className={`${CARD} flex flex-col items-start gap-3 p-7`}>
      <strong className="text-lg text-foreground">Não foi possível carregar esta página</strong>
      <span className="text-[15px] leading-relaxed text-muted-foreground">
        Verifique sua internet e tente de novo. Se continuar, fale com o suporte.
      </span>
      <Button type="button" variant="outline" className="h-11 rounded-[10px] px-4 font-semibold" onClick={onRetry}>
        <RefreshCw aria-hidden="true" />
        Tentar de novo
      </Button>
    </div>
  )
}
