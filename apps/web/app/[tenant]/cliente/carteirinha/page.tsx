'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import { getInitials } from '@/lib/utils'
import type { Client } from '@/lib/types'
import {
  QrCode,
  User,
  Calendar,
  CreditCard,
  Phone,
  Mail,
  Shield,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

import { DigitalCardMockup } from '@/components/digital-card-mockup'
import { useClubMembership } from '@/components/client/club-membership-provider'
import { MembershipCards } from '@/components/client/membership-cards'
import { LoadErrorNotice } from '@/components/client/status-ui'

export default function CarteirinhaPage() {
  return (
    <Suspense fallback={<CarteirinhaSkeleton />}>
      <CarteirinhaContent />
    </Suspense>
  )
}

function CarteirinhaContent() {
  const { tenant } = useTenant()
  const { membership, isLoading, isRefreshing, error, refresh } = useClubMembership()
  const searchParams = useSearchParams()

  if (isLoading) return <CarteirinhaSkeleton />

  // Assinante do Clube: carteirinhas reais (titular + dependentes).
  if (membership) {
    return <MembershipCards membership={membership} tenant={tenant} initialKey={searchParams.get('pessoa')} />
  }

  // Sem assinatura do Clube: a carteirinha de sempre.
  return (
    <div className="space-y-6">
      {error && (
        <LoadErrorNotice
          title="Não conseguimos carregar sua assinatura do clube"
          message={error}
          onRetry={() => void refresh()}
          retrying={isRefreshing}
        />
      )}
      <LegacyCarteirinha />
    </div>
  )
}

function CarteirinhaSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando carteirinha">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="mx-auto h-70 w-full max-w-120 rounded-2xl" />
      <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-18 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}

function LegacyCarteirinha() {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const client = user as Client

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Carteirinha Digital</h1>
          <p className="text-muted-foreground">Apresente sua carteirinha digital para liberar benefícios e descontos</p>
        </div>
      </div>

      {/* Carteirinha */}
      <div className="py-4">
        <DigitalCardMockup
          tenant={tenant}
          clientName={client?.name || '—'}
          cardNumber={client?.cardNumber || '—'}
          planName={client?.plan || '—'}
          cpf={client?.cpf || '—'}
          contractDate={client?.contractDate}
          dependentsCount={client?.dependents?.length ?? 0}
          size="lg"
          interactive={true}
          showFlip={true}
        />
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-3xl mx-auto">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-secondary/10">
              <CreditCard className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Carteirinha</p>
              <p className="font-mono font-medium text-sm">{client?.cardNumber || 'Ainda não emitida'}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Plano</p>
              <p className="font-medium text-sm">{client?.plan || '—'}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <Phone className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Central do clube</p>
              <p className="font-medium text-sm">{tenant?.phone || '—'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage Instructions */}
      <Card className="border-0 shadow-sm max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="text-lg">Como usar sua carteirinha</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-secondary text-white text-xs font-bold flex-shrink-0">1</span>
              Apresente sua carteirinha digital ou física nos estabelecimentos parceiros
            </li>
            <li className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-secondary text-white text-xs font-bold flex-shrink-0">2</span>
              Informe o número da carteirinha ao ligar para a central do clube
            </li>
            <li className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-secondary text-white text-xs font-bold flex-shrink-0">3</span>
              Nas farmácias parceiras, informe seu CPF para obter os descontos
            </li>
            <li className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-secondary text-white text-xs font-bold flex-shrink-0">4</span>
              Para consultas e exames, agende com antecedência direto na rede parceira
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
