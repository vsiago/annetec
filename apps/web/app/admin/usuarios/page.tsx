'use client'

import { useState } from 'react'
import { Button } from '@/components/admin-platform/ui/button'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { DataTable, TableLoading, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { TeamMemberWizard } from '@/components/admin-platform/forms/team-wizards'
import { useTenants } from '@/contexts/tenants-context'
import { usePlatformAuth } from '@/contexts/platform-auth-context'
import { updatePlatformUserAction } from '@/lib/actions/platform-users-api'
import { getInitials } from '@/lib/utils'
import Link from 'next/link'
import { BriefcaseBusiness, Plus, ShieldCheck, Shield, Mail, Phone, Pencil, UserX, UserCheck, Users } from 'lucide-react'

const BOTAO = 'h-11 rounded-[10px] px-4 font-semibold'

export default function PlatformUsuariosPage() {
  const { platformUsers, refresh, isLoading } = useTenants()
  const { user: contaAtual } = usePlatformAuth()
  const [isAddOpen, setIsAddOpen] = useState(false)
  /** `null` = criando; com id = editando aquela conta. */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [listError, setListError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const abrirNovo = () => {
    setEditingId(null)
    setIsAddOpen(true)
  }

  const abrirEdicao = (conta: (typeof platformUsers)[number]) => {
    setEditingId(conta.id)
    setIsAddOpen(true)
  }

  /** Conta em edição (o assistente de "Equipe ANNETEC" cuida do formulário e das validações). */
  const emEdicao = editingId ? platformUsers.find(u => u.id === editingId) ?? null : null

  /**
   * Desativar em vez de apagar: a conta continua assinando o histórico da
   * trilha de auditoria. A API recusa autodesativação e recusa deixar a
   * plataforma sem nenhum superadmin ativo — a mensagem dela aparece aqui.
   */
  const alternarAtivacao = async (id: string, ativo: boolean) => {
    setListError('')
    setBusyId(id)
    const result = await updatePlatformUserAction(id, { active: !ativo })
    setBusyId(null)
    if (!result.success) {
      setListError(result.error || 'Não foi possível alterar o acesso desta pessoa. Tente de novo.')
      return
    }
    await refresh()
  }

  const botaoAdicionar = (
    <Button onClick={abrirNovo} className={BOTAO}>
      <Plus aria-hidden="true" />
      Adicionar pessoa
    </Button>
  )

  return (
    <PageContainer>
      <PageHeader
        icon={Users}
        title="Equipe ANNETEC"
        description={
          <>
            Quem da ANNETEC tem acesso ao console. Os vendedores aparecem aqui para cuidar da conta (nome, telefone, acesso); código de
            indicação e meta ficam em{' '}
            <Link href="/admin/comercial/vendedores" className="font-medium text-secondary underline-offset-2 hover:underline">
              Comercial › Vendedores
            </Link>
            .
          </>
        }
        actions={botaoAdicionar}
      />

      {listError && (
        <p
          role="alert"
          className="m-0 rounded-xl border border-[#B42318]/20 bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]"
        >
          {listError}
        </p>
      )}

      {isLoading && platformUsers.length === 0 ? (
        <TableLoading rows={4} label="Carregando a equipe…" />
      ) : platformUsers.length === 0 ? (
        <EmptyState
          framed
          icon={Users}
          title="Nenhuma pessoa na equipe ainda"
          description="Adicione quem da ANNETEC precisa de acesso ao console."
          action={botaoAdicionar}
        />
      ) : (
        <DataTable caption="Pessoas da equipe ANNETEC com acesso ao console" minWidth="min-w-[720px]">
          <thead>
            <tr>
              <Th>Pessoa</Th>
              <Th>Contato</Th>
              <Th>Acesso</Th>
              <Th align="right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {platformUsers.map(u => (
              <Tr key={u.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 bg-secondary">
                      <AvatarFallback className="bg-secondary text-sm text-white">{getInitials(u.name)}</AvatarFallback>
                    </Avatar>
                    <p className="m-0 font-medium text-foreground">{u.name}</p>
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                      {u.email}
                    </div>
                    {u.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                        {u.phone}
                      </div>
                    )}
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {u.role === 'superadmin' ? (
                      <StatusPill tone="danger" icon={<ShieldCheck />}>
                        Superadmin
                      </StatusPill>
                    ) : u.role === 'platform_seller' ? (
                      <StatusPill tone="warning" icon={<BriefcaseBusiness />}>
                        Vendedor ANNETEC
                      </StatusPill>
                    ) : (
                      <StatusPill tone="info" icon={<Shield />}>
                        Padrão
                      </StatusPill>
                    )}
                    {!u.active && <StatusPill tone="neutral">Desativado</StatusPill>}
                  </div>
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-lg" onClick={() => abrirEdicao(u)}>
                      <Pencil aria-hidden="true" />
                      <span className="sr-only">Editar {u.name}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      disabled={busyId === u.id || u.id === contaAtual?.id}
                      title={u.id === contaAtual?.id ? 'Você não pode desativar a própria conta' : undefined}
                      onClick={() => alternarAtivacao(u.id, u.active)}
                      className={u.active ? 'text-[#B42318] hover:text-[#B42318]' : ''}
                    >
                      {u.active ? <UserX aria-hidden="true" /> : <UserCheck aria-hidden="true" />}
                      <span className="sr-only">
                        {u.active ? 'Desativar' : 'Reativar'} {u.name}
                      </span>
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <TeamMemberWizard open={isAddOpen} onOpenChange={setIsAddOpen} member={emEdicao} onSaved={refresh} />
    </PageContainer>
  )
}
