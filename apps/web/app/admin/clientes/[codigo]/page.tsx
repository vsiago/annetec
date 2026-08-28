'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { Contract, ContractStatus, Invoice, InvoiceStatus } from '@annetec/contracts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { getInitials } from '@/lib/utils'
import {
  getOperatorAction,
  getOperatorContractAction,
  listOperatorContractInvoicesAction,
  markOperatorContractProducedAction,
  sendOperatorMembershipCardAction,
  syncOperatorContractAction,
  attachOperatorDocumentAction,
  declareOperatorPathologyAction,
  registerOperatorPendencyAction,
} from '@/lib/actions/operator-api'
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Mail,
  CheckCircle2,
  Paperclip,
  Stethoscope,
  AlertTriangle,
  CreditCard,
  ExternalLink,
} from 'lucide-react'

const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  pendente: 'Pendente',
  produzido: 'Produzido',
  ativo: 'Ativo',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
  desconhecido: 'Desconhecido',
}

const CONTRACT_STATUS_VARIANT: Record<ContractStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ativo: 'default',
  produzido: 'secondary',
  pendente: 'outline',
  suspenso: 'destructive',
  cancelado: 'destructive',
  desconhecido: 'outline',
}

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  aberta: 'Aberta',
  paga: 'Paga',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
  desconhecido: 'Desconhecido',
}

const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  aberta: 'outline',
  paga: 'secondary',
  vencida: 'destructive',
  cancelada: 'outline',
  desconhecido: 'outline',
}

function money(value: number | null) {
  if (value === null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function OperatorClienteDetailPage() {
  const params = useParams<{ codigo: string }>()
  const codigo = decodeURIComponent(params.codigo)

  const [tenantSlug, setTenantSlug] = useState<string | null>(null)
  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [loadingInvoices, setLoadingInvoices] = useState(false)

  const [syncing, setSyncing] = useState(false)
  const [marking, setMarking] = useState(false)
  const [sendingCard, setSendingCard] = useState(false)
  const [actionMessage, setActionMessage] = useState('')

  // diálogos de ação administrativa
  const [attachOpen, setAttachOpen] = useState(false)
  const [pathologyOpen, setPathologyOpen] = useState(false)
  const [pendencyOpen, setPendencyOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const load = async (slug: string) => {
    setLoading(true)
    setError('')
    const result = await getOperatorContractAction(slug, codigo)
    setLoading(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setContract(result.data)
  }

  const loadInvoices = async (slug: string) => {
    setLoadingInvoices(true)
    const result = await listOperatorContractInvoicesAction(slug, codigo)
    setLoadingInvoices(false)
    if (result.success) setInvoices(result.data)
  }

  useEffect(() => {
    getOperatorAction().then(result => {
      if (result.success && result.data) setTenantSlug(result.data.slug)
      else if (result.success) setError('A Annetec ainda não está configurada como operadora.')
      else setError(result.error)
      if (!result.success || !result.data) setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (tenantSlug) {
      load(tenantSlug)
      loadInvoices(tenantSlug)
    }
  }, [tenantSlug])

  const handleSync = async () => {
    if (!tenantSlug) return
    setSyncing(true)
    const result = await syncOperatorContractAction(tenantSlug, codigo)
    setSyncing(false)
    if (result.success) {
      setContract(result.data)
      setActionMessage('Contrato atualizado a partir do ERP.')
    }
  }

  const handleMarkProduced = async () => {
    if (!tenantSlug) return
    setMarking(true)
    const result = await markOperatorContractProducedAction(tenantSlug, codigo)
    setMarking(false)
    if (result.success) {
      setContract(result.data)
      setActionMessage('Contrato marcado como Produzido.')
    }
  }

  const handleSendCard = async () => {
    if (!tenantSlug) return
    setSendingCard(true)
    const result = await sendOperatorMembershipCardAction(tenantSlug, codigo)
    setSendingCard(false)
    if (result.success) setActionMessage(result.data.message || 'Carteirinha enviada por e-mail.')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Carregando...
      </div>
    )
  }

  if (error || !contract) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">
            {error || 'Contrato não encontrado.'}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-12 bg-primary">
            <AvatarFallback className="bg-primary text-white text-base font-medium">
              {getInitials(contract.holderName ?? '?')}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{contract.holderName ?? '—'}</h1>
              <Badge variant={CONTRACT_STATUS_VARIANT[contract.status]}>
                {CONTRACT_STATUS_LABEL[contract.status]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {contract.upstreamCodigo} · Proposta {contract.proposalNumber ?? '—'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Atualizar do ERP
          </Button>
          <Button variant="outline" size="sm" onClick={handleSendCard} disabled={sendingCard}>
            {sendingCard ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
            Enviar carteirinha
          </Button>
          {contract.status === 'pendente' && (
            <Button size="sm" onClick={handleMarkProduced} disabled={marking}>
              {marking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Marcar como Produzido
            </Button>
          )}
        </div>
      </div>

      {actionMessage && (
        <p className="flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" /> {actionMessage}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border border-border/80 shadow-xs bg-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Dados do contrato</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Plano" value={contract.planName} />
            <Field label="Convênio" value={contract.convenioName} />
            <Field label="Mensalidade" value={money(contract.monthlyValue)} />
            <Field label="Saldo devedor" value={money(contract.outstandingBalance)} />
            <Field label="Dia de vencimento" value={contract.dueDay ? String(contract.dueDay) : null} />
            <Field label="Assinado em" value={contract.signedAt} />
            <Field label="Vendedor (produtor)" value={contract.sellerUpstreamCodigo} />
            <Field label="Status no ERP" value={contract.upstreamStatus} />
            <Field
              label="Última sincronização"
              value={contract.syncedAt ? new Date(contract.syncedAt).toLocaleString('pt-BR') : null}
            />
          </CardContent>
        </Card>

        <Card className="border border-border/80 shadow-xs bg-card">
          <CardHeader>
            <CardTitle className="text-base">Ações administrativas</CardTitle>
            <CardDescription>Registradas direto na Digital Saúde.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <AttachDocumentDialog
              open={attachOpen}
              onOpenChange={setAttachOpen}
              submitting={submitting}
              error={formError}
              onSubmit={async (fileName, fileUrl) => {
                if (!tenantSlug) return
                setSubmitting(true)
                setFormError('')
                const result = await attachOperatorDocumentAction(tenantSlug, {
                  contractUpstreamCodigo: codigo,
                  fileName,
                  fileUrl,
                })
                setSubmitting(false)
                if (!result.success) {
                  setFormError(result.error)
                  return
                }
                setAttachOpen(false)
                setActionMessage('Documento anexado ao contrato.')
              }}
            />

            <DeclarePathologyDialog
              open={pathologyOpen}
              onOpenChange={setPathologyOpen}
              submitting={submitting}
              error={formError}
              beneficiaries={contract.beneficiaries}
              onSubmit={async input => {
                if (!tenantSlug) return
                setSubmitting(true)
                setFormError('')
                const result = await declareOperatorPathologyAction(tenantSlug, input)
                setSubmitting(false)
                if (!result.success) {
                  setFormError(result.error)
                  return
                }
                setPathologyOpen(false)
                setActionMessage('Patologia declarada.')
              }}
            />

            <RegisterPendencyDialog
              open={pendencyOpen}
              onOpenChange={setPendencyOpen}
              submitting={submitting}
              error={formError}
              onSubmit={async pendencyCode => {
                if (!tenantSlug) return
                setSubmitting(true)
                setFormError('')
                const result = await registerOperatorPendencyAction(tenantSlug, {
                  contractCodigo: codigo,
                  pendencyCode,
                })
                setSubmitting(false)
                if (!result.success) {
                  setFormError(result.error)
                  return
                }
                setPendencyOpen(false)
                setActionMessage('Pendência registrada.')
              }}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="border border-border/80 shadow-xs bg-card">
        <CardHeader>
          <CardTitle className="text-base">Beneficiários</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Nome</th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Parentesco</th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">CPF</th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Nascimento</th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-right py-3 px-6 text-sm font-medium text-muted-foreground">Carteirinha</th>
                </tr>
              </thead>
              <tbody>
                {contract.beneficiaries.map(beneficiary => (
                  <tr key={beneficiary.id} className="border-b border-border last:border-0">
                    <td className="py-3 px-6">
                      <p className="text-sm font-medium text-foreground">{beneficiary.name}</p>
                      <p className="text-xs text-muted-foreground">{beneficiary.upstreamCodigo}</p>
                    </td>
                    <td className="py-3 px-6 text-sm text-foreground">{beneficiary.relationship ?? '—'}</td>
                    <td className="py-3 px-6 text-sm text-foreground">{beneficiary.cpf ?? '—'}</td>
                    <td className="py-3 px-6 text-sm text-foreground">{beneficiary.birthDate ?? '—'}</td>
                    <td className="py-3 px-6 text-sm text-foreground">{beneficiary.status ?? '—'}</td>
                    <td className="py-3 px-6 text-right">
                      {beneficiary.provisionalCardUrl && (
                        <a
                          href={beneficiary.provisionalCardUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <CreditCard className="h-3.5 w-3.5" /> Ver
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border/80 shadow-xs bg-card">
        <CardHeader>
          <CardTitle className="text-base">Faturas deste contrato</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingInvoices ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Carregando...
            </div>
          ) : !invoices || invoices.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma fatura encontrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Vencimento</th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Valor</th>
                    <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-right py-3 px-6 text-sm font-medium text-muted-foreground">Boleto</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(invoice => (
                    <tr key={invoice.upstreamCodigo} className="border-b border-border last:border-0">
                      <td className="py-3 px-6 text-sm text-foreground">{invoice.dueAt ?? '—'}</td>
                      <td className="py-3 px-6 text-sm font-medium text-foreground">{money(invoice.amount)}</td>
                      <td className="py-3 px-6">
                        <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>
                          {INVOICE_STATUS_LABEL[invoice.status]}
                        </Badge>
                      </td>
                      <td className="py-3 px-6 text-right">
                        {invoice.invoiceUrl && (
                          <a
                            href={invoice.invoiceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            Ver <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
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

function BackLink() {
  return (
    <Link
      href="/admin/clientes"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> Voltar para Clientes
    </Link>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value ?? '—'}</p>
    </div>
  )
}

function AttachDocumentDialog({
  open,
  onOpenChange,
  submitting,
  error,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  submitting: boolean
  error: string
  onSubmit: (fileName: string, fileUrl: string) => void
}) {
  const [fileName, setFileName] = useState('')
  const [fileUrl, setFileUrl] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="justify-start">
          <Paperclip className="h-4 w-4 mr-2" /> Anexar documento
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anexar documento</DialogTitle>
          <DialogDescription>Envia um link de arquivo já hospedado — a Digital Saúde não recebe upload direto.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nome do arquivo</Label>
            <Input value={fileName} onChange={e => setFileName(e.target.value)} placeholder="RG.pdf" />
          </div>
          <div className="grid gap-1.5">
            <Label>URL do arquivo</Label>
            <Input value={fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="https://..." />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            onClick={() => onSubmit(fileName, fileUrl)}
            disabled={submitting || !fileName || !fileUrl}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Anexar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeclarePathologyDialog({
  open,
  onOpenChange,
  submitting,
  error,
  beneficiaries,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  submitting: boolean
  error: string
  beneficiaries: Contract['beneficiaries']
  onSubmit: (input: { beneficiaryUpstreamCodigo: string; name: string; description?: string }) => void
}) {
  const [beneficiaryCodigo, setBeneficiaryCodigo] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="justify-start">
          <Stethoscope className="h-4 w-4 mr-2" /> Declarar patologia
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Declarar patologia</DialogTitle>
          <DialogDescription>Declaração de saúde do beneficiário, registrada no ERP.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Beneficiário</Label>
            <Select value={beneficiaryCodigo} onValueChange={setBeneficiaryCodigo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {beneficiaries
                  .filter(b => b.upstreamCodigo)
                  .map(b => (
                    <SelectItem key={b.upstreamCodigo!} value={b.upstreamCodigo!}>
                      {b.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Nome da patologia</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Hipertensão" />
          </div>
          <div className="grid gap-1.5">
            <Label>Descrição (opcional)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            onClick={() =>
              onSubmit({ beneficiaryUpstreamCodigo: beneficiaryCodigo, name, description: description || undefined })
            }
            disabled={submitting || !beneficiaryCodigo || !name}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Declarar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RegisterPendencyDialog({
  open,
  onOpenChange,
  submitting,
  error,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  submitting: boolean
  error: string
  onSubmit: (pendencyCode: string) => void
}) {
  const [pendencyCode, setPendencyCode] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="justify-start">
          <AlertTriangle className="h-4 w-4 mr-2" /> Registrar pendência
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pendência</DialogTitle>
          <DialogDescription>Código da pendência conforme cadastrado na Digital Saúde.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Código da pendência</Label>
            <Input value={pendencyCode} onChange={e => setPendencyCode(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={() => onSubmit(pendencyCode)} disabled={submitting || !pendencyCode}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
