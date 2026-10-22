'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarCheck, Globe, Mail, MapPin, Phone, Search, SearchX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { Partner, PartnerCategory } from '@/lib/types'
import { cn } from '@/lib/utils'
import { PARTNER_CATEGORIES } from './categories'
import { displayHost, externalHref, formatPhone, normalize, percent, pluralize, splitCityUf, telHref } from './format'
import { IconBadge, Reveal, Section, SectionHeader } from './section'
import { useVitrine, type PartnerGroup } from './vitrine-context'

function DiscountBadge({ value, prefix = 'até' }: { value: number; prefix?: string }) {
  if (value <= 0) return null
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-sm">
      {prefix ? `${prefix} ` : ''}
      {percent(value)} OFF
    </span>
  )
}

function PartnerGroupCard({ group }: { group: PartnerGroup }) {
  const meta = PARTNER_CATEGORIES[group.category] ?? PARTNER_CATEGORIES.other
  const extraCities = group.cities.length - 2
  return (
    <article className="flex h-full flex-col rounded-3xl border border-border/70 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/5">
      <div className="flex items-start justify-between gap-3">
        <IconBadge icon={meta.icon} className="size-11 rounded-xl" />
        <DiscountBadge value={group.maxDiscount} />
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{meta.label}</p>
      <h3 className="mt-1 font-semibold text-foreground">{group.name}</h3>
      {group.tagline && <p className="mt-1 text-sm text-muted-foreground">{group.tagline}</p>}
      {group.cities.length > 0 && (
        <p className="mt-auto flex items-start gap-1.5 pt-4 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {group.cities.slice(0, 2).join(', ')}
          {extraCities > 0 ? ` e mais ${pluralize(extraCities, 'cidade', 'cidades')}` : ''}
        </p>
      )}
    </article>
  )
}

/** Prévia da rede na landing: os parceiros com maior desconto primeiro. */
export function NetworkPreview({ limit = 8, tone = 'white' }: { limit?: number; tone?: 'white' | 'soft' }) {
  const { content, partnerGroups, stats, paths, dataLoading } = useVitrine()
  const net = content.network

  if (!dataLoading && partnerGroups.length === 0) return null

  const summary = [
    stats.partnerCount > 0 && pluralize(stats.partnerCount, 'parceiro', 'parceiros'),
    stats.unitCount > stats.partnerCount && pluralize(stats.unitCount, 'unidade', 'unidades'),
    stats.cities.length > 0 && pluralize(stats.cities.length, 'cidade', 'cidades'),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Section tone={tone} labelledBy="rede-titulo">
      <SectionHeader
        id="rede-titulo"
        eyebrow={net.eyebrow}
        title={net.title}
        description={summary ? `${net.description} ${summary}.` : net.description}
      />
      {dataLoading && partnerGroups.length === 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-3xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {partnerGroups.slice(0, limit).map((group, index) => (
            <Reveal key={group.key} delay={Math.min(index, 7) * 0.04} className="h-full">
              <PartnerGroupCard group={group} />
            </Reveal>
          ))}
        </div>
      )}
      <div className="mt-10 text-center">
        <Button size="lg" variant="outline" className="h-12 rounded-full border-2 px-7 font-semibold" asChild>
          <Link href={paths.network}>
            {net.cta}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </Section>
  )
}

function PartnerUnitCard({ partner }: { partner: Partner }) {
  const meta = PARTNER_CATEGORIES[partner.category] ?? PARTNER_CATEGORIES.other
  const { city, uf } = splitCityUf(partner.city)
  const tel = telHref(partner.phone)
  const site = externalHref(partner.website)
  const since = partner.since ? new Date(partner.since) : null
  const sinceYear = since && !Number.isNaN(since.getTime()) ? since.getUTCFullYear() : null

  return (
    <article className="flex h-full flex-col rounded-3xl border border-border/70 bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconBadge icon={meta.icon} className="size-11 rounded-xl" />
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-foreground">{partner.name}</h3>
            <p className="text-xs font-medium text-muted-foreground">{meta.label}</p>
          </div>
        </div>
        <DiscountBadge value={partner.discountPercent} prefix="" />
      </div>

      {partner.tagline && <p className="mt-3 text-sm text-muted-foreground">{partner.tagline}</p>}

      {partner.specialties && partner.specialties.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Especialidades">
          {partner.specialties.map(specialty => (
            <li key={specialty} className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
              {specialty}
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-auto space-y-2 pt-5 text-sm text-muted-foreground">
        {(partner.address || city) && (
          <li className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {[partner.address, city && (uf ? `${city} - ${uf}` : city)].filter(Boolean).join(' · ')}
            </span>
          </li>
        )}
        {tel && (
          <li>
            <a href={tel} className="inline-flex items-center gap-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Phone className="size-4 shrink-0" aria-hidden="true" />
              {formatPhone(partner.phone)}
            </a>
          </li>
        )}
        {partner.email && (
          <li>
            <a
              href={`mailto:${partner.email}`}
              className="inline-flex items-center gap-2 break-all hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Mail className="size-4 shrink-0" aria-hidden="true" />
              {partner.email}
            </a>
          </li>
        )}
        {site && (
          <li>
            <a
              href={site}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 break-all hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Globe className="size-4 shrink-0" aria-hidden="true" />
              {displayHost(site)}
            </a>
          </li>
        )}
        {sinceYear && (
          <li className="flex items-center gap-2 text-xs">
            <CalendarCheck className="size-4 shrink-0" aria-hidden="true" />
            Credenciado desde {sinceYear}
          </li>
        )}
      </ul>
    </article>
  )
}

const TODOS = 'todos'

/** Diretório completo da rede, com busca e filtros — página `/rede`. */
export function PartnerDirectory() {
  const { partners, stats, dataLoading } = useVitrine()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<PartnerCategory | typeof TODOS>(TODOS)
  const [uf, setUf] = useState(TODOS)
  const [city, setCity] = useState(TODOS)
  const [specialty, setSpecialty] = useState(TODOS)

  const units = useMemo(
    () =>
      partners
        .map(partner => ({ partner, ...splitCityUf(partner.city) }))
        .sort((a, b) => b.partner.discountPercent - a.partner.discountPercent || a.partner.name.localeCompare(b.partner.name, 'pt-BR')),
    [partners],
  )

  const categoryCounts = useMemo(() => {
    const counts = new Map<PartnerCategory, number>()
    for (const { partner } of units) counts.set(partner.category, (counts.get(partner.category) ?? 0) + 1)
    return counts
  }, [units])

  const cityOptions = useMemo(
    () =>
      [...new Set(units.filter(u => uf === TODOS || u.uf === uf).map(u => u.city).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [units, uf],
  )

  const specialtyOptions = useMemo(
    () =>
      [...new Set(units.flatMap(u => u.partner.specialties ?? []).map(s => s.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [units],
  )

  const results = useMemo(() => {
    const term = normalize(query)
    return units.filter(u => {
      if (category !== TODOS && u.partner.category !== category) return false
      if (uf !== TODOS && u.uf !== uf) return false
      if (city !== TODOS && u.city !== city) return false
      if (specialty !== TODOS && !(u.partner.specialties ?? []).includes(specialty)) return false
      if (!term) return true
      return normalize(
        [u.partner.name, u.partner.tagline, u.partner.address, u.city, ...(u.partner.specialties ?? [])].filter(Boolean).join(' '),
      ).includes(term)
    })
  }, [units, query, category, uf, city, specialty])

  const filtered = query !== '' || category !== TODOS || uf !== TODOS || city !== TODOS || specialty !== TODOS
  const clear = () => {
    setQuery('')
    setCategory(TODOS)
    setUf(TODOS)
    setCity(TODOS)
    setSpecialty(TODOS)
  }

  if (dataLoading && partners.length === 0) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-64 rounded-3xl" />
        ))}
      </div>
    )
  }

  if (partners.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-primary/40 bg-white p-10 text-center">
        <h2 className="text-xl font-bold text-foreground">Rede credenciada em expansão</h2>
        <p className="mt-2 text-muted-foreground">Novos parceiros estão chegando. Fale com a gente para saber mais.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="rounded-3xl bg-white p-4 shadow-lg ring-1 ring-border/60 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[1.6fr_1fr_1fr] lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="relative md:col-span-3 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <label htmlFor="busca-rede" className="sr-only">
              Buscar por nome, especialidade ou bairro
            </label>
            <Input
              id="busca-rede"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Buscar por nome ou especialidade"
              className="h-11 rounded-xl pl-10"
            />
          </div>
          {stats.ufs.length > 1 && (
            <FilterSelect
              label="Estado"
              value={uf}
              onChange={value => {
                setUf(value)
                setCity(TODOS)
              }}
              options={stats.ufs}
              allLabel="Todos os estados"
            />
          )}
          <FilterSelect label="Cidade" value={city} onChange={setCity} options={cityOptions} allLabel="Todas as cidades" />
          <FilterSelect
            label="Especialidade"
            value={specialty}
            onChange={setSpecialty}
            options={specialtyOptions}
            allLabel="Todas as especialidades"
          />
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none" role="group" aria-label="Filtrar por categoria">
          <CategoryChip active={category === TODOS} onClick={() => setCategory(TODOS)} label="Todas" count={units.length} />
          {stats.categories.map(c => (
            <CategoryChip
              key={c}
              active={category === c}
              onClick={() => setCategory(c)}
              label={PARTNER_CATEGORIES[c].label}
              count={categoryCounts.get(c) ?? 0}
            />
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {pluralize(results.length, 'unidade encontrada', 'unidades encontradas')}
        </p>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={clear} className="text-primary">
            <X className="size-4" aria-hidden="true" />
            Limpar filtros
          </Button>
        )}
      </div>

      {results.length === 0 ? (
        <div className="mt-4 rounded-3xl border border-dashed border-border bg-white p-10 text-center">
          <SearchX className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">Nenhum parceiro com esses filtros</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tente outra busca ou limpe os filtros para ver a rede completa.</p>
          <Button variant="outline" className="mt-5 rounded-full" onClick={clear}>
            Limpar filtros
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map(({ partner }) => (
            <PartnerUnitCard key={partner.id} partner={partner} />
          ))}
        </div>
      )}
    </div>
  )
}

function CategoryChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-white text-foreground hover:border-primary/40 hover:bg-accent',
      )}
    >
      {label}
      <span className={cn('rounded-full px-1.5 text-xs', active ? 'bg-white/20' : 'bg-accent text-muted-foreground')}>{count}</span>
    </button>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  allLabel: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-11 w-full rounded-xl" aria-label={label}>
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{allLabel}</SelectItem>
        {options.map(option => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Faixa de conversão da página da rede. */
export function NetworkCta() {
  const { content, primaryCta, stats } = useVitrine()
  return (
    <Reveal>
      <div className="flex flex-col items-start justify-between gap-5 rounded-3xl bg-secondary p-6 text-secondary-foreground sm:flex-row sm:items-center sm:p-8">
        <div>
          <p className="text-lg font-bold sm:text-xl">{content.network.directoryCta}</p>
          <p className="mt-1 text-sm opacity-80">
            {stats.maxDiscount > 0
              ? `Associados têm até ${percent(stats.maxDiscount)} de desconto na rede credenciada.`
              : 'Associados têm desconto na rede credenciada.'}
          </p>
        </div>
        <Button size="lg" className="h-12 shrink-0 rounded-full px-7 font-semibold" asChild>
          <Link href={primaryCta.href}>
            {primaryCta.label}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </Reveal>
  )
}
