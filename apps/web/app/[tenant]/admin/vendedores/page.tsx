'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Mail, MapPin, Pencil, Phone, Plus, Target, TrendingUp, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { SalesGoal } from '@annetec/contracts'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyStateCard } from '@/components/dashboard/empty-state'
import { FormDialog, FormField, FormRow } from '@/components/dashboard/form-dialog'
import { PageHeader } from '@/components/dashboard/page-header'
import { SearchInput, StatusPill } from '@/components/dashboard/table-controls'
import { useActionData } from '@/components/admin/faturamento/use-action-data'
import { useTenant } from '@/contexts/tenant-context'
import { getAllSellers, useTenantData } from '@/contexts/tenant-data-context'
import { listOperatorSalesGoalsAction, upsertOperatorSalesGoalAction } from '@/lib/actions/operator-crm-api'
import { formatBRL } from '@/lib/adapters/faturamento'
import type { Seller } from '@/lib/types'
import { getInitials } from '@/lib/utils'

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

function performanceOf(percent: number) {
  if (percent >= 100) return { label: 'Meta batida', className: 'bg-emerald-50 text-emerald-700' }
  if (percent >= 75) return { label: 'Perto da meta', className: 'bg-sky-50 text-sky-700' }
  if (percent >= 50) return { label: 'No meio do caminho', className: 'bg-amber-50 text-amber-700' }
  return { label: 'Abaixo da meta', className: 'bg-red-50 text-red-600' }
}

/** Valor digitado em reais ("1.500,50" ou "1500.5") para número; `null` se inválido. */
function parseMoney(text: string): number | null {
  const trimmed = text.trim().replace(/[R$\s]/g, '')
  if (!trimmed) return null
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed
  const value = Number(normalized)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export default function VendedoresPage() {
  const { tenant } = useTenant()
  const slug = tenant?.slug ?? ''
  const base = slug ? `/${slug}/admin` : ''
  const { users, sales, isLoading } = useTenantData()

  const now = new Date()
  const year = now.getFullYear()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Seller | null>(null)
  const [target, setTarget] = useState('')
  const [rate, setRate] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const goals = useActionData(slug ? () => listOperatorSalesGoalsAction(slug, year) : null, [slug, year])

  const sellers = useMemo(
    () =>
      getAllSellers(users).filter(seller => (seller.accessStatus ?? (seller.active === false ? 'removed' : 'active')) === 'active'),
    [users],
  )

  const visible = sellers.filter(seller => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return [seller.name, seller.email, seller.region ?? ''].some(field => field.toLowerCase().includes(term))
  })

  function goalOf(sellerId: string): SalesGoal | undefined {
    return (goals.data ?? []).find(goal => goal.sellerId === sellerId && goal.month === month && goal.year === year)
  }

  /** Vendas finalizadas do vendedor no mês escolhido (progresso e comissão estimada). */
  function monthSalesOf(sellerId: string) {
    return sales.filter(sale => {
      const date = new Date(sale.date)
      return (
        sale.sellerId === sellerId &&
        sale.status === 'confirmed' &&
        date.getMonth() + 1 === month &&
        date.getFullYear() === year
      )
    })
  }

  function openGoal(seller: Seller) {
    const goal = goalOf(seller.id)
    setTarget(goal ? String(goal.target).replace('.', ',') : '')
    setRate(goal ? String(Math.round(goal.commissionRate * 10000) / 100).replace('.', ',') : '')
    setFieldErrors({})
    setEditing(seller)
  }

  async function submitGoal(): Promise<string | void> {
    if (!editing) return
    const errors: Record<string, string> = {}
    const targetValue = parseMoney(target)
    if (targetValue === null) errors.target = 'Informe a meta em reais, por exemplo 15000.'
    const rateValue = rate.trim() === '' ? 0 : Number(rate.replace(',', '.'))
    if (!Number.isFinite(rateValue) || rateValue < 0 || rateValue > 100) errors.rate = 'Use um valor entre 0 e 100.'
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return 'Confira os campos destacados abaixo.'
    }

    const result = await upsertOperatorSalesGoalAction(slug, {
      sellerId: editing.id,
      month,
      year,
      target: targetValue ?? 0,
      commissionRate: rateValue / 100,
    })
    if (!result.success) return result.error

    const saved = result.data
    const others = (goals.data ?? []).filter(goal => goal.id !== saved.id)
    goals.setData([...others, saved])
    toast.success('Meta salva', { description: `${editing.name} · ${MONTHS[month - 1]} de ${year}` })
  }

  if (isLoading) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendedores e metas"
        description="A equipe de vendas do clube, a meta de cada mês e quanto já foi vendido."
      >
        <Select value={String(month)} onValueChange={value => setMonth(Number(value))}>
          <SelectTrigger className="h-11 w-44 bg-card" aria-label="Mês das metas">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((name, index) => (
              <SelectItem key={name} value={String(index + 1)}>
                {name} de {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button asChild className="h-11 gap-2 px-5">
          <Link href={`${base}/usuarios?novo=vendedor`}>
            <Plus className="h-4 w-4" />
            Novo vendedor
          </Link>
        </Button>
      </PageHeader>

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome, e-mail ou região" />

      {goals.error && !goals.data && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Não foi possível carregar as metas: {goals.error}{' '}
          <button type="button" className="font-medium underline" onClick={() => void goals.reload()}>
            Tentar de novo
          </button>
        </p>
      )}

      {goals.loading && !goals.data && sellers.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map(item => (
            <Skeleton key={item} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : sellers.length === 0 ? (
        <EmptyStateCard
          icon={Users}
          title="Nenhum vendedor cadastrado"
          description="Cadastre quem vende pelo clube. Cada vendedor recebe um acesso ao portal próprio, com leads, vendas e metas."
          action={
            <Button asChild className="gap-2">
              <Link href={`${base}/usuarios?novo=vendedor`}>
                <Plus className="h-4 w-4" />
                Cadastrar vendedor
              </Link>
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyStateCard icon={Users} title="Nenhum vendedor encontrado" description="Tente outro termo de busca." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map(seller => {
            const goal = goalOf(seller.id)
            const monthSales = monthSalesOf(seller.id)
            const soldByList = monthSales.reduce((sum, sale) => sum + sale.value, 0)
            const achieved = goal ? goal.achieved : soldByList
            const targetValue = goal?.target ?? 0
            const percent = targetValue > 0 ? (achieved / targetValue) * 100 : 0
            const estimatedCommission = monthSales.reduce((sum, sale) => sum + sale.commission, 0)
            const performance = goal && targetValue > 0 ? performanceOf(percent) : null

            return (
              <Card key={seller.id} className="gap-0 py-0 shadow-sm">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                        {getInitials(seller.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-foreground">{seller.name}</h3>
                        {performance && <StatusPill {...performance} />}
                      </div>
                      <p className="flex items-center gap-2 truncate text-sm text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        {seller.email}
                      </p>
                      {seller.phone && (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          {seller.phone}
                        </p>
                      )}
                      {seller.region && (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {seller.region}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl bg-muted/40 p-4">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Target className="h-4 w-4" />
                        Meta de {MONTHS[month - 1].toLowerCase()}
                      </span>
                      {goal ? (
                        <span className="font-medium text-foreground">
                          {formatBRL(achieved)} de {formatBRL(targetValue)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sem meta definida</span>
                      )}
                    </div>
                    {goal && targetValue > 0 && (
                      <>
                        <Progress value={Math.min(percent, 100)} aria-label={`${Math.round(percent)}% da meta`} />
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <TrendingUp className="h-3 w-3" />
                          {Math.round(percent)}% da meta · {monthSales.length}{' '}
                          {monthSales.length === 1 ? 'venda finalizada' : 'vendas finalizadas'}
                        </p>
                      </>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Comissão {goal ? `de ${Math.round(goal.commissionRate * 10000) / 100}%` : 'não definida'} ·
                      estimada pelas vendas do mês: {formatBRL(estimatedCommission)}
                    </p>
                  </div>

                  <Button variant="outline" size="sm" className="gap-2" onClick={() => openGoal(seller)}>
                    <Pencil className="h-3.5 w-3.5" />
                    {goal ? 'Editar meta do mês' : 'Definir meta do mês'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <FormDialog
        open={editing !== null}
        onOpenChange={open => {
          if (!open) setEditing(null)
        }}
        title={editing ? `Meta de ${editing.name}` : 'Meta do mês'}
        description={`Vale para ${MONTHS[month - 1].toLowerCase()} de ${year}. O realizado é somado das vendas do vendedor.`}
        submitLabel="Salvar meta"
        onSubmit={submitGoal}
      >
        <FormRow>
          <FormField label="Meta de vendas (R$)" htmlFor="goal-target" required error={fieldErrors.target}>
            <Input
              id="goal-target"
              inputMode="decimal"
              value={target}
              onChange={event => setTarget(event.target.value)}
              placeholder="15000"
              aria-invalid={Boolean(fieldErrors.target)}
            />
          </FormField>
          <FormField
            label="Comissão (%)"
            htmlFor="goal-rate"
            error={fieldErrors.rate}
            hint="Sobre as vendas do mês."
          >
            <Input
              id="goal-rate"
              inputMode="decimal"
              value={rate}
              onChange={event => setRate(event.target.value)}
              placeholder="10"
              aria-invalid={Boolean(fieldErrors.rate)}
            />
          </FormField>
        </FormRow>
      </FormDialog>
    </div>
  )
}
