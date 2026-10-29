'use client'

import type { ReactNode } from 'react'
import { Building2, MapPin, Palette, type LucideIcon } from 'lucide-react'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Tenant, TenantPlan } from '@/lib/types'

/**
 * Aba "Dados do clube": cadastro e aparência num formulário só, com um único
 * botão "Salvar alterações" (que fica na tela do clube). A situação do clube
 * (ativo, suspenso, encerrado) NÃO é editada aqui: tem seção própria, com
 * confirmação.
 */

function Section({
  title,
  description,
  icon,
  children,
  columns = 'sm:grid-cols-2',
}: {
  title: string
  description?: string
  icon?: LucideIcon
  children: ReactNode
  columns?: string
}) {
  return (
    <SectionCard title={title} description={description} icon={icon}>
      <div className={`grid gap-4 ${columns}`}>{children}</div>
    </SectionCard>
  )
}

function FormField({
  id,
  label,
  className,
  children,
}: {
  id: string
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <Label htmlFor={id} className="text-[13px] font-medium text-[#344054]">
        {label}
      </Label>
      {children}
    </div>
  )
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <FormField id={id} label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} (escolher cor)`}
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
          onChange={event => onChange(event.target.value)}
          className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-input"
        />
        <Input id={id} value={value} onChange={event => onChange(event.target.value)} />
      </div>
    </FormField>
  )
}

export function ClubDataForm({
  draft,
  onChange,
  plans,
}: {
  draft: Tenant
  onChange: (next: Tenant) => void
  plans: TenantPlan[]
}) {
  const setAddress = (patch: Partial<Tenant['address']>) => onChange({ ...draft, address: { ...draft.address, ...patch } })
  const setBranding = (patch: Partial<Tenant['branding']>) =>
    onChange({ ...draft, branding: { ...draft.branding, ...patch } })

  return (
    <div className="flex flex-col gap-6">
      <Section title="Dados principais" icon={Building2}>
        <FormField id="club-name" label="Nome do clube">
          <Input id="club-name" value={draft.name} onChange={event => onChange({ ...draft, name: event.target.value })} />
        </FormField>
        <FormField id="club-legal-name" label="Razão social">
          <Input
            id="club-legal-name"
            value={draft.legalName}
            onChange={event => onChange({ ...draft, legalName: event.target.value })}
          />
        </FormField>
        <FormField id="club-document" label="CNPJ">
          <Input
            id="club-document"
            inputMode="numeric"
            value={draft.document}
            onChange={event => onChange({ ...draft, document: event.target.value })}
          />
        </FormField>
        <FormField id="club-email" label="E-mail do clube">
          <Input
            id="club-email"
            type="email"
            value={draft.email}
            onChange={event => onChange({ ...draft, email: event.target.value })}
          />
        </FormField>
        <FormField id="club-phone" label="Telefone">
          <Input
            id="club-phone"
            type="tel"
            value={draft.phone}
            onChange={event => onChange({ ...draft, phone: event.target.value })}
          />
        </FormField>
        <FormField id="club-plan" label="Plano ANNETEC">
          <Select value={draft.planId} onValueChange={value => onChange({ ...draft, planId: value })}>
            <SelectTrigger id="club-plan" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {plans.map(plan => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.name} — R$ {plan.priceMonthly.toLocaleString('pt-BR')}/mês
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </Section>

      <Section title="Endereço" icon={MapPin} columns="sm:grid-cols-3">
        <FormField id="club-cep" label="CEP">
          <Input
            id="club-cep"
            inputMode="numeric"
            value={draft.address.cep}
            onChange={event => setAddress({ cep: event.target.value })}
          />
        </FormField>
        <FormField id="club-street" label="Rua" className="sm:col-span-2">
          <Input id="club-street" value={draft.address.street} onChange={event => setAddress({ street: event.target.value })} />
        </FormField>
        <FormField id="club-number" label="Número">
          <Input id="club-number" value={draft.address.number} onChange={event => setAddress({ number: event.target.value })} />
        </FormField>
        <FormField id="club-neighborhood" label="Bairro">
          <Input
            id="club-neighborhood"
            value={draft.address.neighborhood}
            onChange={event => setAddress({ neighborhood: event.target.value })}
          />
        </FormField>
        <FormField id="club-city" label="Cidade">
          <Input id="club-city" value={draft.address.city} onChange={event => setAddress({ city: event.target.value })} />
        </FormField>
        <FormField id="club-state" label="Estado (UF)">
          <Input
            id="club-state"
            value={draft.address.state}
            maxLength={2}
            onChange={event => setAddress({ state: event.target.value.toUpperCase() })}
          />
        </FormField>
      </Section>

      <Section
        title="Aparência"
        icon={Palette}
        description="Pinta o site do clube, a tela de login e o painel da equipe."
      >
        <ColorField
          id="club-primary-color"
          label="Cor principal"
          value={draft.branding.primaryColor}
          onChange={value => setBranding({ primaryColor: value })}
        />
        <ColorField
          id="club-secondary-color"
          label="Cor secundária"
          value={draft.branding.secondaryColor}
          onChange={value => setBranding({ secondaryColor: value })}
        />
        <FormField id="club-logo" label="Endereço do logo (link da imagem)" className="sm:col-span-2">
          <Input
            id="club-logo"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={draft.branding.logoUrl ?? ''}
            onChange={event => setBranding({ logoUrl: event.target.value })}
          />
        </FormField>
      </Section>
    </div>
  )
}
