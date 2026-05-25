'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Save } from 'lucide-react'

export default function AdminConfiguracoesPage() {
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = () => {
    setIsSaving(true)
    setTimeout(() => {
      setIsSaving(false)
      alert('Configurações salvas com sucesso!')
    }, 1000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações do Sistema</h1>
          <p className="text-muted-foreground">Gerencie os parâmetros globais da plataforma Administrativa</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="bg-[#26365f] hover:bg-[#152a5c] text-white">
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Salvando...' : 'Salvar Alterações'}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Informações do Sistema</CardTitle>
              <CardDescription>Configurações básicas da plataforma</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome da Plataforma</label>
                <Input defaultValue="Annetec" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">E-mail de Suporte Padrão</label>
                <Input defaultValue="suporte@annetec.com.br" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Fuso Horário</label>
                <Input defaultValue="América/São_Paulo (BRT)" disabled />
                <p className="text-xs text-muted-foreground">Usado para base de cálculos e relatórios.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Precificação Global</CardTitle>
              <CardDescription>Valores base dos planos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#26365f]">Annetec Individual</label>
                  <Input type="number" step="0.01" defaultValue="19.90" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#e84364]">Annetec Família</label>
                  <Input type="number" step="0.01" defaultValue="49.90" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Segurança Global</CardTitle>
              <CardDescription>Políticas aplicadas a todos os usuários</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">Autenticação em Duas Etapas (2FA)</h4>
                  <p className="text-sm text-muted-foreground">Exigir validação adicional no login.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">Log de Auditoria</h4>
                  <p className="text-sm text-muted-foreground">Registrar ações de administradores no sistema.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">Forçar Senha Forte</h4>
                  <p className="text-sm text-muted-foreground">Exigir uso de caracteres especiais em senhas.</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Integrações e Notificações</CardTitle>
              <CardDescription>Comunicações automáticas do sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">Bloqueio Automático</h4>
                  <p className="text-sm text-muted-foreground">Suspender planos após 30 dias de inadimplência.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium">E-mails Transacionais</h4>
                  <p className="text-sm text-muted-foreground">Ativar serviço de e-mail (SendGrid/AWS SES).</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
