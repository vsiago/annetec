'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { DEFAULT_TENANT_PLAN_PRICING, type PlatformPlanOffer, type UpdateTenantPlanPricingInput } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
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
import { updatePlatformPlanPricingAction } from '@/lib/actions/platform-billing-api'
import { createTenantPlanAction, updateTenantPlanAction } from '@/lib/actions/tenants-api'
import { cn } from '@/lib/utils'

/**
 * Criar ou editar um plano da ANNETEC num formulário só. O plano (nome,
 * mensalidade, limite de vidas, recursos) e o preço comercial (taxa de adesão,
 * vida adicional, % sobre a receita, vitrine) moram em tabelas diferentes na
 * API, então o salvar faz uma ou duas chamadas — mas a pessoa vê um plano só.
 */

function toNumber(value: string): number {
  return Number(value.replace(/\./g, '').replace(',', '.'))
}

function money(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function FieldHint({ error, children }: { error?: string | false; children: ReactNode }) {
  return <p className={cn('text-[11px]', error ? 'text-[#B42318]' : 'text-muted-foreground')}>{error || children}</p>
}

export function PlanDialog({
  open,
  offer,
  onClose,
  onSaved,
}: {
  open: boolean
  /** `null` = criar um plano novo. */
  offer: PlatformPlanOffer | null
  onClose: () => void
  /** Chamado depois de gravar (mesmo parcialmente), para a tela recarregar a lista. */
  onSaved: () => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [limit, setLimit] = useState('')
  const [featuresText, setFeaturesText] = useState('')
  const [setupFee, setSetupFee] = useState('')
  const [extra, setExtra] = useState('')
  const [share, setShare] = useState('')
  const [sortOrder, setSortOrder] = useState('')
  const [tagline, setTagline] = useState('')
  const [description, setDescription] = useState('')
  const [publicVisible, setPublicVisible] = useState(true)
  const [highlight, setHighlight] = useState(false)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  // Reinicia só ao abrir ou trocar de plano: recarregar a lista depois de um
  // salvamento parcial não pode apagar o que a pessoa ainda está digitando.
  useEffect(() => {
    if (!open) return
    const pricing = offer?.pricing ?? { ...DEFAULT_TENANT_PLAN_PRICING, planId: '' }
    setName(offer?.name ?? '')
    setPrice(offer ? money(offer.priceMonthly) : '')
    setLimit(offer ? String(offer.memberLimit) : '')
    setFeaturesText(offer ? offer.features.join(', ') : '')
    setSetupFee(money(pricing.setupFee))
    setExtra(money(pricing.pricePerExtraLife))
    setShare(String(pricing.revenueSharePercent).replace('.', ','))
    setSortOrder(pricing.sortOrder === null ? '' : String(pricing.sortOrder))
    setTagline(pricing.tagline ?? '')
    setDescription(pricing.description ?? '')
    setPublicVisible(pricing.publicVisible)
    setHighlight(pricing.highlight)
    setBusy(false)
    setSubmitted(false)
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, offer?.id])

  const values = {
    price: toNumber(price),
    limit: Number(limit.trim()),
    setupFee: toNumber(setupFee),
    extra: toNumber(extra),
    share: toNumber(share),
    sortOrder: sortOrder.trim() === '' ? null : Number(sortOrder),
  }
  const errors = {
    name: name.trim().length === 0 ? 'Dê um nome ao plano.' : false,
    price: price.trim() === '' || !Number.isFinite(values.price) || values.price < 0 ? 'Informe a mensalidade em reais.' : false,
    limit: !Number.isInteger(values.limit) || values.limit < 1 ? 'Informe quantas vidas cabem no plano (número inteiro, a partir de 1).' : false,
    setupFee: !Number.isFinite(values.setupFee) || values.setupFee < 0 ? 'Informe um valor em reais (use 0 para não cobrar).' : false,
    extra: !Number.isFinite(values.extra) || values.extra < 0 ? 'Informe um valor em reais (use 0 para não cobrar).' : false,
    share: !Number.isFinite(values.share) || values.share < 0 || values.share > 30 ? 'Use um percentual entre 0% e 30%.' : false,
    sortOrder:
      values.sortOrder !== null && (!Number.isInteger(values.sortOrder) || values.sortOrder < 0)
        ? 'Use um número inteiro, a partir de 0.'
        : false,
    tagline: tagline.length > 120 ? 'Use no máximo 120 caracteres.' : false,
    description: description.length > 1000 ? 'Use no máximo 1.000 caracteres.' : false,
  } satisfies Record<string, string | false>
  const valid = !Object.values(errors).some(Boolean)
  const show = (key: keyof typeof errors): string | false => (submitted ? errors[key] : false)

  const submit = async () => {
    setSubmitted(true)
    if (!valid || busy) return
    setBusy(true)
    setError('')

    const features = featuresText.split(',').map(item => item.trim()).filter(Boolean)
    const planInput = { name: name.trim(), priceMonthly: round2(values.price), memberLimit: values.limit, features }
    const pricingInput: UpdateTenantPlanPricingInput = {
      setupFee: round2(values.setupFee),
      pricePerExtraLife: round2(values.extra),
      revenueSharePercent: values.share,
      sortOrder: values.sortOrder,
      tagline: tagline.trim() || null,
      description: description.trim() || null,
      publicVisible,
      highlight,
    }

    let planId = offer?.id ?? null

    // 1. O plano em si (nome, mensalidade, limite, recursos).
    const planChanged =
      !offer ||
      offer.name !== planInput.name ||
      offer.priceMonthly !== planInput.priceMonthly ||
      offer.memberLimit !== planInput.memberLimit ||
      offer.features.join('|') !== planInput.features.join('|')
    if (planChanged) {
      const result = offer ? await updateTenantPlanAction(offer.id, planInput) : await createTenantPlanAction(planInput)
      if (!result.success) {
        setBusy(false)
        setError(result.error || 'Não foi possível salvar o plano. Confira os campos e tente de novo.')
        return
      }
      planId = result.data.id
    }

    // 2. Preços e taxas (só chama a API se algo mudou; plano novo com tudo no padrão não precisa).
    const base = offer?.pricing ?? { ...DEFAULT_TENANT_PLAN_PRICING, planId: '' }
    const pricingChanged =
      base.setupFee !== pricingInput.setupFee ||
      base.pricePerExtraLife !== pricingInput.pricePerExtraLife ||
      base.revenueSharePercent !== pricingInput.revenueSharePercent ||
      base.sortOrder !== pricingInput.sortOrder ||
      base.tagline !== pricingInput.tagline ||
      base.description !== pricingInput.description ||
      base.publicVisible !== pricingInput.publicVisible ||
      base.highlight !== pricingInput.highlight
    if (pricingChanged && planId) {
      const result = await updatePlatformPlanPricingAction(planId, pricingInput)
      if (!result.success) {
        await onSaved()
        setBusy(false)
        if (offer) {
          setError(`O plano foi salvo, mas os preços e taxas não. ${result.error}`)
        } else {
          toast.error('O plano foi criado, mas os preços e taxas não foram salvos.', {
            description: `${result.error} Abra o plano e salve de novo.`,
          })
          onClose()
        }
        return
      }
    }

    await onSaved()
    setBusy(false)
    toast.success(offer ? 'Alterações salvas' : 'Plano criado')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={next => !next && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{offer ? `Editar o plano ${offer.name}` : 'Criar plano'}</DialogTitle>
          <DialogDescription>
            {offer
              ? 'Preços, taxas e limite de vidas valem para novas contratações e trocas de plano. Quem já assina mantém as condições da assinatura.'
              : 'Defina o que o plano inclui e quanto a ANNETEC cobra de cada clube que o contratar.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-6"
          onSubmit={event => {
            event.preventDefault()
            void submit()
          }}
        >
          <fieldset className="space-y-4" disabled={busy}>
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plano</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="plan-name">Nome do plano</Label>
                <Input id="plan-name" value={name} onChange={event => setName(event.target.value)} aria-invalid={!!show('name')} />
                {show('name') && <FieldHint error={show('name')}>{null}</FieldHint>}
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <Label htmlFor="plan-price">Mensalidade (R$)</Label>
                <Input
                  id="plan-price"
                  inputMode="decimal"
                  value={price}
                  onChange={event => setPrice(event.target.value)}
                  aria-invalid={!!show('price')}
                />
                <FieldHint error={show('price')}>Por clube, por mês.</FieldHint>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="plan-limit">Limite de vidas</Label>
                <Input
                  id="plan-limit"
                  inputMode="numeric"
                  value={limit}
                  onChange={event => setLimit(event.target.value)}
                  aria-invalid={!!show('limit')}
                />
                <FieldHint error={show('limit')}>Titulares mais dependentes que cabem na mensalidade.</FieldHint>
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="plan-features">Recursos incluídos</Label>
                <Input
                  id="plan-features"
                  value={featuresText}
                  onChange={event => setFeaturesText(event.target.value)}
                  placeholder="Ex.: Carteirinha digital, Suporte prioritário"
                />
                <FieldHint>Separe os itens por vírgula.</FieldHint>
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4" disabled={busy}>
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preços e taxas</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="plan-setup">Taxa de adesão (R$)</Label>
                <Input
                  id="plan-setup"
                  inputMode="decimal"
                  value={setupFee}
                  onChange={event => setSetupFee(event.target.value)}
                  aria-invalid={!!show('setupFee')}
                />
                <FieldHint error={show('setupFee')}>Cobrada uma vez, na primeira fatura.</FieldHint>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-extra">Vida adicional (R$)</Label>
                <Input
                  id="plan-extra"
                  inputMode="decimal"
                  value={extra}
                  onChange={event => setExtra(event.target.value)}
                  aria-invalid={!!show('extra')}
                />
                <FieldHint error={show('extra')}>Por vida acima do limite, por mês.</FieldHint>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-share">% sobre a receita</Label>
                <div className="relative">
                  <Input
                    id="plan-share"
                    inputMode="decimal"
                    value={share}
                    onChange={event => setShare(event.target.value)}
                    aria-invalid={!!show('share')}
                    className="pr-8"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
                <FieldHint error={show('share')}>De 0% a 30%. Use 0 para não cobrar.</FieldHint>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="plan-tagline">Frase de apoio</Label>
                <Input
                  id="plan-tagline"
                  value={tagline}
                  onChange={event => setTagline(event.target.value)}
                  maxLength={120}
                  placeholder="Ex.: Para clubes de até 1.000 vidas"
                />
                <FieldHint error={show('tagline')}>Aparece abaixo do nome do plano. Até 120 caracteres.</FieldHint>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-order">Ordem na vitrine</Label>
                <Input
                  id="plan-order"
                  inputMode="numeric"
                  value={sortOrder}
                  onChange={event => setSortOrder(event.target.value)}
                  placeholder="automática"
                  aria-invalid={!!show('sortOrder')}
                />
                <FieldHint error={show('sortOrder')}>O menor número aparece primeiro.</FieldHint>
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="plan-description">Descrição</Label>
                <Textarea
                  id="plan-description"
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  rows={3}
                  maxLength={1000}
                />
                <FieldHint error={show('description')}>Texto mais longo da contratação pública. Opcional.</FieldHint>
              </div>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm sm:col-span-3">
                <span>
                  <span className="font-medium text-foreground">Mostrar na contratação pública</span>
                  <span className="block text-xs text-muted-foreground">
                    Desligado, o plano some da vitrine, mas a equipe ainda pode trocar um clube para ele.
                  </span>
                </span>
                <Switch checked={publicVisible} onCheckedChange={setPublicVisible} />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm sm:col-span-3">
                <span>
                  <span className="font-medium text-foreground">Destacar como “Mais escolhido”</span>
                  <span className="block text-xs text-muted-foreground">Coloca um selo no plano na vitrine de contratação.</span>
                </span>
                <Switch checked={highlight} onCheckedChange={setHighlight} />
              </label>
            </div>
          </fieldset>

          {error && (
            <p className="rounded-lg border border-[#B42318]/30 bg-[#B42318]/5 px-3 py-2 text-sm text-[#B42318]" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Voltar
            </Button>
            <Button type="submit" disabled={busy} className="gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {offer ? 'Salvar alterações' : 'Criar plano'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
