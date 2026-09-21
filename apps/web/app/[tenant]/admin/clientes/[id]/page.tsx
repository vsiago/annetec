'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  CircleCheckBig,
  Download,
  Eye,
  FileText,
  Gift,
  Heart,
  HeartHandshake,
  IdCard,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Pill,
  RefreshCw,
  ShieldCheck,
  Smile,
  Stethoscope,
  UserPlus,
  Video,
  XCircle,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { DigitalCardMockup } from '@/components/digital-card-mockup'
import { EmptyState } from '@/components/dashboard/empty-state'
import { MockBadge } from '@/components/dashboard/mock-badge'
import { SectionTab, SectionTabsList } from '@/components/dashboard/section-tabs'
import { StatusPill } from '@/components/dashboard/table-controls'
import { useTenant } from '@/contexts/tenant-context'
import { getAllClients, getAllSellers, useTenantData } from '@/contexts/tenant-data-context'
import { formatCurrency } from '@/lib/analytics'
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

const QUICK_ACTIONS = [
  { label: 'Solicitar autorização', icon: FileText, tone: 'text-sky-500' },
  { label: 'Agendar consulta', icon: CalendarPlus, tone: 'text-rose-500' },
  { label: 'Segunda via da carteirinha', icon: Mail, tone: 'text-violet-500' },
  { label: 'Atualizar dados', icon: Pencil, tone: 'text-emerald-500' },
  { label: 'Alterar plano', icon: RefreshCw, tone: 'text-amber-500' },
  { label: 'Cancelar plano', icon: XCircle, tone: 'text-red-500' },
]

const PENDING_TABS = [
  { value: 'plano', label: 'Plano e Cobrança', note: 'Faturas, forma de pagamento e histórico de reajuste.' },
  { value: 'utilizacao', label: 'Utilização', note: 'Consumo de consultas, exames e teto por benefício.' },
  { value: 'autorizacoes', label: 'Autorizações', note: 'Pedidos de autorização e prazos de resposta.' },
  { value: 'documentos', label: 'Documentos', note: 'Contrato, aditivos e documentos pessoais.' },
  { value: 'historico', label: 'Histórico', note: 'Linha do tempo de tudo que aconteceu no cadastro.' },
]

export default function BeneficiarioPage() {
  const params = useParams<{ tenant: string; id: string }>()
  const { tenant } = useTenant()
  const { users, benefits, clientPlans, appointments, isLoading } = useTenantData()
  const [tab, setTab] = useState('visao-geral')

  const client = getAllClients(users).find(item => item.id === params?.id)
  const seller = getAllSellers(users).find(item => item.id === client?.sellerId)

  const base = `/${params?.tenant}/admin`

  const planPrice = clientPlans.find(plan => plan.name === client?.plan)?.priceMonthly ?? 0

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
  const nextCharge = nextChargeDate(client.contractDate)

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

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="h-11 gap-2">
            <Pencil className="h-4 w-4" />
            Editar cadastro
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-11 gap-2">
                Mais ações
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem>
                <RefreshCw className="mr-2 h-4 w-4" />
                Alterar plano
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Mail className="mr-2 h-4 w-4" />
                Reenviar boas-vindas
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                <XCircle className="mr-2 h-4 w-4" />
                Cancelar plano
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button className="h-11 gap-2 px-5">
            <UserPlus className="h-4 w-4" />
            Incluir dependente
          </Button>
        </div>
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
            value={nextCharge.toLocaleDateString('pt-BR')}
            hint={formatCurrency(planPrice)}
            linkLabel="Ver fatura"
            onClick={() => setTab('plano')}
          />
          <SummaryCard
            icon={CircleCheckBig}
            tone="border-emerald-100 bg-emerald-50/70"
            chip="bg-white text-emerald-500"
            label="Situação"
            value={situation.label}
            hint={situation.hint}
            linkLabel="Ver histórico"
            onClick={() => setTab('historico')}
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
          {PENDING_TABS.map(item => (
            <SectionTab key={item.value} value={item.value}>
              {item.label}
            </SectionTab>
          ))}
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
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="gap-2">
                        <Eye className="h-4 w-4" />
                        Visualizar
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Mail className="h-4 w-4" />
                        Enviar por e-mail
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Download className="h-4 w-4" />
                        Baixar PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm lg:col-span-7">
                  <CardHeader>
                    <CardTitle className="text-lg">Últimos Atendimentos</CardTitle>
                    <CardAction className="self-center">
                      <button
                        type="button"
                        onClick={() => setTab('utilizacao')}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Ver todos
                      </button>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    {clientAppointments.length === 0 ? (
                      <EmptyState
                        icon={Stethoscope}
                        title="Sem atendimentos registrados"
                        description="Os atendimentos aparecem aqui conforme a rede credenciada os informa."
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
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Ações Rápidas</CardTitle>
                  <CardAction className="self-center">
                    <MockBadge />
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-2">
                  {QUICK_ACTIONS.map(action => {
                    const Icon = action.icon
                    return (
                      <button
                        key={action.label}
                        type="button"
                        className="flex w-full items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                      >
                        <Icon className={cn('h-4 w-4 shrink-0', action.tone)} />
                        <span className="truncate">{action.label}</span>
                      </button>
                    )
                  })}
                </CardContent>
              </Card>

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
                  <Button variant="outline" className="w-full bg-card">
                    Abrir chamado
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
              <CardAction className="self-center">
                <Button size="sm" className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  Incluir dependente
                </Button>
              </CardAction>
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

        {PENDING_TABS.map(item => (
          <TabsContent key={item.value} value={item.value}>
            <Card className="border-dashed bg-card/60 shadow-none">
              <CardHeader>
                <CardTitle className="text-lg">{item.label}</CardTitle>
                <CardAction className="self-center">
                  <MockBadge />
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                <EmptyState icon={ShieldCheck} title="Em construção" description={item.note} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

/** Vencimento seguinte mantendo o dia da adesão. */
function nextChargeDate(contractDate: Date | string): Date {
  const day = new Date(contractDate).getDate()
  const today = new Date()
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), day)
  return thisMonth >= today ? thisMonth : new Date(today.getFullYear(), today.getMonth() + 1, day)
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
