import { hashPassword } from 'better-auth/crypto'
import { and, eq } from 'drizzle-orm'
import { db, sql } from './client'
import {
  account,
  appointmentMessages,
  appointments,
  benefits,
  clientProfiles,
  clubPlans,
  leadInteractions,
  leads,
  member,
  organization,
  partners,
  sales,
  salesGoals,
  sellerProfiles,
  user,
} from './schema'
import { logger } from '@/lib/logger'

// Trava de produção: seeds/scripts de demonstração gravam contas com senha
// trivial e dados fictícios. Em produção só rodam com liberação explícita.
// (Avaliado depois dos imports — `./client` só conecta na primeira query.)
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IN_PRODUCTION !== '1') {
  console.error(
    `[seed-demo-inquilino] Abortado: NODE_ENV=production. Este script não roda em produção.\n` +
      'Se for mesmo intencional, rode de novo com ALLOW_SEED_IN_PRODUCTION=1.',
  )
  process.exit(1)
}

/**
 * Popula a carteira de UM inquilino com dados de demonstração — no banco de
 * verdade, não no localStorage do navegador.
 *
 * Por que existe: o painel do inquilino nasceu consumindo mocks em
 * localStorage. Ao religá-lo na API, a tela passa a ler o Postgres — e a
 * carteira de demonstração (que só existia no navegador) simplesmente some.
 * Este script leva os mesmos volumes para o banco, para a apresentação
 * continuar de pé depois da migração.
 *
 *   pnpm --filter @annetec/api demo:seed mapcard2
 *   pnpm --filter @annetec/api demo:seed mapcard2 --limpar
 *
 * É idempotente: rodar de novo não duplica (procura pelo e-mail/nome).
 * `--limpar` apaga o que este script criou antes de recriar.
 */

const ADESOES_POR_MES = [18, 22, 26, 30, 34, 38, 42, 52, 62, 108]
const LEADS_POR_MES = [45, 55, 80]

const PLANOS = [
  {
    nome: 'Essencial',
    preco: 29.9,
    peso: 35,
    publico: 'Individual',
    destaque: false,
    descricao: 'Cobertura básica para quem quer começar a se cuidar sem pesar no bolso.',
    coberturas: ['Telemedicina 24h', 'Desconto em farmácia', 'Clube de vantagens'],
  },
  {
    nome: 'Plus',
    preco: 49.9,
    peso: 28,
    publico: 'Individual',
    destaque: true,
    descricao: 'O mais escolhido: consultas e exames com a rede credenciada completa.',
    coberturas: ['Tudo do Essencial', 'Consultas na rede', 'Exames laboratoriais', 'Odontologia básica'],
  },
  {
    nome: 'Família',
    preco: 69.9,
    peso: 22,
    publico: 'Famílias',
    destaque: false,
    descricao: 'Até quatro dependentes na mesma mensalidade.',
    coberturas: ['Tudo do Plus', 'Até 4 dependentes', 'Assistência funeral', 'Segunda opinião médica'],
  },
  {
    nome: 'Odonto',
    preco: 19.9,
    peso: 15,
    publico: 'Individual',
    destaque: false,
    descricao: 'Só odontologia, para quem já tem plano de saúde.',
    coberturas: ['Limpeza semestral', 'Restaurações', 'Urgência odontológica'],
  },
]

/** O que o associado escreveu, e o assunto sob o qual a mesa arquiva. */
const PEDIDOS = [
  'Não consigo agendar consulta pelo aplicativo.',
  'Quero incluir minha filha como dependente.',
  'A carteirinha digital não está carregando.',
  'Preciso da segunda via do boleto deste mês.',
  'O laboratório disse que meu plano não cobre o exame.',
  'Quero trocar do Essencial para o Plus.',
  'Mudei de endereço, como atualizo o cadastro?',
  'Fui cobrado duas vezes na mesma competência.',
  'A clínica não encontrou meu cadastro na rede.',
  'Como funciona a carência para odontologia?',
]

const ASSUNTOS_CHAMADO = [
  'Agendamento pelo aplicativo',
  'Inclusão de dependente',
  'Carteirinha digital',
  'Segunda via de boleto',
  'Cobertura de exame',
  'Troca de plano',
  'Atualização cadastral',
  'Cobrança em duplicidade',
  'Cadastro na rede',
  'Carência',
]

const CANAIS = ['telefone', 'whatsapp', 'email', 'app', 'presencial'] as const
const PRIORIDADES = ['alta', 'normal', 'baixa'] as const

/** Percorre os seis estados para a mesa abrir com todas as abas populadas. */
const SITUACOES_CHAMADO = [
  'aguardando',
  'em_atendimento',
  'aguardando_usuario',
  'aguardando_terceiro',
  'resolvido',
  'encerrado',
] as const

const VENDEDORES = [
  { nome: 'Carlos Mendes', regiao: 'Rio de Janeiro - Capital', meta: 60000 },
  { nome: 'Fernanda Lima', regiao: 'Baixada Fluminense', meta: 45000 },
  { nome: 'Roberto Alves', regiao: 'Região dos Lagos', meta: 40000 },
  { nome: 'Juliana Costa', regiao: 'Niterói e São Gonçalo', meta: 50000 },
  { nome: 'Marcelo Rocha', regiao: 'Rio de Janeiro - Zona Oeste', meta: 42000 },
]

const NOMES = [
  'Ana', 'Bruno', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique',
  'Isabela', 'João', 'Karina', 'Lucas', 'Mariana', 'Nathan', 'Olívia', 'Paulo',
  'Renata', 'Rafael', 'Sabrina', 'Thiago', 'Vanessa', 'Vitor', 'Wagner', 'Yara', 'Zeca',
]

const SOBRENOMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Almeida',
  'Ribeiro', 'Carvalho', 'Gomes', 'Martins', 'Rocha', 'Barbosa', 'Araújo',
]

const ORIGENS = ['Site', 'Indicação', 'Campanha', 'Evento', 'Redes Sociais', 'Parceiro']

const CIDADES = [
  'São Pedro da Aldeia - RJ', 'Cabo Frio - RJ', 'Rio das Ostras - RJ',
  'Iguaba Grande - RJ', 'Araruama - RJ', 'Niterói - RJ',
]

/**
 * Mistura de etapas do funil: muita gente no topo, pouca fechando. Sortear por
 * índice nesta lista é o que afunila o funil em vez de deixar as sete etapas
 * com o mesmo tamanho.
 */
const MIX_ETAPAS = [
  ...Array<string>(30).fill('new'),
  ...Array<string>(22).fill('contacted'),
  ...Array<string>(13).fill('qualified'),
  ...Array<string>(8).fill('proposal'),
  ...Array<string>(14).fill('negotiation'),
  ...Array<string>(8).fill('closed'),
  ...Array<string>(5).fill('lost'),
] as ('new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'closed' | 'lost')[]

const PARCEIROS = [
  { nome: 'Clínica Vida Mais', categoria: 'health', desconto: 30,
    frase: 'Consultas em até 48h', especialidades: ['Clínica Geral', 'Pediatria', 'Ortopedia'] },
  { nome: 'LabExames', categoria: 'health', desconto: 35,
    frase: 'Resultado em 24h pelo aplicativo', especialidades: ['Análises Clínicas', 'Imagem'] },
  { nome: 'OdontoTop', categoria: 'dental', desconto: 25,
    frase: 'Avaliação sem custo', especialidades: ['Odontologia Geral', 'Ortodontia'] },
  { nome: 'Clínica Bem Estar', categoria: 'health', desconto: 22,
    frase: 'Atendimento humanizado', especialidades: ['Psicologia', 'Nutrição'] },
  { nome: 'Visão Total', categoria: 'other', desconto: 18,
    frase: 'Exame de vista gratuito', especialidades: ['Oftalmologia', 'Óptica'] },
  { nome: 'FisioVida', categoria: 'wellness', desconto: 20,
    frase: 'Reabilitação com acompanhamento', especialidades: ['Fisioterapia', 'RPG'] },
  { nome: 'CardioMais', categoria: 'health', desconto: 26,
    frase: 'Check-up cardiológico completo', especialidades: ['Cardiologia'] },
  { nome: 'Clínica da Mulher', categoria: 'health', desconto: 24,
    frase: 'Saúde da mulher em um só lugar', especialidades: ['Ginecologia', 'Mastologia'] },
  { nome: 'Drogaria Central', categoria: 'pharmacy', desconto: 15,
    frase: 'Desconto em medicamentos de uso contínuo', especialidades: ['Medicamentos', 'Perfumaria'] },
  { nome: 'Sabor & Saúde', categoria: 'food', desconto: 12,
    frase: 'Refeições balanceadas', especialidades: ['Alimentação Saudável'] },
  { nome: 'Academia Corpo Ativo', categoria: 'wellness', desconto: 20,
    frase: 'Sem taxa de matrícula', especialidades: ['Musculação', 'Funcional', 'Pilates'] },
  { nome: 'Curso Avance', categoria: 'education', desconto: 40,
    frase: 'Cursos livres e profissionalizantes', especialidades: ['Idiomas', 'Informática'] },
] as const

const BENEFICIOS = [
  { nome: 'Telemedicina 24h', categoria: 'health', descricao: 'Atendimento médico por vídeo, sem custo adicional.', fornecedor: 'Digital Saúde' },
  { nome: 'Desconto em farmácias', categoria: 'pharmacy', descricao: 'Até 30% em medicamentos da rede conveniada.', desconto: 30 },
  { nome: 'Rede odontológica', categoria: 'dental', descricao: 'Consultas e procedimentos com desconto em toda a rede.', desconto: 25 },
  { nome: 'Assistência funeral', categoria: 'funeral', descricao: 'Cobertura familiar sem carência após 90 dias.', fornecedor: 'Grupo Amparo' },
  { nome: 'Consultas', categoria: 'health', descricao: 'Consultas em clínicas da rede credenciada com valor fixo.' },
  { nome: 'Clube de Descontos', categoria: 'discount', descricao: 'Vantagens em comércio, lazer e educação.', desconto: 20 },
] as const

function nomePessoa(i: number): string {
  return `${NOMES[i % NOMES.length]} ${SOBRENOMES[(i * 7) % SOBRENOMES.length]}`
}

/** Dígitos estáveis por índice — documento de vitrine, não CPF válido. */
function cpfDemo(i: number): string {
  const d = String(10000000000 + i * 7919).slice(0, 11)
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** `yyyy-MM-dd` de N dias atrás — formato que a coluna `date` aceita. */
function umaDataDe(diasAtras: number): string {
  return new Date(Date.now() - diasAtras * 86_400_000).toISOString().slice(0, 10)
}

function telefoneDemo(i: number): string {
  return `(22) 9${String(1000 + (i % 9000))}-${String(1000 + ((i * 31) % 9000))}`
}

function semAcento(valor: string): string {
  return Array.from(valor.normalize('NFD'))
    .filter(c => {
      const code = c.codePointAt(0) ?? 0
      return code < 0x300 || code > 0x36f
    })
    .join('')
    .toLowerCase()
}

function inicioDoMes(mesesAtras: number): Date {
  const agora = new Date()
  return new Date(agora.getFullYear(), agora.getMonth() - mesesAtras, 1)
}

/** Contrato não se assina no futuro; corta qualquer data gerada além de hoje. */
function semFuturo(data: Date): Date {
  const hoje = new Date()
  return data > hoje ? hoje : data
}

function planoDe(i: number) {
  const total = PLANOS.reduce((s, p) => s + p.peso, 0)
  let cursor = i % total
  for (const plano of PLANOS) {
    if (cursor < plano.peso) return plano
    cursor -= plano.peso
  }
  return PLANOS[0]!
}

/** Cria `user` + `account` com a MESMA função de hash que o login confere. */
async function criarConta(nome: string, email: string, senha: string) {
  const existente = await db.query.user.findFirst({ where: eq(user.email, email) })
  if (existente) return existente

  const id = crypto.randomUUID()
  const [criado] = await db
    .insert(user)
    .values({ id, name: nome, email, emailVerified: true, role: 'user' })
    .returning()

  await db.insert(account).values({
    id: crypto.randomUUID(),
    userId: id,
    accountId: id,
    providerId: 'credential',
    issuer: 'local:credential',
    password: await hashPassword(senha),
  })

  return criado!
}

async function vincular(orgId: string, userId: string, papel: 'admin' | 'seller' | 'client') {
  const [existente] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
    .limit(1)
  if (existente) return
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    userId,
    role: papel,
  })
}

async function limpar(orgId: string, slug: string) {
  // Ordem importa: interações antes de leads, vendas antes dos vendedores.
  await db.delete(leadInteractions).where(
    sql`lead_id in (select id from leads where organization_id = ${orgId})` as never,
  )
  await db.delete(sales).where(eq(sales.organizationId, orgId))
  await db.delete(salesGoals).where(eq(salesGoals.organizationId, orgId))
  // As mensagens caem junto por cascade na FK do chamado.
  await db.delete(appointments).where(eq(appointments.organizationId, orgId))
  await db.delete(clubPlans).where(eq(clubPlans.organizationId, orgId))
  await db.delete(leads).where(eq(leads.organizationId, orgId))
  await db.delete(partners).where(eq(partners.organizationId, orgId))
  await db.delete(benefits).where(eq(benefits.organizationId, orgId))

  // Só os usuários com e-mail de demonstração; o admin real do inquilino fica.
  // Os padrões saem do SLUG, não fixos: com `mapcard2` embutido, rodar o
  // script em outro inquilino deixava a carteira anterior inteira de pé e a
  // nova era semeada por cima dela.
  //
  // O domínio termina em `.test` (TLD reservado para teste, RFC 2606) e não
  // no próprio slug: `fulano@demo.mapcard2` era recusado pelo validador de
  // e-mail da API — TLD com dígito — e as 432 contas semeadas não conseguiam
  // fazer login nem ser editadas pelo painel.
  await sql`
    delete from "user" u
    using member m
    where m.user_id = u.id
      and m.organization_id = ${orgId}
      and u.email like ${'%.' + slug + '.test'}`
  logger.info('Dados de demonstração anteriores removidos')
}

async function main() {
  const slug = process.argv[2]
  const deveLimpar = process.argv.includes('--limpar')

  if (!slug) {
    console.error('Uso: demo:seed <slug-do-inquilino> [--limpar]')
    process.exit(1)
  }

  const org = await db.query.organization.findFirst({ where: eq(organization.slug, slug) })
  if (!org) {
    console.error(`Inquilino "${slug}" não encontrado.`)
    process.exit(1)
  }

  logger.info({ slug, orgId: org.id }, 'Semeando carteira de demonstração')
  if (deveLimpar) await limpar(org.id, slug)

  // ---- Vendedores --------------------------------------------------------
  const vendedores: { id: string; nome: string; taxa: number }[] = []
  for (const [i, v] of VENDEDORES.entries()) {
    const conta = await criarConta(
      v.nome,
      `${semAcento(v.nome.split(' ')[0]!)}@equipe.${slug}.test`,
      'demo1234',
    )
    await vincular(org.id, conta.id, 'seller')
    await db
      .insert(sellerProfiles)
      .values({
        userId: conta.id,
        organizationId: org.id,
        region: v.regiao,
        salesGoal: String(v.meta),
        commissionRate: '0.1200',
      })
      .onConflictDoNothing()
    vendedores.push({ id: conta.id, nome: v.nome, taxa: 0.12 })
    logger.info({ vendedor: v.nome }, `vendedor ${i + 1}/${VENDEDORES.length}`)
  }

  // ---- Beneficiários + vendas -------------------------------------------
  const meses = ADESOES_POR_MES.length
  let indice = 0
  let criados = 0

  for (const [offset, quantas] of ADESOES_POR_MES.entries()) {
    const inicio = inicioDoMes(meses - 1 - offset)

    for (let n = 0; n < quantas; n++) {
      indice += 1
      const plano = planoDe(indice)
      const vendedor = vendedores[indice % vendedores.length]!
      const nome = nomePessoa(indice)
      const dia = 1 + ((indice * 3) % 27)
      const adesao = semFuturo(new Date(inicio.getFullYear(), inicio.getMonth(), dia))

      const conta = await criarConta(
        nome,
        `${semAcento(nome).replace(' ', '.')}${indice}@assoc.${slug}.test`,
        'demo1234',
      )
      await vincular(org.id, conta.id, 'client')
      await db
        .insert(clientProfiles)
        .values({ userId: conta.id, organizationId: org.id, cpf: cpfDemo(indice) })
        .onConflictDoNothing()

      // Poucos pendentes e cancelados: o suficiente para as três cores de
      // status aparecerem nas listas sem descaracterizar a carteira.
      const situacao =
        indice % 29 === 0 ? 'cancelled' : indice % 13 === 0 ? 'pending' : 'confirmed'

      await db.insert(sales).values({
        organizationId: org.id,
        clientUserId: conta.id,
        clientName: nome,
        sellerId: vendedor.id,
        planName: plano.nome,
        value: String(plano.preco),
        commission: String((plano.preco * vendedor.taxa).toFixed(2)),
        status: situacao,
        soldAt: adesao,
      })
      criados += 1
      if (criados % 50 === 0) logger.info({ criados }, 'beneficiários semeados')
    }
  }

  // ---- Leads + interações ------------------------------------------------
  let iLead = 0
  for (const [offset, quantos] of LEADS_POR_MES.entries()) {
    const inicio = inicioDoMes(LEADS_POR_MES.length - 1 - offset)

    for (let n = 0; n < quantos; n++) {
      iLead += 1
      const nome = nomePessoa(iLead + 500)
      const plano = planoDe(iLead)
      const criadoEm = semFuturo(
        new Date(inicio.getFullYear(), inicio.getMonth(), 1 + ((iLead * 3) % 27)),
      )
      // Passo 37 sobre 100 posições: coprimos, então percorre a mistura
      // inteira sem repetir a mesma etapa em linhas seguidas da tabela.
      const etapa = MIX_ETAPAS[(iLead * 37) % MIX_ETAPAS.length]!

      const [lead] = await db
        .insert(leads)
        .values({
          organizationId: org.id,
          name: nome,
          email: `${semAcento(nome).replace(' ', '.')}${iLead}@email.com`,
          phone: telefoneDemo(iLead + 500),
          source: ORIGENS[iLead % ORIGENS.length]!,
          status: etapa,
          notes: `Interesse no plano ${plano.nome}`,
          estimatedValue: String(plano.preco),
          sellerId: vendedores[iLead % vendedores.length]!.id,
          createdAt: criadoEm,
          updatedAt: criadoEm,
        })
        .returning()

      if (iLead % 3 === 0 && lead) {
        await db.insert(leadInteractions).values({
          leadId: lead.id,
          type: iLead % 2 === 0 ? 'call' : 'whatsapp',
          description: 'Primeiro contato realizado, cliente pediu proposta.',
          occurredAt: criadoEm,
        })
      }
    }
  }

  // ---- Rede credenciada --------------------------------------------------
  for (const [i, p] of PARCEIROS.entries()) {
    for (const cidade of CIDADES.slice(0, 2 + (i % 3))) {
      await db
        .insert(partners)
        .values({
          organizationId: org.id,
          name: p.nome,
          tagline: p.frase,
          category: p.categoria,
          discountPercent: String(p.desconto),
          address: `${['Rua das Flores', 'Av. Brasil', 'Rua do Sol'][i % 3]}, ${100 + i * 7}`,
          city: cidade.split(' - ')[0]!,
          state: 'RJ',
          phone: telefoneDemo(i),
          email: `contato@${semAcento(p.nome).replace(/[^a-z]/g, '')}.test`,
          website: `https://${semAcento(p.nome).replace(/[^a-z]/g, '')}.test`,
          specialties: [...p.especialidades],
          // Credenciamentos escalonados: a coluna "desde" só diz algo se as
          // datas forem diferentes entre si.
          since: umaDataDe(180 + i * 45),
          status: 'active',
        })
        .onConflictDoNothing()
    }
  }

  for (const b of BENEFICIOS) {
    await db
      .insert(benefits)
      .values({
        organizationId: org.id,
        name: b.nome,
        description: b.descricao,
        category: b.categoria,
        ...('desconto' in b ? { discountPercent: String(b.desconto) } : {}),
        ...('fornecedor' in b ? { provider: b.fornecedor } : {}),
      })
      .onConflictDoNothing()
  }

  // ---- Planos do clube ---------------------------------------------------
  // Vitrine comercial do inquilino (`club_plans`), não o catálogo da Digital
  // Saúde: preço e texto de venda são decisão dele, sem contrapartida no ERP.
  for (const plano of PLANOS) {
    await db
      .insert(clubPlans)
      .values({
        organizationId: org.id,
        name: plano.nome,
        description: plano.descricao,
        priceMonthly: String(plano.preco),
        features: plano.coberturas,
        audience: plano.publico,
        highlight: plano.destaque,
      })
      .onConflictDoNothing()
  }

  // ---- Fila de atendimento -----------------------------------------------
  const associados = await db
    .select({ id: member.userId, nome: user.name })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, org.id), eq(member.role, 'client')))
    .limit(PEDIDOS.length)

  for (const [i, associado] of associados.entries()) {
    const situacao = SITUACOES_CHAMADO[i % SITUACOES_CHAMADO.length]!
    // Chamado na fila ainda não tem dono; qualquer outro tem.
    const dono = situacao === 'aguardando' ? null : vendedores[i % vendedores.length]!

    const [chamado] = await db
      .insert(appointments)
      .values({
        organizationId: org.id,
        clientUserId: associado.id,
        clientName: associado.nome,
        subject: ASSUNTOS_CHAMADO[i % ASSUNTOS_CHAMADO.length]!,
        description: PEDIDOS[i % PEDIDOS.length]!,
        channel: CANAIS[i % CANAIS.length]!,
        priority: PRIORIDADES[i % PRIORIDADES.length]!,
        status: situacao,
        assignedUserId: dono?.id ?? null,
      })
      .returning()

    // Thread: o que o associado escreveu, o retorno da equipe e, de vez em
    // quando, a nota interna — que o associado nunca vê.
    await db.insert(appointmentMessages).values([
      {
        appointmentId: chamado!.id,
        kind: 'entrada' as const,
        title: 'Mensagem do associado',
        body: PEDIDOS[i % PEDIDOS.length]!,
        authorName: associado.nome,
      },
      ...(dono
        ? [
            {
              appointmentId: chamado!.id,
              kind: 'saida' as const,
              title: 'Primeiro retorno',
              body: 'Olá! Recebemos seu contato e já estamos verificando. Retornamos em até 24h.',
              authorUserId: dono.id,
              authorName: dono.nome,
            },
          ]
        : []),
      ...(i % 3 === 0 && dono
        ? [
            {
              appointmentId: chamado!.id,
              kind: 'nota' as const,
              title: 'Nota interna',
              body: 'Conferir com a operadora antes de responder em definitivo.',
              authorUserId: dono.id,
              authorName: dono.nome,
            },
          ]
        : []),
    ])
  }

  // ---- Metas comerciais --------------------------------------------------
  // Uma meta por vendedor em cada mês do histórico. `GET /crm/metas` filtra
  // por ano, então semear só o mês corrente deixaria a tela de metas vazia
  // sempre que alguém olhasse o mês anterior.
  for (const vendedor of vendedores) {
    for (let atras = 0; atras < ADESOES_POR_MES.length; atras++) {
      const mes = inicioDoMes(atras)
      await db
        .insert(salesGoals)
        .values({
          organizationId: org.id,
          sellerId: vendedor.id,
          month: mes.getMonth() + 1,
          year: mes.getFullYear(),
          target: String(30000 + ((vendedor.nome.length * 1700) % 25000)),
          commissionRate: String(vendedor.taxa),
        })
        .onConflictDoNothing()
    }
  }

  const [resumo] = await sql`
    select
      (select count(*)::int from member m join "user" u on u.id = m.user_id
        where m.organization_id = ${org.id} and m.role = 'client') as beneficiarios,
      (select count(*)::int from sales where organization_id = ${org.id}) as vendas,
      (select count(*)::int from leads where organization_id = ${org.id}) as leads,
      (select count(*)::int from partners where organization_id = ${org.id}) as parceiros,
      (select count(*)::int from benefits where organization_id = ${org.id}) as beneficios,
      (select count(*)::int from sales_goals where organization_id = ${org.id}) as metas,
      (select count(*)::int from club_plans where organization_id = ${org.id}) as planos,
      (select count(*)::int from appointments where organization_id = ${org.id}) as atendimentos`

  logger.info({ resumo }, 'Carteira de demonstração pronta')
  console.log('\nCarteira de', slug, '→', resumo)
  console.log('Senha das contas de demonstração: demo1234')
  await sql.end()
}

main().catch(async error => {
  logger.error({ err: error }, 'Falha ao semear demonstração')
  await sql.end()
  process.exit(1)
})
