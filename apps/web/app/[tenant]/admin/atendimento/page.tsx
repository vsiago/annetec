'use client'

import { useMemo, useState } from 'react'
import {
  CircleCheckBig,
  Clock,
  Headset,
  ListFilter,
  Mail,
  MessageCircle,
  MonitorSmartphone,
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  Send,
  Smile,
  Timer,
  UserRound,
  X,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/dashboard/page-header'
import { SectionTab, SectionTabsList } from '@/components/dashboard/section-tabs'
import { StatCard } from '@/components/dashboard/stat-card'
import {
  FilterSelect,
  SearchInput,
  StatusPill,
  TableFooter,
} from '@/components/dashboard/table-controls'
import { buildTickets, type MockTicket, type TicketStatus } from '@/lib/mock-operations'
import { cn, getInitials } from '@/lib/utils'

const statusMeta: Record<TicketStatus, { label: string; className: string }> = {
  em_atendimento: { label: 'Em atendimento', className: 'bg-sky-50 text-sky-700' },
  aguardando_usuario: { label: 'Aguardando retorno', className: 'bg-amber-50 text-amber-700' },
  aguardando_terceiro: { label: 'Aguardando terceiro', className: 'bg-violet-50 text-violet-700' },
  resolvido: { label: 'Resolvido', className: 'bg-emerald-50 text-emerald-700' },
  encerrado: { label: 'Encerrado', className: 'bg-slate-100 text-slate-600' },
}

const priorityMeta: Record<MockTicket['priority'], string> = {
  Alta: 'bg-rose-50 text-rose-700',
  Normal: 'bg-slate-100 text-slate-600',
  Baixa: 'bg-sky-50 text-sky-700',
}

const channelIcons: Record<MockTicket['channel'], typeof Phone> = {
  Telefone: Phone,
  WhatsApp: MessageCircle,
  'E-mail': Mail,
  'App/Site': MonitorSmartphone,
  Presencial: UserRound,
}

const AVATAR_TONES = [
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
]

export default function AdminAtendimentoPage() {
  const tickets = useMemo(() => buildTickets(), [])

  const [tab, setTab] = useState('todos')
  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState('all')
  const [subject, setSubject] = useState('all')
  const [owner, setOwner] = useState('all')
  const [perPage, setPerPage] = useState('10')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reply, setReply] = useState('')

  const subjects = useMemo(() => [...new Set(tickets.map(t => t.subject))].sort(), [tickets])
  const owners = useMemo(() => [...new Set(tickets.map(t => t.owner))].sort(), [tickets])

  const countBy = (status: TicketStatus) => tickets.filter(t => t.status === status).length
  const open = tickets.filter(t => t.status === 'em_atendimento').length
  const waiting = countBy('aguardando_usuario') + countBy('aguardando_terceiro')

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return tickets.filter(ticket => {
      // "Em aberto" é tudo que ainda não fechou; "Em atendimento" é só o que
      // está com alguém agora. Sem essa distinção as duas abas listavam igual.
      if (tab === 'aberto' && (ticket.status === 'resolvido' || ticket.status === 'encerrado')) {
        return false
      }
      if (tab === 'atendimento' && ticket.status !== 'em_atendimento') return false
      if (tab === 'aguardando_usuario' && ticket.status !== 'aguardando_usuario') return false
      if (tab === 'aguardando_terceiro' && ticket.status !== 'aguardando_terceiro') return false
      if (tab === 'resolvidos' && ticket.status !== 'resolvido') return false
      if (tab === 'encerrados' && ticket.status !== 'encerrado') return false
      if (channel !== 'all' && ticket.channel !== channel) return false
      if (subject !== 'all' && ticket.subject !== subject) return false
      if (owner !== 'all' && ticket.owner !== owner) return false
      if (!term) return true
      return [ticket.protocol, ticket.userName, ticket.cpf, ticket.subject].some(field =>
        field.toLowerCase().includes(term),
      )
    })
  }, [tickets, tab, search, channel, subject, owner])

  const size = Number(perPage)
  const totalPages = Math.max(1, Math.ceil(filtered.length / size))
  const currentPage = Math.min(page, totalPages)
  const visible = filtered.slice((currentPage - 1) * size, currentPage * size)
  const selected = tickets.find(t => t.id === selectedId) ?? visible[0] ?? null

  function withPageReset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Atendimento"
        description="Registre, acompanhe e resolva as demandas dos nossos beneficiários."
        mock
      >
        <Button className="h-11 gap-2 px-5">
          <Plus className="h-4 w-4" />
          Novo atendimento
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={Headset}
          accent="info"
          value={tickets.length}
          label="Atendimentos no período"
          delta={{ value: '18%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={Clock}
          accent="warning"
          value={open}
          label="Em aberto"
          delta={{ value: '12%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={UserRound}
          accent="primary"
          value={waiting}
          label="Aguardando retorno"
          delta={{ value: '22%', direction: 'down' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={CircleCheckBig}
          accent="success"
          value={countBy('resolvido')}
          label="Resolvidos"
          delta={{ value: '26%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={Timer}
          accent="primary"
          value="4h 18min"
          label="Tempo médio de resolução"
          delta={{ value: '30%', direction: 'down' }}
          comparison="vs. mês anterior"
        />
      </div>

      <Tabs value={tab} onValueChange={withPageReset(setTab)} className="gap-5">
        <SectionTabsList>
          <SectionTab value="todos">Todos</SectionTab>
          <SectionTab value="aberto">Em aberto</SectionTab>
          <SectionTab value="atendimento">Em atendimento</SectionTab>
          <SectionTab value="aguardando_usuario">Aguardando usuário</SectionTab>
          <SectionTab value="aguardando_terceiro">Aguardando terceiro</SectionTab>
          <SectionTab value="resolvidos">Resolvidos</SectionTab>
          <SectionTab value="encerrados">Encerrados</SectionTab>
        </SectionTabsList>

        <TabsContent value={tab} className="m-0">
          <div className="grid gap-5 xl:grid-cols-12">
            <Card className="gap-0 py-0 shadow-sm xl:col-span-8">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <SearchInput
                  value={search}
                  onChange={withPageReset(setSearch)}
                  placeholder="Buscar por protocolo, usuário, CPF, assunto..."
                />
                <FilterSelect
                  label="Canal"
                  value={channel}
                  onChange={withPageReset(setChannel)}
                  allLabel="Todos os canais"
                  options={Object.keys(channelIcons).map(item => ({ value: item, label: item }))}
                />
                <FilterSelect
                  label="Assunto"
                  value={subject}
                  onChange={withPageReset(setSubject)}
                  allLabel="Todos os assuntos"
                  options={subjects.map(item => ({ value: item, label: item }))}
                />
                <FilterSelect
                  label="Responsável"
                  value={owner}
                  onChange={withPageReset(setOwner)}
                  allLabel="Todos"
                  options={owners.map(item => ({ value: item, label: item }))}
                />
                <Button variant="outline" className="h-14 gap-2 rounded-xl">
                  <ListFilter className="h-4 w-4 text-muted-foreground" />
                  Mais filtros
                </Button>
              </div>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                        <th className="w-10 py-3 pl-4">
                          <Checkbox aria-label="Selecionar todos" />
                        </th>
                        <th className="px-3 py-3 font-medium">Protocolo</th>
                        <th className="px-3 py-3 font-medium">Usuário</th>
                        <th className="px-3 py-3 font-medium">Canal</th>
                        <th className="px-3 py-3 font-medium">Assunto</th>
                        <th className="px-3 py-3 font-medium">Prioridade</th>
                        <th className="px-3 py-3 font-medium">Status</th>
                        <th className="px-3 py-3 font-medium">Responsável</th>
                        <th className="px-3 py-3 text-right font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.length === 0 && (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-muted-foreground">
                            Nenhum atendimento com os filtros atuais.
                          </td>
                        </tr>
                      )}
                      {visible.map((ticket, index) => {
                        const ChannelIcon = channelIcons[ticket.channel]
                        return (
                          <tr
                            key={ticket.id}
                            onClick={() => setSelectedId(ticket.id)}
                            className={cn(
                              'cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40',
                              selected?.id === ticket.id && 'bg-primary/5',
                            )}
                          >
                            <td className="py-3 pl-4" onClick={event => event.stopPropagation()}>
                              <Checkbox aria-label={`Selecionar ${ticket.protocol}`} />
                            </td>
                            <td className="px-3 py-3 font-medium text-primary">{ticket.protocol}</td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <Avatar className="h-7 w-7">
                                  <AvatarFallback
                                    className={cn(
                                      'text-[10px] font-semibold',
                                      AVATAR_TONES[index % AVATAR_TONES.length],
                                    )}
                                  >
                                    {getInitials(ticket.userName)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="min-w-0">
                                  <span className="block truncate font-medium text-foreground">
                                    {ticket.userName}
                                  </span>
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    {ticket.cpf}
                                  </span>
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                <ChannelIcon className="h-4 w-4 text-primary" />
                                {ticket.channel}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">{ticket.subject}</td>
                            <td className="px-3 py-3">
                              <StatusPill
                                label={ticket.priority}
                                className={priorityMeta[ticket.priority]}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <StatusPill {...statusMeta[ticket.status]} />
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">{ticket.owner}</td>
                            <td className="px-3 py-3 text-right" onClick={event => event.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Ações do atendimento</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuItem>Assumir atendimento</DropdownMenuItem>
                                  <DropdownMenuItem>Transferir</DropdownMenuItem>
                                  <DropdownMenuItem>Marcar como resolvido</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>

              <TableFooter
                page={currentPage}
                perPage={perPage}
                total={filtered.length}
                noun="atendimentos"
                onPageChange={setPage}
                onPerPageChange={withPageReset(setPerPage)}
              />
            </Card>

            <div className="xl:col-span-4">
              {selected && (
                <TicketPanel
                  ticket={selected}
                  reply={reply}
                  onReplyChange={setReply}
                  onClose={() => setSelectedId(null)}
                />
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TicketPanel({
  ticket,
  reply,
  onReplyChange,
  onClose,
}: {
  ticket: MockTicket
  reply: string
  onReplyChange: (value: string) => void
  onClose: () => void
}) {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-foreground">{ticket.protocol}</h2>
            <StatusPill {...statusMeta[ticket.status]} />
          </div>
          <p className="text-xs text-muted-foreground">
            Aberto em {ticket.openedAt.toLocaleDateString('pt-BR')} às{' '}
            {ticket.openedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Fechar detalhe"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-3 border-b border-border px-4 pb-4">
        <Avatar className="h-11 w-11">
          <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
            {getInitials(ticket.userName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{ticket.userName}</p>
          <p className="truncate text-xs text-muted-foreground">CPF {ticket.cpf}</p>
        </div>
        <Button variant="outline" size="sm">
          Ver perfil
        </Button>
      </div>

      <dl className="space-y-1.5 border-b border-border p-4 text-sm">
        <PanelLine label="Plano">
          <span className="text-primary">{ticket.plan}</span> (ativo)
        </PanelLine>
        <PanelLine label="Telefone">{ticket.phone}</PanelLine>
        <PanelLine label="E-mail">{ticket.email}</PanelLine>
        <PanelLine label="Dependentes">{ticket.dependents}</PanelLine>
        <PanelLine label="Situação financeira">
          <StatusPill
            label={ticket.financialStatus}
            className={
              ticket.financialStatus === 'Em dia'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-red-50 text-red-600'
            }
          />
        </PanelLine>
      </dl>

      <Tabs defaultValue="conversas" className="gap-0">
        <SectionTabsList className="px-2">
          <SectionTab value="conversas">Conversas</SectionTab>
          <SectionTab value="detalhes">Detalhes</SectionTab>
          <SectionTab value="historico">Histórico</SectionTab>
        </SectionTabsList>

        <TabsContent value="conversas" className="m-0 space-y-3 p-4">
          {ticket.messages.map(message => (
            <div key={message.id} className="flex gap-2.5">
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold',
                  message.kind === 'entrada' && 'bg-rose-50 text-rose-500',
                  message.kind === 'saida' && 'bg-emerald-50 text-emerald-500',
                  message.kind === 'nota' && 'bg-sky-50 text-sky-600',
                )}
              >
                {message.kind === 'nota' ? message.author?.slice(0, 2) : <Phone className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p
                    className={cn(
                      'truncate text-xs font-semibold',
                      message.kind === 'entrada' ? 'text-rose-600' : 'text-foreground',
                    )}
                  >
                    {message.title}
                  </p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {message.at.toLocaleDateString('pt-BR')}{' '}
                    {message.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{message.body}</p>
                {message.author && (
                  <p className="text-[11px] text-muted-foreground/80">{message.author}</p>
                )}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="detalhes" className="m-0 space-y-1.5 p-4 text-sm">
          <PanelLine label="Canal">{ticket.channel}</PanelLine>
          <PanelLine label="Assunto">{ticket.subject}</PanelLine>
          <PanelLine label="Prioridade">
            <StatusPill label={ticket.priority} className={priorityMeta[ticket.priority]} />
          </PanelLine>
          <PanelLine label="Responsável">{ticket.owner}</PanelLine>
          <PanelLine label="Última interação">
            {ticket.lastInteractionAt.toLocaleDateString('pt-BR')}
          </PanelLine>
        </TabsContent>

        <TabsContent value="historico" className="m-0 space-y-2 p-4 text-sm">
          {ticket.messages.map(message => (
            <div
              key={message.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2"
            >
              <span className="truncate text-foreground">{message.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {message.at.toLocaleDateString('pt-BR')}
              </span>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
          <input
            value={reply}
            onChange={event => onReplyChange(event.target.value)}
            placeholder="Digite uma mensagem..."
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Smile className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
        <Button className="mt-2 w-full gap-2" disabled={reply.trim().length === 0}>
          <Send className="h-4 w-4" />
          Enviar
        </Button>
      </div>
    </Card>
  )
}

function PanelLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className="min-w-0 truncate text-right text-foreground">{children}</span>
    </div>
  )
}
