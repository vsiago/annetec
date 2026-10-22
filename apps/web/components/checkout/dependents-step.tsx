'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertCircle, AlertTriangle, ChevronDown, HeartHandshake, Plus, Trash2, Users } from 'lucide-react'
import {
  DEPENDENT_RELATIONSHIP_LABELS,
  dependentRulesOf,
  describeDependentRules,
  formatBRL,
  maskCpf,
  type ClubPlan,
  type ClubPlanQuote,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  dependentCharge,
  dependentsPolicy,
  describeDependentsSplit,
  maskDateBR,
  type DependentForm,
  type FieldErrors,
} from '@/lib/adapters/checkout'
import { cn } from '@/lib/utils'
import { CheckoutField } from './form-field'

type DependentField = 'name' | 'relationship' | 'birthDate' | 'cpf'

/** Máximo do contrato (`checkoutInput.dependents.max(20)`) quando o plano não define teto. */
const MAX_DEPENDENTS_PER_SUBSCRIPTION = 20

interface DependentsBlockProps {
  plan: ClubPlan
  quote: ClubPlanQuote
  dependents: DependentForm[]
  errors: Record<string, FieldErrors>
  /** Erro da lista inteira (plano individual / acima do limite), mensagem do validador compartilhado. */
  listError: string | null
  /** Bloco aberto (controlado pelo wizard: abre sozinho quando há erro num dependente). */
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: () => string
  onRemove: (key: string) => void
  onChange: (key: string, field: DependentField, value: string) => void
  onBlur: (key: string, field: DependentField) => void
  onChangePlan?: () => void
}

/**
 * Dependentes como bloco OPCIONAL e recolhido dentro de "Seus dados":
 * "Adicionar dependentes (opcional)" abre o formulário de sempre já com o 1º
 * dependente e o preço por dependente; o resumo do pedido acompanha. Plano
 * individual: o bloco nem aparece (a não ser que já existam dependentes de
 * outro plano — aí fica aberto para a pessoa removê-los).
 */
export function DependentsBlock(props: DependentsBlockProps) {
  const { plan, quote, dependents, open, onOpenChange, onAdd } = props
  const policy = dependentsPolicy(plan)
  const [focusKey, setFocusKey] = useState<string | null>(null)

  useEffect(() => {
    if (!focusKey) return
    const input = document.getElementById(`${focusKey}-name`)
    if (input instanceof HTMLInputElement) input.focus()
    setFocusKey(null)
  }, [focusKey, dependents.length, open])

  if (policy.individual && dependents.length === 0) return null

  const count = dependents.length
  const expanded = open || Boolean(props.listError)
  const priceHint =
    policy.unitPrice === 0
      ? 'Sem custo extra por dependente'
      : policy.included > 0
        ? `${policy.included} incluso${policy.included === 1 ? '' : 's'} no plano · depois +${formatBRL(policy.unitPrice)}/mês cada`
        : `+${formatBRL(policy.unitPrice)}/mês por dependente`
  const summary =
    count === 0
      ? priceHint
      : `Titular + ${count} dependente${count === 1 ? '' : 's'}: ${formatBRL(quote.total)}/mês`

  const toggle = () => {
    if (!expanded && count === 0) {
      onOpenChange(true)
      setFocusKey(onAdd())
      return
    }
    onOpenChange(!expanded)
  }

  return (
    <section className="overflow-hidden rounded-2xl border bg-card" aria-labelledby="checkout-dependents-title">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls="checkout-dependents"
        className="flex w-full items-center gap-3 px-4 py-4 text-left outline-none transition-colors duration-150 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {count === 0 ? <Plus className="size-5" aria-hidden /> : <Users className="size-5" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span id="checkout-dependents-title" className="block text-[15px] font-semibold text-foreground">
            {count === 0 ? 'Adicionar dependentes' : `Dependentes (${count})`}{' '}
            <span className="font-normal text-muted-foreground">(opcional)</span>
          </span>
          <span className="block text-[13px] text-muted-foreground" aria-live="polite">
            {summary}
          </span>
        </span>
        <ChevronDown
          className={cn('size-5 shrink-0 text-muted-foreground transition-transform duration-150', expanded && 'rotate-180')}
          aria-hidden
        />
      </button>
      {expanded ? (
        <div
          id="checkout-dependents"
          className="border-t px-4 pb-4 pt-4 duration-150 animate-in fade-in motion-reduce:animate-none"
        >
          <DependentsList {...props} onAddAndFocus={() => setFocusKey(onAdd())} />
        </div>
      ) : null}
    </section>
  )
}

function DependentsList({
  plan,
  quote,
  dependents,
  errors,
  listError,
  onRemove,
  onChange,
  onBlur,
  onChangePlan,
  onAddAndFocus,
}: DependentsBlockProps & { onAddAndFocus: () => void }) {
  const policy = dependentsPolicy(plan)
  const rules = dependentRulesOf(plan)
  const allowed = new Set(rules.map(rule => rule.relationship))
  // Teto do plano; sem teto, vale o máximo do contrato (`checkoutInput`: 20 por assinatura).
  const effectiveMax = policy.max ?? MAX_DEPENDENTS_PER_SUBSCRIPTION
  const atLimit = dependents.length >= effectiveMax
  const overLimit = policy.max !== null && dependents.length > policy.max
  const next = dependentCharge(quote, dependents.length)
  const split = describeDependentsSplit(quote)
  const reduceMotion = useReducedMotion()

  const priceChips: string[] =
    policy.unitPrice === 0
      ? ['Dependentes sem custo extra']
      : policy.included > 0
        ? [
            `${policy.included} incluso${policy.included === 1 ? '' : 's'} no plano`,
            `A partir do ${policy.included + 1}º: +${formatBRL(policy.unitPrice)}/mês cada`,
          ]
        : [`+${formatBRL(policy.unitPrice)}/mês por dependente`]
  const limitLabel =
    policy.max === null ? 'Sem limite de dependentes' : `Até ${policy.max} dependente${policy.max === 1 ? '' : 's'}`

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {priceChips.map((chip, index) => (
            <span
              key={chip}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium',
                index === 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground/80',
              )}
            >
              {index === 0 ? <Users className="size-3.5" aria-hidden /> : null}
              {chip}
            </span>
          ))}
          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground">
            {limitLabel}
          </span>
        </div>
        {!policy.individual ? (
          <p className="text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground/80">Parentescos aceitos:</span> {describeDependentRules(plan)}
          </p>
        ) : null}
      </div>

      {dependents.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <HeartHandshake className="size-4 shrink-0 text-primary" aria-hidden />
          Nenhum dependente. Inclua quem o plano aceita para que também tenha carteirinha e benefícios.
        </p>
      ) : null}

      <ol className="space-y-3" aria-label="Dependentes">
        <AnimatePresence initial={false}>
          {dependents.map((dependent, index) => {
            const fieldErrors = errors[dependent.key] ?? {}
            const idBase = dependent.key
            const charge = dependentCharge(quote, index)
            const relationshipOutOfPlan = dependent.relationship !== '' && !allowed.has(dependent.relationship)
            return (
              <motion.li
                key={dependent.key}
                layout={!reduceMotion}
                initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.15 } }}
                transition={{ duration: 0.15 }}
                className="rounded-xl border bg-background p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {dependent.name.trim() || `Dependente ${index + 1}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dependent.relationship ? DEPENDENT_RELATIONSHIP_LABELS[dependent.relationship] : 'Dependente'}
                        {' · '}
                        {charge.included ? (
                          <span className="font-medium text-emerald-700 dark:text-emerald-400">Incluso no plano</span>
                        ) : (
                          <span className="font-medium text-foreground">+{formatBRL(charge.price)}/mês</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(dependent.key)}
                    className="size-10 shrink-0 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remover ${dependent.name.trim() || `dependente ${index + 1}`}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <CheckoutField
                    id={`${idBase}-name`}
                    label="Nome completo"
                    autoComplete="off"
                    autoCapitalize="words"
                    value={dependent.name}
                    error={fieldErrors.name}
                    onChange={event => onChange(dependent.key, 'name', event.target.value)}
                    onBlur={() => onBlur(dependent.key, 'name')}
                    containerClassName="sm:col-span-2"
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor={`${idBase}-relationship`} className="text-sm font-medium text-foreground">
                      Parentesco
                    </Label>
                    <Select
                      // Sempre controlado: `''` = sem escolha (mostra o placeholder no Radix 2).
                      value={dependent.relationship}
                      onValueChange={value => {
                        onChange(dependent.key, 'relationship', value)
                        onBlur(dependent.key, 'relationship')
                      }}
                    >
                      <SelectTrigger
                        id={`${idBase}-relationship`}
                        aria-invalid={fieldErrors.relationship ? true : undefined}
                        aria-describedby={fieldErrors.relationship ? `${idBase}-relationship-error` : undefined}
                        className={cn(
                          'h-12 w-full rounded-xl bg-background text-base md:text-[15px]',
                          fieldErrors.relationship && 'border-destructive',
                        )}
                      >
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {rules.map(rule => (
                          <SelectItem key={rule.relationship} value={rule.relationship}>
                            {rule.maxAge === null
                              ? DEPENDENT_RELATIONSHIP_LABELS[rule.relationship]
                              : `${DEPENDENT_RELATIONSHIP_LABELS[rule.relationship]} · até ${rule.maxAge} anos`}
                          </SelectItem>
                        ))}
                        {relationshipOutOfPlan && dependent.relationship ? (
                          <SelectItem value={dependent.relationship} disabled>
                            {`${DEPENDENT_RELATIONSHIP_LABELS[dependent.relationship]} (não aceito neste plano)`}
                          </SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                    {fieldErrors.relationship ? (
                      <p
                        id={`${idBase}-relationship-error`}
                        className="flex items-start gap-1.5 text-[13px] leading-snug text-destructive"
                        role="alert"
                      >
                        <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
                        {fieldErrors.relationship}
                      </p>
                    ) : null}
                  </div>
                  <CheckoutField
                    id={`${idBase}-birthDate`}
                    label="Data de nascimento"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="DD/MM/AAAA"
                    value={dependent.birthDate}
                    error={fieldErrors.birthDate}
                    onChange={event => onChange(dependent.key, 'birthDate', maskDateBR(event.target.value))}
                    onBlur={() => onBlur(dependent.key, 'birthDate')}
                  />
                  <CheckoutField
                    id={`${idBase}-cpf`}
                    label="CPF"
                    optional
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000.000.000-00"
                    value={dependent.cpf}
                    error={fieldErrors.cpf}
                    hint="Ajuda na identificação na rede credenciada."
                    onChange={event => onChange(dependent.key, 'cpf', maskCpf(event.target.value))}
                    onBlur={() => onBlur(dependent.key, 'cpf')}
                    containerClassName="sm:col-span-2"
                  />
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ol>

      {listError ? (
        <p
          id="dependents-list-error"
          className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {listError}.{' '}
            {overLimit
              ? `Remova ${dependents.length - (policy.max ?? 0)} para continuar ou escolha outro plano.`
              : 'Revise a lista para continuar.'}
            {onChangePlan ? (
              <button type="button" onClick={onChangePlan} className="ml-1 font-semibold underline underline-offset-2">
                Trocar de plano
              </button>
            ) : null}
          </span>
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant="outline"
          disabled={atLimit}
          onClick={onAddAndFocus}
          className="h-12 flex-1 rounded-xl border-2 border-dashed text-base font-semibold hover:border-primary hover:bg-primary/5 hover:text-primary"
        >
          <Plus className="size-5" aria-hidden />
          {dependents.length === 0 ? 'Adicionar dependente' : 'Adicionar outro dependente'}
          {!atLimit ? (
            <span className="font-normal text-muted-foreground">
              {next.included ? 'incluso' : `+${formatBRL(next.price)}/mês`}
            </span>
          ) : null}
        </Button>
      </div>
      {atLimit && !overLimit ? (
        <p className="text-center text-sm text-muted-foreground">
          Você chegou ao limite de {effectiveMax} dependente{effectiveMax === 1 ? '' : 's'}{' '}
          {policy.max === null ? 'por assinatura' : 'deste plano'}.
        </p>
      ) : null}

      {dependents.length > 0 ? (
        <div className="space-y-0.5 text-right text-sm text-muted-foreground" aria-live="polite">
          {split ? <p>{split}</p> : null}
          <p>
            Titular + {dependents.length} dependente{dependents.length === 1 ? '' : 's'}:{' '}
            <strong className="text-base font-bold text-foreground">{formatBRL(quote.total)}</strong>/mês
          </p>
        </div>
      ) : null}
    </div>
  )
}
