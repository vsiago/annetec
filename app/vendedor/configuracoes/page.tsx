'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Save, User, Bell, Briefcase, Lock } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { Seller } from '@/lib/types'

export default function VendedorConfiguracoesPage() {
  const { user } = useAuth()
  const seller = user as Seller
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = () => {
    setIsSaving(true)
    setTimeout(() => {
      setIsSaving(false)
      alert('Preferências salvas com sucesso!')
    }, 1000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Minhas Configurações</h1>
          <p className="text-muted-foreground">Personalize seu perfil e suas preferências de notificações</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="bg-[#e84364] hover:bg-[#d42d50] text-white">
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Salvando...' : 'Salvar Preferências'}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          {/* Perfil */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-[#26365f]" />
                Dados do Perfil
              </CardTitle>
              <CardDescription>Informações públicas exibidas para seus clientes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome de Exibição</label>
                <Input defaultValue={seller?.name || ''} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">E-mail Profissional</label>
                <Input defaultValue={seller?.email || ''} type="email" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">WhatsApp Comercial</label>
                <Input defaultValue={seller?.phone || ''} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Região de Atuação</label>
                <Input defaultValue={seller?.region || ''} disabled />
                <p className="text-xs text-muted-foreground">Sua região base é gerenciada pela administração.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Notificações */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-[#e84364]" />
                Notificações e Alertas
              </CardTitle>
              <CardDescription>Como você deseja ser avisado sobre seus leads</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">Novos Leads Recebidos</h4>
                  <p className="text-sm text-muted-foreground">Seja notificado no e-mail quando um novo lead entrar no pipeline.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">Aprovação de Contratos</h4>
                  <p className="text-sm text-muted-foreground">Alerta quando uma venda sua for confirmada pelo sistema.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">Lembretes Diários</h4>
                  <p className="text-sm text-muted-foreground">Resumo matinal dos leads pendentes no funil.</p>
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
                Segurança
              </CardTitle>
              <CardDescription>Acesso à sua conta</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nova Senha</label>
                <Input type="password" placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Confirmar Nova Senha</label>
                <Input type="password" placeholder="••••••••" />
              </div>
              <Button variant="outline" className="w-full mt-2">Alterar Senha</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
