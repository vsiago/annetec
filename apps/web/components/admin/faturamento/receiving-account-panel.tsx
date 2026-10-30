'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import {
  ChevronDown,
  CircleAlert,
  CircleCheckBig,
  Clock,
  Eye,
  EyeOff,
  FlaskConical,
  KeyRound,
  Landmark,
  LoaderCircle,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  CLUB_RECEIVING_WEBHOOK_STATUS_LABELS,
  connectClubReceivingAccountInput,
  type ClubManagedAccountStatus,
  type ClubReceivingAccount,
  type ClubReceivingWebhookStatus,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { notifyReceivingAccountChanged } from '@/lib/receiving-account-events'
import {
  connectReceivingAccountAction,
  disconnectReceivingAccountAction,
  getManagedAccountStatusAction,
  getReceivingAccountAction,
  testReceivingAccountAction,
} from '@/lib/actions/faturamento-api'
import { formatDateTimeBR, formatRelative } from '@/lib/adapters/faturamento'
import { cn } from '@/lib/utils'
import { LoadError } from './billing-ui'
import { ManagedAccountWizard } from './managed-account-wizard'
import { ManagedConnected, ManagedOffer, ManagedRequestCard, OwnAccountOffer } from './managed-account-view'
import { ReasonConfirmDialog } from './reason-confirm-dialog'
import { useActionData } from './use-action-data'

// ---------------------------------------------------------------------------
// Passo a passo no Asaas
// ---------------------------------------------------------------------------

const KEY_STEPS: ReactNode[] = [
  <>
    Entre na sua conta do Asaas e abra <strong>Integrações</strong> → <strong>Chaves de API</strong>.
  </>,
  <>
    Clique em <strong>Gerar chave de API</strong>. Como nome, sugerimos <strong>ANNETEC</strong>.
  </>,
  <>
    Deixe <strong>sem data de expiração</strong>, para a cobrança não parar de uma hora para outra.
  </>,
  <>
    <strong>Não</strong> marque a opção <strong>&quot;Permitir operações de saque via API&quot;</strong>: a ANNETEC
    só precisa cobrar e acompanhar os pagamentos, nunca movimentar o seu saldo.
  </>,
  <>
    Copie a chave <strong>na hora</strong>: o Asaas só a mostra uma vez. Depois, cole no campo abaixo.
  </>,
]

function KeyGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="rounded-xl border border-border bg-muted/30">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
        <span className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          Como gerar a chave no Asaas
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="space-y-2 px-3 pb-3 pt-1 text-sm text-muted-foreground">
          {KEY_STEPS.map((step, index) => (
            <li key={index} className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ---------------------------------------------------------------------------
// Formulário da chave (conectar e trocar)
// ---------------------------------------------------------------------------

function KeyForm({
  tenantSlug,
  replacing,
  onConnected,
  onCancel,
}: {
  tenantSlug: string
  /** `true` = já há conta conectada e esta chave a substitui. */
  replacing: boolean
  onConnected: (account: ClubReceivingAccount) => void
  onCancel?: () => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [visible, setVisible] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setFieldError(null)
    setFormError(null)

    const parsed = connectClubReceivingAccountInput.safeParse({ apiKey })
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Informe a chave de API do Asaas')
      return
    }

    setBusy(true)
    try {
      const result = await connectReceivingAccountAction(tenantSlug, parsed.data)
      if (!result.success) {
        // 400: chave inválida / ambiente errado — junto ao campo. 422 (Asaas recusou), 429 e o resto: mensagem.
        const keyMessage = result.fieldErrors?.apiKey
        if (keyMessage) setFieldError(keyMessage)
        else setFormError(result.error)
        toast.error(replacing ? 'Não foi possível trocar a chave' : 'Não foi possível conectar a conta', {
          description: keyMessage ?? result.error,
        })
        return
      }
      // A chave não fica em memória depois de aceita.
      setApiKey('')
      setVisible(false)
      toast.success(replacing ? 'Chave trocada' : 'Conta Asaas conectada', {
        description: result.data.accountName
          ? `Recebimento na conta de ${result.data.accountName}.`
          : 'O clube já pode receber as mensalidades.',
      })
      notifyReceivingAccountChanged(result.data.connected)
      onConnected(result.data)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={event => void submit(event)} className="space-y-3" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="recebimento-chave" className="text-sm font-medium">
          {replacing ? 'Nova chave de API do Asaas' : 'Chave de API do Asaas'}
        </Label>
        <div className="relative">
          <Input
            id="recebimento-chave"
            name="asaas-api-key"
            type={visible ? 'text' : 'password'}
            value={apiKey}
            onChange={event => {
              setApiKey(event.target.value)
              setFieldError(null)
              setFormError(null)
            }}
            placeholder="$aact_prod_…"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={500}
            aria-invalid={!!fieldError}
            aria-describedby="recebimento-chave-ajuda"
            disabled={busy}
            data-1p-ignore
            data-lpignore="true"
            className="pr-11 font-mono"
          />
          <button
            type="button"
            onClick={() => setVisible(value => !value)}
            className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
            aria-label={visible ? 'Ocultar a chave' : 'Mostrar a chave'}
            aria-pressed={visible}
            tabIndex={-1}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {fieldError ? (
          <p id="recebimento-chave-ajuda" className="text-xs text-destructive">
            {fieldError}
          </p>
        ) : (
          <p id="recebimento-chave-ajuda" className="text-xs text-muted-foreground">
            Chave de produção começa com <code className="text-[11px]">$aact_prod_</code>; a de testes (sandbox), com{' '}
            <code className="text-[11px]">$aact_hmlg_</code>. Por segurança, ela nunca é exibida de novo depois de
            salva.
          </p>
        )}
      </div>

      {formError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {formError}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        )}
        <Button type="submit" className="gap-2" disabled={busy || apiKey.trim() === ''}>
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
          {busy ? 'Conectando…' : replacing ? 'Trocar chave' : 'Conectar'}
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Conta conectada
// ---------------------------------------------------------------------------

const WEBHOOK_TONE: Record<ClubReceivingWebhookStatus, string> = {
  ativo:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
  pendente:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  erro: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300',
}

/** Situação geral crua do Asaas (`general`) em português; o que não conhecemos aparece como veio. */
const ACCOUNT_GENERAL_LABELS: Record<string, string> = {
  APPROVED: 'Aprovada',
  AWAITING_APPROVAL: 'Aguardando aprovação',
  PENDING: 'Pendente',
  REJECTED: 'Recusada',
}

function InfoItem({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 space-y-0.5', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm font-medium text-foreground">{children}</dd>
    </div>
  )
}

function EnvBadge({ env }: { env: NonNullable<ClubReceivingAccount['env']> }) {
  const sandbox = env === 'sandbox'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
        sandbox
          ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
      )}
    >
      {sandbox ? <FlaskConical className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
      {sandbox ? 'Sandbox' : 'Produção'}
    </span>
  )
}

function AccountApproval({ status }: { status: ClubReceivingAccount['accountStatus'] }) {
  if (!status) return <span className="font-normal text-muted-foreground">Situação não informada pelo Asaas.</span>
  if (status.approved) {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
        <CircleCheckBig className="h-4 w-4" />
        Conta aprovada
      </span>
    )
  }
  const general = status.general ? (ACCOUNT_GENERAL_LABELS[status.general] ?? status.general) : null
  return (
    <div className="space-y-1.5">
      <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
        <Clock className="h-4 w-4" />
        {general ? `Conta ${general.toLowerCase()} no Asaas` : 'Conta ainda não aprovada no Asaas'}
      </span>
      {status.pending.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs font-normal text-muted-foreground">
          {status.pending.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ConnectedAccount({
  tenantSlug,
  account,
  onUpdate,
  onNotConnected,
  onReplace,
  onDisconnected,
}: {
  tenantSlug: string
  account: ClubReceivingAccount
  /** Resposta nova do Asaas (teste de conexão). */
  onUpdate: (account: ClubReceivingAccount) => void
  /** O teste descobriu que não há conta conectada (a tela estava defasada). */
  onNotConnected: () => void
  onReplace: () => void
  onDisconnected: (account: ClubReceivingAccount) => void
}) {
  const [testing, setTesting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  async function test() {
    if (testing) return
    setTesting(true)
    setActionError(null)
    try {
      const result = await testReceivingAccountAction(tenantSlug)
      if (!result.success) {
        setActionError(result.error)
        toast.error('Não foi possível testar a conexão', { description: result.error })
        if (result.code === 'RECEBIMENTO_NAO_CONFIGURADO') onNotConnected()
        return
      }
      onUpdate(result.data)
      if (result.data.webhookStatus === 'erro') {
        toast.warning('Conexão com o Asaas ok, mas o aviso de pagamentos falhou', {
          description: result.data.webhookLastError ?? undefined,
        })
      } else if (result.data.webhookStatus === 'pendente') {
        toast.warning('Conexão com o Asaas ok, aviso de pagamentos pendente', {
          description: result.data.webhookLastError ?? undefined,
        })
      } else {
        toast.success('Conexão com o Asaas funcionando')
      }
    } finally {
      setTesting(false)
    }
  }

  const sandbox = account.env === 'sandbox'
  const webhook = account.webhookStatus

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Landmark className="h-5 w-5 text-primary" />
              Conta Asaas conectada
            </CardTitle>
            {account.env && <EnvBadge env={account.env} />}
          </div>
          <CardDescription>
            As mensalidades dos associados caem direto nesta conta. A ANNETEC não passa pelo dinheiro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {sandbox && (
            <p className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
              Ambiente de testes: as cobranças passam pelo Asaas, mas com dinheiro de teste. Para receber de verdade, o
              clube precisa conectar uma conta de produção.
            </p>
          )}

          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem label="Nome da conta">{account.accountName || '—'}</InfoItem>
            <InfoItem label="CPF/CNPJ">{account.cpfCnpj || '—'}</InfoItem>
            <InfoItem label="E-mail">{account.email || '—'}</InfoItem>
            <InfoItem label="Chave de API">
              {account.keyHint ? (
                <span className="font-mono">termina em …{account.keyHint}</span>
              ) : (
                '—'
              )}
            </InfoItem>
            <InfoItem label="Conectada em">
              {account.connectedAt ? formatDateTimeBR(account.connectedAt) : '—'}
            </InfoItem>
            <InfoItem label="Última verificação">
              {account.lastCheckedAt ? (
                <>
                  {formatRelative(account.lastCheckedAt)}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {formatDateTimeBR(account.lastCheckedAt)}
                  </span>
                </>
              ) : (
                'Ainda não verificada'
              )}
            </InfoItem>
          </dl>

          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <InfoItem label="Situação da conta no Asaas">
              <AccountApproval status={account.accountStatus} />
            </InfoItem>
            <InfoItem label="Aviso de pagamentos (webhook)">
              {webhook ? (
                <div className="space-y-1.5">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                      WEBHOOK_TONE[webhook],
                    )}
                  >
                    {CLUB_RECEIVING_WEBHOOK_STATUS_LABELS[webhook]}
                  </span>
                  {webhook === 'ativo' && (
                    <p className="text-xs font-normal text-muted-foreground">
                      O Asaas avisa a ANNETEC de cada pagamento e a baixa é feita sozinha.
                    </p>
                  )}
                  {webhook === 'erro' && (
                    <p className="text-xs font-normal text-destructive">
                      {account.webhookLastError ?? 'O Asaas recusou o cadastro do aviso de pagamentos.'}
                    </p>
                  )}
                  {webhook === 'pendente' && (
                    <p className="text-xs font-normal text-muted-foreground">
                      {account.webhookLastError ? `${account.webhookLastError} ` : ''}
                      Clique em &quot;Testar conexão&quot; para tentar de novo.
                    </p>
                  )}
                </div>
              ) : (
                '—'
              )}
            </InfoItem>
          </div>

          {actionError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {actionError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" className="gap-2" onClick={() => void test()} disabled={testing}>
              {testing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {testing ? 'Testando…' : 'Testar conexão'}
            </Button>
            <Button variant="outline" className="gap-2" onClick={onReplace} disabled={testing}>
              <KeyRound className="h-4 w-4" />
              Trocar chave
            </Button>
            <Button
              variant="outline"
              className="gap-2 text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={() => setConfirmDisconnect(true)}
              disabled={testing}
            >
              <Unplug className="h-4 w-4" />
              Desconectar
            </Button>
          </div>
        </CardContent>
      </Card>

      <ReasonConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Desconectar a conta Asaas?"
        description={
          <>
            <p>
              O clube deixa de receber as mensalidades na conta{account.accountName ? ` de ${account.accountName}` : ''}.
              Enquanto não houver uma conta conectada, novas adesões e cobranças ficam bloqueadas.
            </p>
            <p>
              Se ainda houver assinaturas vinculadas a esta conta, a desconexão é recusada: cancele ou encerre essas
              assinaturas antes.
            </p>
          </>
        }
        confirmLabel="Desconectar"
        onConfirm={async () => {
          const result = await disconnectReceivingAccountAction(tenantSlug)
          if (!result.success) {
            toast.error('Não foi possível desconectar', { description: result.error })
            return result.error
          }
          toast.success('Conta Asaas desconectada')
          notifyReceivingAccountChanged(false)
          onDisconnected(result.data)
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Aba completa
// ---------------------------------------------------------------------------

function ReceivingSkeleton() {
  return (
    <Card className="shadow-sm" aria-busy="true" aria-label="Carregando a conta de recebimento">
      <CardHeader>
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-10 rounded-lg" />
        ))}
      </CardContent>
    </Card>
  )
}

/**
 * Aba "Recebimento": o clube escolhe entre a conta Asaas PRÓPRIA (chave colada)
 * e a conta GERENCIADA pela ANNETEC (pedido + aprovação). Sem uma das duas,
 * adesão e cobrança ficam bloqueadas pela API (`RECEBIMENTO_NAO_CONFIGURADO`).
 * A chave só passa pelo formulário — nunca volta da API nem fica guardada.
 */
export function ReceivingAccountPanel({
  tenantSlug,
  onChanged,
}: {
  tenantSlug: string
  /** Conectou, trocou ou desconectou: quem mostra `asaasConfigured` precisa reler. */
  onChanged: () => void
}) {
  const account = useActionData(tenantSlug ? () => getReceivingAccountAction(tenantSlug) : null, [tenantSlug])
  const managedStatus = useActionData(tenantSlug ? () => getManagedAccountStatusAction(tenantSlug) : null, [tenantSlug])
  const [replacing, setReplacing] = useState(false)
  const [ownOpen, setOwnOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)

  const data = account.data
  const managed = managedStatus.data

  function applyAccount(next: ClubReceivingAccount) {
    account.setData(next)
    setReplacing(false)
    onChanged()
    void managedStatus.reload({ silent: true })
  }

  function applyManagedAccount(next: ClubReceivingAccount) {
    account.setData(next)
    notifyReceivingAccountChanged(next.connected, next.managed?.pendingDocuments ?? 0)
    onChanged()
  }

  function applySubmitted(next: ClubManagedAccountStatus) {
    managedStatus.setData(next)
    account.setData(next.account)
    toast.success('Pedido enviado à ANNETEC', { description: 'Avisaremos você aqui quando ele for analisado.' })
    onChanged()
  }

  if (!data) {
    if (account.error && !account.loading) {
      return <LoadError message={account.error} onRetry={() => void account.reload()} />
    }
    return <ReceivingSkeleton />
  }

  // Conta gerenciada pela ANNETEC: sem "Trocar chave" nem "Desconectar" (a ANNETEC é quem muda).
  if (data.connected && data.source === 'subaccount') {
    return <ManagedConnected tenantSlug={tenantSlug} account={data} onUpdate={applyManagedAccount} />
  }

  if (!data.connected) {
    const request = managed?.request ?? null
    const inReview = request !== null && ['pendente', 'aprovando', 'falhou'].includes(request.status)
    const refused = request?.status === 'recusado'
    const ownForm = (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Landmark className="h-5 w-5 text-primary" />
            Conecte a sua conta Asaas
          </CardTitle>
          <CardDescription>
            Siga o passo a passo, gere a chave de API no Asaas e cole no campo abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <KeyGuide defaultOpen />
          <KeyForm tenantSlug={tenantSlug} replacing={false} onConnected={applyAccount} />
        </CardContent>
      </Card>
    )

    return (
      <div className="space-y-5">
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Este clube ainda não configurou o recebimento das mensalidades. Sem uma conta de recebimento, novas adesões e
          cobranças ficam bloqueadas e quem tentar assinar vê um aviso para falar com o clube.
        </p>

        {managedStatus.error && !managed && (
          <LoadError message={managedStatus.error} onRetry={() => void managedStatus.reload()} />
        )}

        {request && (inReview || refused) && (
          <ManagedRequestCard
            request={request}
            canRequest={managed?.canRequest ?? false}
            blockedReason={managed?.blockedReason ?? null}
            onRequestAgain={() => setWizardOpen(true)}
          />
        )}

        {inReview ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" className="gap-2" onClick={() => setOwnOpen(open => !open)} aria-expanded={ownOpen}>
                <Landmark className="h-4 w-4" />
                {ownOpen ? 'Ocultar o passo a passo' : 'Conectar minha conta Asaas'}
              </Button>
            </div>
            {ownOpen && ownForm}
          </div>
        ) : (
          <>
            <div className="grid gap-5 lg:grid-cols-2">
              <OwnAccountOffer open={ownOpen} onToggle={() => setOwnOpen(open => !open)} />
              {!refused && <ManagedOffer status={managed} onRequest={() => setWizardOpen(true)} />}
            </div>
            {ownOpen && ownForm}
          </>
        )}

        {managed && (
          <ManagedAccountWizard
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            tenantSlug={tenantSlug}
            status={managed}
            onSubmitted={applySubmitted}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <ConnectedAccount
        tenantSlug={tenantSlug}
        account={data}
        onUpdate={next => {
          account.setData(next)
          onChanged()
        }}
        onNotConnected={() => {
          void account.reload({ silent: true })
          onChanged()
        }}
        onReplace={() => setReplacing(true)}
        onDisconnected={applyAccount}
      />

      {replacing && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5 text-primary" />
              Trocar a chave de API
            </CardTitle>
            <CardDescription>
              Use para renovar a chave. Com assinaturas vinculadas, a nova chave precisa ser da mesma conta Asaas. A
              chave atual continua valendo se a nova for recusada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <KeyGuide />
            <KeyForm
              tenantSlug={tenantSlug}
              replacing
              onConnected={applyAccount}
              onCancel={() => setReplacing(false)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
