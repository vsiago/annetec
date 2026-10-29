'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, Info, Loader2, Lock, Save } from 'lucide-react'
import type { UF } from '@annetec/contracts'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/admin-platform/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePlatformRole } from '@/components/admin-platform/billing/console-kit'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { TenantSubscriptionPanel } from '@/components/admin-platform/billing/tenant-subscription-panel'
import { TenantOnboardingPanel } from '@/components/admin-platform/compliance/tenant-onboarding-panel'
import { TenantAccessPanel } from '@/components/admin-platform/tenant-access-panel'
import { AdvancedTab } from '@/components/admin-platform/club-detail/advanced-tab'
import { ClubDataForm } from '@/components/admin-platform/club-detail/club-data-form'
import { ClubHeader } from '@/components/admin-platform/club-detail/club-header'
import {
  CLUB_STATUS_LABEL,
  CLUB_STATUS_TONE,
  resolveClubTab,
  type ClubTab,
} from '@/components/admin-platform/club-detail/club-model'
import { ClubSituationSheet } from '@/components/admin-platform/club-detail/club-situation-sheet'
import { ClubSummary } from '@/components/admin-platform/club-detail/club-summary'
import { useClubSummary } from '@/components/admin-platform/club-detail/use-club-summary'
import { usePlatformAuth } from '@/contexts/platform-auth-context'
import { useTenants } from '@/contexts/tenants-context'
import type { Tenant, TenantStatus } from '@/lib/types'

/**
 * Detalhe de um clube (/admin/inquilinos/<id>).
 *
 * Responde "este clube está pronto para vender e pagando em dia?". Cinco abas
 * mais Avançado (só superadmin): Resumo · Dados do clube · Pessoas com acesso ·
 * Plano ANNETEC · Documentos. A aba atual vai em `?tab=` (links antigos como
 * `?tab=cadastro` ou `?tab=kyb` continuam abrindo a aba certa).
 *
 * Só "Dados do clube" tem botão de salvar: o resto salva item a item, dentro de
 * cada painel. A situação do clube (suspender, encerrar, bloquear o painel) é
 * outra coisa e tem seção própria, com confirmação.
 */

const TAB_CLASS =
  'h-auto min-h-11 flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 text-sm font-medium text-muted-foreground shadow-none ' +
  'hover:text-foreground data-[state=active]:border-secondary data-[state=active]:bg-transparent data-[state=active]:font-semibold ' +
  'data-[state=active]:text-secondary data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:border-secondary'

const TABS: { value: Exclude<ClubTab, 'avancado'>; label: string }[] = [
  { value: 'resumo', label: 'Resumo' },
  { value: 'dados', label: 'Dados do clube' },
  { value: 'pessoas', label: 'Pessoas com acesso' },
  { value: 'plano', label: 'Plano ANNETEC' },
  { value: 'documentos', label: 'Documentos' },
]

/** O que o formulário "Dados do clube" edita. A situação do clube fica de fora de propósito. */
type FormValues = Pick<Tenant, 'name' | 'legalName' | 'document' | 'email' | 'phone' | 'address' | 'branding' | 'planId'>

function formValues(tenant: Tenant): FormValues {
  return {
    name: tenant.name,
    legalName: tenant.legalName,
    document: tenant.document,
    email: tenant.email,
    phone: tenant.phone,
    address: tenant.address,
    branding: tenant.branding,
    planId: tenant.planId,
  }
}

export default function ClubDetailPage() {
  // `useSearchParams` pede Suspense para não segurar a página inteira.
  return (
    <Suspense fallback={null}>
      <ClubDetailLoader />
    </Suspense>
  )
}

function ClubDetailLoader() {
  const params = useParams<{ id: string }>()
  const { tenants, isLoading } = useTenants()
  const tenant = tenants.find(item => item.id === params.id)

  // Só espera quando ainda não tem o clube: ao salvar, a lista recarrega e a
  // tela segue montada (senão a aba aberta e o que foi digitado se perdiam).
  if (!tenant) {
    if (isLoading) return null
    return (
      <div className="flex flex-col gap-4">
        <Link href="/admin/inquilinos" className="inline-flex items-center gap-1 text-sm font-medium text-secondary hover:underline">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar para Clubes
        </Link>
        <p className="m-0 text-sm text-muted-foreground">Não encontramos este clube. Volte para a lista e escolha outro.</p>
      </div>
    )
  }

  return <ClubDetail key={tenant.id} tenant={tenant} />
}

function ClubDetail({ tenant }: { tenant: Tenant }) {
  const { plans, updateTenant } = useTenants()
  const { isSuperadmin } = usePlatformRole()
  const { isLoading: authLoading } = usePlatformAuth()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const summary = useClubSummary(tenant)

  // A aba atual: o estado local manda (troca na hora); a URL acompanha e, se
  // alguém navegar para `?tab=...` (link do Resumo, de outra tela), o estado segue.
  const urlTab = resolveClubTab(searchParams.get('tab'))
  const [aba, setAbaState] = useState<ClubTab>(urlTab)
  useEffect(() => setAbaState(urlTab), [urlTab])

  function setAba(next: string) {
    const tab = resolveClubTab(next)
    setAbaState(tab)
    const query = new URLSearchParams(searchParams.toString())
    if (tab === 'resumo') query.delete('tab')
    else query.set('tab', tab)
    const qs = query.toString()
    window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname)
  }

  const [situacaoAberta, setSituacaoAberta] = useState(false)

  // Formulário "Dados do clube": `edits` guarda só o que a pessoa mexeu. Sem
  // isso, qualquer atualização da lista (mudar a situação, por exemplo)
  // apagaria o que está digitado.
  const [edits, setEdits] = useState<FormValues | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [salvo, setSalvo] = useState(false)

  const form: FormValues = edits ?? formValues(tenant)
  const dirty = edits !== null && JSON.stringify(edits) !== JSON.stringify(formValues(tenant))

  useEffect(() => {
    if (!salvo) return
    const timer = setTimeout(() => setSalvo(false), 4000)
    return () => clearTimeout(timer)
  }, [salvo])

  async function handleSave() {
    setError('')
    setSalvo(false)
    setIsSaving(true)
    const result = await updateTenant(tenant.id, {
      name: form.name,
      legalName: form.legalName,
      document: form.document,
      email: form.email,
      phone: form.phone,
      address: { ...form.address, state: form.address.state as UF },
      branding: { ...form.branding, logoUrl: form.branding.logoUrl?.trim() || undefined },
      planId: form.planId,
    })
    setIsSaving(false)
    if (!result.success) {
      setError(result.error || 'Não foi possível salvar as alterações. Confira os campos e tente de novo.')
      return
    }
    setEdits(null)
    setSalvo(true)
  }

  /** Grava só a situação do cadastro (os campos do formulário não vão junto). */
  async function changeStatus(status: TenantStatus): Promise<string | null> {
    const result = await updateTenant(tenant.id, { status })
    if (!result.success) return result.error || 'Tente de novo em instantes.'
    summary.reloadAll()
    return null
  }

  const detail = summary.health.data

  return (
    <div className="flex flex-col gap-6">
      <ClubHeader
        tenant={tenant}
        panelAccess={detail?.tenant.access}
        onChangeSituation={() => setSituacaoAberta(true)}
      />

      {tenant.status === 'cancelled' ? (
        <Alert>
          <Info className="size-4" aria-hidden="true" />
          <AlertDescription>
            Este clube está encerrado: o site, o login e o painel não abrem. Alguns números do Resumo podem não
            carregar. Para reabrir, use “Mudar situação do clube”.
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={aba} onValueChange={setAba} className="gap-6">
        <TabsList
          aria-label="Seções do clube"
          className="h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b border-border bg-transparent p-0"
        >
          {TABS.map(item => (
            <TabsTrigger key={item.value} value={item.value} className={TAB_CLASS}>
              {item.label}
            </TabsTrigger>
          ))}
          {isSuperadmin ? (
            <TabsTrigger value="avancado" className={`${TAB_CLASS} ml-auto`}>
              <Lock className="size-3.5" aria-hidden="true" />
              Avançado
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="resumo">
          <ClubSummary
            tenant={tenant}
            summary={summary}
            isSuperadmin={isSuperadmin}
            onOpenAdvanced={() => setAba('avancado')}
          />
        </TabsContent>

        <TabsContent value="dados" className="flex flex-col gap-4">
          <ClubDataForm
            draft={{ ...tenant, ...form }}
            onChange={next => setEdits(formValues(next))}
            plans={plans}
          />

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white p-6">
            <div className="min-w-0">
              <h2 className="m-0 flex flex-wrap items-center gap-2 text-base font-bold text-foreground">
                Situação do clube
                <StatusPill tone={CLUB_STATUS_TONE[tenant.status]}>{CLUB_STATUS_LABEL[tenant.status]}</StatusPill>
              </h2>
              <p className="m-0 mt-1 text-[13px] text-muted-foreground">
                Para bloquear o painel, suspender, encerrar ou liberar o acesso do clube.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSituacaoAberta(true)}
              className="min-h-11 rounded-[10px] border-[#D0D5DD] px-4 text-sm font-semibold text-[#344054]"
            >
              Mudar situação do clube
            </Button>
          </section>

          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-border bg-white p-3 shadow-sm">
            {salvo ? (
              <span role="status" className="mr-auto text-sm font-medium text-[#067647]">
                Alterações salvas
              </span>
            ) : dirty ? (
              <span className="mr-auto text-sm text-muted-foreground">Você tem alterações sem salvar.</span>
            ) : (
              <span className="mr-auto text-sm text-muted-foreground">Nenhuma alteração para salvar.</span>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEdits(null)
                setError('')
              }}
              disabled={!dirty || isSaving}
              className="min-h-11 rounded-[10px] border-[#D0D5DD] px-4 text-sm font-semibold text-[#344054]"
            >
              Descartar alterações
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!dirty || isSaving}
              className="min-h-11 gap-2 rounded-[10px] bg-secondary px-4 text-sm font-semibold text-white hover:bg-secondary/90"
            >
              {isSaving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
              {isSaving ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="pessoas">
          <TenantAccessPanel tenantId={tenant.id} tenantSlug={tenant.slug} />
        </TabsContent>

        <TabsContent value="plano">
          <TenantSubscriptionPanel tenantId={tenant.id} tenantSlug={tenant.slug} />
        </TabsContent>

        <TabsContent value="documentos">
          <TenantOnboardingPanel tenantId={tenant.id} tenantSlug={tenant.slug} document={tenant.document} />
        </TabsContent>

        <TabsContent value="avancado">
          {authLoading ? null : <AdvancedTab tenant={tenant} isSuperadmin={isSuperadmin} />}
        </TabsContent>
      </Tabs>

      <ClubSituationSheet
        open={situacaoAberta}
        onOpenChange={setSituacaoAberta}
        tenant={tenant}
        detail={detail}
        detailLoading={summary.health.loading}
        isSuperadmin={isSuperadmin}
        onChangeStatus={changeStatus}
        onAccessChanged={summary.reloadAll}
      />
    </div>
  )
}
