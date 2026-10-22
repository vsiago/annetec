'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calculator, EyeOff, Loader2, Pencil, Star, Tags } from 'lucide-react'
import {
  quotePlatformPlan,
  recommendPlatformPlan,
  type PlatformPlanOffer,
  type UpdateTenantPlanPricingInput,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/dashboard/empty-state'
import { LoadError, SuperadminOnly, TableSkeleton, runCommand } from '@/components/admin-platform/billing/console-kit'
import { updatePlatformPlanPricingAction } from '@/lib/actions/platform-billing-api'
import { formatBRL, formatCount, formatPercent } from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Preços dos planos ANNETEC (complemento comercial de `tenant_plans`): adesão,
 * valor por vida excedente, participação na receita e vitrine pública. O
 * simulador usa a MESMA `quotePlatformPlan` com que a API fatura.
 */

function toNumber(value: string): number {
  return Number(value.replace(/\./g, '').replace(',', '.'))
}

function money(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

function EditPricingDialog({
  offer,
  onClose,
  onSaved,
}: {
  offer: PlatformPlanOffer | null
  onClose: () => void
  onSaved: (offer: PlatformPlanOffer) => void
}) {
  const [setupFee, setSetupFee] = useState('')
  const [extra, setExtra] = useState('')
  const [share, setShare] = useState('')
  const [sortOrder, setSortOrder] = useState('')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')
  const [publicVisible, setPublicVisible] = useState(true)
  const [highlight, setHighlight] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!offer) return
    setSetupFee(money(offer.pricing.setupFee))
    setExtra(money(offer.pricing.pricePerExtraLife))
    setShare(String(offer.pricing.revenueSharePercent).replace('.', ','))
    setSortOrder(offer.pricing.sortOrder === null ? '' : String(offer.pricing.sortOrder))
    setTagline(offer.pricing.tagline ?? '')
    setDescription(offer.pricing.description ?? '')
    setPublicVisible(offer.pricing.publicVisible)
    setHighlight(offer.pricing.highlight)
    setBusy(false)
  }, [offer])

  const values = {
    setupFee: toNumber(setupFee),
    pricePerExtraLife: toNumber(extra),
    revenueSharePercent: toNumber(share),
    sortOrder: sortOrder.trim() === '' ? null : Number(sortOrder),
  }
  const errors = {
    setupFee: !Number.isFinite(values.setupFee) || values.setupFee < 0,
    pricePerExtraLife: !Number.isFinite(values.pricePerExtraLife) || values.pricePerExtraLife < 0,
    revenueSharePercent: !Number.isFinite(values.revenueSharePercent) || values.revenueSharePercent < 0 || values.revenueSharePercent > 30,
    sortOrder: values.sortOrder !== null && (!Number.isInteger(values.sortOrder) || values.sortOrder < 0),
  }
  const valid = !Object.values(errors).some(Boolean) && tagline.length <= 120 && description.length <= 1000

  const submit = async () => {
    if (!offer || !valid || busy) return
    setBusy(true)
    const input: UpdateTenantPlanPricingInput = {
      setupFee: Math.round(values.setupFee * 100) / 100,
      pricePerExtraLife: Math.round(values.pricePerExtraLife * 100) / 100,
      revenueSharePercent: values.revenueSharePercent,
      sortOrder: values.sortOrder,
      tagline: tagline.trim() || null,
      description: description.trim() || null,
      publicVisible,
      highlight,
    }
    const saved = await runCommand(updatePlatformPlanPricingAction(offer.id, input), `Preços do plano ${offer.name} atualizados`)
    setBusy(false)
    if (saved) {
      onSaved(saved)
      onClose()
    }
  }

  return (
    <Dialog open={!!offer} onOpenChange={open => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Preços do plano {offer?.name}</DialogTitle>
          <DialogDescription>
            Mensalidade {offer ? formatBRL(offer.priceMonthly) : ''} e limite de {offer ? formatCount(offer.memberLimit) : ''} vidas
            vêm do cadastro do plano. Mudanças valem para novas contratações e trocas de plano — assinaturas ativas mantêm o
            retrato do plano.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="pricing-setup">Adesão (R$)</Label>
            <Input id="pricing-setup" inputMode="decimal" value={setupFee} onChange={e => setSetupFee(e.target.value)} aria-invalid={errors.setupFee} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pricing-extra">Por vida extra (R$)</Label>
            <Input id="pricing-extra" inputMode="decimal" value={extra} onChange={e => setExtra(e.target.value)} aria-invalid={errors.pricePerExtraLife} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pricing-share">Split da receita (%)</Label>
            <Input id="pricing-share" inputMode="decimal" value={share} onChange={e => setShare(e.target.value)} aria-invalid={errors.revenueSharePercent} />
            {errors.revenueSharePercent && <p className="text-[11px] text-destructive">Entre 0 e 30%</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pricing-order">Ordem na vitrine</Label>
            <Input id="pricing-order" inputMode="numeric" value={sortOrder} onChange={e => setSortOrder(e.target.value)} placeholder="auto" aria-invalid={errors.sortOrder} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pricing-tagline">Chamada curta</Label>
            <Input id="pricing-tagline" value={tagline} onChange={e => setTagline(e.target.value)} maxLength={120} placeholder="Ex.: Para associações de até 1.000 vidas" />
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="pricing-description">Descrição</Label>
            <Textarea id="pricing-description" value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={1000} />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm sm:col-span-3">
            <span>
              <span className="font-medium text-foreground">Visível na contratação pública</span>
              <span className="block text-xs text-muted-foreground">Fora da vitrine, continua disponível para troca de plano pelo console.</span>
            </span>
            <Switch checked={publicVisible} onCheckedChange={setPublicVisible} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm sm:col-span-3">
            <span>
              <span className="font-medium text-foreground">Selo “Mais escolhido”</span>
              <span className="block text-xs text-muted-foreground">Destaca o plano na vitrine de contratação.</span>
            </span>
            <Switch checked={highlight} onCheckedChange={setHighlight} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Voltar
          </Button>
          <Button onClick={submit} disabled={!valid || busy} className="gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar preços
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PricingTab({
  plans,
  loading,
  error,
  onRetry,
  isSuperadmin,
  onSaved,
}: {
  plans: PlatformPlanOffer[] | null
  loading: boolean
  error: string | null
  onRetry: () => void
  isSuperadmin: boolean
  onSaved: (offer: PlatformPlanOffer) => void
}) {
  const [editing, setEditing] = useState<PlatformPlanOffer | null>(null)
  const [lives, setLives] = useState('1200')
  const count = Math.max(0, Math.trunc(Number(lives.replace(/\D/g, '')) || 0))

  const sorted = useMemo(
    () =>
      [...(plans ?? [])].sort(
        (a, b) => (a.pricing.sortOrder ?? 999) - (b.pricing.sortOrder ?? 999) || a.priceMonthly - b.priceMonthly,
      ),
    [plans],
  )
  const recommended = useMemo(() => (plans && count > 0 ? recommendPlatformPlan(plans, count) : null), [plans, count])

  if (error && !plans) return <LoadError message={error} onRetry={onRetry} />
  if (loading && !plans) return <TableSkeleton rows={4} />
  if (!plans || plans.length === 0) {
    return (
      <EmptyState
        icon={Tags}
        title="Nenhum plano ANNETEC cadastrado"
        description="Cadastre os planos da plataforma em Configurações; os preços comerciais aparecem aqui."
      />
    )
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="simulate-lives" className="flex items-center gap-1.5">
            <Calculator className="h-4 w-4 text-muted-foreground" />
            Simular para
          </Label>
          <div className="relative">
            <Input
              id="simulate-lives"
              inputMode="numeric"
              value={lives}
              onChange={event => setLives(event.target.value)}
              className="w-40 pr-12"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">vidas</span>
          </div>
        </div>
        <p className="pb-2 text-xs text-muted-foreground">
          Mesma cotação da contratação pública: mensalidade + excedente por vida acima do limite. A recomendação é o plano visível
          mais barato para esse volume.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map(offer => {
          const quote = quotePlatformPlan(offer, offer.pricing, count)
          const isRecommended = recommended === offer.id
          return (
            <Card
              key={offer.id}
              className={cn('gap-4 shadow-none', isRecommended && 'border-primary/40 ring-2 ring-primary/10')}
            >
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
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
                <CardDescription>{offer.pricing.tagline ?? `Até ${formatCount(offer.memberLimit)} vidas incluídas`}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Mensalidade</dt>
                    <dd className="font-semibold text-foreground">{formatBRL(offer.priceMonthly)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Vidas incluídas</dt>
                    <dd className="font-semibold text-foreground">{formatCount(offer.memberLimit)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Adesão</dt>
                    <dd className="text-foreground">{formatBRL(offer.pricing.setupFee)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Vida excedente</dt>
                    <dd className="text-foreground">{formatBRL(offer.pricing.pricePerExtraLife)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Split da receita</dt>
                    <dd className="text-foreground">
                      {offer.pricing.revenueSharePercent > 0 ? formatPercent(offer.pricing.revenueSharePercent) : 'Desligado'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Ordem</dt>
                    <dd className="text-foreground">{offer.pricing.sortOrder ?? 'auto'}</dd>
                  </div>
                </dl>
                <div
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm',
                    isRecommended ? 'bg-primary/5 text-foreground' : 'bg-muted/50 text-muted-foreground',
                  )}
                >
                  <p>
                    {formatCount(count)} vidas → <span className="font-semibold text-foreground">{formatBRL(quote.monthlyTotal)}/mês</span>
                  </p>
                  <p className="text-xs">
                    {quote.extraLives > 0 ? `${formatCount(quote.extraLives)} excedente(s) · ` : ''}uso de {formatPercent(quote.usagePct)} ·
                    ativação {formatBRL(quote.activationTotal)}
                  </p>
                  {isRecommended && <p className="mt-1 text-xs font-semibold text-primary">Recomendado para esse volume</p>}
                </div>
                <SuperadminOnly isSuperadmin={isSuperadmin}>
                  <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setEditing(offer)}>
                    <Pencil className="h-4 w-4" />
                    Editar preços
                  </Button>
                </SuperadminOnly>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <EditPricingDialog offer={editing} onClose={() => setEditing(null)} onSaved={onSaved} />
    </div>
  )
}
