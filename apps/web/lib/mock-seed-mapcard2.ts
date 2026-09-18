import type { Appointment, Benefit, Client, ClientPlan, Lead, Partner, Sale, Seller } from './types'

/**
 * Base de demonstração do inquilino MapCard2, usada na apresentação ao
 * cliente. Fica separada de `mock-seed.ts` porque é volumosa e descartável:
 * quando o painel passar a ler do banco, some este arquivo inteiro.
 *
 * O id precisa casar com o `organization.id` do inquilino no banco — é por
 * ele que as coleções de `lib/actions/*` filtram, e `useTenant()` devolve o
 * registro real vindo da API:
 *
 *   select id from organization where slug = 'mapcard2';
 */
export const MAPCARD2_TENANT_ID = 'de3bc135-e287-42ac-8c79-280571c8c3fe'

/**
 * Adesões por mês nos últimos 10 meses (mais antigo primeiro), somando 432
 * beneficiários. A curva crescente é o que o gráfico "Evolução de
 * Beneficiários" desenha.
 */
const ADMISSIONS_PER_MONTH = [18, 22, 26, 30, 34, 38, 42, 52, 62, 108]

/** Participação de cada plano, na proporção do painel aprovado. */
const PLANS = [
  {
    name: 'Essencial',
    price: 29.9,
    weight: 35,
    audience: 'Individual',
    description: 'Cuidado na medida certa para o seu dia a dia.',
    features: [
      'Consultas nas clínicas próprias',
      'Descontos em exames e procedimentos',
      'Telemedicina',
      'Assistência funeral (opcional)',
    ],
  },
  {
    name: 'Plus',
    price: 49.9,
    weight: 28,
    audience: 'Individual',
    highlight: true,
    description: 'Mais cobertura para quem usa com frequência.',
    features: [
      'Consultas nas clínicas próprias',
      'Descontos em exames e procedimentos',
      'Telemedicina ilimitada',
      'Assistência funeral',
      'Clube de descontos',
    ],
  },
  {
    name: 'Família',
    price: 69.9,
    weight: 22,
    audience: 'Família',
    description: 'Mais benefícios para quem você mais ama.',
    features: [
      'Consultas nas clínicas próprias',
      'Descontos em exames e procedimentos',
      'Telemedicina para toda a família',
      'Assistência funeral',
      'Clube de descontos',
      'Até 4 dependentes inclusos',
    ],
  },
  {
    name: 'Odonto',
    price: 19.9,
    weight: 15,
    audience: 'Individual',
    description: 'Sorriso sempre em dia, com rede credenciada.',
    features: [
      'Consultas odontológicas',
      'Limpeza e profilaxia',
      'Urgência odontológica 24h',
      'Descontos em ortodontia',
    ],
  },
]

const SELLERS = [
  { name: 'Carlos Mendes', region: 'Rio de Janeiro - Capital', goal: 60000 },
  { name: 'Fernanda Lima', region: 'Baixada Fluminense', goal: 45000 },
  { name: 'Roberto Alves', region: 'Região dos Lagos', goal: 40000 },
  { name: 'Juliana Costa', region: 'Niterói e São Gonçalo', goal: 50000 },
  { name: 'Marcelo Rocha', region: 'Rio de Janeiro - Zona Oeste', goal: 42000 },
]

const FIRST_NAMES = [
  'Ana', 'Bruno', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique',
  'Isabela', 'João', 'Karina', 'Lucas', 'Mariana', 'Nathan', 'Olívia', 'Paulo',
  'Renata', 'Rafael', 'Sabrina', 'Thiago', 'Vanessa', 'Vitor', 'Wagner', 'Yara', 'Zeca',
]

const LAST_NAMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Almeida',
  'Ribeiro', 'Carvalho', 'Gomes', 'Martins', 'Rocha', 'Barbosa', 'Araújo',
]

const LEAD_SOURCES = ['Site', 'Indicação', 'Campanha', 'Evento', 'Redes Sociais', 'Parceiro']

const CITIES = [
  'Rio de Janeiro - RJ',
  'Niterói - RJ',
  'São Gonçalo - RJ',
  'São Pedro da Aldeia - RJ',
  'Cabo Frio - RJ',
  'Nova Iguaçu - RJ',
  'Duque de Caxias - RJ',
  'Petrópolis - RJ',
]

const APPOINTMENT_KINDS = ['Consulta', 'Exame', 'Telemedicina', 'Odontologia']

const APPOINTMENT_PROVIDERS = [
  'Clínica Vida Plena',
  'LabExames',
  'Clínica MapCard Centro',
  'Odonto Sorriso',
  'Ailine Telemedicina',
]

/** Leads criados por mês nos últimos 3 meses, mais antigo primeiro. */
const LEADS_PER_MONTH = [45, 55, 80]

/**
 * Mistura de etapas do funil: 100 posições distribuídas na proporção de uma
 * carteira real — muita gente no topo, pouca fechando. Sortear por índice
 * nesta lista é o que afunila o funil, em vez de deixar todas as etapas com
 * o mesmo tamanho.
 */
const LEAD_STATUS_MIX: Lead['status'][] = [
  ...Array<Lead['status']>(30).fill('new'),
  ...Array<Lead['status']>(22).fill('contacted'),
  ...Array<Lead['status']>(13).fill('qualified'),
  ...Array<Lead['status']>(8).fill('proposal'),
  ...Array<Lead['status']>(14).fill('negotiation'),
  ...Array<Lead['status']>(8).fill('closed'),
  ...Array<Lead['status']>(5).fill('lost'),
]

function slugify(value: string): string {
  // Em NFD o acento vira um caractere próprio na faixa U+0300–U+036F, então
  // descartar essa faixa basta — e evita um regex com marca combinante no
  // código-fonte, que editor e ferramenta costumam embaralhar.
  return Array.from(value.normalize('NFD'))
    .filter(char => {
      const code = char.codePointAt(0) ?? 0
      return code < 0x300 || code > 0x36f
    })
    .join('')
    .toLowerCase()
}

function personName(index: number): string {
  return `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[(index * 7) % LAST_NAMES.length]}`
}

/** Dígitos estáveis por índice — documento de vitrine, não CPF válido. */
function fakeCpf(index: number): string {
  const digits = String(10000000000 + index * 7919).slice(0, 11)
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

function fakePhone(index: number): string {
  return `(21) 9${String(1000 + (index % 9000))}-${String(1000 + ((index * 31) % 9000))}`
}

/**
 * Nenhum contrato pode ser assinado no futuro. Sem este corte, o mês corrente
 * gerava adesões até o dia 27 mesmo sendo dia 18 — e aí qualquer registro
 * criado agora caía no FIM de toda lista ordenada por data, dando a impressão
 * de que a gravação não tinha funcionado.
 */
function noFuture(date: Date): Date {
  const today = new Date()
  return date > today ? today : date
}

/** Início do mês a N meses atrás do mês corrente. */
function monthStart(monthsAgo: number): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1)
}

function planFor(index: number) {
  const total = PLANS.reduce((sum, plan) => sum + plan.weight, 0)
  let cursor = index % total
  for (const plan of PLANS) {
    if (cursor < plan.weight) return plan
    cursor -= plan.weight
  }
  return PLANS[0]
}

function build() {
  const sellers: Seller[] = SELLERS.map((seller, i) => ({
    id: `mc2-seller-${i + 1}`,
    tenantId: MAPCARD2_TENANT_ID,
    name: seller.name,
    email: `${slugify(seller.name.split(' ')[0])}@mapcard2.com.br`,
    role: 'seller',
    phone: fakePhone(i),
    region: seller.region,
    salesGoal: seller.goal,
    totalSales: 0,
    commissionRate: 0.12,
    createdAt: monthStart(11),
  }))

  const clients: Client[] = []
  const sales: Sale[] = []
  const months = ADMISSIONS_PER_MONTH.length
  let index = 0

  ADMISSIONS_PER_MONTH.forEach((admissions, monthOffset) => {
    const start = monthStart(months - 1 - monthOffset)

    for (let n = 0; n < admissions; n++) {
      index += 1
      const plan = planFor(index)
      const seller = sellers[index % sellers.length]
      const name = personName(index)
      // Espalha as adesões ao longo do mês sem estourar para o mês seguinte.
      const day = 1 + (index * 3) % 27
      const contractDate = noFuture(new Date(start.getFullYear(), start.getMonth(), day))

      // Poucos pendentes e cancelados: o suficiente para as três cores de
      // status aparecerem nas listas sem descaracterizar a carteira.
      const planStatus: Client['planStatus'] =
        index % 29 === 0 ? 'cancelled' : index % 13 === 0 ? 'pending' : 'active'

      clients.push({
        id: `mc2-client-${index}`,
        tenantId: MAPCARD2_TENANT_ID,
        name,
        email: `${slugify(name).replace(' ', '.')}${index}@email.com`,
        role: 'client',
        phone: fakePhone(index),
        cpf: fakeCpf(index),
        city: CITIES[index % CITIES.length],
        plan: plan.name,
        planStatus,
        contractDate,
        cardNumber: `MC-${contractDate.getFullYear()}-${String(index).padStart(5, '0')}`,
        sellerId: seller.id,
        // Só o plano Família carrega dependentes — é o que distingue os
        // planos entre si na ficha do beneficiário.
        dependents:
          plan.name === 'Família'
            ? Array.from({ length: 2 + (index % 2) }, (_, d) => ({
                id: `mc2-dep-${index}-${d + 1}`,
                name: `${FIRST_NAMES[(index + d * 5) % FIRST_NAMES.length]} ${name.split(' ')[1]}`,
                cpf: fakeCpf(index * 10 + d),
                relationship: d === 0 ? 'Cônjuge' : 'Filho(a)',
                birthDate: new Date(1985 + ((index + d) % 30), (index + d) % 12, 1 + ((index + d) % 27)),
              }))
            : [],
        createdAt: contractDate,
      })

      sales.push({
        id: `mc2-sale-${index}`,
        tenantId: MAPCARD2_TENANT_ID,
        clientId: `mc2-client-${index}`,
        clientName: name,
        sellerId: seller.id,
        sellerName: seller.name,
        plan: plan.name,
        source: LEAD_SOURCES[index % LEAD_SOURCES.length],
        value: plan.price,
        commission: Number((plan.price * 0.12).toFixed(2)),
        date: contractDate,
        status: planStatus === 'cancelled' ? 'cancelled' : planStatus === 'pending' ? 'pending' : 'confirmed',
      })
    }
  })

  // Histórico de atendimentos: alimenta "Últimos Atendimentos" na ficha do
  // beneficiário. Três por pessoa deixa toda ficha com lista cheia sem
  // inchar demais o localStorage.
  const appointments: Appointment[] = []

  clients.forEach((client, i) => {
    for (let n = 0; n < 3; n++) {
      const seed = i * 3 + n
      const kind = APPOINTMENT_KINDS[seed % APPOINTMENT_KINDS.length]
      const provider = APPOINTMENT_PROVIDERS[seed % APPOINTMENT_PROVIDERS.length]

      appointments.push({
        id: `mc2-apt-${seed + 1}`,
        tenantId: MAPCARD2_TENANT_ID,
        clientId: client.id,
        clientName: client.name,
        kind,
        provider,
        description: `${kind} em ${provider}`,
        status: seed % 11 === 0 ? 'aguardando' : 'concluido',
        createdAt: new Date(Date.now() - (((seed * 17) % 300) + 5) * 86_400_000),
      })
    }
  })

  // Leads dos últimos 3 meses — o funil que a tela de Leads consome.
  const leads: Lead[] = []
  let leadIndex = 0

  LEADS_PER_MONTH.forEach((count, monthOffset) => {
    const start = monthStart(LEADS_PER_MONTH.length - 1 - monthOffset)

    for (let n = 0; n < count; n++) {
      leadIndex += 1
      const name = personName(leadIndex + 500)
      const plan = planFor(leadIndex)
      const createdAt = noFuture(
        new Date(start.getFullYear(), start.getMonth(), 1 + (leadIndex * 3) % 27),
      )

      leads.push({
        id: `mc2-lead-${leadIndex}`,
        tenantId: MAPCARD2_TENANT_ID,
        name,
        email: `${slugify(name).replace(' ', '.')}${leadIndex}@email.com`,
        phone: fakePhone(leadIndex + 500),
        source: LEAD_SOURCES[leadIndex % LEAD_SOURCES.length],
        // Passo 37 sobre 100 posições: coprimos, então percorre a mistura
        // inteira sem repetir o mesmo status em linhas seguidas da tabela.
        status: LEAD_STATUS_MIX[(leadIndex * 37) % LEAD_STATUS_MIX.length],
        interest: `Plano ${plan.name}`,
        notes: `Interesse no plano ${plan.name}`,
        value: plan.price,
        createdAt,
        updatedAt: createdAt,
        sellerId: sellers[leadIndex % sellers.length].id,
        interactions: [],
      })
    }
  })

  return { sellers, clients, sales, leads, appointments }
}

const generated = build()

export const mapcard2Users: (Seller | Client)[] = [...generated.sellers, ...generated.clients]
export const mapcard2Sales: Sale[] = generated.sales
export const mapcard2Leads: Lead[] = generated.leads
export const mapcard2Appointments: Appointment[] = generated.appointments

export const mapcard2ClientPlans: ClientPlan[] = PLANS.map((plan, i) => ({
  id: `mc2-plan-${i + 1}`,
  tenantId: MAPCARD2_TENANT_ID,
  name: plan.name,
  priceMonthly: plan.price,
  description: plan.description,
  features: plan.features,
  highlight: plan.highlight,
  audience: plan.audience,
}))

const PARTNER_BASE: {
  name: string
  tagline: string
  category: Partner['category']
  discountPercent: number
  specialties: string[]
}[] = [
  { name: 'Clínica Vida Mais', tagline: 'Cuidando de você sempre', category: 'health', discountPercent: 30, specialties: ['Clínica Geral', 'Cardiologia', 'Ginecologia'] },
  { name: 'LabExames', tagline: 'Resultados com confiança', category: 'health', discountPercent: 35, specialties: ['Análises Clínicas', 'Toxicológico'] },
  { name: 'OdontoTop', tagline: 'Sorriso para todos', category: 'dental', discountPercent: 25, specialties: ['Odontologia', 'Radiologia'] },
  { name: 'Clínica Bem Estar', tagline: 'Saúde em primeiro lugar', category: 'health', discountPercent: 22, specialties: ['Fisioterapia', 'Ortopedia'] },
  { name: 'ExameFácil', tagline: 'Diagnóstico ao seu alcance', category: 'health', discountPercent: 28, specialties: ['Imagem', 'Laboratório'] },
  { name: 'Visão Total', tagline: 'Cuidando da sua visão', category: 'other', discountPercent: 18, specialties: ['Oftalmologia', 'Óptica'] },
  { name: 'FisioVida', tagline: 'Movimento para uma vida melhor', category: 'wellness', discountPercent: 20, specialties: ['Fisioterapia', 'Pilates'] },
  { name: 'CardioMais', tagline: 'Seu coração em boas mãos', category: 'health', discountPercent: 26, specialties: ['Cardiologia'] },
  { name: 'Multiimagem', tagline: 'Imagens que geram confiança', category: 'health', discountPercent: 30, specialties: ['Radiologia', 'Ultrassonografia'] },
  { name: 'Clínica da Mulher', tagline: 'Saúde feminina em todas as fases', category: 'health', discountPercent: 24, specialties: ['Ginecologia', 'Obstetrícia'] },
  { name: 'Drogaria Central', tagline: 'Sua farmácia de confiança', category: 'pharmacy', discountPercent: 15, specialties: ['Medicamentos'] },
  { name: 'Sabor & Saúde', tagline: 'Comer bem todo dia', category: 'food', discountPercent: 12, specialties: ['Alimentação'] },
  { name: 'Academia Corpo Ativo', tagline: 'Movimento é vida', category: 'wellness', discountPercent: 20, specialties: ['Musculação', 'Funcional'] },
  { name: 'Curso Avance', tagline: 'Conhecimento que transforma', category: 'education', discountPercent: 40, specialties: ['Idiomas', 'Preparatório'] },
]

const PARTNER_CITIES = [
  'São Pedro da Aldeia - RJ',
  'Cabo Frio - RJ',
  'Rio das Ostras - RJ',
  'Iguaba Grande - RJ',
  'Araruama - RJ',
]

/**
 * A rede credenciada é a base que a tela de parceiros lista e pagina: cada
 * marca aparece em algumas cidades, como acontece de fato num clube regional.
 */
export const mapcard2Partners: Partner[] = PARTNER_BASE.flatMap((partner, i) =>
  PARTNER_CITIES.slice(0, 2 + (i % 3)).map((city, c) => {
    const index = i * 5 + c
    return {
      ...partner,
      id: `mc2-partner-${index + 1}`,
      tenantId: MAPCARD2_TENANT_ID,
      address: `${['Rua das Flores', 'Av. Brasil', 'Rua do Sol', 'Av. Teixeira e Souza', 'Rua das Palmeiras'][c % 5]}, ${100 + index * 7}`,
      city,
      phone: `(22) 26${String(21 + (index % 60)).padStart(2, '0')}-${String(1000 + index * 13).slice(0, 4)}`,
      email: `contato@${slugify(partner.name).replace(/[^a-z0-9]/g, '')}.com.br`,
      website: `www.${slugify(partner.name).replace(/[^a-z0-9]/g, '')}.com.br`,
      since: new Date(2019 + (index % 6), index % 12, 1 + (index % 27)),
      // Uma minoria fora do ar dá à coluna de status as três cores da tela.
      status: index % 17 === 0 ? 'inactive' : 'active',
    }
  }),
)

export const mapcard2Benefits: Benefit[] = [
  {
    id: 'mc2-benefit-1',
    tenantId: MAPCARD2_TENANT_ID,
    name: 'Telemedicina 24h',
    description: 'Atendimento médico por vídeo, sem custo adicional.',
    category: 'health',
    provider: 'Digital Saúde',
    locations: ['Nacional'],
  },
  {
    id: 'mc2-benefit-2',
    tenantId: MAPCARD2_TENANT_ID,
    name: 'Desconto em farmácias',
    description: 'Até 30% em medicamentos da rede conveniada.',
    category: 'pharmacy',
    discount: 30,
    locations: ['RJ', 'SP'],
  },
  {
    id: 'mc2-benefit-3',
    tenantId: MAPCARD2_TENANT_ID,
    name: 'Rede odontológica',
    description: 'Consultas e procedimentos com desconto em toda a rede.',
    category: 'dental',
    discount: 25,
    locations: ['RJ'],
  },
  {
    id: 'mc2-benefit-4',
    tenantId: MAPCARD2_TENANT_ID,
    name: 'Assistência funeral',
    description: 'Cobertura familiar sem carência após 90 dias.',
    category: 'funeral',
    provider: 'Grupo Amparo',
    locations: ['Nacional'],
  },
  {
    id: 'mc2-benefit-5',
    tenantId: MAPCARD2_TENANT_ID,
    name: 'Consultas',
    description: 'Consultas em clínicas da rede credenciada com valor fixo.',
    category: 'health',
    locations: ['RJ'],
  },
  {
    id: 'mc2-benefit-6',
    tenantId: MAPCARD2_TENANT_ID,
    name: 'Clube de Descontos',
    description: 'Vantagens em comércio, lazer e educação na rede parceira.',
    category: 'discount',
    discount: 20,
    locations: ['Nacional'],
  },
]
