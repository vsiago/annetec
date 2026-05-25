'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/auth-context'
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

export default function CarteirinhaPage() {
  const { user } = useAuth()
  const client = user as Client

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Carteirinha Digital</h1>
          <p className="text-muted-foreground">Apresente sua carteirinha para acessar os benefícios</p>
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Baixar PDF
        </Button>
      </div>

      {/* Digital Card */}
      <div className="max-w-md mx-auto">
        <Card className="border-0 shadow-xl overflow-hidden">
          {/* Card Front */}
          <div className="bg-gradient-to-br from-[#26365f] via-[#2a4a8f] to-[#26365f] text-white p-6 relative">
            {/* Logo */}
            <div className="flex items-center justify-between mb-6">
              <img
                src="/annetec-light.svg"
                alt="Annetec"
                className="h-8"
              />
              <Badge className="bg-white/20 text-white border-0">
                <Shield className="h-3 w-3 mr-1" />
                Ativo
              </Badge>
            </div>

            {/* Card Number */}
            <div className="mb-6">
              <p className="text-white/60 text-xs uppercase tracking-wider">Número da Carteirinha</p>
              <p className="text-2xl font-mono font-bold tracking-wider mt-1">
                {client?.cardNumber || 'CA-0000-00000'}
              </p>
            </div>

            {/* User Info */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border-2 border-white/30">
                <AvatarFallback className="bg-[#e84364] text-white text-xl">
                  {client?.name ? getInitials(client.name) : 'CL'}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-bold text-lg">{client?.name}</p>
                <p className="text-white/70 text-sm">{client?.plan}</p>
              </div>
            </div>

            {/* Decorative Elements */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
          </div>

          {/* Card Details */}
          <CardContent className="p-6 bg-white">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-xs text-muted-foreground">CPF</p>
                <p className="font-medium">{client?.cpf}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Associado desde</p>
                <p className="font-medium">
                  {client?.contractDate ? new Date(client.contractDate).toLocaleDateString('pt-BR') : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Telefone</p>
                <p className="font-medium">{client?.phone}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dependentes</p>
                <p className="font-medium">{client?.dependents?.length || 0}</p>
              </div>
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center pt-4 border-t border-border">
              <div className="p-4 bg-white border-2 border-dashed border-[#26365f]/30 rounded-xl">
                <div className="w-32 h-32 bg-[#26365f]/5 rounded-lg flex items-center justify-center">
                  <QrCode className="h-24 w-24 text-[#26365f]" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                Apresente este QR Code para validar sua carteirinha
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-3xl mx-auto">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#26365f]/10">
              <CreditCard className="h-5 w-5 text-[#26365f]" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Carteirinha</p>
              <p className="font-mono font-medium text-sm">{client?.cardNumber}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#e84364]/10">
              <Calendar className="h-5 w-5 text-[#e84364]" />
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
              <p className="font-medium text-sm">0800 000 0000</p>
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
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#26365f] text-white text-xs font-bold flex-shrink-0">1</span>
              Apresente sua carteirinha digital ou física nos estabelecimentos parceiros
            </li>
            <li className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#26365f] text-white text-xs font-bold flex-shrink-0">2</span>
              Informe o número da carteirinha ao ligar para a Teleorientação 24h
            </li>
            <li className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#26365f] text-white text-xs font-bold flex-shrink-0">3</span>
              Nas farmácias parceiras, informe seu CPF para obter os descontos
            </li>
            <li className="flex items-start gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#26365f] text-white text-xs font-bold flex-shrink-0">4</span>
              Para consultas e exames, agende pelo app ou telefone com antecedência
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
