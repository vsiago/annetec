'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { ClubSubscription } from '@annetec/contracts'
import {
  ArrowLeft,
  CalendarDays,
  CircleCheckBig,
  Gift,
  Heart,
  HeartHandshake,
  IdCard,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Pill,
  ShieldCheck,
  Smile,
  Stethoscope,
  UserPlus,
  Video,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { DigitalCardMockup } from '@/components/digital-card-mockup'
import { EmptyState } from '@/components/dashboard/empty-state'
import { SectionTab, SectionTabsList } from '@/components/dashboard/section-tabs'
import { StatusPill } from '@/components/dashboard/table-controls'
import { useTenant } from '@/contexts/tenant-context'
import { getAllClients, getAllSellers, useTenantData } from '@/contexts/tenant-data-context'
import { useActionData } from '@/components/admin/faturamento/use-action-data'
import { listClubChargesAction, listClubSubscriptionsAction } from '@/lib/actions/faturamento-api'
import {
  chargeStatusMeta,
  formatBRL,
  formatDateBR,
  paymentMethodLabel,
  subscriptionStatusMeta,
} from '@/lib/adapters/faturamento'
import type { Benefit, Client } from '@/lib/types'
import { cn, getInitials } from '@/lib/utils'

const planStatusMeta: Record<Client['planStatus'], { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-emerald-50 text-emerald-700' },
  pending: { label: 'Pendente', className: 'bg-amber-50 text-amber-700' },
  cancelled: { label: 'Cancelado', className: 'bg-red-50 text-red-600' },
}

const situationMeta: Record<Client['planStatus'], { label: string; hint: string }> = {
  active: { label: 'Em dia', hint: 'Pagamento recorrente' },
  pending: { label: 'Pendente', hint: 'Aguardando confirmação' },
  cancelled: { label: 'Cancelado', hint: 'Sem cobrança ativa' },
}

const benefitIcons: Record<Benefit['category'], typeof Stethoscope> = {
  health: Stethoscope,
  dental: Smile,
  pharmacy: Pill,
  funeral: HeartHandshake,
  discount: Gift,
}

/**
 * Cada benefício ganha uma tinta própria, na ordem em que aparece. É o que
 * dá à faixa de benefícios a leitura de catálogo do painel aprovado, em vez
 * de seis cartões iguais na cor da marca.
 */
const BENEFIT_TONES = [
  { card: 'border-rose-100 bg-rose-50/70', chip: 'bg-white text-rose-500' },
  { card: 'border-sky-100 bg-sky-50/70', chip: 'bg-white text-sky-500' },
  { card: 'border-emerald-100 bg-emerald-50/70', chip: 'bg-white text-emerald-500' },
  { card: 'border-amber-100 bg-amber-50/70', chip: 'bg-white text-amber-500' },
  { card: 'border-violet-100 bg-violet-50/70', chip: 'bg-white text-violet-500' },
  { card: 'border-indigo-100 bg-indigo-50/70', chip: 'bg-white text-indigo-500' },
]


export default function BeneficiarioPage() {
  const params = useParams<{ tenant: string; id: string }>()
  const { tenant } = useTenant()
  const { users, benefits, appointments, isLoading } = useTenantData()
  const [tab, setTab] = useState('visao-geral')

  const client = getAllClients(users).find(item => item.id === params?.id)
  const seller = getAllSellers(users).find(item => item.id === client?.sellerId)

  const base = `/${params?.tenant}/admin`

  const slug = tenant?.slug ?? params?.tenant ?? ''

  /**
   * Assinatura do Clube de Benefícios deste beneficiário. A busca da API (`q`)
   * casa por e-mail/CPF; o filtro por `holder.userId` garante que é a dele e
   * não de outra pessoa com e-mail parecido.
   */
  const subscriptionLookup = useActionData(
    slug && client?.email
      ? () => listClubSubscriptionsAction(slug, { q: client.email, perPage: 20 })
      : null,
    [slug, client?.id, client?.email],
  )
  const subscription = useMemo(() => {
    const items = subscriptionLookup.data?.items ?? []
    const mine = items.filter(
      item =>
        item.holder.userId === client?.id ||
        item.holder.email.toLowerCase() === client?.email.toLowerCase(),
    )
    // A vigente primeiro; cancelada só se não houver outra.
    return mine.find(item => item.status !== 'canceled') ?? mine[0] ?? null
  }, [subscriptionLookup.data, client?.id, client?.email])

  const clientAppointments = useMemo(
    () =>
      appointments
        .filter(item => item.clientId === client?.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [appointments, client?.id],
  )

  if (isLoading) return null

  if (!client) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <EmptyState
            icon={IdCard}
            title="Beneficiário não encontrado"
            description="O cadastro pode ter sido removido ou o link está desatualizado."
            action={
              <Button asChild variant="outline">
                <Link href={`${base}/clientes`}>Voltar para a lista</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    )
  }

  const status = planStatusMeta[client.planStatus]
  const situation = situationMeta[client.planStatus]
  const subscriptionStatus = subscription ? subscriptionStatusMeta(subscription.status) : null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <Link
          href={`${base}/clientes`}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para a lista
        </Link>

      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="flex items-start gap-5 xl:col-span-6">
          <Avatar className="h-24 w-24 shrink-0">
            <AvatarImage src={client.avatar} alt={client.name} />
            <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
              {getInitials(client.name)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{client.name}</h1>
              <StatusPill {...status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Beneficiário desde {new Date(client.contractDate).toLocaleDateString('pt-BR')}
            </p>

            <div className="grid gap-1.5 pt-1 text-sm sm:grid-cols-2">
              <InfoLine icon={IdCard}>{client.cpf}</InfoLine>
              <InfoLine icon={Phone}>
                <span className="inline-flex items-center gap-1.5">
                  {client.phone}
                  <MessageCircle className="h-4 w-4 text-emerald-500" />
                </span>
              </InfoLine>
              <InfoLine icon={Mail}>{client.email}</InfoLine>
              <InfoLine icon={MapPin}>{client.city ?? 'Endereço não informado'}</InfoLine>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 xl:col-span-6">
          <SummaryCard
            icon={Heart}
            tone="border-rose-100 bg-rose-50/70"
            chip="bg-white text-rose-500"
            label="Plano atual"
            value={client.plan}
            linkLabel="Ver detalhes"
            onClick={() => setTab('plano')}
          />
          <SummaryCard
            icon={CalendarDays}
            tone="border-rose-100 bg-rose-50/70"
            chip="bg-white text-rose-500"
            label="Próxima cobrança"
            value={
              subscription?.nextDueDate
                ? formatDateBR(subscription.nextDueDate)
                : subscriptionLookup.loading
                  ? 'Carregando…'
                  : '—'
            }
            hint={
              subscription
                ? formatBRL(subscription.amount)
                : subscriptionLookup.loading
                  ? undefined
                  : 'Sem assinatura no clube'
            }
            linkLabel="Ver cobranças"
            onClick={() => setTab('plano')}
          />
          <SummaryCard
            icon={CircleCheckBig}
            tone="border-emerald-100 bg-emerald-50/70"
            chip="bg-white text-emerald-500"
            label="Situação"
            value={subscriptionStatus?.label ?? situation.label}
            hint={
              subscription
                ? subscription.overdueCount > 0
                  ? `${subscription.overdueCount} cobrança(s) em atraso`
                  : paymentMethodLabel(subscription.paymentMethod)
                : situation.hint
            }
            linkLabel="Ver cobranças"
            onClick={() => setTab('plano')}
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <SectionTabsList>
          <SectionTab value="visao-geral">Visão Geral</SectionTab>
          <SectionTab value="dados">Dados Cadastrais</SectionTab>
          <SectionTab value="dependentes" badge={client.dependents.length}>
            Dependentes
          </SectionTab>
          <SectionTab value="plano">Plano e Cobrança</SectionTab>
        </SectionTabsList>

        <TabsContent value="visao-geral" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-12">
            <div className="space-y-6 xl:col-span-9">
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Benefícios do Plano</h2>
                {benefits.length === 0 ? (
                  <Card className="shadow-sm">
                    <CardContent className="p-0">
                      <EmptyState
                        icon={Gift}
                        title="Nenhum benefício cadastrado"
                        description="Cadastre os benefícios do clube para que apareçam na ficha do beneficiário."
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {benefits.map((benefit, index) => {
                      const Icon = benefitIcons[benefit.category]
                      const tone = BENEFIT_TONES[index % BENEFIT_TONES.length]
                      return (
                        <div
                          key={benefit.id}
                          className={cn(
                            'flex flex-col items-center gap-2 rounded-xl border p-4 text-center',
                            tone.card,
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-11 w-11 items-center justify-center rounded-xl shadow-sm',
                              tone.chip,
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </span>
                          <span className="text-sm font-semibold leading-tight text-foreground">
                            {benefit.name}
                          </span>
                          <span className="text-[11px] leading-tight text-muted-foreground">
                            {benefit.provider ?? 'Rede credenciada'}
                          </span>
                          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                            Ativo
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              <div className="grid gap-6 lg:grid-cols-12">
                <Card className="shadow-sm lg:col-span-5">
                  <CardHeader>
                    <CardTitle className="text-lg">Carteirinha Digital</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <DigitalCardMockup
                      tenant={tenant}
                      clientName={client.name}
                      cardNumber={client.cardNumber}
                      planName={client.plan}
                      cpf={client.cpf}
                      contractDate={client.contractDate}
                      dependentsCount={client.dependents.length}
                      size="sm"
                    />
                  </CardContent>
                </Card>

                <Card className="shadow-sm lg:col-span-7">
                  <CardHeader>
                    <CardTitle className="text-lg">Últimos Atendimentos</CardTitle>
                    <CardAction className="self-center">
                      <Link href={`${base}/atendimento`} className="text-sm font-medium text-primary hover:underline">
                        Ver todos
                      </Link>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    {clientAppointments.length === 0 ? (
                      <EmptyState
                        icon={Stethoscope}
                        title="Sem atendimentos registrados"
                        description="Os chamados abertos por este beneficiário na mesa de atendimento aparecem aqui."
                      />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                              <th className="pb-3 pr-4 font-medium">Data</th>
                              <th className="pb-3 pr-4 font-medium">Tipo de atendimento</th>
                              <th className="pb-3 pr-4 font-medium">Prestador</th>
                              <th className="pb-3 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {clientAppointments.slice(0, 5).map(item => (
                              <tr key={item.id} className="border-b border-border/60 last:border-0">
                                <td className="py-3 pr-4 text-muted-foreground">
                                  {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                                </td>
                                <td className="py-3 pr-4 font-medium text-foreground">
                                  {item.subject || 'Atendimento'}
                                </td>
                                <td className="py-3 pr-4 text-muted-foreground">
                                  {item.assignedName || 'Na fila'}
                                </td>
                                <td className="py-3">
                                  <StatusPill
                                    label={
                                      item.status === 'resolvido' || item.status === 'encerrado'
                                        ? 'Resolvido'
                                        : 'Em aberto'
                                    }
                                    className={
                                      item.status === 'resolvido' || item.status === 'encerrado'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-sky-50 text-sky-700'
                                    }
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="space-y-6 xl:col-span-3">
              <Card className="border-primary/15 bg-primary/5 shadow-sm">
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-sm">
                      <MessageCircle className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">Precisa de ajuda?</p>
                      <p className="text-xs text-muted-foreground">Fale com nosso atendimento</p>
                    </div>
                  </div>
                  <Button asChild variant="outline" className="w-full bg-card">
                    <Link href={`${base}/atendimento`}>Abrir chamado</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="dados">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Dados Cadastrais</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Nome completo" value={client.name} />
              <Field label="CPF" value={client.cpf} />
              <Field label="E-mail" value={client.email} />
              <Field label="Telefone" value={client.phone ?? '—'} />
              <Field label="Cidade" value={client.city ?? '—'} />
              <Field label="Nº do beneficiário" value={client.cardNumber} />
              <Field label="Plano" value={client.plan} />
              <Field
                label="Beneficiário desde"
                value={new Date(client.contractDate).toLocaleDateString('pt-BR')}
              />
              <Field label="Vendedor responsável" value={seller?.name ?? '—'} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dependentes">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Dependentes</CardTitle>
            </CardHeader>
            <CardContent>
              {client.dependents.length === 0 ? (
                <EmptyState
                  icon={UserPlus}
                  title="Nenhum dependente"
                  description="Este plano não tem dependentes incluídos até o momento."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                        <th className="pb-3 pr-4 font-medium">Nome</th>
                        <th className="pb-3 pr-4 font-medium">CPF</th>
                        <th className="pb-3 pr-4 font-medium">Parentesco</th>
                        <th className="pb-3 font-medium">Nascimento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {client.dependents.map(dependent => (
                        <tr key={dependent.id} className="border-b border-border/60 last:border-0">
                          <td className="py-3 pr-4 font-medium text-foreground">{dependent.name}</td>
                          <td className="py-3 pr-4 text-muted-foreground">{dependent.cpf}</td>
                          <td className="py-3 pr-4 text-muted-foreground">{dependent.relationship}</td>
                          <td className="py-3 text-muted-foreground">
                            {new Date(dependent.birthDate).toLocaleDateString('pt-BR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plano">
          <PlanBillingTab
            tenantSlug={slug}
            base={base}
            subscription={subscription}
            loading={subscriptionLookup.loading}
            error={subscriptionLookup.error}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/**
 * Plano e cobrança do beneficiário, direto do Faturamento: assinatura vigente
 * e as últimas cobranças dela. Ações (segunda via, baixa manual, cancelar)
 * ficam no Faturamento — o link abre lá já filtrado nesta assinatura.
 */
function PlanBillingTab({
  tenantSlug,
  base,
  subscription,
  loading,
  error,
}: {
  tenantSlug: string
  base: string
  subscription: ClubSubscription | null
  loading: boolean
  error: string | null
}) {
  const charges = useActionData(
    tenantSlug && subscription
      ? () => listClubChargesAction(tenantSlug, { subscriptionId: subscription.id, perPage: 12 })
      : null,
    [tenantSlug, subscription?.id],
  )

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">Carregando cobrança…</CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <EmptyState icon={ShieldCheck} title="Não foi possível carregar a cobrança" description={error} />
        </CardContent>
      </Card>
    )
  }

  if (!subscription) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <EmptyState
            icon={ShieldCheck}
            title="Sem assinatura no Clube de Benefícios"
            description="Este beneficiário não tem assinatura com cobrança pelo clube. Adesões feitas pelo checkout aparecem aqui."
          />
        </CardContent>
      </Card>
    )
  }

  const meta = subscriptionStatusMeta(subscription.status)
  const faturamentoHref = `${base}/faturamento?tab=cobrancas&assinatura=${encodeURIComponent(
    subscription.id,
  )}&nome=${encodeURIComponent(subscription.holder.name)}`
  const items = charges.data?.items ?? []

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Assinatura</CardTitle>
          <CardAction className="self-center">
            <Link href={faturamentoHref} className="text-sm font-medium text-primary hover:underline">
              Abrir no Faturamento
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Situação</p>
            <StatusPill {...meta} />
          </div>
          <Field label="Plano" value={subscription.planName} />
          <Field label="Mensalidade" value={formatBRL(subscription.amount)} />
          <Field label="Forma de pagamento" value={paymentMethodLabel(subscription.paymentMethod)} />
          <Field label="Vencimento" value={`Todo dia ${subscription.dueDay}`} />
          <Field
            label="Próxima cobrança"
            value={subscription.nextDueDate ? formatDateBR(subscription.nextDueDate) : '—'}
          />
          <Field label="Em aberto" value={formatBRL(subscription.openAmount)} />
          <Field label="Carteirinha" value={subscription.cardNumber ?? '—'} />
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Últimas cobranças</CardTitle>
        </CardHeader>
        <CardContent>
          {charges.loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando cobranças…</p>
          ) : charges.error ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{charges.error}</p>
          ) : items.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nenhuma cobrança gerada"
              description="As cobranças aparecem aqui conforme a régua do Faturamento as gera."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Vencimento</th>
                    <th className="pb-3 pr-4 font-medium">Valor</th>
                    <th className="pb-3 pr-4 font-medium">Forma</th>
                    <th className="pb-3 pr-4 font-medium">Pago em</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(charge => (
                    <tr key={charge.id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-4 text-foreground">{formatDateBR(charge.dueDate)}</td>
                      <td className="py-3 pr-4 font-medium text-foreground">{formatBRL(charge.amount)}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{paymentMethodLabel(charge.method)}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {charge.paidAt ? formatDateBR(charge.paidAt) : '—'}
                      </td>
                      <td className="py-3">
                        <StatusPill {...chargeStatusMeta(charge.status)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function InfoLine({
  icon: Icon,
  children,
}: {
  icon: typeof Phone
  children: React.ReactNode
}) {
  return (
    <span className="flex items-center gap-2 text-muted-foreground">
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <span className="truncate text-foreground">{children}</span>
    </span>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}


function SummaryCard({
  icon: Icon,
  tone,
  chip,
  label,
  value,
  hint,
  linkLabel,
  onClick,
}: {
  icon: typeof Heart
  tone: string
  chip: string
  label: string
  value: string
  hint?: string
  linkLabel: string
  onClick: () => void
}) {
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border p-4', tone)}>
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm', chip)}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-bold text-foreground">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        <button
          type="button"
          onClick={onClick}
          className="pt-1 text-xs font-medium text-primary hover:underline"
        >
          {linkLabel} →
        </button>
      </div>
    </div>
  )
}
