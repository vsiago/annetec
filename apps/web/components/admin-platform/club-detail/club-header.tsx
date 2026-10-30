'use client'

import { useState } from 'react'
import { ExternalLink, MoreHorizontal, ShieldAlert } from 'lucide-react'
import type { PlatformAccessLevel } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BackLink, PageHeader } from '@/components/admin-platform/ui/page-header'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { OpenClubPanelButton } from '@/components/admin-platform/club-detail/open-club-panel-button'
import { CLUB_STATUS_LABEL, CLUB_STATUS_TONE, clubSinceLabel } from '@/components/admin-platform/club-detail/club-model'
import type { Tenant } from '@/lib/types'
import { useSiteAddress } from '@/lib/site-address'
import { EntityAvatar } from '@/components/admin-platform/ui/entity-avatar'

/**
 * Cabeçalho do detalhe do clube (PageHeader do console): "Voltar para Clubes",
 * logo (ou iniciais na cor do clube), nome, situação, endereço do site e
 * "Cliente desde". Ações: "Ver site"
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
    <PageHeader
      breadcrumb={<BackLink href="/admin/inquilinos">Voltar para Clubes</BackLink>}
      title={
        <span className="flex min-w-0 items-center gap-3.5">
          {showLogo ? (
            <span
              className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
              aria-hidden="true"
            >
              {/* Logo público do clube (URL livre, cadastrada na Aparência); next/image não se aplica. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt=""
                className="size-full rounded-2xl border border-border object-contain p-1"
                onError={() => setLogoFailed(true)}
              />
            </span>
          ) : (
            <EntityAvatar
              name={tenant.name}
              color={tenant.branding.primaryColor}
              className="size-12 rounded-2xl text-base shadow-[0_1px_2px_rgba(16,24,40,0.12),0_6px_14px_-6px_rgba(16,24,40,0.35)]"
            />
          )}
          <span className="min-w-0 wrap-break-word">{tenant.name}</span>
        </span>
      }
      badge={
        <>
          <StatusPill tone={CLUB_STATUS_TONE[tenant.status]}>{CLUB_STATUS_LABEL[tenant.status]}</StatusPill>
          {panelAccess === 'read_only' ? <StatusPill tone="warning">Painel só para consulta</StatusPill> : null}
          {panelAccess === 'blocked' ? <StatusPill tone="danger">Painel bloqueado</StatusPill> : null}
        </>
      }
      description={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
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
        </span>
      }
      actions={
        <>
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
        </>
      }
    />
  )
}
