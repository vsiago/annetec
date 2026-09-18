'use client'

import { useState } from 'react'
import {
  Bell,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Database,
  Download,
  FileText,
  KeyRound,
  Lock,
  Mail,
  MessageCircle,
  Palette,
  ScrollText,
  Settings2,
  ShieldCheck,
  Smartphone,
  Tags,
  TrendingUp,
  Upload,
  UserRound,
  Webhook,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/dashboard/page-header'
import { SectionTab, SectionTabsList } from '@/components/dashboard/section-tabs'
import { DataTable, StatusPill } from '@/components/dashboard/table-controls'
import { useTenant } from '@/contexts/tenant-context'
import { cn } from '@/lib/utils'

const NOTIFICATION_RULES = [
  { id: 'leads', label: 'Novos leads', hint: 'Receber notificações de novos leads', icon: UserRound, on: true },
  { id: 'vendas', label: 'Novas vendas', hint: 'Receber notificações de vendas', icon: TrendingUp, on: true },
  { id: 'inadimplencia', label: 'Inadimplência', hint: 'Alertas de beneficiários inadimplentes', icon: CircleAlert, on: true },
  { id: 'agendamentos', label: 'Agendamentos', hint: 'Lembretes e confirmações', icon: CalendarClock, on: true },
  { id: 'sistema', label: 'Atualizações do sistema', hint: 'Novidades e manutenções', icon: Settings2, on: false },
]

const INTEGRATIONS = [
  { name: 'Gateway de Pagamento', provider: 'Mercado Pago', connected: true, tone: 'bg-sky-50 text-sky-500' },
  { name: 'Envio de E-mails', provider: 'SendGrid', connected: true, tone: 'bg-indigo-50 text-indigo-500' },
  { name: 'WhatsApp Business', provider: 'Z-API', connected: true, tone: 'bg-emerald-50 text-emerald-500' },
  { name: 'SMS', provider: 'Twilio', connected: false, tone: 'bg-rose-50 text-rose-500' },
]

const SECURITY_ITEMS = [
  { name: 'Autenticação em duas etapas (2FA)', hint: 'Recomendado para administradores', status: 'Ativada', icon: ShieldCheck },
  { name: 'Política de senhas', hint: 'Força e validade das senhas', status: 'Configurada', icon: KeyRound },
  { name: 'Controle de tentativas de login', hint: 'Bloqueio após tentativas inválidas', status: 'Ativado', icon: Lock },
  { name: 'Logs de auditoria', hint: 'Histórico de acessos e alterações', status: 'Ativado', icon: ScrollText },
]

const LEGAL_DOCUMENTS = [
  { name: 'Termos de uso da plataforma', version: 'v3.2', updatedAt: '12/03/2025', published: true },
  { name: 'Política de privacidade (LGPD)', version: 'v2.8', updatedAt: '12/03/2025', published: true },
  { name: 'Contrato de adesão ao clube', version: 'v4.0', updatedAt: '01/06/2025', published: true },
  { name: 'Regulamento da rede credenciada', version: 'v1.5', updatedAt: '20/08/2025', published: true },
  { name: 'Política de cancelamento', version: 'v1.1', updatedAt: '03/09/2025', published: false },
]

const OTHER_OPTIONS = [
  { label: 'Termos de uso', icon: FileText },
  { label: 'Política de privacidade', icon: ShieldCheck },
  { label: 'Configurações avançadas', icon: Settings2 },
  { label: 'Webhooks', icon: Webhook },
  { label: 'Campos personalizados', icon: Tags },
  { label: 'Categorias e etiquetas', icon: Tags },
]

export default function AdminConfiguracoesPage() {
  const { tenant } = useTenant()
  const [tab, setTab] = useState('geral')
  const [rules, setRules] = useState(() =>
    Object.fromEntries(NOTIFICATION_RULES.map(rule => [rule.id, rule.on])),
  )
  const [maintenance, setMaintenance] = useState(false)
  const [logging, setLogging] = useState(true)
  const [recurring, setRecurring] = useState(true)
  const [negativate, setNegativate] = useState(false)
  const [businessHours, setBusinessHours] = useState(true)
  const [requireTwoFactor, setRequireTwoFactor] = useState(true)
  const [showNetwork, setShowNetwork] = useState(true)
  const [showCard, setShowCard] = useState(true)
  const [showScheduling, setShowScheduling] = useState(false)

  const primaryColor = tenant?.branding.primaryColor ?? '#e84364'
  const secondaryColor = tenant?.branding.secondaryColor ?? '#1e2a4a'

  return (
    <div className="space-y-5">
      <PageHeader
        title="Configurações"
        description="Personalize a plataforma de acordo com a sua operação."
        mock
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <SectionTabsList>
          <SectionTab value="geral">Geral</SectionTab>
          <SectionTab value="financeiro">Financeiro</SectionTab>
          <SectionTab value="comunicacao">Comunicação</SectionTab>
          <SectionTab value="integracoes">Integrações</SectionTab>
          <SectionTab value="seguranca">Segurança</SectionTab>
          <SectionTab value="personalizacao">Personalização</SectionTab>
          <SectionTab value="termos">Termos e Políticas</SectionTab>
          <SectionTab value="avancado">Avançado</SectionTab>
        </SectionTabsList>

        <TabsContent value="geral" className="m-0 space-y-5">
          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Informações da empresa</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Dados que aparecem na plataforma e nas comunicações.
                </p>
                <CardAction className="self-center">
                  <button type="button" className="text-sm font-medium text-primary hover:underline">
                    Editar
                  </button>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex h-20 items-center justify-center rounded-xl bg-muted/50">
                  {tenant?.branding.logoUrl ? (
                    <img src={tenant.branding.logoUrl} alt={tenant.name} className="h-10 object-contain" />
                  ) : (
                    <span className="text-lg font-bold text-primary">{tenant?.name}</span>
                  )}
                </div>
                <Field label="Nome fantasia" value={tenant?.name ?? '—'} />
                <Field label="Razão social" value={tenant?.legalName ?? '—'} />
                <Field label="CNPJ" value={tenant?.document ?? '—'} />
                <Field label="E-mail principal" value={tenant?.email ?? '—'} />
                <Field label="Telefone" value={tenant?.phone ?? '—'} />
                <Field
                  label="Endereço"
                  value={
                    tenant
                      ? `${tenant.address.street}, ${tenant.address.number} - ${tenant.address.neighborhood}\n${tenant.address.city} - ${tenant.address.state}, ${tenant.address.cep}`
                      : '—'
                  }
                />
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Configurações gerais</CardTitle>
                <p className="text-xs text-muted-foreground">Ajustes básicos da plataforma.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <LabeledSelect label="Fuso horário" defaultValue="brasilia" options={[
                  { value: 'brasilia', label: '(GMT-03:00) Brasília' },
                  { value: 'manaus', label: '(GMT-04:00) Manaus' },
                ]} />
                <LabeledSelect label="Idioma" defaultValue="pt-br" options={[
                  { value: 'pt-br', label: 'Português (Brasil)' },
                  { value: 'en', label: 'English (US)' },
                ]} />
                <div className="grid grid-cols-2 gap-3">
                  <LabeledSelect label="Formato de data" defaultValue="ddmmaaaa" options={[
                    { value: 'ddmmaaaa', label: 'DD/MM/AAAA' },
                    { value: 'mmddaaaa', label: 'MM/DD/AAAA' },
                  ]} />
                  <LabeledSelect label="Formato de moeda" defaultValue="brl" options={[
                    { value: 'brl', label: 'R$ (Real)' },
                    { value: 'usd', label: 'US$ (Dólar)' },
                  ]} />
                </div>
                <LabeledSelect label="Sessão expira em" defaultValue="30" options={[
                  { value: '30', label: '30 minutos' },
                  { value: '60', label: '1 hora' },
                  { value: '480', label: '8 horas' },
                ]} />

                <ToggleRow
                  label="Modo de manutenção"
                  hint="Impede o acesso de usuários não administradores"
                  checked={maintenance}
                  onChange={setMaintenance}
                />
                <ToggleRow
                  label="Habilitar registro de logs"
                  hint="Mantém histórico detalhado de ações no sistema"
                  checked={logging}
                  onChange={setLogging}
                />

                <Button className="w-full">Salvar alterações</Button>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Personalização da plataforma</CardTitle>
                <p className="text-xs text-muted-foreground">Aparência e identidade visual.</p>
                <CardAction className="self-center">
                  <button type="button" className="text-sm font-medium text-primary hover:underline">
                    Editar
                  </button>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Logo da plataforma</p>
                  <div className="flex h-20 items-center justify-center rounded-xl bg-muted/50">
                    {tenant?.branding.logoUrl ? (
                      <img src={tenant.branding.logoUrl} alt={tenant.name} className="h-10 object-contain" />
                    ) : (
                      <span className="text-lg font-bold text-primary">{tenant?.name}</span>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Cores principais</p>
                  <div className="grid grid-cols-3 gap-2">
                    <ColorSwatch label="Primária" color={primaryColor} />
                    <ColorSwatch label="Secundária" color={secondaryColor} />
                    <ColorSwatch label="Acento" color={`${primaryColor}22`} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Nome que aparece no sistema</p>
                  <div className="flex gap-2">
                    <Input defaultValue={tenant?.name ?? ''} className="h-10" />
                    <Button className="h-10">Salvar</Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-border/60 p-2.5">
                  <Palette className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">Favicon</span>
                  <Button variant="outline" size="sm">
                    Alterar
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Notificações e alertas</CardTitle>
                <p className="text-xs text-muted-foreground">Configure como e quando receber avisos.</p>
                <CardAction className="self-center">
                  <button type="button" className="text-sm font-medium text-primary hover:underline">
                    Editar
                  </button>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-3">
                {NOTIFICATION_RULES.map(rule => {
                  const Icon = rule.icon
                  return (
                    <div key={rule.id} className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {rule.label}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {rule.hint}
                        </span>
                      </span>
                      <Switch
                        checked={rules[rule.id]}
                        onCheckedChange={value => setRules(prev => ({ ...prev, [rule.id]: value }))}
                      />
                    </div>
                  )
                })}

                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">Canais de notificação</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      { label: 'E-mail', icon: Mail, on: true },
                      { label: 'WhatsApp', icon: MessageCircle, on: true },
                      { label: 'SMS', icon: Smartphone, on: false },
                      { label: 'Push (App)', icon: Bell, on: true },
                    ].map(item => (
                      <label key={item.label} className="flex items-center gap-2">
                        <Checkbox defaultChecked={item.on} />
                        <span className="text-foreground">{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <Button className="w-full">Salvar preferências</Button>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Integrações</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Conecte a plataforma com serviços externos.
                </p>
                <CardAction className="self-center">
                  <button type="button" className="text-sm font-medium text-primary hover:underline">
                    Ver todas
                  </button>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-2">
                {INTEGRATIONS.map(item => (
                  <div key={item.name} className="flex items-center gap-3">
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        item.tone,
                      )}
                    >
                      <CreditCard className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {item.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {item.provider}
                      </span>
                    </span>
                    <StatusPill
                      label={item.connected ? 'Conectado' : 'Não conectado'}
                      className={
                        item.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }
                    />
                  </div>
                ))}
                <Button variant="outline" className="w-full gap-2">
                  <Settings2 className="h-4 w-4" />
                  Configurar integrações
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Segurança</CardTitle>
                <p className="text-xs text-muted-foreground">Proteja os dados da sua operação.</p>
                <CardAction className="self-center">
                  <button type="button" className="text-sm font-medium text-primary hover:underline">
                    Configurar
                  </button>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {SECURITY_ITEMS.map(item => {
                  const Icon = item.icon
                  return (
                    <div key={item.name} className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {item.name}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {item.hint}
                        </span>
                      </span>
                      <StatusPill label={item.status} className="bg-emerald-50 text-emerald-700" />
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Backup e dados</CardTitle>
                <p className="text-xs text-muted-foreground">Gerencie seus dados e backups.</p>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <div className="flex items-center gap-3">
                  <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">Último backup</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {new Date(Date.now() - 86_400_000).toLocaleDateString('pt-BR')} às 02:00
                    </span>
                  </span>
                  <StatusPill label="Sucesso" className="bg-emerald-50 text-emerald-700" />
                </div>

                <div className="flex items-center gap-3">
                  <Download className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">Exportar dados</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Baixe uma cópia dos seus dados
                    </span>
                  </span>
                  <Button variant="outline" size="sm">
                    Exportar
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  <Upload className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">Importar dados</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Importe dados de outras fontes
                    </span>
                  </span>
                  <Button variant="outline" size="sm">
                    Importar
                  </Button>
                </div>

                <Button variant="outline" className="w-full gap-2 border-primary/30 text-primary">
                  <Database className="h-4 w-4" />
                  Gerenciar backups
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Outras opções</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {OTHER_OPTIONS.map(option => {
                  const Icon = option.icon
                  return (
                    <button
                      key={option.label}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate text-foreground">{option.label}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  )
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="financeiro" className="m-0">
          <div className="grid gap-5 lg:grid-cols-2">
            <SettingsCard title="Cobrança" hint="Como as mensalidades são geradas e cobradas.">
              <LabeledSelect
                label="Dia de vencimento padrão"
                defaultValue="10"
                options={['5', '10', '15', '20', '25'].map(day => ({
                  value: day,
                  label: `Todo dia ${day}`,
                }))}
              />
              <LabeledSelect
                label="Geração de boletos"
                defaultValue="auto"
                options={[
                  { value: 'auto', label: 'Automática, 10 dias antes' },
                  { value: 'manual', label: 'Manual, em lote' },
                ]}
              />
              <LabeledSelect
                label="Tolerância de atraso"
                defaultValue="5"
                options={['3', '5', '10'].map(days => ({ value: days, label: `${days} dias` }))}
              />
              <ToggleRow
                label="Cobrança recorrente no cartão"
                hint="Tenta a recorrência antes de emitir o boleto"
                checked={recurring}
                onChange={setRecurring}
              />
              <Button className="w-full">Salvar alterações</Button>
            </SettingsCard>

            <SettingsCard title="Multa e juros" hint="Encargos aplicados após o vencimento.">
              <FieldRow label="Multa por atraso" value="2%" hint="Aplicada uma vez, no dia seguinte" />
              <FieldRow label="Juros ao mês" value="1%" hint="Pró-rata por dia de atraso" />
              <FieldRow label="Desconto por antecipação" value="Não aplicado" />
              <ToggleRow
                label="Negativar após 60 dias"
                hint="Envia o inadimplente para o birô de crédito"
                checked={negativate}
                onChange={setNegativate}
              />
              <Button variant="outline" className="w-full">
                Configurar régua de cobrança
              </Button>
            </SettingsCard>
          </div>
        </TabsContent>

        <TabsContent value="comunicacao" className="m-0">
          <div className="grid gap-5 lg:grid-cols-2">
            <SettingsCard title="Identidade do remetente" hint="Como o beneficiário vê suas mensagens.">
              <FieldRow label="Nome do remetente" value={tenant?.name ?? '—'} />
              <FieldRow label="E-mail de envio" value={tenant?.email ?? '—'} />
              <FieldRow label="Responder para" value={tenant?.email ?? '—'} />
              <FieldRow label="WhatsApp Business" value="(22) 2621-1000" />
              <Button variant="outline" className="w-full">
                Editar remetente
              </Button>
            </SettingsCard>

            <SettingsCard title="Canais ativos" hint="Por onde a plataforma pode falar com a carteira.">
              {[
                { label: 'E-mail transacional', icon: Mail, on: true },
                { label: 'WhatsApp Business', icon: MessageCircle, on: true },
                { label: 'SMS', icon: Smartphone, on: false },
                { label: 'Push no aplicativo', icon: Bell, on: true },
              ].map(item => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.label}</span>
                    <StatusPill
                      label={item.on ? 'Ativo' : 'Inativo'}
                      className={item.on ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}
                    />
                  </div>
                )
              })}
              <ToggleRow
                label="Horário comercial apenas"
                hint="Segura envios fora de 8h–20h"
                checked={businessHours}
                onChange={setBusinessHours}
              />
            </SettingsCard>
          </div>
        </TabsContent>

        <TabsContent value="integracoes" className="m-0">
          <Card className="gap-0 py-0 shadow-sm">
            <CardHeader className="p-4">
              <CardTitle className="text-base">Integrações</CardTitle>
              <p className="text-xs text-muted-foreground">
                Serviços externos conectados a esta operação.
              </p>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0">
              {INTEGRATIONS.map(item => (
                <div
                  key={item.name}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 p-3"
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      item.tone,
                    )}
                  >
                    <CreditCard className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {item.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{item.provider}</span>
                  </span>
                  <StatusPill
                    label={item.connected ? 'Conectado' : 'Não conectado'}
                    className={
                      item.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }
                  />
                  <Button variant="outline" size="sm">
                    {item.connected ? 'Gerenciar' : 'Conectar'}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seguranca" className="m-0">
          <div className="grid gap-5 lg:grid-cols-2">
            <SettingsCard title="Proteção de acesso" hint="Regras aplicadas a todos os usuários.">
              {SECURITY_ITEMS.map(item => {
                const Icon = item.icon
                return (
                  <div key={item.name} className="flex items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {item.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {item.hint}
                      </span>
                    </span>
                    <StatusPill label={item.status} className="bg-emerald-50 text-emerald-700" />
                  </div>
                )
              })}
            </SettingsCard>

            <SettingsCard title="Sessões e senhas" hint="Como as credenciais se comportam.">
              <FieldRow label="Tamanho mínimo da senha" value="8 caracteres" />
              <FieldRow label="Validade da senha" value="90 dias" />
              <FieldRow label="Sessões simultâneas" value="Até 3 dispositivos" />
              <FieldRow label="Bloqueio automático" value="Após 5 tentativas" />
              <ToggleRow
                label="Exigir 2FA para administradores"
                hint="Segundo fator obrigatório no login"
                checked={requireTwoFactor}
                onChange={setRequireTwoFactor}
              />
              <Button variant="outline" className="w-full">
                Encerrar todas as sessões
              </Button>
            </SettingsCard>
          </div>
        </TabsContent>

        <TabsContent value="personalizacao" className="m-0">
          <div className="grid gap-5 lg:grid-cols-2">
            <SettingsCard title="Marca" hint="Logo, cores e nome exibidos no portal.">
              <div className="flex h-24 items-center justify-center rounded-xl bg-muted/50">
                {tenant?.branding.logoUrl ? (
                  <img src={tenant.branding.logoUrl} alt={tenant.name} className="h-12 object-contain" />
                ) : (
                  <span className="text-xl font-bold text-primary">{tenant?.name}</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <ColorSwatch label="Primária" color={primaryColor} />
                <ColorSwatch label="Secundária" color={secondaryColor} />
                <ColorSwatch label="Acento" color={`${primaryColor}22`} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1">
                  Trocar logo
                </Button>
                <Button className="flex-1">Salvar marca</Button>
              </div>
            </SettingsCard>

            <SettingsCard title="Portal do beneficiário" hint="O que o associado vê ao entrar.">
              <ToggleRow
                label="Exibir rede credenciada"
                hint="Lista de parceiros no portal e no app"
                checked={showNetwork}
                onChange={setShowNetwork}
              />
              <ToggleRow
                label="Carteirinha digital"
                hint="Permite baixar e compartilhar a carteirinha"
                checked={showCard}
                onChange={setShowCard}
              />
              <ToggleRow
                label="Agendamento online"
                hint="Beneficiário marca consulta pelo portal"
                checked={showScheduling}
                onChange={setShowScheduling}
              />
              <FieldRow label="Domínio do portal" value={`/${tenant?.slug ?? ''}`} />
              <Button variant="outline" className="w-full">
                Pré-visualizar portal
              </Button>
            </SettingsCard>
          </div>
        </TabsContent>

        <TabsContent value="termos" className="m-0">
          <Card className="gap-0 py-0 shadow-sm">
            <CardHeader className="p-4">
              <CardTitle className="text-base">Termos e políticas</CardTitle>
              <p className="text-xs text-muted-foreground">
                Documentos aceitos pelo beneficiário na adesão.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={[
                  {
                    key: 'name',
                    header: 'Documento',
                    render: row => (
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-primary" />
                        <span className="font-medium text-foreground">{row.name}</span>
                      </span>
                    ),
                  },
                  {
                    key: 'version',
                    header: 'Versão',
                    hideOnMobile: true,
                    render: row => <span className="text-muted-foreground">{row.version}</span>,
                  },
                  {
                    key: 'updatedAt',
                    header: 'Atualizado em',
                    hideOnMobile: true,
                    render: row => <span className="text-muted-foreground">{row.updatedAt}</span>,
                  },
                  {
                    key: 'status',
                    header: 'Situação',
                    align: 'right',
                    render: row => (
                      <StatusPill
                        label={row.published ? 'Publicado' : 'Rascunho'}
                        className={
                          row.published
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }
                      />
                    ),
                  },
                ]}
                rows={LEGAL_DOCUMENTS}
                rowKey={row => row.name}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="avancado" className="m-0">
          <div className="grid gap-5 lg:grid-cols-2">
            <SettingsCard title="Dados e backup" hint="Exportação, importação e cópias de segurança.">
              <FieldRow
                label="Último backup"
                value="Sucesso"
                hint={`${new Date(Date.now() - 86_400_000).toLocaleDateString('pt-BR')} às 02:00`}
              />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-2">
                  <Download className="h-4 w-4" />
                  Exportar
                </Button>
                <Button variant="outline" className="flex-1 gap-2">
                  <Upload className="h-4 w-4" />
                  Importar
                </Button>
              </div>
              <Button variant="outline" className="w-full gap-2 border-primary/30 text-primary">
                <Database className="h-4 w-4" />
                Gerenciar backups
              </Button>
            </SettingsCard>

            <SettingsCard title="Desenvolvedor" hint="Extensões para integrar sistemas próprios.">
              {OTHER_OPTIONS.map(option => {
                const Icon = option.icon
                return (
                  <button
                    key={option.label}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-foreground">{option.label}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                )
              })}
            </SettingsCard>

            <Card className="border-destructive/30 bg-destructive/5 shadow-none lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base text-destructive">Zona de risco</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Ações que afetam toda a operação e não podem ser desfeitas sozinhas.
                </p>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant="outline" className="bg-card">
                  Encerrar todas as sessões
                </Button>
                <Button variant="outline" className="bg-card">
                  Limpar dados de demonstração
                </Button>
                <Button variant="outline" className="border-destructive/40 bg-card text-destructive">
                  Suspender operação
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Casca dos painéis de ajuste: título, explicação e corpo empilhado. */
function SettingsCard({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}

/** Linha de ajuste que hoje é só leitura — vira campo quando houver API. */
function FieldRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate text-sm text-muted-foreground">{label}</span>
        {hint && <span className="block truncate text-[11px] text-muted-foreground/80">{hint}</span>}
      </span>
      <span className="shrink-0 text-sm font-medium text-foreground">{value}</span>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="whitespace-pre-line text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}

function ColorSwatch({ label, color }: { label: string; color: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border border-border/60 p-1.5">
        <span className="h-5 w-5 shrink-0 rounded" style={{ backgroundColor: color }} />
        <span className="truncate text-[11px] text-muted-foreground">{color.toUpperCase()}</span>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-[11px] leading-snug text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function LabeledSelect({
  label,
  defaultValue,
  options,
}: {
  label: string
  defaultValue: string
  options: { value: string; label: string }[]
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Select defaultValue={defaultValue}>
        <SelectTrigger className="w-full data-[size=default]:h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
