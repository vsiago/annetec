/**
 * Dados de vitrine das operações que ainda não têm modelo no banco: rede de
 * clínicas com elegibilidade, chamados de atendimento e campanhas de
 * comunicação. As telas que consomem daqui carregam o selo `MockBadge`.
 *
 * Tudo é derivado por índice — sem `Math.random()` — para a tela abrir igual
 * em todo carregamento e a apresentação não mudar de números no meio.
 * Quando cada domínio ganhar tabela e API, este arquivo some inteiro.
 */

export interface MockClinic {
  id: string
  name: string
  tagline: string
  kind: 'propria' | 'credenciada'
  city: string
  address: string
  specialties: string[]
  eligibility: 'online' | 'manual'
  active: boolean
  favorite: boolean
  phone: string
  email: string
  cnpj: string
  manager: string
  service: string
  parking: boolean
  accessibility: boolean
}

const CLINIC_CITIES = [
  'São Pedro da Aldeia - RJ',
  'Cabo Frio - RJ',
  'Rio das Ostras - RJ',
  'Iguaba Grande - RJ',
  'Araruama - RJ',
]

const CLINIC_BASE: { name: string; tagline: string; specialties: string[]; kind: MockClinic['kind'] }[] = [
  { name: 'Clínica Centro', tagline: 'Cuidando de você sempre', kind: 'propria', specialties: ['Clínica Geral', 'Cardiologia', 'Pediatria', 'Dermatologia'] },
  { name: 'Clínica Vida Mais', tagline: 'Saúde perto de casa', kind: 'credenciada', specialties: ['Dermatologia', 'Ginecologia', 'Clínica Geral'] },
  { name: 'LabExames', tagline: 'Resultados com confiança', kind: 'credenciada', specialties: ['Análises Clínicas', 'Toxicológico'] },
  { name: 'OdontoTop', tagline: 'Sorriso para todos', kind: 'credenciada', specialties: ['Odontologia', 'Radiologia'] },
  { name: 'Hospital São Lucas', tagline: 'Pronto atendimento 24h', kind: 'propria', specialties: ['Pronto Atendimento', 'Exames', 'Internação'] },
  { name: 'Clínica Bem Estar', tagline: 'Reabilitação e movimento', kind: 'credenciada', specialties: ['Fisioterapia', 'Ortopedia'] },
  { name: 'CardioMais', tagline: 'Seu coração em boas mãos', kind: 'credenciada', specialties: ['Cardiologia', 'Clínica Geral'] },
  { name: 'Clínica da Mulher', tagline: 'Saúde feminina em todas as fases', kind: 'credenciada', specialties: ['Ginecologia', 'Obstetrícia'] },
  { name: 'Multiimagem', tagline: 'Imagens que geram confiança', kind: 'credenciada', specialties: ['Radiologia', 'Ultrassonografia'] },
  { name: 'FisioVida', tagline: 'Movimento para uma vida melhor', kind: 'credenciada', specialties: ['Fisioterapia', 'RPG'] },
  { name: 'Clínica Praia', tagline: 'Atendimento à beira-mar', kind: 'propria', specialties: ['Clínica Geral', 'Pediatria'] },
  { name: 'Clínica Lagoa', tagline: 'Perto de quem precisa', kind: 'propria', specialties: ['Clínica Geral', 'Nutrição'] },
]

const MANAGERS = [
  'Dr. Carlos Mendes',
  'Dra. Juliana Ribeiro',
  'Dr. Roberto Silva',
  'Dra. Fernanda Alves',
  'Dr. Ricardo Lima',
]

export function buildClinics(): MockClinic[] {
  return CLINIC_BASE.flatMap((clinic, i) =>
    CLINIC_CITIES.slice(0, clinic.kind === 'propria' ? 1 : 2 + (i % 3)).map((city, c) => {
      const index = i * 5 + c
      return {
        id: `clinic-${index + 1}`,
        name: clinic.name,
        tagline: clinic.tagline,
        kind: clinic.kind,
        city,
        address: `${['Rua das Flores', 'Av. Brasil', 'Rua do Sol', 'Av. Teixeira e Souza', 'Rua das Acácias'][c % 5]}, ${100 + index * 9}`,
        specialties: clinic.specialties,
        eligibility: index % 7 === 0 ? 'manual' : 'online',
        active: index % 19 !== 0,
        favorite: index % 6 === 0,
        phone: `(22) 26${String(21 + (index % 60)).padStart(2, '0')}-${String(1200 + index * 17).slice(0, 4)}`,
        email: `contato@${clinic.name.toLowerCase().replace(/[^a-z]/g, '')}.com.br`,
        cnpj: `12.345.${String(600 + index).slice(0, 3)}/0001-${String(10 + (index % 89))}`,
        manager: MANAGERS[index % MANAGERS.length],
        service: index % 3 === 0 ? 'Particular e convênio' : 'Somente convênio',
        parking: index % 4 !== 0,
        accessibility: index % 5 !== 0,
      }
    }),
  )
}

export type TicketStatus =
  | 'em_atendimento'
  | 'aguardando_usuario'
  | 'aguardando_terceiro'
  | 'resolvido'
  | 'encerrado'

export type TicketChannel = 'Telefone' | 'WhatsApp' | 'E-mail' | 'App/Site' | 'Presencial'

export interface TicketMessage {
  id: string
  kind: 'entrada' | 'saida' | 'nota'
  title: string
  body: string
  at: Date
  author?: string
}

export interface MockTicket {
  id: string
  protocol: string
  userName: string
  cpf: string
  channel: TicketChannel
  subject: string
  priority: 'Alta' | 'Normal' | 'Baixa'
  status: TicketStatus
  owner: string
  openedAt: Date
  lastInteractionAt: Date
  plan: string
  phone: string
  email: string
  dependents: number
  financialStatus: 'Em dia' | 'Inadimplente'
  messages: TicketMessage[]
}

const TICKET_SUBJECTS = [
  'Cobrança',
  'Carteirinha',
  'Reclamação',
  'Benefício',
  'Informação',
  'Clínica/Atendimento',
  'Cancelamento',
  'Financeiro',
  'Dependente',
  'Outros',
]

const TICKET_CHANNELS: TicketChannel[] = ['Telefone', 'WhatsApp', 'E-mail', 'App/Site', 'Presencial']
const TICKET_OWNERS = ['Juliana', 'Rafael', 'Fernanda', 'Lucas', 'Camila']
const TICKET_PRIORITIES: MockTicket['priority'][] = ['Alta', 'Normal', 'Baixa']

/**
 * Mistura de situações: a maioria resolvida, um punhado em aberto. É essa
 * proporção que faz os indicadores do topo da tela baterem com a lista.
 */
const TICKET_STATUS_MIX: TicketStatus[] = [
  ...Array<TicketStatus>(28).fill('resolvido'),
  ...Array<TicketStatus>(22).fill('em_atendimento'),
  ...Array<TicketStatus>(18).fill('aguardando_usuario'),
  ...Array<TicketStatus>(16).fill('aguardando_terceiro'),
  ...Array<TicketStatus>(16).fill('encerrado'),
]

const TICKET_NAMES = [
  'Maria Oliveira', 'Carlos Mendes', 'Ana Paula Souza', 'Roberto Silva', 'Juliana Ribeiro',
  'Fernando Alves', 'Ricardo Lima', 'Patrícia Gomes', 'Lucas Ferreira', 'Beatriz Santos',
  'Marcelo Rocha', 'Camila Duarte', 'Rafael Torres', 'Larissa Pinto', 'Bruno Cardoso',
]

const PLAN_NAMES = ['Essencial', 'Plus', 'Família', 'Odonto']

export function buildTickets(count = 60): MockTicket[] {
  const now = Date.now()

  return Array.from({ length: count }, (_, i) => {
    const index = i + 1
    const name = TICKET_NAMES[index % TICKET_NAMES.length]
    const openedAt = new Date(now - (((index * 13) % 45) + 1) * 86_400_000)
    const lastInteractionAt = new Date(openedAt.getTime() + ((index % 5) + 1) * 3_600_000)
    const status = TICKET_STATUS_MIX[(index * 37) % TICKET_STATUS_MIX.length]

    return {
      id: `ticket-${index}`,
      protocol: `#AT-${1028 - i}`,
      userName: name,
      cpf: `${String(100 + (index % 800))}.${String(200 + (index % 700))}.${String(300 + (index % 600))}-0${index % 10}`,
      channel: TICKET_CHANNELS[index % TICKET_CHANNELS.length],
      subject: TICKET_SUBJECTS[index % TICKET_SUBJECTS.length],
      priority: TICKET_PRIORITIES[index % TICKET_PRIORITIES.length],
      status,
      owner: TICKET_OWNERS[index % TICKET_OWNERS.length],
      openedAt,
      lastInteractionAt,
      plan: PLAN_NAMES[index % PLAN_NAMES.length],
      phone: `(22) 99${String(800 + (index % 190))}-${String(5000 + index * 7).slice(0, 4)}`,
      email: `${name.toLowerCase().split(' ')[0]}.${index}@email.com`,
      dependents: index % 4,
      financialStatus: index % 9 === 0 ? 'Inadimplente' : 'Em dia',
      messages: [
        {
          id: `msg-${index}-1`,
          kind: 'entrada',
          title: 'Ligação recebida',
          body: 'Usuária informou que não conseguiu utilizar o benefício odontológico. Relata que o prestador não reconheceu a carteirinha.',
          at: openedAt,
          author: 'Atendente: Juliana Ribeiro',
        },
        {
          id: `msg-${index}-2`,
          kind: 'nota',
          title: 'Encaminhado para análise',
          body: 'Encaminhado para análise com a área de credenciamento.',
          at: new Date(openedAt.getTime() + 2 * 3_600_000),
          author: 'JR',
        },
        {
          id: `msg-${index}-3`,
          kind: 'saida',
          title: 'Ligação realizada',
          body: 'Prestador confirmado na rede. Orientada sobre o procedimento de agendamento.',
          at: new Date(openedAt.getTime() + 20 * 3_600_000),
          author: 'Atendente: Juliana Ribeiro',
        },
      ],
    }
  })
}

export interface MockCommunication {
  id: string
  sentAt: Date
  channel: 'WhatsApp' | 'E-mail' | 'Push' | 'SMS'
  subject: string
  audience: string
  sent: number
  openRate: number
  status: 'Enviado' | 'Agendado' | 'Rascunho'
}

export const COMMUNICATION_TEMPLATES = [
  { id: 'tpl-1', name: 'Boas-vindas', hint: 'Mensagem inicial para novos beneficiários', tone: 'bg-sky-50 text-sky-500' },
  { id: 'tpl-2', name: 'Lembrete de pagamento', hint: 'Aviso de vencimento da mensalidade', tone: 'bg-emerald-50 text-emerald-500' },
  { id: 'tpl-3', name: 'Campanha de vacinação', hint: 'Comunicação sazonal de saúde', tone: 'bg-amber-50 text-amber-500' },
  { id: 'tpl-4', name: 'Novos parceiros', hint: 'Divulgação de parceiros e benefícios', tone: 'bg-violet-50 text-violet-500' },
  { id: 'tpl-5', name: 'Pesquisa de satisfação', hint: 'Coleta de feedback dos beneficiários', tone: 'bg-orange-50 text-orange-500' },
  { id: 'tpl-6', name: 'Comunicado importante', hint: 'Avisos institucionais', tone: 'bg-rose-50 text-rose-500' },
]

export interface MockCampaign {
  id: string
  name: string
  goal: string
  channel: MockCommunication['channel']
  audience: string
  startedAt: Date
  endsAt: Date
  reach: number
  openRate: number
  clickRate: number
  conversions: number
  status: 'Ativa' | 'Agendada' | 'Encerrada'
}

export function buildCampaigns(): MockCampaign[] {
  const base: { name: string; goal: string; channel: MockCommunication['channel']; audience: string; status: MockCampaign['status'] }[] = [
    { name: 'Campanha de vacinação', goal: 'Agendamentos na rede própria', channel: 'WhatsApp', audience: 'Todos os beneficiários', status: 'Ativa' },
    { name: 'Recuperação de inadimplentes', goal: 'Regularizar mensalidades em atraso', channel: 'SMS', audience: 'Inadimplentes', status: 'Ativa' },
    { name: 'Boas-vindas novos associados', goal: 'Ativação da carteirinha digital', channel: 'E-mail', audience: 'Novos beneficiários', status: 'Ativa' },
    { name: 'Upgrade para plano Família', goal: 'Migração de plano', channel: 'WhatsApp', audience: 'Plano Essencial', status: 'Agendada' },
    { name: 'Pesquisa de satisfação (NPS)', goal: 'Coletar NPS do trimestre', channel: 'Push', audience: 'Todos os beneficiários', status: 'Encerrada' },
    { name: 'Novos parceiros da rede', goal: 'Divulgar credenciados', channel: 'E-mail', audience: 'Todos os beneficiários', status: 'Encerrada' },
  ]

  const now = Date.now()
  return base.map((item, i) => ({
    ...item,
    id: `campaign-${i + 1}`,
    startedAt: new Date(now - (30 - i * 4) * 86_400_000),
    endsAt: new Date(now + (i % 3) * 10 * 86_400_000),
    reach: 800 + ((i * 937) % 6400),
    openRate: 52 + ((i * 9) % 38),
    clickRate: 6 + ((i * 5) % 22),
    conversions: 18 + ((i * 31) % 160),
  }))
}

export interface MockNotificationRule {
  id: string
  event: string
  hint: string
  audience: string
  channels: MockCommunication['channel'][]
  active: boolean
}

export const NOTIFICATION_RULES: MockNotificationRule[] = [
  { id: 'rule-1', event: 'Boleto a vencer', hint: 'Enviado 3 dias antes do vencimento', audience: 'Beneficiários', channels: ['WhatsApp', 'E-mail'], active: true },
  { id: 'rule-2', event: 'Boleto em atraso', hint: 'Enviado no 1º e no 7º dia de atraso', audience: 'Inadimplentes', channels: ['SMS', 'WhatsApp'], active: true },
  { id: 'rule-3', event: 'Adesão confirmada', hint: 'Carteirinha digital liberada', audience: 'Novos beneficiários', channels: ['E-mail', 'Push'], active: true },
  { id: 'rule-4', event: 'Consulta agendada', hint: 'Confirmação e lembrete 24h antes', audience: 'Beneficiários', channels: ['Push', 'WhatsApp'], active: true },
  { id: 'rule-5', event: 'Autorização negada', hint: 'Aviso ao beneficiário e ao atendimento', audience: 'Beneficiários', channels: ['E-mail'], active: false },
  { id: 'rule-6', event: 'Novo lead recebido', hint: 'Notifica o vendedor responsável', audience: 'Equipe de vendas', channels: ['Push'], active: true },
  { id: 'rule-7', event: 'Aniversário do associado', hint: 'Mensagem no dia', audience: 'Aniversariantes do mês', channels: ['WhatsApp'], active: false },
]

export function buildCommunications(count = 24): MockCommunication[] {
  const channels: MockCommunication['channel'][] = ['WhatsApp', 'E-mail', 'Push', 'SMS']
  const subjects = [
    'Lembrete de pagamento',
    'Campanha de vacinação',
    'Novos parceiros na rede',
    'Manutenção do sistema',
    'Pesquisa de satisfação',
    'Boas-vindas aos novos beneficiários',
  ]
  const audiences = ['Beneficiários', 'Todos', 'App', 'Inadimplentes', 'Novos beneficiários']
  const now = Date.now()

  return Array.from({ length: count }, (_, i) => {
    const index = i + 1
    return {
      id: `comm-${index}`,
      sentAt: new Date(now - index * 2 * 86_400_000),
      channel: channels[index % channels.length],
      subject: subjects[index % subjects.length],
      audience: audiences[index % audiences.length],
      sent: 1200 + ((index * 431) % 7200),
      openRate: 55 + ((index * 7) % 35),
      status: index % 11 === 0 ? 'Agendado' : 'Enviado',
    }
  })
}
