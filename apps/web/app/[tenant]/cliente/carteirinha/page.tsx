'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import { getInitials } from '@/lib/utils'
import type { Client } from '@/lib/types'
import {
  Download,
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

export default function CarteirinhaPage() {
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
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Baixar PDF
        </Button>
      </div>

      {/* Digital Card Mockup */}
      <div className="py-4">
        <DigitalCardMockup
          tenant={tenant}
          clientName={client?.name || 'Mariana Alves Costa'}
          cardNumber={client?.cardNumber || 'MEP-2024-88901'}
          planName={client?.plan || 'MepCard Família'}
          cpf={client?.cpf || '234.567.890-11'}
          contractDate={client?.contractDate}
          dependentsCount={client?.dependents?.length || 2}
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
              <p className="font-mono font-medium text-sm">{client?.cardNumber}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Validade</p>
              <p className="font-medium text-sm">Indeterminada</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <Phone className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Teleorientação</p>
              <p className="font-medium text-sm">{tenant?.phone}</p>
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
              Informe o número da carteirinha ao ligar para a Teleorientação 24h
            </li>
            <li className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-secondary text-white text-xs font-bold flex-shrink-0">3</span>
              Nas farmácias parceiras, informe seu CPF para obter os descontos
            </li>
            <li className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-secondary text-white text-xs font-bold flex-shrink-0">4</span>
              Para consultas e exames, agende pelo app ou telefone com antecedência
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
