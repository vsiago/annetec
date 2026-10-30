'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CircleCheckBig,
  Clock,
  Headset,
  Mail,
  MessageCircle,
  MonitorSmartphone,
  MoreHorizontal,
  Phone,
  Plus,
  Send,
  UserRound,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { FormDialog, FormField, FormRow, FormSelect } from '@/components/dashboard/form-dialog'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import { getAllClients, useTenantData } from '@/contexts/tenant-data-context'
import type {
  Appointment,
  AppointmentChannel,
  AppointmentPriority,
  AppointmentStatus,
} from '@/lib/types'
import { cn, getInitials } from '@/lib/utils'

const statusMeta: Record<AppointmentStatus, { label: string; className: string }> = {
  aguardando: { label: 'Na fila', className: 'bg-slate-100 text-slate-600' },
  em_atendimento: { label: 'Em atendimento', className: 'bg-sky-50 text-sky-700' },
  aguardando_usuario: { label: 'Aguardando retorno', className: 'bg-amber-50 text-amber-700' },
  aguardando_terceiro: { label: 'Aguardando terceiro', className: 'bg-violet-50 text-violet-700' },
  resolvido: { label: 'Resolvido', className: 'bg-emerald-50 text-emerald-700' },
  encerrado: { label: 'Encerrado', className: 'bg-slate-100 text-slate-600' },
}

const priorityMeta: Record<AppointmentPriority, { label: string; className: string }> = {
  alta: { label: 'Alta', className: 'bg-rose-50 text-rose-700' },
  normal: { label: 'Normal', className: 'bg-slate-100 text-slate-600' },
  baixa: { label: 'Baixa', className: 'bg-sky-50 text-sky-700' },
}

const channelMeta: Record<AppointmentChannel, { label: string; icon: typeof Phone }> = {
  telefone: { label: 'Telefone', icon: Phone },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  email: { label: 'E-mail', icon: Mail },
  app: { label: 'App/Site', icon: MonitorSmartphone },
  presencial: { label: 'Presencial', icon: UserRound },
}

/**
 * O chamado como a tela precisa dele: o registro da mesa mais o cadastro do
 * associado, que vive em `users` e nao no chamado.
 *
 * Dependentes e situacao financeira ficam de fora de proposito. Dependentes
 * sao beneficiarios do contrato na Digital Saude e a situacao financeira vem
 * do modulo de cobranca do ERP — nenhum dos dois esta disponivel aqui, e
 * inventar um valor faria a mesa priorizar atendimento por dado falso.
 */
interface Chamado {
  chamado: Appointment
  protocolo: string
  cpf: string
  plano: string
  telefone: string
  email: string
}

/**
 * Protocolo para leitura humana. Usa o numero da Digital Saude quando o
 * inquilino tem o modulo; sem ele, deriva do id do chamado — estavel e unico,
 * ao contrario de um contador que reiniciaria a cada carga da tela.
 */
function protocoloDe(chamado: Appointment): string {
  return chamado.protocol || 'ATD-' + chamado.id.slice(0, 8).toUpperCase()
}

const AVATAR_TONES = [
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
]

const EMPTY_TICKET = {
  clientId: '',
  subject: '',
  description: '',
  channel: 'telefone',
  priority: 'normal',
}

const FINISHED: AppointmentStatus[] = ['resolvido', 'encerrado']

export default function AdminAtendimentoPage() {
  const { tenant } = useTenant()
  const { user: me } = useAuth()
  const { appointments, users, isLoading, addAppointmentMessage, createAppointment, updateAppointment } =
    useTenantData()
  const base = tenant ? `/${tenant.slug}/admin` : ''

  const tickets = useMemo<Chamado[]>(() => {
    const porId = new Map(getAllClients(users).map(client => [client.id, client]))
    return appointments.map(chamado => {
      const associado = porId.get(chamado.clientId)
      return {
        chamado,
        protocolo: protocoloDe(chamado),
        cpf: associado?.cpf || '—',
        plano: associado?.plan || 'Sem plano',
        telefone: associado?.phone || '—',
        email: associado?.email || '—',
      }
    })
  }, [appointments, users])

  const [tab, setTab] = useState('todos')
  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState('all')
  const [subject, setSubject] = useState('all')
  const [owner, setOwner] = useState('all')
  const [perPage, setPerPage] = useState('10')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [creating, setCreating] = useState(false)
  const [newTicket, setNewTicket] = useState(EMPTY_TICKET)
  const [newTicketError, setNewTicketError] = useState<Record<string, string>>({})

  const subjects = useMemo(
    () => [...new Set(tickets.map(t => t.chamado.subject).filter(Boolean))].sort(),
    [tickets],
  )
  const owners = useMemo(
    () => [...new Set(tickets.map(t => t.chamado.assignedName).filter(Boolean))].sort(),
    [tickets],
  )

  const countBy = (status: AppointmentStatus) =>
    tickets.filter(t => t.chamado.status === status).length
  const open = countBy('em_atendimento')
  // A fila conta junto: chamado sem dono tambem esta esperando alguem.
  const waiting =
    countBy('aguardando_usuario') + countBy('aguardando_terceiro') + countBy('aguardando')

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return tickets.filter(item => {
      const ticket = item.chamado
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
      if (owner !== 'all' && ticket.assignedName !== owner) return false
      if (!term) return true
      return [item.protocolo, ticket.clientName, item.cpf, ticket.subject].some(field =>
        field.toLowerCase().includes(term),
      )
    })
  }, [tickets, tab, search, channel, subject, owner])

  const size = Number(perPage)
  const totalPages = Math.max(1, Math.ceil(filtered.length / size))
  const currentPage = Math.min(page, totalPages)
  const visible = filtered.slice((currentPage - 1) * size, currentPage * size)
  const selected = tickets.find(t => t.chamado.id === selectedId) ?? visible[0] ?? null

  /**
   * Responde o chamado. A mensagem entra como `saida` — nota interna tem
   * caminho próprio, e o servidor recusa `nota` vinda do associado.
   */
  async function responder(item: Chamado) {
    const texto = reply.trim()
    if (!texto) return
    try {
      await addAppointmentMessage(item.chamado.id, {
        kind: 'saida',
        title: 'Resposta enviada',
        body: texto,
      })
      setReply('')
    } catch (error) {
      // O texto continua no campo para a pessoa tentar de novo.
      toast.error('Resposta não enviada', {
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      })
    }
  }

  async function assumir(item: Chamado) {
    if (!me) return
    try {
      await updateAppointment(item.chamado.id, {
        assignedId: me.id,
        status: item.chamado.status === 'aguardando' ? 'em_atendimento' : item.chamado.status,
      })
      toast.success('Atendimento assumido', { description: item.protocolo })
    } catch (error) {
      toast.error('Não foi possível assumir', {
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      })
    }
  }

  async function resolver(item: Chamado) {
    try {
      await updateAppointment(item.chamado.id, { status: 'resolvido' })
      toast.success('Atendimento resolvido', { description: item.protocolo })
    } catch (error) {
      toast.error('Não foi possível marcar como resolvido', {
        description: error instanceof Error ? error.message : 'Tente novamente em instantes.',
      })
    }
  }

  const clients = useMemo(
    () => [...getAllClients(users)].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [users],
  )

  async function submitNewTicket(): Promise<string | void> {
    const errors: Record<string, string> = {}
    if (!newTicket.clientId) errors.clientId = 'Escolha o associado.'
    if (newTicket.subject.trim().length < 3) errors.subject = 'Informe o assunto.'
    if (newTicket.description.trim().length < 3) errors.description = 'Descreva o pedido.'
    setNewTicketError(errors)
    if (Object.keys(errors).length > 0) return 'Confira os campos destacados abaixo.'

    const client = clients.find(item => item.id === newTicket.clientId)
    if (!client) return 'Associado não encontrado.'
    try {
      await createAppointment({
        clientId: client.id,
        clientName: client.name,
        subject: newTicket.subject.trim(),
        description: newTicket.description.trim(),
        channel: newTicket.channel as AppointmentChannel,
        priority: newTicket.priority as AppointmentPriority,
        assignedId: '',
        assignedName: '',
        protocol: '',
        lastInteractionAt: new Date(),
        messages: [],
      } as Parameters<typeof createAppointment>[0])
    } catch (error) {
      return error instanceof Error ? error.message : 'Não foi possível registrar o atendimento.'
    }
    toast.success('Atendimento registrado', { description: client.name })
  }

  function withPageReset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  if (isLoading) return null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Atendimento"
        description="Registre, acompanhe e resolva as demandas dos associados."
      >
        <Button
          className="h-11 gap-2 px-5"
          onClick={() => {
            setNewTicket(EMPTY_TICKET)
            setNewTicketError({})
            setCreating(true)
          }}
        >
          <Plus className="h-4 w-4" />
          Novo atendimento
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Headset}
          accent="info"
          value={tickets.length}
          label="Atendimentos registrados"
        />
        <StatCard
          icon={Clock}
          accent="warning"
          value={open}
          label="Em aberto"
        />
        <StatCard
          icon={UserRound}
          accent="primary"
          value={waiting}
          label="Aguardando retorno"
        />
        <StatCard
          icon={CircleCheckBig}
          accent="success"
          value={countBy('resolvido')}
          label="Resolvidos"
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
                  options={Object.entries(channelMeta).map(([value, meta]) => ({
                    value,
                    label: meta.label,
                  }))}
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
              </div>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                        <th className="py-3 pl-4 pr-3 font-medium">Protocolo</th>
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
                          <td colSpan={8} className="py-12 text-center text-muted-foreground">
                            Nenhum atendimento com os filtros atuais.
                          </td>
                        </tr>
                      )}
                      {visible.map((item, index) => {
                        const ticket = item.chamado
                        const canal = channelMeta[ticket.channel]
                        const ChannelIcon = canal.icon
                        return (
                          <tr
                            key={ticket.id}
                            onClick={() => setSelectedId(ticket.id)}
                            className={cn(
                              'cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40',
                              selected?.chamado.id === ticket.id && 'bg-primary/5',
                            )}
                          >
                            <td className="py-3 pl-4 pr-3 font-medium text-primary">{item.protocolo}</td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <Avatar className="h-7 w-7">
                                  <AvatarFallback
                                    className={cn(
                                      'text-[10px] font-semibold',
                                      AVATAR_TONES[index % AVATAR_TONES.length],
                                    )}
                                  >
                                    {getInitials(ticket.clientName)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="min-w-0">
                                  <span className="block truncate font-medium text-foreground">
                                    {ticket.clientName}
                                  </span>
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    {item.cpf}
                                  </span>
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                <ChannelIcon className="h-4 w-4 text-primary" />
                                {canal.label}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">{ticket.subject}</td>
                            <td className="px-3 py-3">
                              <StatusPill {...priorityMeta[ticket.priority]} />
                            </td>
                            <td className="px-3 py-3">
                              <StatusPill {...statusMeta[ticket.status]} />
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">
                              {ticket.assignedName || 'Na fila'}
                            </td>
                            <td className="px-3 py-3 text-right" onClick={event => event.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Ações do atendimento</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuItem
                                    disabled={FINISHED.includes(ticket.status) || ticket.assignedId === me?.id}
                                    onSelect={() => void assumir(item)}
                                  >
                                    Assumir atendimento
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={FINISHED.includes(ticket.status)}
                                    onSelect={() => void resolver(item)}
                                  >
                                    Marcar como resolvido
                                  </DropdownMenuItem>
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
                  base={base}
                  item={selected}
                  reply={reply}
                  onReplyChange={setReply}
                  onSend={() => responder(selected)}
                  onClose={() => setSelectedId(null)}
                />
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <FormDialog
        open={creating}
        onOpenChange={setCreating}
        title="Novo atendimento"
        description="Registre um pedido que chegou por telefone, WhatsApp ou balcão. Ele entra na fila."
        submitLabel="Registrar atendimento"
        onSubmit={submitNewTicket}
      >
        <FormField label="Associado" required error={newTicketError.clientId}>
          <FormSelect
            value={newTicket.clientId}
            onChange={value => setNewTicket(prev => ({ ...prev, clientId: value }))}
            placeholder="Escolha o associado"
            options={clients.map(client => ({ value: client.id, label: client.name }))}
            invalid={Boolean(newTicketError.clientId)}
          />
        </FormField>
        <FormField label="Assunto" htmlFor="ticket-subject" required error={newTicketError.subject}>
          <Input
            id="ticket-subject"
            value={newTicket.subject}
            onChange={event => setNewTicket(prev => ({ ...prev, subject: event.target.value }))}
            aria-invalid={Boolean(newTicketError.subject)}
          />
        </FormField>
        <FormField label="Descrição" htmlFor="ticket-description" required error={newTicketError.description}>
          <Textarea
            id="ticket-description"
            rows={3}
            value={newTicket.description}
            onChange={event => setNewTicket(prev => ({ ...prev, description: event.target.value }))}
            aria-invalid={Boolean(newTicketError.description)}
          />
        </FormField>
        <FormRow>
          <FormField label="Canal">
            <FormSelect
              value={newTicket.channel}
              onChange={value => setNewTicket(prev => ({ ...prev, channel: value }))}
              placeholder="Canal"
              options={Object.entries(channelMeta).map(([value, meta]) => ({ value, label: meta.label }))}
            />
          </FormField>
          <FormField label="Prioridade">
            <FormSelect
              value={newTicket.priority}
              onChange={value => setNewTicket(prev => ({ ...prev, priority: value }))}
              placeholder="Prioridade"
              options={Object.entries(priorityMeta).map(([value, meta]) => ({ value, label: meta.label }))}
            />
          </FormField>
        </FormRow>
      </FormDialog>
    </div>
  )
}

function TicketPanel({
  base,
  item,
  reply,
  onReplyChange,
  onSend,
  onClose,
}: {
  base: string
  item: Chamado
  reply: string
  onReplyChange: (value: string) => void
  onSend: () => void
  onClose: () => void
}) {
  const ticket = item.chamado
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-foreground">{item.protocolo}</h2>
            <StatusPill {...statusMeta[ticket.status]} />
          </div>
          <p className="text-xs text-muted-foreground">
            Aberto em {ticket.createdAt.toLocaleDateString('pt-BR')} às{' '}
            {ticket.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
            {getInitials(ticket.clientName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{ticket.clientName}</p>
          <p className="truncate text-xs text-muted-foreground">CPF {item.cpf}</p>
        </div>
        {ticket.clientId && (
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}/clientes/${ticket.clientId}`}>Ver perfil</Link>
          </Button>
        )}
      </div>

      <dl className="space-y-1.5 border-b border-border p-4 text-sm">
        <PanelLine label="Plano">
          <span className="text-primary">{item.plano}</span>
        </PanelLine>
        <PanelLine label="Telefone">{item.telefone}</PanelLine>
        <PanelLine label="E-mail">{item.email}</PanelLine>
        {/*
          Dependentes e situação financeira ficariam aqui, mas nenhum dos dois
          tem origem: dependentes são beneficiários do contrato na Digital
          Saúde e a situação financeira vem do módulo de cobrança do ERP. A
          mesa prioriza atendimento por esses dois campos — preenchê-los com
          palpite seria pior que não mostrá-los.
        */}
        <PanelLine label="Prioridade">
          <StatusPill {...priorityMeta[ticket.priority]} />
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
          <PanelLine label="Canal">{channelMeta[ticket.channel].label}</PanelLine>
          <PanelLine label="Assunto">{ticket.subject}</PanelLine>
          <PanelLine label="Prioridade">
            <StatusPill {...priorityMeta[ticket.priority]} />
          </PanelLine>
          <PanelLine label="Responsável">{ticket.assignedName || 'Na fila'}</PanelLine>
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
        </div>
        <Button
          className="mt-2 w-full gap-2"
          disabled={reply.trim().length === 0}
          onClick={onSend}
        >
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
