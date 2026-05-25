import type { User, Seller, Client, Lead, Sale, SalesGoal, Benefit, Dependent } from './types'

// Mock Users
export const mockUsers: (User | Seller | Client)[] = [
  {
    id: 'admin-1',
    name: 'Carlos Administrador',
    email: 'admin@annetec.com.br',
    role: 'admin',
    phone: '(11) 99999-0001',
    createdAt: new Date('2023-01-01'),
  },
  {
    id: 'seller-1',
    name: 'Maria Vendedora',
    email: 'maria@annetec.com.br',
    role: 'seller',
    phone: '(11) 99999-0002',
    region: 'São Paulo - Capital',
    salesGoal: 50000,
    totalSales: 35000,
    commissionRate: 0.15,
    createdAt: new Date('2023-03-15'),
  } as Seller,
  {
    id: 'seller-2',
    name: 'João Consultor',
    email: 'joao@annetec.com.br',
    role: 'seller',
    phone: '(11) 99999-0003',
    region: 'São Paulo - Interior',
    salesGoal: 40000,
    totalSales: 42000,
    commissionRate: 0.12,
    createdAt: new Date('2023-05-20'),
  } as Seller,
  {
    id: 'client-1',
    name: 'Ana Silva Santos',
    email: 'ana@email.com',
    role: 'client',
    phone: '(11) 98765-4321',
    cpf: '123.456.789-00',
    plan: 'Annetec Família',
    planStatus: 'active',
    contractDate: new Date('2024-01-15'),
    cardNumber: 'CA-2024-00001',
    sellerId: 'seller-1',
    dependents: [
      {
        id: 'dep-1',
        name: 'Pedro Silva Santos',
        cpf: '987.654.321-00',
        relationship: 'Filho',
        birthDate: new Date('2015-06-10'),
      },
      {
        id: 'dep-2',
        name: 'Lucas Silva Santos',
        cpf: '456.789.123-00',
        relationship: 'Filho',
        birthDate: new Date('2018-03-22'),
      },
    ],
    createdAt: new Date('2024-01-15'),
  } as Client,
  {
    id: 'client-2',
    name: 'Roberto Oliveira',
    email: 'roberto@email.com',
    role: 'client',
    phone: '(11) 91234-5678',
    cpf: '321.654.987-00',
    plan: 'Annetec Individual',
    planStatus: 'active',
    contractDate: new Date('2024-02-20'),
    cardNumber: 'CA-2024-00002',
    sellerId: 'seller-2',
    dependents: [],
    createdAt: new Date('2024-02-20'),
  } as Client,
]

// Mock Leads
export const mockLeads: Lead[] = [
  {
    id: 'lead-1',
    name: 'Fernanda Costa',
    email: 'fernanda@email.com',
    phone: '(11) 97777-1111',
    source: 'Website',
    status: 'new',
    notes: 'Interessada no plano família',
    value: 2400,
    createdAt: new Date('2024-03-01'),
    updatedAt: new Date('2024-03-01'),
    sellerId: 'seller-1',
    interactions: [],
  },
  {
    id: 'lead-2',
    name: 'Marcos Pereira',
    email: 'marcos@empresa.com',
    phone: '(11) 97777-2222',
    source: 'Indicação',
    status: 'contacted',
    notes: 'Empresa com 15 funcionários',
    value: 18000,
    createdAt: new Date('2024-02-25'),
    updatedAt: new Date('2024-03-02'),
    sellerId: 'seller-1',
    interactions: [
      {
        id: 'int-1',
        type: 'call',
        description: 'Primeira ligação - apresentou interesse',
        date: new Date('2024-03-02'),
      },
    ],
  },
  {
    id: 'lead-3',
    name: 'Juliana Mendes',
    email: 'juliana@email.com',
    phone: '(11) 97777-3333',
    source: 'Instagram',
    status: 'qualified',
    notes: 'Quer incluir 3 dependentes',
    value: 3600,
    createdAt: new Date('2024-02-20'),
    updatedAt: new Date('2024-03-03'),
    sellerId: 'seller-1',
    interactions: [
      {
        id: 'int-2',
        type: 'email',
        description: 'Enviado material informativo',
        date: new Date('2024-02-22'),
      },
      {
        id: 'int-3',
        type: 'call',
        description: 'Tirou dúvidas sobre cobertura odontológica',
        date: new Date('2024-03-01'),
      },
    ],
  },
  {
    id: 'lead-4',
    name: 'Ricardo Almeida',
    email: 'ricardo@empresa.com',
    phone: '(11) 97777-4444',
    source: 'LinkedIn',
    status: 'proposal',
    notes: 'Proposta enviada para 8 colaboradores',
    value: 9600,
    createdAt: new Date('2024-02-15'),
    updatedAt: new Date('2024-03-04'),
    sellerId: 'seller-1',
    interactions: [
      {
        id: 'int-4',
        type: 'meeting',
        description: 'Reunião presencial na empresa',
        date: new Date('2024-02-28'),
      },
      {
        id: 'int-5',
        type: 'email',
        description: 'Proposta comercial enviada',
        date: new Date('2024-03-04'),
      },
    ],
  },
  {
    id: 'lead-5',
    name: 'Carla Rodrigues',
    email: 'carla@email.com',
    phone: '(11) 97777-5555',
    source: 'Evento',
    status: 'negotiation',
    notes: 'Negociando desconto para pagamento anual',
    value: 2160,
    createdAt: new Date('2024-02-10'),
    updatedAt: new Date('2024-03-05'),
    sellerId: 'seller-1',
    interactions: [
      {
        id: 'int-6',
        type: 'call',
        description: 'Apresentação do plano',
        date: new Date('2024-02-12'),
      },
      {
        id: 'int-7',
        type: 'meeting',
        description: 'Visita residencial',
        date: new Date('2024-02-20'),
      },
      {
        id: 'int-8',
        type: 'call',
        description: 'Discussão sobre condições de pagamento',
        date: new Date('2024-03-05'),
      },
    ],
  },
  {
    id: 'lead-6',
    name: 'Paulo Nascimento',
    email: 'paulo@email.com',
    phone: '(11) 97777-6666',
    source: 'Website',
    status: 'closed',
    notes: 'Contrato assinado - plano individual',
    value: 1200,
    createdAt: new Date('2024-01-20'),
    updatedAt: new Date('2024-02-15'),
    sellerId: 'seller-1',
    interactions: [
      {
        id: 'int-9',
        type: 'call',
        description: 'Contato inicial',
        date: new Date('2024-01-22'),
      },
      {
        id: 'int-10',
        type: 'meeting',
        description: 'Assinatura do contrato',
        date: new Date('2024-02-15'),
      },
    ],
  },
  {
    id: 'lead-7',
    name: 'Beatriz Lima',
    email: 'beatriz@email.com',
    phone: '(11) 97777-7777',
    source: 'Indicação',
    status: 'lost',
    notes: 'Optou por outra operadora',
    value: 2400,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-02-20'),
    sellerId: 'seller-1',
    interactions: [
      {
        id: 'int-11',
        type: 'call',
        description: 'Apresentação inicial',
        date: new Date('2024-01-18'),
      },
      {
        id: 'int-12',
        type: 'note',
        description: 'Cliente informou que fechou com concorrente',
        date: new Date('2024-02-20'),
      },
    ],
  },
  // Leads do seller-2
  {
    id: 'lead-8',
    name: 'Sandra Ferreira',
    email: 'sandra@email.com',
    phone: '(19) 98888-1111',
    source: 'Website',
    status: 'new',
    notes: 'Interior SP - Campinas',
    value: 1800,
    createdAt: new Date('2024-03-05'),
    updatedAt: new Date('2024-03-05'),
    sellerId: 'seller-2',
    interactions: [],
  },
  {
    id: 'lead-9',
    name: 'André Souza',
    email: 'andre@empresa.com',
    phone: '(19) 98888-2222',
    source: 'Indicação',
    status: 'proposal',
    notes: 'Empresa de Ribeirão Preto - 25 funcionários',
    value: 30000,
    createdAt: new Date('2024-02-01'),
    updatedAt: new Date('2024-03-06'),
    sellerId: 'seller-2',
    interactions: [
      {
        id: 'int-13',
        type: 'meeting',
        description: 'Visita à empresa',
        date: new Date('2024-02-15'),
      },
      {
        id: 'int-14',
        type: 'email',
        description: 'Proposta corporativa enviada',
        date: new Date('2024-03-06'),
      },
    ],
  },
]

// Mock Sales
export const mockSales: Sale[] = [
  {
    id: 'sale-1',
    clientId: 'client-1',
    clientName: 'Ana Silva Santos',
    sellerId: 'seller-1',
    sellerName: 'Maria Vendedora',
    plan: 'Annetec Família',
    value: 2400,
    commission: 360,
    date: new Date('2024-01-15'),
    status: 'confirmed',
  },
  {
    id: 'sale-2',
    clientId: 'client-2',
    clientName: 'Roberto Oliveira',
    sellerId: 'seller-2',
    sellerName: 'João Consultor',
    plan: 'Annetec Individual',
    value: 1200,
    commission: 144,
    date: new Date('2024-02-20'),
    status: 'confirmed',
  },
  {
    id: 'sale-3',
    clientId: '',
    clientName: 'Paulo Nascimento',
    sellerId: 'seller-1',
    sellerName: 'Maria Vendedora',
    plan: 'Annetec Individual',
    value: 1200,
    commission: 180,
    date: new Date('2024-02-15'),
    status: 'confirmed',
  },
  {
    id: 'sale-4',
    clientId: '',
    clientName: 'Empresa XYZ Ltda',
    sellerId: 'seller-2',
    sellerName: 'João Consultor',
    plan: 'Annetec Empresarial',
    value: 12000,
    commission: 1440,
    date: new Date('2024-03-01'),
    status: 'pending',
  },
]

// Mock Sales Goals
export const mockSalesGoals: SalesGoal[] = [
  {
    id: 'goal-1',
    sellerId: 'seller-1',
    month: 3,
    year: 2024,
    target: 50000,
    achieved: 35000,
    commissionRate: 0.15,
  },
  {
    id: 'goal-2',
    sellerId: 'seller-2',
    month: 3,
    year: 2024,
    target: 40000,
    achieved: 42000,
    commissionRate: 0.12,
  },
]

// Mock Benefits
export const mockBenefits: Benefit[] = [
  {
    id: 'benefit-1',
    name: 'Teleorientação em Saúde 24h',
    description: 'Orientação médica por telefone ou vídeo, disponível 24 horas por dia, 7 dias por semana.',
    category: 'health',
  },
  {
    id: 'benefit-2',
    name: 'Consultas Preventivas',
    description: 'Consultas com ginecologista, pediatra e geriatra sem custo adicional.',
    category: 'health',
  },
  {
    id: 'benefit-3',
    name: 'Plano Odontológico',
    description: 'Cobertura odontológica completa incluindo procedimentos estéticos.',
    category: 'dental',
  },
  {
    id: 'benefit-4',
    name: 'Desconto Farmácia',
    description: 'Até 60% de desconto em medicamentos nas farmácias parceiras.',
    category: 'pharmacy',
    discount: 60,
  },
  {
    id: 'benefit-5',
    name: 'Auxílio Funeral',
    description: 'Reembolso de até R$ 3.000 para despesas com funeral.',
    category: 'funeral',
  },
  {
    id: 'benefit-6',
    name: 'Club de Vantagens',
    description: 'Descontos exclusivos em alimentação, lazer, educação e muito mais.',
    category: 'discount',
  },
]

// Login credentials for mock auth
export const mockCredentials = [
  { email: 'admin@annetec.com.br', password: 'admin123', userId: 'admin-1' },
  { email: 'maria@annetec.com.br', password: 'seller123', userId: 'seller-1' },
  { email: 'joao@annetec.com.br', password: 'seller123', userId: 'seller-2' },
  { email: 'ana@email.com', password: 'client123', userId: 'client-1' },
  { email: 'roberto@email.com', password: 'client123', userId: 'client-2' },
]

// Helper functions
export function getUserById(id: string): User | Seller | Client | undefined {
  return mockUsers.find(user => user.id === id)
}

export function getUserByEmail(email: string): User | Seller | Client | undefined {
  return mockUsers.find(user => user.email === email)
}

export function getLeadsBySellerId(sellerId: string): Lead[] {
  return mockLeads.filter(lead => lead.sellerId === sellerId)
}

export function getSalesBySellerId(sellerId: string): Sale[] {
  return mockSales.filter(sale => sale.sellerId === sellerId)
}

export function getClientsBySellerId(sellerId: string): Client[] {
  return mockUsers.filter(user => user.role === 'client' && (user as Client).sellerId === sellerId) as Client[]
}

export function getAllSellers(): Seller[] {
  return mockUsers.filter(user => user.role === 'seller') as Seller[]
}

export function getAllClients(): Client[] {
  return mockUsers.filter(user => user.role === 'client') as Client[]
}
