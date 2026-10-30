'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import type { Contract, ContractStatus, Invoice, InvoiceStatus } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { AttachDocumentDialog, DeclarePathologyDialog, RegisterPendencyDialog } from '@/components/admin-platform/forms/contract-dialogs'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { BackLink, PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { StatusPill, type StatusPillTone } from '@/components/admin-platform/ui/status-pill'
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
  ClipboardCheck,
  Loader2,
  RefreshCw,
  Mail,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileText,
  Receipt,
  UserRound,
  Users,
} from 'lucide-react'

const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  pendente: 'Pendente',
  produzido: 'Produzido',
  ativo: 'Ativo',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
  desconhecido: 'Desconhecido',
}

const CONTRACT_STATUS_TONE: Record<ContractStatus, StatusPillTone> = {
  ativo: 'success',
  produzido: 'info',
  pendente: 'warning',
  suspenso: 'warning',
  cancelado: 'danger',
  desconhecido: 'neutral',
}

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  aberta: 'Aberta',
  paga: 'Paga',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
  desconhecido: 'Desconhecido',
}

const INVOICE_STATUS_TONE: Record<InvoiceStatus, StatusPillTone> = {
  aberta: 'info',
  paga: 'success',
  vencida: 'danger',
  cancelada: 'neutral',
  desconhecido: 'neutral',
}

const LINK_CLASS =
  'inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-medium text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2'

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
      <PageContainer>
        <div>
          <BackLink href="/admin/clientes">Voltar para Clientes</BackLink>
        </div>
        <SectionCard>
          <SectionSkeleton rows={5} label="Carregando contrato…" />
        </SectionCard>
      </PageContainer>
    )
  }

  if (error || !contract) {
    return (
      <PageContainer>
        <div>
          <BackLink href="/admin/clientes">Voltar para Clientes</BackLink>
        </div>
        <ErrorState description={error || 'Contrato não encontrado.'} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={<BackLink href="/admin/clientes">Voltar para Clientes</BackLink>}
        icon={UserRound}
        title={contract.holderName ?? '—'}
        badge={
          <StatusPill tone={CONTRACT_STATUS_TONE[contract.status]}>{CONTRACT_STATUS_LABEL[contract.status]}</StatusPill>
        }
        description={`${contract.upstreamCodigo} · Proposta ${contract.proposalNumber ?? '—'}`}
        actions={
          <>
            <Button variant="outline" className="h-10" onClick={handleSync} disabled={syncing}>
              {syncing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
              Atualizar do ERP
            </Button>
            <Button variant="outline" className="h-10" onClick={handleSendCard} disabled={sendingCard}>
              {sendingCard ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Mail aria-hidden="true" />}
              Enviar carteirinha
            </Button>
            {contract.status === 'pendente' && (
              <Button className="h-10" onClick={handleMarkProduced} disabled={marking}>
                {marking ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
                Marcar como Produzido
              </Button>
            )}
          </>
        }
      />

      {actionMessage && (
        <p
          role="status"
          className="m-0 flex items-center gap-2 rounded-xl bg-[#ECFDF3] px-4 py-3 text-sm font-medium text-[#067647]"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> {actionMessage}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard icon={FileText} title="Dados do contrato" className="lg:col-span-2">
          <dl className="m-0 grid grid-cols-2 gap-4 sm:grid-cols-3">
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
          </dl>
        </SectionCard>

        <SectionCard icon={ClipboardCheck} title="Ações administrativas" description="Registradas direto na Digital Saúde.">
          <div className="flex flex-col gap-3">
            <AttachDocumentDialog
              open={attachOpen}
              onOpenChange={setAttachOpen}
              onSubmit={async (fileName, fileUrl) => {
                if (!tenantSlug) return 'Clube não identificado. Recarregue a página e tente de novo.'
                const result = await attachOperatorDocumentAction(tenantSlug, {
                  contractUpstreamCodigo: codigo,
                  fileName,
                  fileUrl,
                })
                if (!result.success) return result.error
                setActionMessage('Documento anexado ao contrato.')
                return null
              }}
            />

            <DeclarePathologyDialog
              open={pathologyOpen}
              onOpenChange={setPathologyOpen}
              beneficiaries={contract.beneficiaries}
              onSubmit={async input => {
                if (!tenantSlug) return 'Clube não identificado. Recarregue a página e tente de novo.'
                const result = await declareOperatorPathologyAction(tenantSlug, input)
                if (!result.success) return result.error
                setActionMessage('Patologia declarada.')
                return null
              }}
            />

            <RegisterPendencyDialog
              open={pendencyOpen}
              onOpenChange={setPendencyOpen}
              onSubmit={async pendencyCode => {
                if (!tenantSlug) return 'Clube não identificado. Recarregue a página e tente de novo.'
                const result = await registerOperatorPendencyAction(tenantSlug, {
                  contractCodigo: codigo,
                  pendencyCode,
                })
                if (!result.success) return result.error
                setActionMessage('Pendência registrada.')
                return null
              }}
            />
          </div>
        </SectionCard>
      </div>

      <SectionCard icon={Users} title="Beneficiários" padded={false}>
        {contract.beneficiaries.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum beneficiário neste contrato" />
        ) : (
          <DataTable caption="Beneficiários do contrato" framed={false} minWidth="min-w-[760px]">
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Parentesco</Th>
                <Th>CPF</Th>
                <Th>Nascimento</Th>
                <Th>Status</Th>
                <Th align="right">Carteirinha</Th>
              </tr>
            </thead>
            <tbody>
              {contract.beneficiaries.map(beneficiary => (
                <Tr key={beneficiary.id}>
                  <Td>
                    <p className="m-0 font-semibold text-foreground">{beneficiary.name}</p>
                    <p className="m-0 text-[13px] text-muted-foreground">{beneficiary.upstreamCodigo}</p>
                  </Td>
                  <Td className="text-foreground">{beneficiary.relationship ?? '—'}</Td>
                  <Td className="text-foreground">{beneficiary.cpf ?? '—'}</Td>
                  <Td className="text-foreground">{beneficiary.birthDate ?? '—'}</Td>
                  <Td className="text-foreground">{beneficiary.status ?? '—'}</Td>
                  <Td align="right">
                    {beneficiary.provisionalCardUrl && (
                      <a href={beneficiary.provisionalCardUrl} target="_blank" rel="noreferrer" className={LINK_CLASS}>
                        <CreditCard className="size-4" aria-hidden="true" /> Ver
                        <span className="sr-only"> carteirinha de {beneficiary.name}</span>
                      </a>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </SectionCard>

      <SectionCard icon={Receipt} title="Faturas deste contrato" padded={false}>
        {loadingInvoices ? (
          <div className="p-6">
            <SectionSkeleton rows={3} label="Carregando faturas…" />
          </div>
        ) : !invoices || invoices.length === 0 ? (
          <EmptyState icon={Receipt} title="Nenhuma fatura encontrada" />
        ) : (
          <DataTable caption="Faturas do contrato" framed={false} minWidth="min-w-[560px]">
            <thead>
              <tr>
                <Th>Vencimento</Th>
                <Th align="right">Valor</Th>
                <Th>Status</Th>
                <Th align="right">Boleto</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(invoice => (
                <Tr key={invoice.upstreamCodigo}>
                  <Td className="text-foreground">{invoice.dueAt ?? '—'}</Td>
                  <Td align="right" className="font-semibold tabular-nums text-foreground">
                    {money(invoice.amount)}
                  </Td>
                  <Td>
                    <StatusPill tone={INVOICE_STATUS_TONE[invoice.status]}>
                      {INVOICE_STATUS_LABEL[invoice.status]}
                    </StatusPill>
                  </Td>
                  <Td align="right">
                    {invoice.invoiceUrl && (
                      <a href={invoice.invoiceUrl} target="_blank" rel="noreferrer" className={LINK_CLASS}>
                        Ver <ExternalLink className="size-4" aria-hidden="true" />
                        <span className="sr-only"> boleto com vencimento {invoice.dueAt ?? 'sem data'}</span>
                      </a>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </SectionCard>
    </PageContainer>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="m-0 wrap-break-word text-sm font-semibold text-foreground">{value ?? '—'}</dd>
    </div>
  )
}
