import { ErrorState } from '@/components/admin-platform/ui/empty-state'
import { SectionHeading } from '@/components/admin-platform/ui/section-card'
import { Skeleton } from '@/components/ui/skeleton'

const CARD = 'rounded-2xl border border-border bg-card shadow-sm'

/** Esqueleto discreto enquanto os dados chegam: mesma grade da tela pronta. */
export function HomeLoading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando o resumo do negócio</span>

      <section className="flex flex-col gap-4">
        <SectionHeading title="Precisa de você" />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
          {[0, 1, 2].map(index => (
            <div key={index} className={`${CARD} flex flex-col gap-3 px-6 py-[22px]`}>
              <div className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
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
              <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="size-10 rounded-xl" />
              </div>
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-6">
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
    <ErrorState
      title="Não foi possível carregar esta página"
      description="Verifique sua internet e tente de novo. Se continuar, fale com o suporte."
      onRetry={onRetry}
    />
  )
}
