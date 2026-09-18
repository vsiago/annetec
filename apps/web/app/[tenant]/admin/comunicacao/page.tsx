'use client'

import { useMemo, useState } from 'react'
import {
  Bell,
  Braces,
  Cake,
  Eye,
  Link2,
  Mail,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Send,
  Smartphone,
  TriangleAlert,
  UserPlus,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/dashboard/page-header'
import { SectionTab, SectionTabsList } from '@/components/dashboard/section-tabs'
import { StatCard } from '@/components/dashboard/stat-card'
import {
  DataTable,
  FilterSelect,
  SearchInput,
  StatusPill,
} from '@/components/dashboard/table-controls'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { getAllClients, useTenantData } from '@/contexts/tenant-data-context'
import {
  buildCampaigns,
  buildCommunications,
  COMMUNICATION_TEMPLATES,
  NOTIFICATION_RULES,
} from '@/lib/mock-operations'
import { cn } from '@/lib/utils'

const CHANNELS = [
  { value: 'email', label: 'E-mail', icon: Mail },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'sms', label: 'SMS', icon: Smartphone },
  { value: 'push', label: 'Push (App)', icon: Bell },
  { value: 'interna', label: 'Notificação interna', icon: MessageSquare },
]

const channelStyle: Record<string, string> = {
  WhatsApp: 'bg-emerald-50 text-emerald-700',
  'E-mail': 'bg-sky-50 text-sky-700',
  Push: 'bg-violet-50 text-violet-700',
  SMS: 'bg-amber-50 text-amber-700',
}

/** Corpo de cada template — "Usar template" joga isso no compositor. */
const TEMPLATE_PREVIEWS: Record<string, string> = {
  'tpl-1':
    'Olá {{nome}}, seja bem-vindo(a)! Sua carteirinha digital já está disponível no app. Qualquer dúvida, é só chamar a gente por aqui.',
  'tpl-2':
    'Oi {{nome}}, sua mensalidade de {{valor}} vence em {{vencimento}}. O boleto está no app, na aba Cobrança.',
  'tpl-3':
    'A campanha de vacinação começou nas nossas clínicas. Agende seu horário pelo app — sem custo para beneficiários ativos.',
  'tpl-4':
    'Novidade na rede: {{parceiro}} agora é credenciado e oferece até {{desconto}}% de desconto para você.',
  'tpl-5':
    'De 0 a 10, quanto você recomendaria o nosso clube para um amigo? Sua resposta leva menos de 1 minuto.',
  'tpl-6':
    'Comunicado importante: {{assunto}}. Em caso de dúvida, fale com o nosso atendimento pelo app ou telefone.',
}

function CampaignMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-2 py-2">
      <p className="text-sm font-bold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

export default function AdminComunicacaoPage() {
  const { users, leads, isLoading } = useTenantData()
  const communications = useMemo(() => buildCommunications(), [])
  const campaigns = useMemo(() => buildCampaigns(), [])
  const [rules, setRules] = useState(NOTIFICATION_RULES)
  const [historySearch, setHistorySearch] = useState('')
  const [historyChannel, setHistoryChannel] = useState('all')

  const historyRows = useMemo(() => {
    const term = historySearch.trim().toLowerCase()
    return communications.filter(item => {
      if (historyChannel !== 'all' && item.channel !== historyChannel) return false
      if (!term) return true
      return [item.subject, item.channel, item.audience].some(field =>
        field.toLowerCase().includes(term),
      )
    })
  }, [communications, historySearch, historyChannel])

  const [tab, setTab] = useState('enviar')
  const [channel, setChannel] = useState('whatsapp')
  const [audience, setAudience] = useState('')
  const [message, setMessage] = useState('')

  const clients = getAllClients(users)

  /** Segmentos reais da carteira: é o que o seletor de público oferece. */
  const segments = useMemo(() => {
    const thisMonth = new Date().getMonth()
    return [
      { id: 'todos', label: 'Todos os beneficiários', icon: Users, count: clients.length },
      {
        id: 'inadimplentes',
        label: 'Inadimplentes',
        icon: TriangleAlert,
        count: clients.filter(c => c.planStatus === 'pending').length,
      },
      {
        id: 'aniversariantes',
        label: 'Aniversariantes do mês',
        icon: Cake,
        count: clients.filter(c => new Date(c.contractDate).getMonth() === thisMonth).length,
      },
      {
        id: 'novos',
        label: 'Novos beneficiários (30 dias)',
        icon: UserPlus,
        count: clients.filter(
          c => Date.now() - new Date(c.contractDate).getTime() <= 30 * 86_400_000,
        ).length,
      },
      { id: 'leads', label: 'Leads em aberto', icon: MessageSquare, count: leads.length },
    ]
  }, [clients, leads])

  const selectedSegment = segments.find(segment => segment.id === audience)
  const totalSent = communications.reduce((sum, item) => sum + item.sent, 0)
  const averageOpen = Math.round(
    communications.reduce((sum, item) => sum + item.openRate, 0) / Math.max(communications.length, 1),
  )

  if (isLoading) return null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Comunicação"
        description="Conecte-se com seus beneficiários, leads, parceiros e equipe."
        mock
      >
        <Button className="h-11 gap-2 px-5">
          <Send className="h-4 w-4" />
          Nova comunicação
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Mail}
          accent="info"
          value={totalSent.toLocaleString('pt-BR')}
          label="Mensagens enviadas"
          delta={{ value: '18%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={Users}
          accent="success"
          value={clients.length.toLocaleString('pt-BR')}
          label="Destinatários únicos"
          delta={{ value: '22%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={Eye}
          accent="primary"
          value={`${averageOpen}%`}
          label="Taxa de abertura"
          delta={{ value: '5 p.p.', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={Link2}
          accent="warning"
          value="12%"
          label="Taxa de cliques"
          delta={{ value: '3 p.p.', direction: 'up' }}
          comparison="vs. mês anterior"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <SectionTabsList>
          <SectionTab value="enviar">Enviar Comunicação</SectionTab>
          <SectionTab value="campanhas">Campanhas</SectionTab>
          <SectionTab value="templates">Templates</SectionTab>
          <SectionTab value="central">Central de Notificações</SectionTab>
          <SectionTab value="historico">Histórico</SectionTab>
        </SectionTabsList>

        <div className="grid gap-5 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <TabsContent value="enviar" className="m-0 space-y-5">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Nova comunicação</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {CHANNELS.map(item => {
                      const Icon = item.icon
                      const active = channel === item.value
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setChannel(item.value)}
                          className={cn(
                            'flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors',
                            active
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border/60 text-muted-foreground hover:bg-muted',
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      )
                    })}
                  </div>

                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-60 flex-1 space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Destinatários</label>
                      <Select value={audience} onValueChange={setAudience}>
                        <SelectTrigger className="w-full data-[size=default]:h-12">
                          <SelectValue placeholder="Selecione o público" />
                        </SelectTrigger>
                        <SelectContent>
                          {segments.map(segment => (
                            <SelectItem key={segment.id} value={segment.id}>
                              {segment.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex h-12 min-w-32 flex-col items-center justify-center rounded-xl bg-muted/50 px-4">
                      <span className="text-base font-bold text-foreground">
                        {(selectedSegment?.count ?? 0).toLocaleString('pt-BR')}
                      </span>
                      <span className="text-[11px] text-muted-foreground">destinatários</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Assunto / Mensagem</label>
                    <Textarea
                      value={message}
                      onChange={event => setMessage(event.target.value)}
                      placeholder="Digite sua mensagem..."
                      className="min-h-28 resize-none rounded-xl"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Paperclip className="h-4 w-4" />
                      Adicionar anexo
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Braces className="h-4 w-4" />
                      Inserir variável
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Eye className="h-4 w-4" />
                      Visualizar
                    </Button>
                    <Button
                      className="ml-auto gap-2"
                      disabled={!audience || message.trim().length === 0}
                    >
                      <Send className="h-4 w-4" />
                      Enviar mensagem
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Últimas comunicações</CardTitle>
                  <CardAction className="self-center">
                    <span className="text-sm font-medium text-primary">Ver todas</span>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                          <th className="pb-3 pr-4 font-medium">Data</th>
                          <th className="pb-3 pr-4 font-medium">Tipo</th>
                          <th className="pb-3 pr-4 font-medium">Assunto</th>
                          <th className="pb-3 pr-4 font-medium">Público</th>
                          <th className="pb-3 pr-4 font-medium">Enviados</th>
                          <th className="pb-3 pr-4 font-medium">Abertura</th>
                          <th className="pb-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {communications.slice(0, 6).map(item => (
                          <tr key={item.id} className="border-b border-border/60 last:border-0">
                            <td className="py-3 pr-4 text-muted-foreground">
                              {item.sentAt.toLocaleDateString('pt-BR')}
                            </td>
                            <td className="py-3 pr-4">
                              <StatusPill
                                label={item.channel}
                                className={channelStyle[item.channel] ?? 'bg-muted text-muted-foreground'}
                              />
                            </td>
                            <td className="py-3 pr-4 font-medium text-foreground">{item.subject}</td>
                            <td className="py-3 pr-4 text-muted-foreground">{item.audience}</td>
                            <td className="py-3 pr-4 text-foreground">
                              {item.sent.toLocaleString('pt-BR')}
                            </td>
                            <td className="py-3 pr-4 text-foreground">{item.openRate}%</td>
                            <td className="py-3">
                              <StatusPill
                                label={item.status}
                                className={
                                  item.status === 'Enviado'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-amber-50 text-amber-700'
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="campanhas" className="m-0 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {campaigns.map(campaign => (
                  <Card key={campaign.id} className="shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base">{campaign.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{campaign.goal}</p>
                      <CardAction className="self-center">
                        <StatusPill
                          label={campaign.status}
                          className={
                            campaign.status === 'Ativa'
                              ? 'bg-emerald-50 text-emerald-700'
                              : campaign.status === 'Agendada'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                          }
                        />
                      </CardAction>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <StatusPill
                          label={campaign.channel}
                          className={channelStyle[campaign.channel] ?? 'bg-muted text-muted-foreground'}
                        />
                        <span className="text-muted-foreground">{campaign.audience}</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <CampaignMetric label="Alcance" value={campaign.reach.toLocaleString('pt-BR')} />
                        <CampaignMetric label="Abertura" value={`${campaign.openRate}%`} />
                        <CampaignMetric label="Conversões" value={String(campaign.conversions)} />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Taxa de cliques</span>
                          <span>{campaign.clickRate}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${campaign.clickRate * 3}%` }}
                          />
                        </div>
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        {campaign.startedAt.toLocaleDateString('pt-BR')} →{' '}
                        {campaign.endsAt.toLocaleDateString('pt-BR')}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="templates" className="m-0">
              <div className="grid gap-4 md:grid-cols-2">
                {COMMUNICATION_TEMPLATES.map(template => (
                  <Card key={template.id} className="shadow-sm">
                    <CardContent className="space-y-3">
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                            template.tone,
                          )}
                        >
                          <Mail className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-foreground">{template.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{template.hint}</p>
                        </div>
                      </div>

                      <p className="rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                        {TEMPLATE_PREVIEWS[template.id] ?? 'Prévia não configurada.'}
                      </p>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            setMessage(TEMPLATE_PREVIEWS[template.id] ?? '')
                            setTab('enviar')
                            toast.success('Template carregado', { description: template.name })
                          }}
                        >
                          Usar template
                        </Button>
                        <Button size="sm" variant="ghost" className="flex-1">
                          Editar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="central" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Central de notificações</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Que evento dispara aviso, para quem e por qual canal.
                  </p>
                </CardHeader>
                <CardContent className="space-y-1 p-4 pt-0">
                  {rules.map(rule => (
                    <div
                      key={rule.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 p-3"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {rule.event}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {rule.hint} · {rule.audience}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {rule.channels.map(item => (
                          <StatusPill
                            key={item}
                            label={item}
                            className={channelStyle[item] ?? 'bg-muted text-muted-foreground'}
                          />
                        ))}
                      </span>
                      <Switch
                        checked={rule.active}
                        onCheckedChange={value => {
                          setRules(prev =>
                            prev.map(item => (item.id === rule.id ? { ...item, active: value } : item)),
                          )
                          toast.success(value ? 'Aviso ativado' : 'Aviso desativado', {
                            description: rule.event,
                          })
                        }}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="historico" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <SearchInput
                    value={historySearch}
                    onChange={setHistorySearch}
                    placeholder="Buscar por assunto, canal ou público..."
                  />
                  <FilterSelect
                    label="Canal"
                    value={historyChannel}
                    onChange={setHistoryChannel}
                    allLabel="Todos os canais"
                    options={['WhatsApp', 'E-mail', 'Push', 'SMS'].map(item => ({
                      value: item,
                      label: item,
                    }))}
                  />
                </div>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      {
                        key: 'date',
                        header: 'Data',
                        render: row => (
                          <span className="text-muted-foreground">
                            {row.sentAt.toLocaleDateString('pt-BR')}
                          </span>
                        ),
                      },
                      {
                        key: 'channel',
                        header: 'Canal',
                        render: row => (
                          <StatusPill
                            label={row.channel}
                            className={channelStyle[row.channel] ?? 'bg-muted text-muted-foreground'}
                          />
                        ),
                      },
                      {
                        key: 'subject',
                        header: 'Assunto',
                        render: row => <span className="font-medium text-foreground">{row.subject}</span>,
                      },
                      {
                        key: 'audience',
                        header: 'Público',
                        hideOnMobile: true,
                        render: row => <span className="text-muted-foreground">{row.audience}</span>,
                      },
                      {
                        key: 'sent',
                        header: 'Enviados',
                        hideOnMobile: true,
                        render: row => row.sent.toLocaleString('pt-BR'),
                      },
                      { key: 'open', header: 'Abertura', render: row => `${row.openRate}%` },
                      {
                        key: 'status',
                        header: 'Status',
                        align: 'right',
                        render: row => (
                          <StatusPill
                            label={row.status}
                            className={
                              row.status === 'Enviado'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }
                          />
                        ),
                      },
                    ]}
                    rows={historyRows}
                    rowKey={row => row.id}
                    empty="Nenhuma comunicação encontrada."
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </div>

          <div className="space-y-5 xl:col-span-4">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Templates de comunicação</CardTitle>
                  <CardAction className="self-center">
                    <span className="text-sm font-medium text-primary">Ver todos</span>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-1">
                  {COMMUNICATION_TEMPLATES.map(template => (
                    <div
                      key={template.id}
                      className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted"
                    >
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                          template.tone,
                        )}
                      >
                        <Mail className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {template.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {template.hint}
                        </span>
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Ações do template</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Usar template</DropdownMenuItem>
                          <DropdownMenuItem>Editar</DropdownMenuItem>
                          <DropdownMenuItem>Duplicar</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Segmentos de público</CardTitle>
                  <CardAction className="self-center">
                    <span className="text-sm font-medium text-primary">Ver todos</span>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {segments.map(segment => {
                    const Icon = segment.icon
                    return (
                      <button
                        key={segment.id}
                        type="button"
                        onClick={() => setAudience(segment.id)}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {segment.label}
                        </span>
                        <span className="font-semibold text-foreground">
                          {segment.count.toLocaleString('pt-BR')}
                        </span>
                      </button>
                    )
                  })}
                </CardContent>
              </Card>
          </div>
        </div>
      </Tabs>
    </div>
  )
}
