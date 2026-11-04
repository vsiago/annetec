'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, usePathname, useSearchParams } from 'next/navigation'
import { AlertCircle, Building2, Info, Loader2, Lock, Save, ShieldAlert } from 'lucide-react'
import type { TenantBranding, UF } from '@annetec/contracts'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/admin-platform/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePlatformRole } from '@/components/admin-platform/billing/console-kit'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { BackLink } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
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
    <Suspense fallback={<ClubDetailLoading />}>
      <ClubDetailLoader />
    </Suspense>
  )
}

/** Carregando o clube: voltar para a lista e um cartão de esqueleto (nunca área em branco). */
function ClubDetailLoading() {
  return (
    <PageContainer>
      <BackLink href="/admin/inquilinos">Voltar para Clubes</BackLink>
      <SectionCard>
        <SectionSkeleton rows={4} label="Carregando o clube…" />
      </SectionCard>
    </PageContainer>
  )
}

function ClubDetailLoader() {
  const params = useParams<{ id: string }>()
  const { tenants, isLoading } = useTenants()
  const tenant = tenants.find(item => item.id === params.id)

  // Só espera quando ainda não tem o clube: ao salvar, a lista recarrega e a
  // tela segue montada (senão a aba aberta e o que foi digitado se perdiam).
  if (!tenant) {
    if (isLoading) return <ClubDetailLoading />
    return (
      <PageContainer>
        <BackLink href="/admin/inquilinos">Voltar para Clubes</BackLink>
        <EmptyState
          framed
          icon={Building2}
          title="Não encontramos este clube."
          description="Volte para a lista e escolha outro."
        />
      </PageContainer>
    )
  }

  return <ClubDetail key={tenant.id} tenant={tenant} />
}

function ClubDetail({ tenant }: { tenant: Tenant }) {
  const { plans, updateTenant, applyBranding } = useTenants()
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
      // A API aplica só as cores e mantém as imagens guardadas (logo/ícone mudam apenas pelos
      // endpoints de envio); mandar o objeto inteiro é inofensivo.
      branding: { primaryColor: form.branding.primaryColor, secondaryColor: form.branding.secondaryColor },
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

  /**
   * Logo/ícone são gravados na hora (rotas de upload). A resposta traz a marca
   * inteira: ela vira a marca do clube na lista e, se há edições pendentes, entra
   * nelas — menos as CORES, que seguem as que a pessoa digitou e ainda não salvou.
   */
  function handleBrandingChange(next: TenantBranding) {
    applyBranding(tenant.id, next)
    setEdits(current =>
      current
        ? {
            ...current,
            branding: {
              ...next,
              primaryColor: current.branding.primaryColor,
              secondaryColor: current.branding.secondaryColor,
            },
          }
        : current,
    )
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
    <PageContainer>
      <ClubHeader
        tenant={tenant}
        panelAccess={detail?.tenant.access}
        onChangeSituation={() => setSituacaoAberta(true)}
      />

      {tenant.status === 'cancelled' ? (
        <Alert className="rounded-2xl px-5 py-4 shadow-sm">
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

        <TabsContent value="dados" className="flex flex-col gap-6">
          <ClubDataForm
            draft={{ ...tenant, ...form }}
            onChange={next => setEdits(formValues(next))}
            onBrandingChange={handleBrandingChange}
            plans={plans}
          />

          <SectionCard
            title={
              <span className="flex flex-wrap items-center gap-2">
                Situação do clube
                <StatusPill tone={CLUB_STATUS_TONE[tenant.status]}>{CLUB_STATUS_LABEL[tenant.status]}</StatusPill>
              </span>
            }
            description="Para bloquear o painel, suspender, encerrar ou liberar o acesso do clube."
            icon={ShieldAlert}
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => setSituacaoAberta(true)}
              className="min-h-11 rounded-[10px] border-[#D0D5DD] px-4 text-sm font-semibold text-[#344054]"
            >
              Mudar situação do clube
            </Button>
          </SectionCard>

          {error ? (
            <Alert variant="destructive" className="rounded-2xl px-5 py-4">
              <AlertCircle className="size-4" aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
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
          {authLoading ? (
            <SectionCard>
              <SectionSkeleton rows={3} label="Carregando…" />
            </SectionCard>
          ) : (
            <AdvancedTab tenant={tenant} isSuperadmin={isSuperadmin} />
          )}
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
    </PageContainer>
  )
}
