'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Calculator, EyeOff, Loader2, Pencil, Plus, Star, Tags, Trash2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { quotePlatformPlan, recommendPlatformPlan, type PlatformPlanOffer } from '@annetec/contracts'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/admin-platform/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/dashboard/empty-state'
import { PageHeader } from '@/components/dashboard/page-header'
import { LivesTerm } from '@/components/admin-platform/billing/billing-bits'
import { LoadError, SuperadminOnly, TableSkeleton, useConsoleData, usePlatformRole } from '@/components/admin-platform/billing/console-kit'
import { PlanDialog } from '@/components/admin-platform/billing/plan-dialog'
import { useTenants } from '@/contexts/tenants-context'
import { listPlatformPlanPricingAction } from '@/lib/actions/platform-billing-api'
import { deleteTenantPlanAction } from '@/lib/actions/tenants-api'
import { formatBRL, formatCount, formatPercent } from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Planos e preços: quanto a ANNETEC cobra de cada clube. Junta o catálogo
 * (nome, mensalidade, limite de vidas, recursos) com o preço comercial do
 * mesmo plano (taxa de adesão, vida adicional, % sobre a receita, vitrine).
 * Tudo vem da API (`/platform/billing/precos`); criar, editar e remover só
 * para o superadmin.
 */

/** A API ainda escreve "inquilino" nesta mensagem; na tela o termo é sempre "clube". */
function clubTerm(message: string): string {
  return message.replace(/inquilino\(s\)/gi, 'clube(s)').replace(/inquilinos/gi, 'clubes').replace(/inquilino/gi, 'clube')
}

function Spec({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
  )
}

export default function PlanosEPrecosPage() {
  const { isSuperadmin } = usePlatformRole()
  const { refresh } = useTenants()
  const plans = useConsoleData(() => listPlatformPlanPricingAction(), [])

  const [dialog, setDialog] = useState<{ open: boolean; offer: PlatformPlanOffer | null }>({ open: false, offer: null })
  const [removing, setRemoving] = useState<PlatformPlanOffer | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const [lives, setLives] = useState('1200')
  const count = Math.max(0, Math.trunc(Number(lives.replace(/\D/g, '')) || 0))

  const sorted = useMemo(
    () =>
      [...(plans.data ?? [])].sort(
        (a, b) => (a.pricing.sortOrder ?? 999) - (b.pricing.sortOrder ?? 999) || a.priceMonthly - b.priceMonthly,
      ),
    [plans.data],
  )
  const recommended = useMemo(() => (plans.data && count > 0 ? recommendPlatformPlan(plans.data, count) : null), [plans.data, count])

  /** Depois de gravar: recarrega a lista daqui e a do contexto (usada ao cadastrar um clube). */
  const afterSave = async () => {
    await Promise.all([plans.reload({ silent: true }), refresh()])
  }

  const openCreate = () => setDialog({ open: true, offer: null })
  const openEdit = (offer: PlatformPlanOffer) => setDialog({ open: true, offer })

  const startRemove = (offer: PlatformPlanOffer) => {
    setRemoveError('')
    setRemoving(offer)
  }

  /** Remover só vale para plano que nenhum clube usa — a API recusa com a contagem de clubes, e é essa frase que aparece. */
  const confirmRemove = async () => {
    if (!removing || removeBusy) return
    setRemoveBusy(true)
    setRemoveError('')
    const result = await deleteTenantPlanAction(removing.id)
    setRemoveBusy(false)
    if (!result.success) {
      setRemoveError(result.error ? clubTerm(result.error) : 'Não foi possível remover o plano. Tente de novo.')
      return
    }
    toast.success(`Plano ${removing.name} removido`)
    setRemoving(null)
    await afterSave()
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Planos e preços" description="Quanto a ANNETEC cobra de cada clube.">
        <SuperadminOnly isSuperadmin={isSuperadmin} reason="Somente o superadmin pode criar planos.">
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Criar plano
          </Button>
        </SuperadminOnly>
      </PageHeader>

      {plans.error && !plans.data ? (
        <LoadError message={plans.error} onRetry={() => plans.reload()} />
      ) : plans.loading && !plans.data ? (
        <Card className="shadow-none">
          <TableSkeleton rows={4} />
        </Card>
      ) : sorted.length === 0 ? (
        <Card className="shadow-none">
          <EmptyState
            icon={Tags}
            title="Nenhum plano ainda"
            description="Crie o primeiro plano para os clubes poderem contratar a ANNETEC."
            action={
              <SuperadminOnly isSuperadmin={isSuperadmin} reason="Somente o superadmin pode criar planos.">
                <Button onClick={openCreate} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Criar plano
                </Button>
              </SuperadminOnly>
            }
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/30 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="simulate-lives" className="flex items-center gap-1.5">
                <Calculator className="h-4 w-4 text-muted-foreground" />
                Simular o valor para um clube com
              </Label>
              <div className="relative">
                <Input
                  id="simulate-lives"
                  inputMode="numeric"
                  value={lives}
                  onChange={event => setLives(event.target.value)}
                  className="w-44 pr-14"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  <LivesTerm />
                </span>
              </div>
            </div>
            <p className="pb-2 text-xs text-muted-foreground">
              É a mesma conta da contratação pública: mensalidade mais a vida adicional de cada vida acima do limite. O plano
              recomendado é o mais barato, entre os que aparecem na vitrine, para esse tamanho de clube.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sorted.map(offer => {
              const quote = quotePlatformPlan(offer, offer.pricing, count)
              const isRecommended = recommended === offer.id
              return (
                <Card key={offer.id} className={cn('gap-4 shadow-none', isRecommended && 'border-secondary/40 bg-accent/40 ring-2 ring-secondary/10')}>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      <Wallet className="h-4 w-4 text-secondary" />
                      {offer.name}
                      {offer.pricing.highlight && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                          <Star className="h-3 w-3" />
                          Mais escolhido
                        </span>
                      )}
                      {!offer.pricing.publicVisible && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
                          <EyeOff className="h-3 w-3" />
                          Fora da vitrine
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {offer.pricing.tagline ?? (
                        <>
                          Até {formatCount(offer.memberLimit)} <LivesTerm /> incluídas
                        </>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-2xl font-bold text-primary">
                      {formatBRL(offer.priceMonthly)}
                      <span className="text-sm font-normal text-muted-foreground"> por mês</span>
                    </p>

                    {offer.features.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {offer.features.map(feature => (
                          <Badge key={feature} variant="outline">
                            {feature}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2 border-t border-border pt-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preços e taxas</h3>
                      <dl className="grid grid-cols-2 gap-3">
                        <Spec label="Vidas incluídas">
                          {formatCount(offer.memberLimit)} <LivesTerm />
                        </Spec>
                        <Spec label="Taxa de adesão">{formatBRL(offer.pricing.setupFee)}</Spec>
                        <Spec label="Vida adicional">{formatBRL(offer.pricing.pricePerExtraLife)} por mês</Spec>
                        <Spec label="% sobre a receita">
                          {offer.pricing.revenueSharePercent > 0 ? formatPercent(offer.pricing.revenueSharePercent) : 'Desligado'}
                        </Spec>
                        <Spec label="Ordem na vitrine">{offer.pricing.sortOrder ?? 'automática'}</Spec>
                      </dl>
                    </div>

                    <div
                      className={cn(
                        'rounded-lg px-3 py-2 text-sm',
                        isRecommended ? 'bg-accent text-foreground' : 'bg-muted/50 text-muted-foreground',
                      )}
                    >
                      <p>
                        {formatCount(count)} <LivesTerm /> →{' '}
                        <span className="font-semibold text-foreground">{formatBRL(quote.monthlyTotal)} por mês</span>
                      </p>
                      <p className="text-xs">
                        {quote.extraLives > 0 ? `${formatCount(quote.extraLives)} acima do limite · ` : ''}usa {formatPercent(quote.usagePct)}{' '}
                        do plano · primeira fatura de {formatBRL(quote.activationTotal)}
                      </p>
                      {isRecommended && <p className="mt-1 text-xs font-semibold text-secondary">Recomendado para esse tamanho de clube</p>}
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                      <SuperadminOnly isSuperadmin={isSuperadmin} reason="Somente o superadmin pode editar planos.">
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => openEdit(offer)}>
                          <Pencil className="h-3.5 w-3.5" />
                          Editar plano
                        </Button>
                      </SuperadminOnly>
                      <SuperadminOnly isSuperadmin={isSuperadmin} reason="Somente o superadmin pode remover planos.">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-2 text-[#B42318] hover:text-[#B42318]"
                          onClick={() => startRemove(offer)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remover plano
                        </Button>
                      </SuperadminOnly>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      <PlanDialog
        open={dialog.open}
        offer={dialog.offer}
        onClose={() => setDialog(current => ({ ...current, open: false }))}
        onSaved={afterSave}
      />

      <AlertDialog open={!!removing} onOpenChange={open => !open && !removeBusy && setRemoving(null)}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover o plano {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O plano sai do catálogo e deixa de aparecer na contratação. Só dá para remover um plano que nenhum clube usa: se algum
              clube estiver nele, nada muda e mostramos aqui quantos são. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeError && (
            <p className="rounded-lg border border-[#B42318]/30 bg-[#B42318]/5 px-3 py-2 text-sm text-[#B42318]" role="alert">
              {removeError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeBusy}>Voltar</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmRemove} disabled={removeBusy} className="gap-2">
              {removeBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              Remover plano
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
