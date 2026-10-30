'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/auth-context'
import { getInitials } from '@/lib/utils'
import type { Client } from '@/lib/types'
import {
  Plus,
  User,
  Calendar,
  CreditCard,
  MoreHorizontal,
  Users,
  Heart,
  Edit,
  Trash2,
  HeadphonesIcon,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useTenant } from '@/contexts/tenant-context'
import { useClubMembership } from '@/components/client/club-membership-provider'
import { MembershipDependents } from '@/components/client/membership-dependents'
import { LoadErrorNotice } from '@/components/client/status-ui'

export default function DependentesPage() {
  const { tenant } = useTenant()
  const { membership, isLoading, isRefreshing, error, refresh } = useClubMembership()

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Carregando dependentes">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  // Assinante do Clube: dependentes da assinatura, cada um com a carteirinha.
  if (membership) return <MembershipDependents membership={membership} tenant={tenant} />

  // Sem assinatura do Clube: a tela de sempre.
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
      <LegacyDependentes />
    </div>
  )
}

function LegacyDependentes() {
  const { user } = useAuth()
  const client = user as Client
  const { tenant } = useTenant()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const base = `/${tenant?.slug ?? ''}/cliente`

  const calculateAge = (birthDate: Date) => {
    const today = new Date()
    const birth = new Date(birthDate)
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return age
  }

  const dependents = client?.dependents || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dependentes</h1>
          <p className="text-muted-foreground">Gerencie os dependentes do seu plano</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:opacity-90 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Dependente
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Incluir um dependente</DialogTitle>
              <DialogDescription>
                Fale com o clube para incluir um novo dependente
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                A inclusão de dependentes é feita pelo atendimento do clube, que confere os dados com você e emite a carteirinha. Ter em mãos: nome completo, data de nascimento, CPF (se tiver) e grau de parentesco.
              </p>
              <div className="flex flex-col gap-2">
                <Button asChild className="h-11 bg-primary hover:opacity-90 text-white">
                  <Link href={`${base}/suporte`} onClick={() => setIsAddOpen(false)}>
                    <HeadphonesIcon />
                    Falar com o atendimento
                  </Link>
                </Button>
                <Button type="button" variant="outline" className="h-11" onClick={() => setIsAddOpen(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Card */}
      <Card className="border-0 shadow-sm bg-gradient-to-r from-secondary to-secondary/80 text-white">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-white/10">
              <Users className="h-8 w-8" />
            </div>
            <div>
              <p className="text-white/80 text-sm">Total de Dependentes</p>
              <p className="text-3xl font-bold">{dependents.length}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-white/60 text-sm">Seu plano permite</p>
              <p className="font-medium">Até 5 dependentes</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dependents List */}
      {dependents.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {dependents.map((dependent, index) => (
            <Card key={dependent.id} className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Avatar className="h-14 w-14 bg-secondary">
                    <AvatarFallback className="bg-secondary text-white">
                      {getInitials(dependent.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold">{dependent.name}</h3>
                        <Badge variant="outline" className="mt-1">
                          <Heart className="h-3 w-3 mr-1" />
                          {dependent.relationship}
                        </Badge>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <CreditCard className="mr-2 h-4 w-4" />
                            Ver Carteirinha
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        CPF: {dependent.cpf}
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {calculateAge(dependent.birthDate)} anos ({new Date(dependent.birthDate).toLocaleDateString('pt-BR')})
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Nenhum dependente cadastrado</h3>
            <p className="text-muted-foreground mb-4">
              Adicione seus dependentes para que eles também possam usufruir dos benefícios do plano.
            </p>
            <Button className="bg-primary hover:opacity-90 text-white" onClick={() => setIsAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Dependente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Informações Importantes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary mt-1.5 flex-shrink-0" />
              Dependentes têm acesso a todos os benefícios do plano
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary mt-1.5 flex-shrink-0" />
              Cada dependente receberá sua própria carteirinha digital
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary mt-1.5 flex-shrink-0" />
              A inclusão de dependentes pode alterar o valor mensal do plano
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary mt-1.5 flex-shrink-0" />
              Para dependentes menores de idade, o titular é responsável pelo uso dos benefícios
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
