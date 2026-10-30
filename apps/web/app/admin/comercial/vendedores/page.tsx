'use client'

import { useMemo, useState } from 'react'
import { BriefcaseBusiness, Copy, Pencil, Plus, Target, Trophy, UserCheck, UserX, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import type { PlatformSeller } from '@annetec/contracts'
import {
  ConfirmDialog,
  KpiSkeleton,
  RefreshButton,
  SuperadminOnly,
  TableSkeleton,
  copyToClipboard,
  runCommand,
  useConsoleData,
  usePlatformRole,
} from '@/components/admin-platform/billing/console-kit'
import { ComercialNav, SUPERADMIN_ONLY } from '@/components/admin-platform/comercial/comercial-kit'
import { CreateSellerWizard, EditSellerWizard } from '@/components/admin-platform/comercial/seller-wizards'
import { Button } from '@/components/admin-platform/ui/button'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { EntityAvatar } from '@/components/admin-platform/ui/entity-avatar'
import { KpiCard } from '@/components/admin-platform/ui/kpi-card'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { currentMonthSP, formatInt, formatMoney, monthLabel } from '@/components/sales/sales-ui'
import { getSalesReportAction, listSellersAction, updateSellerAction } from '@/lib/actions/comercial-api'

/**
 * Comercial › Vendedores: os vendedores próprios da ANNETEC, com código de
 * indicação, meta e os números do mês. Cadastrar, editar e ativar/desativar
 * são do superadmin; o platform_admin vê tudo e os botões ficam desativados.
 */
export default function ComercialSellersPage() {
  const { isSuperadmin } = usePlatformRole()
  const month = currentMonthSP()
  const sellers = useConsoleData(() => listSellersAction(), [])
  const report = useConsoleData(() => getSalesReportAction(month), [month])
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<PlatformSeller | null>(null)
  const [toggling, setToggling] = useState<PlatformSeller | null>(null)

  const byId = useMemo(() => new Map((report.data?.rows ?? []).map(row => [row.sellerUserId, row])), [report.data])
  const list = sellers.data ?? []
  const activeCount = list.filter(seller => seller.active).length
  const totals = report.data?.totals

  const replace = (seller: PlatformSeller) =>
    sellers.setData(current => (current ? current.map(item => (item.userId === seller.userId ? seller : item)) : current))

  const refresh = () => {
    void sellers.reload({ silent: true })
    void report.reload({ silent: true })
  }

  const copyLink = async (seller: PlatformSeller) => {
    const url = `${window.location.origin}/contratar?ref=${encodeURIComponent(seller.referralCode)}`
    if (await copyToClipboard(url)) toast.success('Link de indicação copiado', { description: url })
    else toast.error('Não foi possível copiar. Copie o código manualmente.')
  }

  const addButton = (
    <SuperadminOnly isSuperadmin={isSuperadmin} reason={SUPERADMIN_ONLY}>
      <Button className="h-11 rounded-[10px] px-4 font-semibold" onClick={() => setCreateOpen(true)}>
        <Plus aria-hidden="true" />
        Cadastrar vendedor
      </Button>
    </SuperadminOnly>
  )

  return (
    <PageContainer>
      <PageHeader
        icon={BriefcaseBusiness}
        title="Vendedores"
        description="Vendedores próprios da ANNETEC: prospectam operadoras e clubes e ganham comissão pelas faturas pagas."
        actions={
          <>
            <RefreshButton loading={sellers.loading || report.loading} onClick={refresh} />
            {addButton}
          </>
        }
      />
      <ComercialNav />

      {report.error && !totals ? null : !totals ? (
        <KpiSkeleton count={3} className="xl:grid-cols-3" />
      ) : (
        <section aria-label={`Números de ${monthLabel(month)}`} className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            icon={<BriefcaseBusiness />}
            accent="navy"
            label="Vendedores ativos"
            value={formatInt(activeCount)}
            hint={list.length > activeCount ? `${formatInt(list.length - activeCount)} inativos` : 'Todos ativos'}
          />
          <KpiCard
            icon={<Trophy />}
            accent="green"
            label={`Clubes ganhos em ${monthLabel(month).split(' ')[0]}`}
            value={formatInt(totals.wonInMonth)}
            hint={`${formatInt(totals.proposalsInProgress)} propostas em andamento`}
            href="/admin/comercial/relatorio"
          />
          <KpiCard
            icon={<Wallet />}
            accent="coral"
            label="Comissão do mês"
            value={formatMoney(totals.commission.net)}
            hint={`${formatMoney(totals.commission.a_pagar)} a pagar aos vendedores`}
            href="/admin/comercial/comissoes"
          />
        </section>
      )}

      <SectionCard padded={false}>
        {sellers.error && !sellers.data ? (
          <ErrorState framed={false} onRetry={() => sellers.reload()} />
        ) : !sellers.data ? (
          <TableSkeleton rows={4} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={BriefcaseBusiness}
            title="Nenhum vendedor cadastrado"
            description="Cadastre quem vai prospectar operadoras e clubes para a ANNETEC."
            action={addButton}
          />
        ) : (
          <DataTable caption="Vendedores ANNETEC" minWidth="min-w-[1040px]" framed={false}>
            <thead>
              <tr>
                <Th>Vendedor</Th>
                <Th>Código de indicação</Th>
                <Th align="right">Meta</Th>
                <Th align="right">Ganhos no mês</Th>
                <Th align="right">Comissão do mês</Th>
                <Th>Situação</Th>
                <Th align="right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {list.map(seller => {
                const row = byId.get(seller.userId)
                return (
                  <Tr key={seller.userId}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <EntityAvatar name={seller.name} />
                        <div className="min-w-0">
                          <p className="m-0 truncate font-semibold text-foreground">{seller.name}</p>
                          <p className="m-0 truncate text-xs text-muted-foreground">{seller.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <code className="whitespace-nowrap rounded-md bg-[#F2F4F7] px-2 py-0.5 font-mono text-xs text-foreground">{seller.referralCode}</code>
                        <Button variant="ghost" size="icon" onClick={() => void copyLink(seller)} aria-label={`Copiar o link de indicação de ${seller.name}`}>
                          <Copy aria-hidden="true" />
                        </Button>
                      </div>
                    </Td>
                    <Td align="right">
                      {seller.monthlyGoal ? (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                          <Target className="size-3.5 text-muted-foreground" aria-hidden="true" />
                          {formatInt(seller.monthlyGoal)} clubes
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sem meta</span>
                      )}
                    </Td>
                    <Td align="right">
                      {row ? (
                        <span className={row.monthlyGoal && row.wonInMonth >= row.monthlyGoal ? 'font-semibold text-[#067647]' : undefined}>
                          {formatInt(row.wonInMonth)}
                          {row.monthlyGoal ? <span className="text-muted-foreground"> / {formatInt(row.monthlyGoal)}</span> : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td align="right">{row ? formatMoney(row.commission.net) : '—'}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        {seller.active ? <StatusPill tone="success">Ativo</StatusPill> : <StatusPill tone="neutral">Inativo</StatusPill>}
                        {!seller.accountActive ? <StatusPill tone="danger">Conta desligada</StatusPill> : null}
                      </div>
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1">
                        <SuperadminOnly isSuperadmin={isSuperadmin} reason={SUPERADMIN_ONLY}>
                          <Button variant="ghost" size="icon-lg" onClick={() => setEditing(seller)} aria-label={`Editar ${seller.name}`}>
                            <Pencil aria-hidden="true" />
                          </Button>
                        </SuperadminOnly>
                        <SuperadminOnly isSuperadmin={isSuperadmin} reason={SUPERADMIN_ONLY}>
                          <Button
                            variant="ghost"
                            size="icon-lg"
                            onClick={() => setToggling(seller)}
                            className={seller.active ? 'text-[#B42318] hover:text-[#B42318]' : ''}
                            aria-label={`${seller.active ? 'Desativar' : 'Ativar'} ${seller.name}`}
                          >
                            {seller.active ? <UserX aria-hidden="true" /> : <UserCheck aria-hidden="true" />}
                          </Button>
                        </SuperadminOnly>
                      </div>
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </SectionCard>

      <p className="m-0 text-[13px] text-muted-foreground">
        Nome, senha e acesso da conta (desligar o login) ficam em Equipe ANNETEC. Desativar aqui tira o vendedor das vendas: ele só
        consulta o histórico e o link de indicação para de atribuir.
      </p>

      <CreateSellerWizard open={createOpen} onOpenChange={setCreateOpen} onCreated={() => refresh()} />
      <EditSellerWizard
        open={editing !== null}
        onOpenChange={open => !open && setEditing(null)}
        seller={editing}
        onSaved={seller => {
          replace(seller)
          toast.success('Vendedor atualizado')
        }}
      />
      <ConfirmDialog
        open={toggling !== null}
        onOpenChange={open => !open && setToggling(null)}
        title={toggling?.active ? `Desativar ${toggling.name}?` : `Ativar ${toggling?.name ?? 'vendedor'}?`}
        description={
          toggling?.active
            ? 'O vendedor passa a só consultar o histórico: não cadastra prospects, não gera links e o link de indicação para de atribuir vendas. As comissões já geradas continuam.'
            : 'O vendedor volta a receber indicações pelo link, cadastrar prospects e gerar links de contratação.'
        }
        confirmLabel={toggling?.active ? 'Desativar vendedor' : 'Ativar vendedor'}
        destructive={toggling?.active}
        onConfirm={async () => {
          if (!toggling) return false
          const updated = await runCommand(
            updateSellerAction(toggling.userId, { active: !toggling.active }),
            toggling.active ? `${toggling.name} desativado` : `${toggling.name} ativado`,
          )
          if (updated) replace(updated)
          return !!updated
        }}
      />
    </PageContainer>
  )
}
