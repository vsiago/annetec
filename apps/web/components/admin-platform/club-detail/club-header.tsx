'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink, MoreHorizontal, ShieldAlert } from 'lucide-react'
import type { PlatformAccessLevel } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { OpenClubPanelButton } from '@/components/admin-platform/club-detail/open-club-panel-button'
import { CLUB_STATUS_LABEL, CLUB_STATUS_TONE, clubSinceLabel } from '@/components/admin-platform/club-detail/club-model'
import type { Tenant } from '@/lib/types'
import { useSiteAddress } from '@/lib/site-address'
import { getInitials } from '@/lib/utils'


/**
 * Cabeçalho do detalhe do clube: caminho, logo (ou iniciais na cor do clube),
 * nome, situação, endereço do site e "Cliente desde". Ações: "Ver site"
 * (secundário), UM botão primário ("Abrir painel do clube") e o menu
 * "Mais ações".
 */
export function ClubHeader({
  tenant,
  panelAccess,
  onChangeSituation,
}: {
  tenant: Tenant
  /** Acesso atual da equipe do clube ao painel (vem da holding; `undefined` enquanto carrega). */
  panelAccess?: PlatformAccessLevel
  onChangeSituation: () => void
}) {
  const siteAddress = useSiteAddress()
  const [logoFailed, setLogoFailed] = useState(false)
  const logoUrl = tenant.branding.logoUrl?.trim()
  const showLogo = Boolean(logoUrl) && !logoFailed
  const since = clubSinceLabel(tenant.createdAt)

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Caminho" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/inquilinos" className="font-medium text-secondary hover:underline">
          Clubes
        </Link>
        <span aria-hidden="true">/</span>
        <span className="min-w-0 truncate" aria-current="page">
          {tenant.name}
        </span>
      </nav>

      <header className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <span
            className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] text-xl font-bold text-white"
            style={{ backgroundColor: showLogo ? '#FFFFFF' : tenant.branding.primaryColor }}
            aria-hidden="true"
          >
            {showLogo ? (
              // Logo público do clube (URL livre, cadastrada na Aparência); next/image não se aplica.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="size-full border border-border object-contain p-1"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              getInitials(tenant.name)
            )}
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="m-0 truncate text-[28px] font-bold leading-tight tracking-tight text-foreground">
              {tenant.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
              <StatusPill tone={CLUB_STATUS_TONE[tenant.status]}>{CLUB_STATUS_LABEL[tenant.status]}</StatusPill>
              {panelAccess === 'read_only' ? <StatusPill tone="warning">Painel só para consulta</StatusPill> : null}
              {panelAccess === 'blocked' ? <StatusPill tone="danger">Painel bloqueado</StatusPill> : null}
              <a
                href={`/${tenant.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-secondary hover:underline"
              >
                {siteAddress(tenant.slug)}
                <ExternalLink className="size-3" aria-hidden="true" />
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
              {since ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Cliente desde {since}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            variant="outline"
            className="min-h-11 rounded-[10px] border-[#D0D5DD] px-4 text-sm font-semibold text-[#344054]"
          >
            <a href={`/${tenant.slug}`} target="_blank" rel="noreferrer">
              Ver site
              <span className="sr-only"> (abre em nova aba)</span>
            </a>
          </Button>

          <OpenClubPanelButton tenantId={tenant.id} slug={tenant.slug} cancelled={tenant.status === 'cancelled'} />

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                aria-label="Mais ações: mudar situação do clube"
                className="size-11 rounded-[10px] border-[#D0D5DD] text-[#344054]"
              >
                <MoreHorizontal className="size-5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-64">
              <DropdownMenuItem onSelect={onChangeSituation} className="min-h-11 cursor-pointer gap-2 text-sm">
                <ShieldAlert className="size-4" aria-hidden="true" />
                Mudar situação do clube
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </div>
  )
}
