'use client'

import { Building, CalendarDays, CircleCheck, CircleX, Landmark, MapPin, Tag } from 'lucide-react'
import {
  LEGAL_FORM_LABELS,
  LEGAL_NATURE_CODES_BY_FORM,
  formatDateBR,
  isLegalNatureCompatible,
  legalForm as legalFormSchema,
  type CnpjLookupResult,
  type LegalForm,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { formatCnpj } from '@/lib/adapters/contratacao'
import { cn } from '@/lib/utils'
import { Notice, Pill } from './ui'

function formatCnae(code: string): string {
  const d = code.replace(/\D/g, '')
  return d.length === 7 ? `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5)}` : code
}

/** Formas jurídicas cujas naturezas aceitas incluem o código da Receita. */
export function formsForNature(code: string | null | undefined): LegalForm[] {
  if (!code) return []
  return legalFormSchema.options.filter(form => LEGAL_NATURE_CODES_BY_FORM[form].includes(code))
}

/**
 * Cartão com o que a Receita devolveu (razão social, situação, natureza,
 * CNAE, endereço) e os alertas que a pré-checagem também vai apontar.
 */
export function ReceitaCard({
  result,
  legalForm,
  onUseForm,
  compact,
}: {
  result: CnpjLookupResult
  legalForm: LegalForm | null
  onUseForm?: (form: LegalForm) => void
  compact?: boolean
}) {
  const active = result.registrationStatus.toUpperCase() === 'ATIVA'
  const compatible = legalForm ? isLegalNatureCompatible(legalForm, result.legalNatureCode) : null
  const suggestions = compatible === false ? formsForNature(result.legalNatureCode).filter(form => form !== legalForm) : []
  const address = [
    [result.address.street, result.address.number].filter(Boolean).join(', '),
    result.address.neighborhood,
    [result.address.city, result.address.state].filter(Boolean).join('/'),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dados da Receita Federal</p>
            <p className="mt-1 font-display text-lg font-bold leading-tight text-foreground">{result.legalName}</p>
            {result.tradeName ? <p className="text-sm text-muted-foreground">{result.tradeName}</p> : null}
          </div>
          <Pill tone={active ? 'success' : 'danger'}>
            {active ? <CircleCheck className="size-3.5" aria-hidden /> : <CircleX className="size-3.5" aria-hidden />}
            Situação: {result.registrationStatus}
          </Pill>
        </div>
        <dl className={cn('mt-4 grid gap-3 text-[13px]', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2')}>
          <div className="flex items-start gap-2">
            <Tag className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <div>
              <dt className="text-muted-foreground">CNPJ</dt>
              <dd className="font-medium tabular-nums text-foreground">{formatCnpj(result.cnpj)}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CalendarDays className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <div>
              <dt className="text-muted-foreground">Abertura</dt>
              <dd className="font-medium text-foreground">{result.openingDate ? formatDateBR(result.openingDate) : 'não informada'}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Landmark className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <div>
              <dt className="text-muted-foreground">Natureza jurídica</dt>
              <dd className="font-medium text-foreground">
                {result.legalNatureCode ? `${result.legalNatureCode} · ` : ''}
                {result.legalNatureName ?? 'não informada'}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Building className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <div>
              <dt className="text-muted-foreground">Atividade principal</dt>
              <dd className="font-medium text-foreground">
                {result.mainCnae ? `${formatCnae(result.mainCnae.code)} · ${result.mainCnae.description}` : 'não informada'}
              </dd>
            </div>
          </div>
          {!compact && address ? (
            <div className="flex items-start gap-2 sm:col-span-2">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              <div>
                <dt className="text-muted-foreground">Endereço da sede</dt>
                <dd className="font-medium text-foreground">{address}</dd>
              </div>
            </div>
          ) : null}
        </dl>
        {result.provider === 'simulated' ? (
          <p className="mt-3 text-[11px] text-muted-foreground">Consulta simulada (dados fictícios de demonstração).</p>
        ) : null}
      </div>

      {!active ? (
        <Notice tone="error" title="A situação cadastral precisa estar ATIVA.">
          {result.registrationStatusReason ? `${result.registrationStatusReason}. ` : ''}
          Você pode seguir com a proposta, mas a análise cadastral não aprova CNPJ inativo na Receita.
        </Notice>
      ) : null}

      {compatible === false && legalForm ? (
        <Notice tone="warning" title="A natureza jurídica não bate com a forma escolhida.">
          Na Receita consta “{result.legalNatureName ?? result.legalNatureCode}”, que não costuma corresponder a{' '}
          {LEGAL_FORM_LABELS[legalForm]}. Confira a forma jurídica — a divergência vira um alerta na análise.
          {suggestions.length && onUseForm ? (
            <span className="mt-2 flex flex-wrap gap-2">
              {suggestions.map(form => (
                <Button
                  key={form}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full bg-background text-foreground"
                  onClick={() => onUseForm(form)}
                >
                  Usar {LEGAL_FORM_LABELS[form]}
                </Button>
              ))}
            </span>
          ) : null}
        </Notice>
      ) : null}
    </div>
  )
}
