import { Skeleton } from '@/components/ui/skeleton'

/** Esqueleto do formulário de plano enquanto a lista e as formas do clube carregam. */
export function PlanFormSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando formulário">
      <div className="space-y-3">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="hidden space-y-2 lg:block">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
        <div className="space-y-6">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="space-y-4 rounded-2xl border border-border/60 bg-card p-6">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-72 max-w-full" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
              <Skeleton className="h-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
