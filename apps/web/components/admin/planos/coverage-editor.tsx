'use client'

import { useRef, type ComponentProps, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Plus, Sparkles, Trash2 } from 'lucide-react'
import {
  CLUB_COVERAGE_CATEGORY_LABELS,
  CLUB_COVERAGE_CHANNEL_LABELS,
  CLUB_COVERAGE_KIND_LABELS,
  CLUB_COVERAGE_LIMIT_PERIOD_LABELS,
  clubCoverageCategory,
  clubCoverageChannel,
  clubCoverageKind,
  clubCoverageLimitPeriod,
  describeCoverageValue,
  describeWaitingPeriod,
  type ClubCoverageKind,
  type ClubCoverageLimitPeriod,
} from '@annetec/contracts'
import { FormField } from '@/components/dashboard/form-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  CUSTOM_COVERAGE_TEMPLATE,
  coverageFromForm,
  coverageTemplatesByCategory,
  normalizeSearch,
  type CoverageFormState,
  type CoverageTemplate,
} from '@/lib/adapters/planos'
import { cn } from '@/lib/utils'
import { CoverageIcon } from './plan-ui'

/** O Select do Radix não aceita valor vazio: "sem limite" é este sentinela. */
const NO_LIMIT = 'none'

const KIND_HINTS: Record<ClubCoverageKind, string> = {
  included: 'Sem custo no uso (pode ter limite de usos).',
  discount_percent: 'Desconto sobre o preço do parceiro.',
  copay: 'O associado paga um valor fixo por uso.',
  usage_limit: 'Incluso até um número de usos por período.',
}

/** Campo com prefixo/sufixo fixo ("R$", "%", "dias"). */
export function AffixInput({
  prefix,
  suffix,
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, 'prefix'> & { prefix?: ReactNode; suffix?: ReactNode }) {
  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
          {prefix}
        </span>
      )}
      <Input className={cn(prefix ? 'pl-10' : undefined, suffix ? 'pr-12' : undefined, className)} {...props} />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  )
}

export function CoverageEditor({
  coverages,
  errors,
  open,
  onToggle,
  onChange,
  onAdd,
  onMove,
  onRemove,
}: {
  coverages: CoverageFormState[]
  errors: Record<string, string>
  open: ReadonlySet<string>
  onToggle: (key: string) => void
  onChange: (index: number, patch: Partial<CoverageFormState>) => void
  onAdd: (template: CoverageTemplate) => string
  onMove: (index: number, direction: -1 | 1) => void
  onRemove: (index: number) => void
}) {
  return (
    <div className="space-y-3">
      {coverages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">Nenhuma cobertura ainda</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Comece por um modelo pronto (telemedicina, consultas, farmácia…) e ajuste valor, limite e carência.
          </p>
        </div>
      ) : (
        <ol className="space-y-2" aria-label="Coberturas do plano">
          {coverages.map((item, index) => (
            <CoverageItem
              key={item.key}
              item={item}
              index={index}
              total={coverages.length}
              errors={errors}
              open={open.has(item.key)}
              onToggle={() => onToggle(item.key)}
              onChange={patch => onChange(index, patch)}
              onMove={direction => onMove(index, direction)}
              onRemove={() => onRemove(index)}
            />
          ))}
        </ol>
      )}
      <AddCoverageMenu coverages={coverages} onAdd={onAdd} />
    </div>
  )
}

function AddCoverageMenu({
  coverages,
  onAdd,
}: {
  coverages: CoverageFormState[]
  /** Devolve a `key` da cobertura criada — o foco vai para o título dela. */
  onAdd: (template: CoverageTemplate) => string
}) {
  const titles = new Set(coverages.map(item => normalizeSearch(item.title)))
  const pendingFocus = useRef<string | null>(null)
  const add = (template: CoverageTemplate) => {
    pendingFocus.current = onAdd(template)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <Plus className="size-4" aria-hidden="true" />
          Adicionar cobertura
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[60vh] w-80 overflow-y-auto"
        onCloseAutoFocus={event => {
          // Sem isto o Radix devolve o foco ao botão e a cobertura nova fica sem foco.
          const key = pendingFocus.current
          if (!key) return
          event.preventDefault()
          pendingFocus.current = null
          const field = document.getElementById(`cobertura-${key}-title`)
          field?.focus()
          field?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }}
      >
        {coverageTemplatesByCategory().map(group => (
          <DropdownMenuGroup key={group.category}>
            <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {group.templates.map(item => {
              const added = titles.has(normalizeSearch(item.coverage.title))
              return (
                <DropdownMenuItem key={item.key} onSelect={() => add(item)} className="gap-3 py-2">
                  <CoverageIcon category={item.coverage.category} className="size-7 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{item.coverage.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {added ? 'Já está no plano' : describeCoverageValue(item.coverage)}
                    </span>
                  </span>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => add(CUSTOM_COVERAGE_TEMPLATE)} className="gap-3 py-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Personalizada</span>
            <span className="block text-xs text-muted-foreground">Em branco, para qualquer benefício</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CoverageItem({
  item,
  index,
  total,
  errors,
  open,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: {
  item: CoverageFormState
  index: number
  total: number
  errors: Record<string, string>
  open: boolean
  onToggle: () => void
  onChange: (patch: Partial<CoverageFormState>) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
  const prefix = `coverages.${index}.`
  const error = (field: string) => errors[`${prefix}${field}`]
  const hasErrors = Object.keys(errors).some(path => path.startsWith(prefix))
  const preview = coverageFromForm(item)
  const title = item.title.trim() || 'Nova cobertura'
  const panelId = `cobertura-${item.key}`
  const fieldId = (field: string) => `cobertura-${item.key}-${field}`

  function changeKind(kind: ClubCoverageKind) {
    const patch: Partial<CoverageFormState> = { kind }
    if (kind === 'included' || kind === 'usage_limit') patch.value = ''
    if (kind === 'usage_limit') {
      patch.limitQuantity = item.limitQuantity || '1'
      patch.limitPeriod = item.limitPeriod || 'year'
    }
    onChange(patch)
  }

  return (
    <li
      className={cn(
        'rounded-xl border bg-card transition-colors',
        hasErrors ? 'border-destructive/40' : open ? 'border-border' : 'border-border/60',
      )}
    >
      <div className="flex items-center gap-2 py-2.5 pl-3 pr-2 sm:gap-3 sm:pl-4">
        <CoverageIcon category={item.category} className="hidden size-8 rounded-lg sm:flex" />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="min-w-0 flex-1 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <span className="block truncate text-sm font-medium text-foreground">
            <span className="mr-1.5 tabular-nums text-muted-foreground">{index + 1}.</span>
            {title}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {describeCoverageValue(preview)} · {describeWaitingPeriod(preview.waitingDays)} ·{' '}
            {CLUB_COVERAGE_CHANNEL_LABELS[item.channel]}
          </span>
        </button>
        {hasErrors && <span className="shrink-0 text-xs font-medium text-destructive">Revisar</span>}
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Mover ${title} para cima`}
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Mover ${title} para baixo`}
          >
            <ArrowDown className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label={`Remover ${title}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onToggle}
            aria-label={open ? `Recolher ${title}` : `Editar ${title}`}
            aria-expanded={open}
            aria-controls={panelId}
          >
            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
          </Button>
        </div>
      </div>

      {open && (
        <div id={panelId} className="grid gap-4 border-t border-border/60 p-4 sm:grid-cols-2 sm:p-5">
          <FormField label="Título" htmlFor={fieldId('title')} error={error('title')} required>
            <Input
              id={fieldId('title')}
              value={item.title}
              placeholder="Ex.: Telemedicina 24h"
              onChange={event => onChange({ title: event.target.value })}
              aria-invalid={Boolean(error('title')) || undefined}
            />
          </FormField>
          <FormField label="Categoria" htmlFor={fieldId('category')} error={error('category')}>
            <Select
              value={item.category}
              onValueChange={value => onChange({ category: value as CoverageFormState['category'] })}
            >
              <SelectTrigger id={fieldId('category')} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {clubCoverageCategory.options.map(category => (
                  <SelectItem key={category} value={category}>
                    {CLUB_COVERAGE_CATEGORY_LABELS[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Como funciona" htmlFor={fieldId('kind')} hint={KIND_HINTS[item.kind]} error={error('kind')}>
            <Select value={item.kind} onValueChange={value => changeKind(value as ClubCoverageKind)}>
              <SelectTrigger id={fieldId('kind')} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {clubCoverageKind.options.map(kind => (
                  <SelectItem key={kind} value={kind}>
                    {CLUB_COVERAGE_KIND_LABELS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {item.kind === 'discount_percent' || item.kind === 'copay' ? (
            <FormField
              label={item.kind === 'copay' ? 'Valor por uso' : 'Desconto'}
              htmlFor={fieldId('value')}
              error={error('value')}
              required
            >
              <AffixInput
                id={fieldId('value')}
                inputMode="decimal"
                prefix={item.kind === 'copay' ? 'R$' : undefined}
                suffix={item.kind === 'discount_percent' ? '%' : undefined}
                placeholder={item.kind === 'copay' ? '39,90' : '30'}
                value={item.value}
                onChange={event => onChange({ value: event.target.value })}
                aria-invalid={Boolean(error('value')) || undefined}
              />
            </FormField>
          ) : (
            <div className="hidden sm:block" aria-hidden="true" />
          )}

          <FormField
            label={item.kind === 'usage_limit' ? 'Limite de uso' : 'Limite de uso (opcional)'}
            htmlFor={fieldId('limitQuantity')}
            error={error('limitQuantity') ?? error('limitPeriod')}
            required={item.kind === 'usage_limit'}
          >
            <div className="flex gap-2">
              <AffixInput
                id={fieldId('limitQuantity')}
                inputMode="numeric"
                className="w-28"
                suffix="usos"
                placeholder="—"
                disabled={item.kind !== 'usage_limit' && !item.limitPeriod}
                value={item.limitQuantity}
                onChange={event => onChange({ limitQuantity: event.target.value })}
                aria-invalid={Boolean(error('limitQuantity')) || undefined}
              />
              <Select
                value={item.limitPeriod || NO_LIMIT}
                onValueChange={value =>
                  onChange(
                    value === NO_LIMIT
                      ? { limitPeriod: '', limitQuantity: '' }
                      : {
                          limitPeriod: value as ClubCoverageLimitPeriod,
                          limitQuantity: item.limitQuantity || '1',
                        },
                  )
                }
              >
                <SelectTrigger className="min-w-0 flex-1" aria-label="Período do limite">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {item.kind !== 'usage_limit' && <SelectItem value={NO_LIMIT}>Sem limite</SelectItem>}
                  {clubCoverageLimitPeriod.options.map(period => (
                    <SelectItem key={period} value={period}>
                      {CLUB_COVERAGE_LIMIT_PERIOD_LABELS[period]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FormField>

          <FormField
            label="Carência"
            htmlFor={fieldId('waitingDays')}
            hint="Dias após a ativação; 0 = uso imediato."
            error={error('waitingDays')}
          >
            <AffixInput
              id={fieldId('waitingDays')}
              inputMode="numeric"
              suffix="dias"
              placeholder="0"
              value={item.waitingDays}
              onChange={event => onChange({ waitingDays: event.target.value })}
              aria-invalid={Boolean(error('waitingDays')) || undefined}
            />
          </FormField>

          <FormField label="Canal" htmlFor={fieldId('channel')} error={error('channel')}>
            <Select
              value={item.channel}
              onValueChange={value => onChange({ channel: value as CoverageFormState['channel'] })}
            >
              <SelectTrigger id={fieldId('channel')} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {clubCoverageChannel.options.map(channel => (
                  <SelectItem key={channel} value={channel}>
                    {CLUB_COVERAGE_CHANNEL_LABELS[channel]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label="Parceiro"
            htmlFor={fieldId('provider')}
            hint="Quem presta o benefício. Vazio = rede do clube."
            error={error('provider')}
          >
            <Input
              id={fieldId('provider')}
              value={item.provider}
              placeholder="Rede do clube"
              onChange={event => onChange({ provider: event.target.value })}
              aria-invalid={Boolean(error('provider')) || undefined}
            />
          </FormField>

          <FormField
            label="Descrição"
            htmlFor={fieldId('description')}
            hint={`${item.description.trim().length}/400 · o que o associado recebe, em uma ou duas frases.`}
            error={error('description')}
            className="sm:col-span-2"
          >
            <Textarea
              id={fieldId('description')}
              rows={2}
              value={item.description}
              onChange={event => onChange({ description: event.target.value })}
              className="resize-y"
              aria-invalid={Boolean(error('description')) || undefined}
            />
          </FormField>
        </div>
      )}
    </li>
  )
}
