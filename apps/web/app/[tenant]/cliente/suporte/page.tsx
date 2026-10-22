'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import type { Client } from '@/lib/types'
import { createOperatorAppointmentAction } from '@/lib/actions/operator-support-api'
import { atendimentoParaApiCriacao } from '@/lib/adapters/painel'
import {
  AlertCircle,
  Phone,
  Mail,
  MessageSquare,
  Send,
  CheckCircle2,
  FileText,
  HeadphonesIcon,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const SUBJECTS = [
  { value: 'Dúvida sobre o plano', label: 'Dúvida sobre o plano' },
  { value: 'Utilização de benefícios', label: 'Utilização de benefícios' },
  { value: 'Inclusão de dependentes', label: 'Inclusão de dependentes' },
  { value: 'Pagamento e cobrança', label: 'Pagamento e cobrança' },
  { value: 'Cancelamento', label: 'Cancelamento' },
  { value: 'Outro assunto', label: 'Outro assunto' },
]

/**
 * Suporte do associado. Os dois formulários (mensagem e teleorientação) abrem
 * um chamado de verdade na mesa de atendimento do clube (`POST /atendimentos`);
 * telefone e e-mail são os do cadastro do clube.
 */
export default function SuportePage() {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const client = user as Client
  const slug = tenant?.slug ?? ''

  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSubmitted, setFormSubmitted] = useState(false)

  const [isTeleOpen, setIsTeleOpen] = useState(false)
  const [teleDescription, setTeleDescription] = useState('')
  const [teleSending, setTeleSending] = useState(false)
  const [teleError, setTeleError] = useState<string | null>(null)
  const [teleSubmitted, setTeleSubmitted] = useState(false)

  async function openTicket(ticketSubject: string, description: string) {
    return createOperatorAppointmentAction(
      slug,
      atendimentoParaApiCriacao({
        clientId: client.id,
        clientName: client.name,
        subject: ticketSubject,
        description,
        channel: 'app',
        priority: 'normal',
      }),
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!client || !slug) return
    if (!subject || !message.trim()) {
      setFormError('Escolha o assunto e escreva a mensagem.')
      return
    }
    setSending(true)
    setFormError(null)
    const result = await openTicket(subject, message.trim())
    setSending(false)
    if (!result.success) {
      setFormError(result.error)
      return
    }
    setFormSubmitted(true)
    setSubject('')
    setMessage('')
  }

  const handleRequestTeleorientation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!client || !slug || !teleDescription.trim()) return
    // Abre pelo app e entra na fila: o associado não escolhe prioridade nem
    // quem vai atender — a mesa distribui.
    setTeleSending(true)
    setTeleError(null)
    const result = await openTicket('Teleorientação', teleDescription.trim())
    setTeleSending(false)
    if (!result.success) {
      setTeleError(result.error)
      return
    }
    setTeleSubmitted(true)
    setTeleDescription('')
  }

  const phoneDigits = tenant?.phone?.replace(/\D/g, '') ?? ''
  const whatsappHref = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(
        `Olá! Sou associado(a) ${client?.name ?? ''} do ${tenant?.name ?? ''} e preciso de suporte.`,
      )}`
    : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Suporte</h1>
        <p className="text-muted-foreground">Estamos aqui para ajudar você</p>
      </div>

      {/* Contact Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Teleorientation */}
        <Card className="border-0 shadow-sm bg-gradient-to-br from-primary to-primary/80 text-white">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-lg bg-white/10">
                <Phone className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold">Teleorientação</h3>
                <p className="text-white/80 text-sm">Peça pelo app e a equipe retorna o contato</p>
              </div>
            </div>
            <Button
              variant="secondary"
              className="w-full bg-white/15 hover:bg-white/25 text-white border-0"
              onClick={() => setIsTeleOpen(true)}
            >
              Solicitar Teleorientação
            </Button>
          </CardContent>
        </Card>

        {/* Central de Atendimento */}
        <Card className="border-0 shadow-sm bg-gradient-to-br from-secondary to-secondary/80 text-white">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-lg bg-white/10">
                <HeadphonesIcon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold">Central de Atendimento</h3>
                <p className="text-white/80 text-sm">Dúvidas e suporte</p>
              </div>
            </div>
            <p className="text-2xl font-bold mb-4">{tenant?.phone || '—'}</p>
            {whatsappHref && (
              <Button variant="secondary" className="w-full bg-white/15 hover:bg-white/25 text-white border-0" asChild>
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Falar no WhatsApp
                </a>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Email */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-bold">Email</h3>
                <p className="text-muted-foreground text-sm">Fale com o clube por e-mail</p>
              </div>
            </div>
            {tenant?.email ? (
              <a href={`mailto:${tenant.email}`} className="text-lg font-medium text-secondary break-all hover:underline">
                {tenant.email}
              </a>
            ) : (
              <p className="text-lg font-medium text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Contact Form */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Enviar Mensagem</CardTitle>
          <CardDescription>Sua mensagem abre um chamado na central de atendimento do clube</CardDescription>
        </CardHeader>
        <CardContent>
          {formSubmitted ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="font-semibold text-lg">Mensagem Enviada!</h3>
              <p className="text-muted-foreground mt-2">
                Recebemos sua mensagem e responderemos em breve.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => setFormSubmitted(false)}>
                Enviar outra mensagem
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" defaultValue={client?.name} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" defaultValue={client?.email} disabled />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Assunto</Label>
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger id="subject">
                    <SelectValue placeholder="Selecione o assunto" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map(item => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Mensagem</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Descreva sua dúvida ou solicitação..."
                  rows={5}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={sending} className="bg-primary hover:opacity-90 text-white">
                  <Send className="h-4 w-4 mr-2" />
                  {sending ? 'Enviando...' : 'Enviar Mensagem'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Useful links */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-secondary" />
            <CardTitle className="text-lg">Links Úteis</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="outline" className="justify-start h-auto py-4" asChild>
              <Link href={`/${slug}/cliente/parceiros`}>
                <FileText className="h-5 w-5 mr-3 text-secondary" />
                <div className="text-left">
                  <p className="font-medium">Rede Credenciada</p>
                  <p className="text-xs text-muted-foreground">Lista de parceiros</p>
                </div>
              </Link>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-4" asChild>
              <Link href={`/${slug}/cliente/beneficios`}>
                <FileText className="h-5 w-5 mr-3 text-secondary" />
                <div className="text-left">
                  <p className="font-medium">Benefícios do Plano</p>
                  <p className="text-xs text-muted-foreground">O que o seu plano inclui</p>
                </div>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isTeleOpen}
        onOpenChange={open => {
          setIsTeleOpen(open)
          if (!open) {
            setTeleSubmitted(false)
            setTeleError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          {teleSubmitted ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="font-semibold text-lg">Solicitação registrada!</h3>
              <p className="text-muted-foreground mt-2 text-sm">
                Sua solicitação de teleorientação foi registrada. Nossa equipe entrará em contato em breve.
              </p>
              <Button className="mt-4 bg-primary hover:opacity-90 text-white" onClick={() => setIsTeleOpen(false)}>
                Fechar
              </Button>
            </div>
          ) : (
            <form onSubmit={handleRequestTeleorientation}>
              <DialogHeader>
                <DialogTitle>Solicitar Teleorientação</DialogTitle>
                <DialogDescription>Descreva brevemente o motivo para agilizarmos seu atendimento</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-4">
                {teleError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{teleError}</AlertDescription>
                  </Alert>
                )}
                <Textarea
                  value={teleDescription}
                  onChange={e => setTeleDescription(e.target.value)}
                  placeholder="Ex: Estou com febre e dor de garganta há 2 dias..."
                  rows={4}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsTeleOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={teleSending} className="bg-primary hover:opacity-90 text-white">
                  {teleSending ? 'Enviando...' : 'Enviar Solicitação'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
