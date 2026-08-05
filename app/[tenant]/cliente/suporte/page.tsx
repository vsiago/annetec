'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import { useTenantData } from '@/contexts/tenant-data-context'
import type { Client } from '@/lib/types'
import {
  Phone,
  Mail,
  MessageSquare,
  Clock,
  MapPin,
  Send,
  CheckCircle2,
  HelpCircle,
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// Phone-dependent FAQ text, built at render time so it reflects the tenant's
// own contact number instead of a fixed 0800.
function buildFaqs(phone: string) {
  return [
    {
      question: 'Como faço para usar a Teleorientação?',
      answer: `Basta ligar para o número ${phone}, disponível 24 horas por dia, 7 dias por semana. Tenha em mãos o número da sua carteirinha para identificação.`,
    },
    {
      question: 'Posso incluir mais dependentes no meu plano?',
      answer: 'Sim! Você pode incluir até 5 dependentes no seu plano. Acesse a aba "Dependentes" para adicionar novos membros à sua família.',
    },
    {
      question: 'Como funciona o desconto nas farmácias?',
      answer: 'Nas farmácias parceiras, basta informar seu CPF no momento da compra para obter descontos de até 60% em medicamentos.',
    },
    {
      question: 'Qual o prazo para reembolso do auxílio funeral?',
      answer: 'O reembolso é processado em até 5 dias úteis após o envio de toda a documentação necessária.',
    },
    {
      question: 'Como agendar consultas e exames?',
      answer: `Você pode agendar pelo telefone ${phone} ou diretamente nos estabelecimentos da rede conveniada. Consulte a lista de parceiros no app.`,
    },
  ]
}

export default function SuportePage() {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const { createAppointment } = useTenantData()
  const client = user as Client
  const [formSubmitted, setFormSubmitted] = useState(false)
  const [isTeleOpen, setIsTeleOpen] = useState(false)
  const [teleDescription, setTeleDescription] = useState('')
  const [teleSubmitted, setTeleSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormSubmitted(true)
    setTimeout(() => setFormSubmitted(false), 3000)
  }

  const handleRequestTeleorientation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!client || !teleDescription) return
    await createAppointment({
      clientId: client.id,
      clientName: client.name,
      description: teleDescription,
    })
    setTeleSubmitted(true)
    setTeleDescription('')
  }

  const whatsappHref = tenant
    ? `https://wa.me/${tenant.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Olá! Sou associado(a) ${client?.name ?? ''} do ${tenant.name} e preciso de suporte.`
      )}`
    : '#'

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
                <h3 className="font-bold">Teleorientação 24h</h3>
                <p className="text-white/80 text-sm">Orientação médica gratuita</p>
              </div>
            </div>
            <p className="text-2xl font-bold">{tenant?.phone}</p>
            <div className="flex items-center gap-2 mt-2 text-white/80 text-sm mb-4">
              <Clock className="h-4 w-4" />
              Disponível 24 horas
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
            <p className="text-2xl font-bold">{tenant?.phone}</p>
            <div className="flex items-center gap-2 mt-2 text-white/80 text-sm mb-4">
              <Clock className="h-4 w-4" />
              Seg a Sex, 8h às 18h
            </div>
            <Button variant="secondary" className="w-full bg-white/15 hover:bg-white/25 text-white border-0" asChild>
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                <MessageSquare className="h-4 w-4 mr-2" />
                Falar no WhatsApp
              </a>
            </Button>
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
                <p className="text-muted-foreground text-sm">Resposta em até 24h</p>
              </div>
            </div>
            <p className="text-lg font-medium text-secondary">{tenant?.email}</p>
          </CardContent>
        </Card>
      </div>

      {/* Contact Form */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Enviar Mensagem</CardTitle>
          <CardDescription>Preencha o formulário abaixo que entraremos em contato</CardDescription>
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
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o assunto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="duvida">Dúvida sobre o plano</SelectItem>
                    <SelectItem value="beneficio">Utilização de benefícios</SelectItem>
                    <SelectItem value="dependente">Inclusão de dependentes</SelectItem>
                    <SelectItem value="pagamento">Pagamento e cobrança</SelectItem>
                    <SelectItem value="cancelamento">Cancelamento</SelectItem>
                    <SelectItem value="outro">Outro assunto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Mensagem</Label>
                <Textarea
                  id="message"
                  placeholder="Descreva sua dúvida ou solicitação..."
                  rows={5}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" className="bg-primary hover:opacity-90 text-white">
                  <Send className="h-4 w-4 mr-2" />
                  Enviar Mensagem
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-secondary" />
            <CardTitle className="text-lg">Perguntas Frequentes</CardTitle>
          </div>
          <CardDescription>Encontre respostas para as dúvidas mais comuns</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {buildFaqs(tenant?.phone || '0800 000 0000').map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Documents */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-secondary" />
            <CardTitle className="text-lg">Documentos Úteis</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="outline" className="justify-start h-auto py-4">
              <FileText className="h-5 w-5 mr-3 text-secondary" />
              <div className="text-left">
                <p className="font-medium">Contrato do Plano</p>
                <p className="text-xs text-muted-foreground">Termos e condições</p>
              </div>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-4">
              <FileText className="h-5 w-5 mr-3 text-secondary" />
              <div className="text-left">
                <p className="font-medium">Rede Credenciada</p>
                <p className="text-xs text-muted-foreground">Lista de parceiros</p>
              </div>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-4">
              <FileText className="h-5 w-5 mr-3 text-secondary" />
              <div className="text-left">
                <p className="font-medium">Manual do Associado</p>
                <p className="text-xs text-muted-foreground">Guia completo de uso</p>
              </div>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-4">
              <FileText className="h-5 w-5 mr-3 text-secondary" />
              <div className="text-left">
                <p className="font-medium">Política de Privacidade</p>
                <p className="text-xs text-muted-foreground">LGPD e dados</p>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isTeleOpen} onOpenChange={open => { setIsTeleOpen(open); if (!open) setTeleSubmitted(false) }}>
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
              <div className="py-4">
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
                <Button type="submit" className="bg-primary hover:opacity-90 text-white">
                  Enviar Solicitação
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
