'use client'

import Link from 'next/link'
import { BadgeCheck, ChevronRight, Package, UserCog, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/dashboard/page-header'
import { useTenant } from '@/contexts/tenant-context'

/**
 * Configurações do clube. Mostra só o que existe de verdade: os dados
 * cadastrais e a identidade visual vindos do cadastro do inquilino, e atalhos
 * para os módulos onde cada ajuste é feito e gravado (régua de cobrança,
 * usuários, planos, assinatura da plataforma).
 *
 * A versão anterior era uma maquete — integrações, 2FA, backups e termos com
 * status inventados e botões "Salvar" que não gravavam nada.
 */
const SETTINGS_SHORTCUTS = [
  {
    segment: 'faturamento?tab=automacao',
    label: 'Cobrança automática',
    hint: 'Formas de pagamento, régua de lembretes, multa, juros e suspensão.',
    icon: Wallet,
  },
  {
    segment: 'usuarios',
    label: 'Usuários e permissões',
    hint: 'Quem acessa o painel, o portal do vendedor e o do associado.',
    icon: UserCog,
  },
  {
    segment: 'planos',
    label: 'Produtos e planos',
    hint: 'Planos vendidos pelo clube, preços e regras de dependentes.',
    icon: Package,
  },
  {
    segment: 'assinatura',
    label: 'Assinatura da plataforma',
    hint: 'Seu plano ANNETEC, faturas e forma de pagamento.',
    icon: BadgeCheck,
  },
]

export default function AdminConfiguracoesPage() {
  const { tenant } = useTenant()
  if (!tenant) return null

  const base = `/${tenant.slug}/admin`
  const address = tenant.address
  const addressText = address?.street
    ? `${address.street}, ${address.number}${address.complement ? ` - ${address.complement}` : ''} - ${
        address.neighborhood
      }\n${address.city} - ${address.state}, ${address.cep}`
    : '—'

  return (
    <div className="space-y-5">
      <PageHeader title="Configurações" description="Dados do clube e onde ajustar cada parte da operação." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Dados do clube</CardTitle>
            <p className="text-xs text-muted-foreground">
              Cadastro usado na plataforma, nas cobranças e nas comunicações. Para alterar, fale com o suporte
              ANNETEC.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome fantasia" value={tenant.name || '—'} />
            <Field label="Razão social" value={tenant.legalName || '—'} />
            <Field label="CNPJ" value={tenant.document || '—'} />
            <Field label="Endereço do portal" value={`/${tenant.slug}`} />
            <Field label="E-mail principal" value={tenant.email || '—'} />
            <Field label="Telefone" value={tenant.phone || '—'} />
            <div className="sm:col-span-2">
              <Field label="Endereço" value={addressText} />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Identidade visual</CardTitle>
            <p className="text-xs text-muted-foreground">
              Logo e cores aplicadas no site do clube, nos portais e na carteirinha.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex h-24 items-center justify-center rounded-xl bg-muted/50">
              {tenant.branding.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenant.branding.logoUrl} alt={tenant.name} className="h-12 object-contain" />
              ) : (
                <span className="text-lg font-bold text-primary">{tenant.name}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ColorSwatch label="Cor primária" color={tenant.branding.primaryColor} />
              <ColorSwatch label="Cor secundária" color={tenant.branding.secondaryColor} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Onde ajustar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {SETTINGS_SHORTCUTS.map(item => {
            const Icon = item.icon
            return (
              <Link
                key={item.segment}
                href={`${base}/${item.segment}`}
                className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-3 transition-colors hover:bg-muted/50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.hint}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="whitespace-pre-line text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}

function ColorSwatch({ label, color }: { label: string; color: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border border-border/60 p-1.5">
        <span className="h-5 w-5 shrink-0 rounded" style={{ backgroundColor: color }} />
        <span className="truncate text-[11px] text-muted-foreground">{color.toUpperCase()}</span>
      </div>
    </div>
  )
}
