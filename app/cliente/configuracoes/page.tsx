'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Save, User, Bell, CreditCard, Lock } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { Client } from '@/lib/types'

export default function ClienteConfiguracoesPage() {
  const { user } = useAuth()
  const client = user as Client
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = () => {
    setIsSaving(true)
    setTimeout(() => {
      setIsSaving(false)
      alert('Configurações da conta salvas com sucesso!')
    }, 1000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Minha Conta</h1>
          <p className="text-muted-foreground">Gerencie seus dados pessoais, senha e preferências de comunicação</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="bg-[#1c3670] hover:bg-[#152a5c] text-white">
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Salvando...' : 'Salvar Alterações'}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          {/* Perfil */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-[#1c3670]" />
                Dados Cadastrais
              </CardTitle>
              <CardDescription>Mantenha suas informações atualizadas para contato</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome Completo</label>
                <Input defaultValue={client?.name || ''} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">E-mail</label>
                <Input defaultValue={client?.email || ''} type="email" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Celular (WhatsApp)</label>
                <Input defaultValue={client?.phone || ''} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">CPF</label>
                <Input defaultValue={client?.cpf || ''} disabled />
                <p className="text-xs text-muted-foreground">Para alterar seu CPF, entre em contato com o suporte.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Notificações */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-green-600" />
                Preferências de Alertas
              </CardTitle>
              <CardDescription>Escolha como deseja receber nossos avisos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">Avisos de Fatura por E-mail</h4>
                  <p className="text-sm text-muted-foreground">Receba lembretes mensais de pagamento.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">Avisos via WhatsApp</h4>
                  <p className="text-sm text-muted-foreground">Promoções e novidades exclusivas da Annetec.</p>
                </div>
                <Switch checked={false} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">Boletins Informativos</h4>
                  <p className="text-sm text-muted-foreground">Dicas de saúde e atualizações da rede referenciada.</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>

          {/* Segurança */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-gray-600" />
                Segurança e Senha
              </CardTitle>
              <CardDescription>Proteja o acesso ao seu painel</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Senha Atual</label>
                <Input type="password" placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Nova Senha</label>
                <Input type="password" placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Repita a Nova Senha</label>
                <Input type="password" placeholder="••••••••" />
              </div>
              <Button variant="outline" className="w-full mt-2">Atualizar Senha</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
