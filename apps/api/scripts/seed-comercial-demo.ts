/**
 * Seed de DEMONSTRAÇÃO de todo o setor comercial (Rede Comercial, `vendas-rede`):
 * estrutura, leads, balcão, comissões e contas com login, na plataforma ANNETEC
 * (escopo `platform`) e no clube (padrão: `mepcard`). Também remove tudo depois.
 *
 *   pnpm --filter @annetec/api exec tsx scripts/seed-comercial-demo.ts [slug] --dry-run
 *   pnpm --filter @annetec/api exec tsx scripts/seed-comercial-demo.ts [slug] --confirmar
 *   ... --confirmar --redefinir-senhas          (gera senha nova para as 9 contas demo)
 *   ... --remover --dry-run | --confirmar       (apaga TODO o dado demo, deste seed e do seed-mepcard-rio)
 *   ... --remover-catalogo --confirmar          (idem + planos, benefícios e parceiros do seed-mepcard-rio)
 *
 * - Pré-requisito: o `seed-mepcard-rio.ts` já rodou (planos do clube). Este seed reaproveita
 *   (por e-mail e por nome) tudo o que ele criou e acrescenta o resto.
 * - Idempotente: procura antes de criar; rodar de novo não duplica nada.
 * - Uma transação por execução. `--dry-run` executa tudo e desfaz (rollback) no fim.
 * - Não chama Asaas, não envia e-mail, não cria assinatura nem cobrança.
 * - Contas: e-mails `@example.com`. As 9 contas de login ganham senha aleatória (impressa UMA vez,
 *   no fim da execução em `--confirmar`; nunca vai para arquivo nem para log).
 * - Tudo é FICTÍCIO: pessoas, empresas, telefones (`21 90000-0NNN`) e CNPJs.
 *
 * Marcas do que é demo (a remoção só apaga o que tem marca):
 *   contas ........ e-mail da lista fixa abaixo (todos `@example.com`)
 *   leads ......... `dados.demo = 'comercial-demo'`  (lead sem a marca NUNCA é apagado)
 *   atendimentos .. agente demo + telefone fictício `21900000NNN`
 *   comissões ..... `cobranca_ref` com prefixo `DEMO-`
 *   estrutura ..... nomes fixos / CNPJs fixos deste arquivo
 */
import { and, eq, inArray, isNull, like, sql as dsql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { hashPassword } from 'better-auth/crypto'
import { randomBytes, randomUUID } from 'node:crypto'
import { db, sql } from '@/db/client'
import {
  account,
  benefits,
  clubPlans,
  clubSubscriptions,
  member,
  organization,
  partners,
  platformSellers,
  sellerProfiles,
  session,
  tenantPlans,
  user,
  vendasAgentes,
  vendasAtendimentosBalcao,
  vendasComissoes,
  vendasConfig,
  vendasCorretoras,
  vendasEquipes,
  vendasLeadEventos,
  vendasLeads,
  vendasUnidades,
} from '@/db/schema'
import {
  cadeiaDoAgente,
  comissoesDaCobranca,
  gerarCodigoIndicacao,
  simularEconomiaBalcao,
  type Atribuicao,
  type ConfigComissao,
  type EtapaLead,
  type OverridesComissao,
  type PapelComercial,
  type TipoEventoLead,
} from '@/modules/vendas-rede/rules'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const confirmar = args.includes('--confirmar')
const redefinirSenhas = args.includes('--redefinir-senhas')
const removerCatalogo = args.includes('--remover-catalogo')
const remover = args.includes('--remover') || removerCatalogo
const slug = args.find(a => !a.startsWith('--')) ?? 'mepcard'

if (!dryRun && !confirmar) {
  console.error(
    'Uso: seed-comercial-demo.ts [slug] --dry-run | --confirmar  [--redefinir-senhas | --remover | --remover-catalogo]\n' +
      'Sem --confirmar (ou --dry-run) nada é gravado. Abortado.',
  )
  process.exit(1)
}
if (remover && redefinirSenhas) {
  console.error('--redefinir-senhas não combina com --remover. Abortado.')
  process.exit(1)
}

const WEB = 'https://www.annetec.org.br'
const MARCA = 'comercial-demo'
const PREFIXO_COBRANCA = 'DEMO-'

// ---------------------------------------------------------------------------
// Tempo (America/Sao_Paulo, sem horário de verão desde 2019: UTC-3 fixo)
// ---------------------------------------------------------------------------

const agora = new Date()
const MIN = 60_000
const H = 3_600_000
const D = 86_400_000
const ymdSP = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const dois = (n: number) => String(n).padStart(2, '0')
/** Dia de São Paulo (hoje + `dias`) às `hora`:`min`. */
function diaSP(dias: number, hora: number, min = 0): Date {
  return new Date(`${ymdSP(new Date(agora.getTime() + dias * D))}T${dois(hora)}:${dois(min)}:00-03:00`)
}
const limitarAoPassado = (d: Date) => new Date(Math.min(d.getTime(), agora.getTime() - 2 * MIN))
const mais = (d: Date, ms: number) => new Date(d.getTime() + ms)

// PRNG determinístico: mesmas datas/horas em toda execução.
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Estrutura da rede
// ---------------------------------------------------------------------------

type Escopo = 'platform' | 'tenant'
type Origem = 'site' | 'indicacao' | 'balcao' | 'prospeccao' | 'evento' | 'redes_sociais' | 'importacao' | 'link' | 'outro'

interface CorretoraSpec {
  escopo: Escopo
  nomeFantasia: string
  razaoSocial: string
  /** CNPJ fictício, dígitos verificadores válidos, conferido na BrasilAPI (404 = não registrado). */
  cnpj: string
  endereco: { logradouro: string; numero: string; bairro: string; cidade: string; uf: 'RJ' }
  unidade: { nome: string; bairro: string; logradouro: string; numero: string }
}

const CORRETORAS: CorretoraSpec[] = [
  {
    escopo: 'platform',
    nomeFantasia: 'Rota Norte Parcerias',
    razaoSocial: 'Rota Norte Intermediação de Negócios Ltda',
    // Verificado em desenvolvimento: BrasilAPI respondeu 404 (CNPJ inexistente).
    cnpj: '92918708000144',
    endereco: { logradouro: 'Rua do Ouvidor', numero: '120', bairro: 'Centro', cidade: 'Rio de Janeiro', uf: 'RJ' },
    unidade: { nome: 'Rota Norte - Escritório Centro', bairro: 'Centro', logradouro: 'Rua do Ouvidor', numero: '120' },
  },
  {
    escopo: 'tenant',
    nomeFantasia: 'Guanabara Saúde Parcerias',
    razaoSocial: 'Guanabara Saúde Corretagem e Serviços Ltda',
    // Verificado em desenvolvimento: BrasilAPI respondeu 404 (CNPJ inexistente).
    cnpj: '82771142000117',
    endereco: { logradouro: 'Rua Voluntários da Pátria', numero: '350', bairro: 'Botafogo', cidade: 'Rio de Janeiro', uf: 'RJ' },
    unidade: { nome: 'Guanabara - Posto Botafogo', bairro: 'Botafogo', logradouro: 'Rua Voluntários da Pátria', numero: '350' },
  },
]

interface UnidadePropriaSpec {
  nome: string
  tipo: 'clinica' | 'outro'
  endereco: { logradouro: string; numero: string; bairro: string; cidade: string; uf: 'RJ' }
}
const UNIDADES_PROPRIAS: UnidadePropriaSpec[] = [
  { nome: 'Clínica Bem Viver Tijuca', tipo: 'clinica', endereco: { logradouro: 'Rua Conde de Bonfim', numero: '420', bairro: 'Tijuca', cidade: 'Rio de Janeiro', uf: 'RJ' } },
  { nome: 'Clínica Saúde Total Madureira', tipo: 'clinica', endereco: { logradouro: 'Rua Carvalho de Souza', numero: '210', bairro: 'Madureira', cidade: 'Rio de Janeiro', uf: 'RJ' } },
  { nome: 'Laboratório Precisão Campo Grande', tipo: 'outro', endereco: { logradouro: 'Rua Coronel Agostinho', numero: '88', bairro: 'Campo Grande', cidade: 'Rio de Janeiro', uf: 'RJ' } },
]

const EQUIPES: { escopo: Escopo; nome: string; corretoraCnpj: string | null; unidadeNome: string | null }[] = [
  { escopo: 'platform', nome: 'Equipe Rota Norte Alfa', corretoraCnpj: '92918708000144', unidadeNome: 'Rota Norte - Escritório Centro' },
  { escopo: 'tenant', nome: 'Equipe Zona Norte', corretoraCnpj: null, unidadeNome: null },
  { escopo: 'tenant', nome: 'Equipe Zona Sul', corretoraCnpj: '82771142000117', unidadeNome: 'Guanabara - Posto Botafogo' },
]

interface PessoaSpec {
  key: string
  escopo: Escopo
  nome: string
  email: string
  papel: PapelComercial
  corretoraCnpj?: string
  equipe?: string
  unidade?: string
  meta: number | null
  /** Área da conta com login (tabela do relatório); ausente = sem senha. */
  login?: string
}

const PESSOAS: PessoaSpec[] = [
  // Plataforma
  { key: 'p_gerente', escopo: 'platform', nome: 'Marcelo Quintela Tavares', email: 'marcelo.quintela.annetec@example.com', papel: 'gerente', corretoraCnpj: '92918708000144', meta: null, login: 'Plataforma - Gerente' },
  { key: 'p_super', escopo: 'platform', nome: 'Fernanda Louzada Braga', email: 'fernanda.louzada.annetec@example.com', papel: 'supervisor', corretoraCnpj: '92918708000144', equipe: 'Equipe Rota Norte Alfa', meta: null, login: 'Plataforma - Supervisor' },
  { key: 'bruno', escopo: 'platform', nome: 'Bruno Machado Reis', email: 'bruno.machado.annetec@example.com', papel: 'vendedor', corretoraCnpj: '92918708000144', equipe: 'Equipe Rota Norte Alfa', meta: 4, login: 'Plataforma - Vendedor' },
  { key: 'aline', escopo: 'platform', nome: 'Aline Cavalcante Dutra', email: 'aline.cavalcante.annetec@example.com', papel: 'vendedor', corretoraCnpj: '92918708000144', equipe: 'Equipe Rota Norte Alfa', meta: 4 },
  { key: 'diego', escopo: 'platform', nome: 'Diego Albuquerque Neri', email: 'diego.albuquerque.annetec@example.com', papel: 'vendedor', corretoraCnpj: '92918708000144', equipe: 'Equipe Rota Norte Alfa', meta: 4 },
  { key: 'renata', escopo: 'platform', nome: 'Renata Pimentel Sodré', email: 'renata.pimentel.annetec@example.com', papel: 'vendedor', meta: 3, login: 'Plataforma - Vendedor solo' },
  // Clube (os 6 primeiros vêm do seed-mepcard-rio; os e-mails têm de ser idênticos)
  { key: 'rafaela', escopo: 'tenant', nome: 'Rafaela Monteiro', email: 'rafaela.monteiro.mepcard@example.com', papel: 'supervisor', equipe: 'Equipe Zona Norte', meta: null, login: 'Clube - Supervisor' },
  { key: 'thiago', escopo: 'tenant', nome: 'Thiago Barbosa', email: 'thiago.barbosa.mepcard@example.com', papel: 'vendedor', equipe: 'Equipe Zona Norte', meta: 10, login: 'Clube - Vendedor' },
  { key: 'camila', escopo: 'tenant', nome: 'Camila Nascimento', email: 'camila.nascimento.mepcard@example.com', papel: 'vendedor', equipe: 'Equipe Zona Norte', meta: 10 },
  { key: 'leandro', escopo: 'tenant', nome: 'Leandro Siqueira', email: 'leandro.siqueira.mepcard@example.com', papel: 'vendedor', equipe: 'Equipe Zona Norte', meta: 10 },
  { key: 'patricia', escopo: 'tenant', nome: 'Patrícia Guedes', email: 'patricia.guedes.mepcard@example.com', papel: 'vendedor', meta: 8, login: 'Clube - Vendedor solo' },
  { key: 'vanessa', escopo: 'tenant', nome: 'Vanessa Cardoso', email: 'vanessa.cardoso.mepcard@example.com', papel: 'balcao', unidade: 'Clínica Bem Viver Tijuca', meta: null, login: 'Clube - Balcão' },
  // Clube: novos
  { key: 'c_gerente', escopo: 'tenant', nome: 'Cláudio Rezende Prates', email: 'claudio.rezende.mepcard@example.com', papel: 'gerente', corretoraCnpj: '82771142000117', meta: null, login: 'Clube - Gerente' },
  { key: 'c_super', escopo: 'tenant', nome: 'Luciana Prado Mendes', email: 'luciana.prado.mepcard@example.com', papel: 'supervisor', corretoraCnpj: '82771142000117', equipe: 'Equipe Zona Sul', meta: null },
  { key: 'rodrigo', escopo: 'tenant', nome: 'Rodrigo Alencar Vieira', email: 'rodrigo.alencar.mepcard@example.com', papel: 'vendedor', corretoraCnpj: '82771142000117', equipe: 'Equipe Zona Sul', meta: 8 },
  { key: 'bianca', escopo: 'tenant', nome: 'Bianca Furtado Lacerda', email: 'bianca.furtado.mepcard@example.com', papel: 'vendedor', corretoraCnpj: '82771142000117', equipe: 'Equipe Zona Sul', meta: 8 },
  { key: 'juliana', escopo: 'tenant', nome: 'Juliana Barreto Coelho', email: 'juliana.barreto.mepcard@example.com', papel: 'balcao', unidade: 'Clínica Saúde Total Madureira', meta: null },
  { key: 'marcos', escopo: 'tenant', nome: 'Marcos Vinícius Sales', email: 'marcos.sales.mepcard@example.com', papel: 'balcao', unidade: 'Laboratório Precisão Campo Grande', meta: null },
]
const EMAILS_DEMO = PESSOAS.map(p => p.email.toLowerCase())

// Catálogo do seed-mepcard-rio.ts (só para `--remover-catalogo`, por nome).
const CATALOGO_PLANOS = ['Mepcard Essencial', 'Mepcard Família', 'Mepcard Sênior', 'Mepcard Empresarial']
const CATALOGO_BENEFICIOS = [
  'Telemedicina 24h', 'Desconto em consultas', 'Desconto em exames', 'Desconto em farmácias', 'Odontologia com desconto', 'Ótica e oftalmologia',
  'Assistência funeral', 'Orientação nutricional', 'Academias e bem-estar', 'Clube pet', 'Cursos e capacitação',
]
const CATALOGO_PARCEIROS = [
  'Clínica Bem Viver Tijuca', 'Laboratório Vital Méier', 'Odonto Sorriso Copacabana', 'Farmácia Saúde Viva Madureira', 'Ótica Visão Clara Botafogo',
  'Fisio Movimento Barra', 'Clínica Cuidar Campo Grande', 'Academia Corpo em Forma Recreio', 'Clínica Vida e Saúde Icaraí', 'Laboratório Exata Niterói',
  'Odonto Prime Icaraí', 'Farmácia Bom Remédio Tijuca', 'Núcleo Nutri Equilíbrio Ipanema', 'Clínica Mulher Plena Leblon',
  'Centro de Imagem Diagnóstica Penha', 'Estúdio Pilates Corpo & Mente Jacarepaguá', 'Pet Amigo Veterinária Flamengo', 'Escola Aprender Mais Centro de Niterói',
]

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

type Passo = 'hoje' | 'futuro' | 'atrasado' | null
interface LeadSpec {
  nome: string
  tipo: 'pessoa' | 'empresa'
  cidade: string
  origem: Origem
  detalhe: string | null
  etapa: EtapaLead
  dono: string | null
  valor: number
  vidas: number
  plano: number | null
  /** Dias desde a criação. */
  idade: number
  /** Dias atrás do ganho/perda. */
  fecho: number | null
  passo: Passo
  motivo: string | null
}
const L = (
  nome: string, tipo: 'pessoa' | 'empresa', cidade: string, origem: Origem, detalhe: string | null, etapa: EtapaLead, dono: string | null,
  valor: number, vidas: number, plano: number | null, idade: number, fecho: number | null = null, passo: Passo = null, motivo: string | null = null,
): LeadSpec => ({ nome, tipo, cidade, origem, detalhe, etapa, dono, valor, vidas, plano, idade, fecho, passo, motivo })

// Plataforma: associações, sindicatos, cooperativas, clubes de benefícios e operadoras pequenas (fictícios).
// `valor` = mensalidade estimada em R$; `plano` = posição (por preço) entre os `tenant_plans`.
const LEADS_PLATAFORMA: LeadSpec[] = [
  L('Associação Beneficente dos Servidores de Niterói', 'empresa', 'Niterói', 'site', null, 'novo', null, 2800, 1800, 0, 1),
  L('Sindicato dos Condutores Autônomos do Grande Rio', 'empresa', 'Rio de Janeiro', 'indicacao', 'Indicação de cliente', 'novo', null, 3500, 4200, 1, 2),
  L('Cooperativa de Saúde Serra do Mar', 'empresa', 'Petrópolis', 'evento', 'Feira de Benefícios Rio 2026', 'novo', 'bruno', 1900, 900, 0, 1, null, 'hoje'),
  L('Clube de Vantagens Cidade Maravilhosa', 'empresa', 'Rio de Janeiro', 'redes_sociais', 'Instagram', 'novo', null, 1500, 600, 0, 3),
  L('Operadora Saúde Aliança Fluminense', 'empresa', 'Duque de Caxias', 'prospeccao', null, 'novo', 'aline', 4200, 7500, 2, 2, null, 'futuro'),
  L('Mutual dos Profissionais de Educação de Nova Iguaçu', 'empresa', 'Nova Iguaçu', 'site', null, 'em_contato', 'diego', 2400, 3000, 1, 6, null, 'hoje'),
  L('Associação Comercial e Empresarial de Maricá', 'empresa', 'Maricá', 'indicacao', 'Indicação de parceiro', 'em_contato', 'renata', 1700, 1100, 0, 9, null, 'atrasado'),
  L('Sindicato dos Trabalhadores em Turismo de Cabo Frio', 'empresa', 'Cabo Frio', 'outro', 'WhatsApp', 'em_contato', 'bruno', 2100, 1600, 1, 5, null, 'futuro'),
  L('Cooperativa de Taxistas Orla Carioca', 'empresa', 'Rio de Janeiro', 'prospeccao', null, 'em_contato', 'aline', 1300, 500, 0, 11, null, 'atrasado'),
  L('Clube de Benefícios Vale Fluminense', 'empresa', 'Volta Redonda', 'link', 'Link de indicação do vendedor', 'em_contato', 'diego', 2600, 2200, 1, 7, null, 'futuro'),
  L('Associação dos Aposentados e Pensionistas de São Gonçalo', 'empresa', 'São Gonçalo', 'evento', 'Congresso de Associativismo', 'proposta', 'renata', 3100, 5200, 1, 15, null, 'hoje'),
  L('Operadora Vida e Bem-Estar Baixada', 'empresa', 'Nova Iguaçu', 'indicacao', 'Indicação de cliente', 'proposta', 'bruno', 5200, 9800, 2, 18, null, 'futuro'),
  L('Sindicato dos Vigilantes e Zeladores do Rio', 'empresa', 'Rio de Janeiro', 'prospeccao', null, 'proposta', 'aline', 3900, 6000, 2, 14, null, 'atrasado'),
  L('Cooperativa Agrícola e de Saúde de Campos', 'empresa', 'Campos dos Goytacazes', 'site', null, 'proposta', 'diego', 2800, 2700, 1, 21, null, 'futuro'),
  L('Federação das Associações de Moradores de Itaboraí', 'empresa', 'Itaboraí', 'indicacao', 'Indicação de parceiro', 'negociacao', 'bruno', 4600, 8000, 2, 28, null, 'hoje'),
  L('Clube de Benefícios Orgulho Carioca', 'empresa', 'Rio de Janeiro', 'evento', 'Feira de Benefícios Rio 2026', 'negociacao', 'renata', 3300, 3800, 1, 24, null, 'futuro'),
  L('Associação Mutualista dos Taxistas de Macaé', 'empresa', 'Macaé', 'outro', 'WhatsApp', 'negociacao', 'diego', 2900, 2400, 1, 33, null, 'atrasado'),
  L('Associação Mutual Beneficente Rio Antigo', 'empresa', 'Rio de Janeiro', 'indicacao', 'Indicação de cliente', 'ganho', 'bruno', 3200, 3500, 1, 34, 4),
  L('Sindicato dos Comerciários de Angra dos Reis', 'empresa', 'Angra dos Reis', 'site', null, 'ganho', 'aline', 2700, 2600, 1, 40, 11),
  L('Cooperativa de Profissionais de Saúde da Costa Verde', 'empresa', 'Mangaratiba', 'evento', 'Congresso de Associativismo', 'ganho', 'diego', 4100, 5100, 2, 52, 23),
  L('Clube de Benefícios Praia Grande Fluminense', 'empresa', 'Niterói', 'redes_sociais', 'LinkedIn', 'ganho', 'renata', 1800, 900, 0, 55, 37),
  L('Associação de Servidores Municipais de Resende', 'empresa', 'Resende', 'prospeccao', null, 'ganho', 'bruno', 2300, 1800, 1, 70, 52),
  L('Operadora Clínica Popular do Subúrbio', 'empresa', 'Rio de Janeiro', 'prospeccao', null, 'perdido', 'aline', 1200, 400, 0, 30, 8, null, 'Já tem fornecedor de benefícios com contrato vigente'),
  L('Sindicato dos Funcionários de Postos de Combustível', 'empresa', 'Duque de Caxias', 'site', null, 'perdido', 'diego', 1600, 700, 0, 38, 19, null, 'Sem orçamento neste ano; retomar em 2027'),
  L('Associação Esportiva Recreativa Zona Oeste', 'empresa', 'Rio de Janeiro', 'outro', 'WhatsApp', 'perdido', 'renata', 900, 300, 0, 26, 14, null, 'Preço acima do esperado'),
]

// Clube: pessoas e famílias interessadas nos planos (plano: 0 Essencial, 1 Família, 2 Sênior, 3 Empresarial).
// O `valor` é trocado pelo preço mensal do plano na hora de gravar.
const LEADS_CLUBE: LeadSpec[] = [
  L('Adriana Souza Mattos', 'pessoa', 'Rio de Janeiro', 'site', null, 'novo', null, 0, 4, 1, 1),
  L('Wagner Peixoto Lima', 'pessoa', 'Niterói', 'link', 'Link de indicação do vendedor', 'novo', 'thiago', 0, 1, 0, 0, null, 'hoje'),
  L('Simone Carvalho Duarte', 'pessoa', 'Rio de Janeiro', 'redes_sociais', 'Instagram', 'novo', null, 0, 4, 1, 2),
  L('Luiz Fernando Barreto', 'pessoa', 'São João de Meriti', 'outro', 'WhatsApp', 'novo', null, 0, 1, 2, 1),
  L('Mercadinho Boa Esquina Ltda', 'empresa', 'Rio de Janeiro', 'prospeccao', null, 'novo', null, 0, 8, 3, 3),
  L('Cláudia Regina Nogueira', 'pessoa', 'Rio de Janeiro', 'indicacao', 'Indicação de associado', 'em_contato', 'leandro', 0, 4, 1, 5, null, 'hoje'),
  L('Sebastião Almeida Neto', 'pessoa', 'Duque de Caxias', 'evento', 'Ação de saúde na Praça Seca', 'em_contato', 'patricia', 0, 1, 2, 6, null, 'atrasado'),
  L('Tatiane Oliveira Bastos', 'pessoa', 'Niterói', 'site', null, 'em_contato', 'rodrigo', 0, 1, 0, 4, null, 'futuro'),
  L('Everton Rangel Fonseca', 'pessoa', 'Rio de Janeiro', 'outro', 'WhatsApp', 'em_contato', 'bianca', 0, 3, 1, 7, null, 'hoje'),
  L('Padaria Pão Dourado da Penha MEI', 'empresa', 'Rio de Janeiro', 'prospeccao', null, 'em_contato', 'thiago', 0, 4, 3, 8, null, 'atrasado'),
  L('Marlene da Conceição Reis', 'pessoa', 'Nova Iguaçu', 'indicacao', 'Indicação de associado', 'em_contato', 'camila', 0, 1, 2, 9, null, 'futuro'),
  L('Rogério Tavares Campos', 'pessoa', 'São Gonçalo', 'site', null, 'proposta', 'leandro', 0, 4, 1, 12, null, 'futuro'),
  L('Priscila Monteiro Xavier', 'pessoa', 'Rio de Janeiro', 'redes_sociais', 'Instagram', 'proposta', 'patricia', 0, 1, 0, 10, null, 'hoje'),
  L('Oficina Mecânica Irmãos Vasconcelos ME', 'empresa', 'Rio de Janeiro', 'indicacao', 'Indicação de associado', 'proposta', 'rodrigo', 0, 5, 3, 14, null, 'atrasado'),
  L('Edna Maria Figueiredo', 'pessoa', 'Rio de Janeiro', 'evento', 'Ação de saúde na Praça Seca', 'proposta', 'bianca', 0, 1, 2, 11, null, 'futuro'),
  L('Carlos Eduardo Pacheco', 'pessoa', 'Niterói', 'indicacao', 'Indicação de associado', 'negociacao', 'thiago', 0, 4, 1, 19, null, 'hoje'),
  L('Vera Lúcia Andrade', 'pessoa', 'Rio de Janeiro', 'link', 'Link de indicação do vendedor', 'negociacao', 'camila', 0, 1, 2, 22, null, 'futuro'),
  L('Clínica Veterinária Patas e Amigos Ltda', 'empresa', 'Rio de Janeiro', 'site', null, 'negociacao', 'bianca', 0, 6, 3, 20, null, 'atrasado'),
  L('Mônica Aparecida Teixeira', 'pessoa', 'Rio de Janeiro', 'site', null, 'ganho', 'leandro', 0, 4, 1, 24, 6),
  L('Anderson Gomes Pimenta', 'pessoa', 'Niterói', 'link', 'Link de indicação do vendedor', 'ganho', 'thiago', 0, 1, 0, 20, 15),
  L('Dulce Helena Rosário', 'pessoa', 'Rio de Janeiro', 'indicacao', 'Indicação de associado', 'ganho', 'rodrigo', 0, 1, 2, 36, 29),
  L('Fabrício Lemos Ventura', 'pessoa', 'Rio de Janeiro', 'evento', 'Ação de saúde na Praça Seca', 'ganho', 'patricia', 0, 3, 1, 50, 44),
  L('Gilberto Sampaio Moura', 'pessoa', 'Rio de Janeiro', 'indicacao', 'Indicação de associado', 'ganho', 'bianca', 0, 4, 1, 18, 3),
  L('Aparecida Rocha Lins', 'pessoa', 'Duque de Caxias', 'site', null, 'ganho', 'camila', 0, 1, 0, 40, 33),
  L('Joana Darc Freitas', 'pessoa', 'Rio de Janeiro', 'site', null, 'perdido', 'thiago', 0, 1, 0, 21, 9, null, 'Achou a mensalidade alta'),
  L('Roberto Salgado Pinheiro', 'pessoa', 'Rio de Janeiro', 'redes_sociais', 'Instagram', 'perdido', 'bianca', 0, 4, 1, 33, 21, null, 'Já possui plano de saúde'),
  L('Sueli Barros Coutinho', 'pessoa', 'Duque de Caxias', 'outro', 'WhatsApp', 'perdido', 'leandro', 0, 1, 2, 27, 16, null, 'Sem retorno após três tentativas'),
]

// Balcão: 15 atendimentos (assinou vira lead ganho, vai_pensar vira lead em contato, recusou vira lead perdido).
type ResultadoBalcao = 'assinou' | 'vai_pensar' | 'recusou'
const ATENDIMENTOS: { dono: string; dias: number; nome: string; servico: string; valor: number; plano: number; resultado: ResultadoBalcao }[] = [
  { dono: 'vanessa', dias: 0, nome: 'Helena Ribeiro Matos', servico: 'Consulta cardiologia', valor: 320, plano: 1, resultado: 'vai_pensar' },
  { dono: 'vanessa', dias: 0, nome: 'Josué Santana Braga', servico: 'Hemograma completo', valor: 85, plano: 0, resultado: 'assinou' },
  { dono: 'vanessa', dias: 0, nome: 'Nilza Portela Cruz', servico: 'Consulta clínica geral', valor: 220, plano: 2, resultado: 'recusou' },
  { dono: 'vanessa', dias: 1, nome: 'Maurício Dantas Faria', servico: 'Ultrassom abdome total', valor: 240, plano: 1, resultado: 'assinou' },
  { dono: 'vanessa', dias: 3, nome: 'Elisa Cordeiro Neves', servico: 'Consulta dermatologia', valor: 350, plano: 1, resultado: 'vai_pensar' },
  { dono: 'vanessa', dias: 5, nome: 'Antônio Carlos Veloso', servico: 'Eletrocardiograma', valor: 150, plano: 2, resultado: 'assinou' },
  { dono: 'vanessa', dias: 8, nome: 'Lívia Drummond Assis', servico: 'Consulta ginecologia', valor: 300, plano: 0, resultado: 'vai_pensar' },
  { dono: 'vanessa', dias: 11, nome: 'Jorge Luiz Magalhães', servico: 'Raio-X de tórax', valor: 130, plano: 0, resultado: 'recusou' },
  { dono: 'juliana', dias: 0, nome: 'Beatriz Amaral Sodré', servico: 'Consulta pediatria', valor: 260, plano: 1, resultado: 'assinou' },
  { dono: 'juliana', dias: 2, nome: 'Raimundo Nonato Silva', servico: 'Consulta ortopedia', valor: 300, plano: 2, resultado: 'vai_pensar' },
  { dono: 'juliana', dias: 6, nome: 'Cristiane Lopes Vidal', servico: 'Consulta oftalmologia', valor: 280, plano: 0, resultado: 'recusou' },
  { dono: 'juliana', dias: 12, nome: 'Paulo Roberto Esteves', servico: 'Ecocardiograma', valor: 480, plano: 1, resultado: 'vai_pensar' },
  { dono: 'marcos', dias: 0, nome: 'Sônia Maria Gouveia', servico: 'Perfil lipídico completo', valor: 70, plano: 2, resultado: 'vai_pensar' },
  { dono: 'marcos', dias: 4, nome: 'Davi Lucas Pestana', servico: 'Glicemia e hemoglobina glicada', valor: 60, plano: 0, resultado: 'assinou' },
  { dono: 'marcos', dias: 9, nome: 'Renata Brandão Lessa', servico: 'TSH e T4 livre', valor: 110, plano: 1, resultado: 'recusou' },
]

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const slugEmail = (s: string) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 48)
/** Telefone fictício `21 90000-0NNN`, só dígitos (como o sistema grava). */
const fone = (n: number) => `21900000${String(n).padStart(3, '0')}`
const dinheiro = (n: number) => n.toFixed(2)
const nomePrimeiro = (s: string) => s.split(' ')[0] ?? s

// Senha legível: 4 grupos de 4 caracteres sem ambíguos (sem 0/O, 1/l/I). 16 caracteres + 3 hífens.
const ALFABETO_SENHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
function gerarSenha(): string {
  const limite = 256 - (256 % ALFABETO_SENHA.length)
  const out: string[] = []
  while (out.length < 16) {
    for (const byte of randomBytes(32)) {
      if (byte >= limite) continue
      out.push(ALFABETO_SENHA[byte % ALFABETO_SENHA.length]!)
      if (out.length === 16) break
    }
  }
  return [0, 4, 8, 12].map(i => out.slice(i, i + 4).join('')).join('-')
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
class Desfazer extends Error {}

const resumo = new Map<string, { criado: number; existia: number }>()
const conta = (tipo: string, criado: boolean, n = 1) => {
  const r = resumo.get(tipo) ?? { criado: 0, existia: 0 }
  if (criado) r.criado += n
  else r.existia += n
  resumo.set(tipo, r)
}

const escopoWhere = (t: { scope: AnyPgColumn; tenantId: AnyPgColumn }, escopo: Escopo, tenantId: string | null) =>
  and(eq(t.scope, escopo), escopo === 'platform' || !tenantId ? isNull(t.tenantId) : eq(t.tenantId, tenantId))

interface Credencial {
  area: string
  escopo: Escopo
  email: string
  senha: string
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

async function criarDemo(tx: Tx, orgId: string, credenciais: Credencial[]) {
  const tenantDe = (e: Escopo) => (e === 'platform' ? null : orgId)

  // Planos do clube (preço e desconto do balcão) e planos da plataforma.
  const planosClube = await tx.select().from(clubPlans).where(eq(clubPlans.organizationId, orgId))
  const ORDEM_PLANOS = ['Mepcard Essencial', 'Mepcard Família', 'Mepcard Sênior', 'Mepcard Empresarial']
  const planosOrdenados = ORDEM_PLANOS.map(n => planosClube.find(p => p.name === n))
  if (planosOrdenados.some(p => !p)) throw new Error('Planos do clube não encontrados: rode antes o seed-mepcard-rio.ts --confirmar.')
  const planoDe = (i: number) => planosOrdenados[i]!
  const planosPlat = await tx.select().from(tenantPlans)
  planosPlat.sort((a, b) => Number(a.priceMonthly) - Number(b.priceMonthly))

  // Config de comissão por escopo (linha criada sob demanda no sistema; sem linha, padrões da spec).
  async function configDe(escopo: Escopo): Promise<ConfigComissao> {
    const [c] = await tx.select().from(vendasConfig).where(escopoWhere(vendasConfig, escopo, tenantDe(escopo))).limit(1)
    return {
      escalaMensal: c?.escalaMensal ?? [100, 50, 25],
      percentualAdesao: c ? Number(c.percentualAdesao) : escopo === 'platform' ? 50 : 0,
      overrides: c?.overrides ?? { supervisor: 10, gerente: 5, corretora: 5 },
      balcaoPercentual: c?.balcaoPercentual ?? null,
    }
  }
  const configs: Record<Escopo, ConfigComissao> = { platform: await configDe('platform'), tenant: await configDe('tenant') }

  // --- Corretoras, unidades, equipes -------------------------------------
  const corretoras = new Map<string, typeof vendasCorretoras.$inferSelect>()
  const unidades = new Map<string, typeof vendasUnidades.$inferSelect>() // chave `${escopo}:${nome}`
  const equipes = new Map<string, typeof vendasEquipes.$inferSelect>() // chave `${escopo}:${nome}`

  for (const c of CORRETORAS) {
    const [ex] = await tx
      .select()
      .from(vendasCorretoras)
      .where(and(escopoWhere(vendasCorretoras, c.escopo, tenantDe(c.escopo)), eq(vendasCorretoras.cnpj, c.cnpj)))
      .limit(1)
    conta('corretoras', !ex)
    const row =
      ex ??
      (
        await tx
          .insert(vendasCorretoras)
          .values({ scope: c.escopo, tenantId: tenantDe(c.escopo), nomeFantasia: c.nomeFantasia, razaoSocial: c.razaoSocial, cnpj: c.cnpj, endereco: c.endereco })
          .returning()
      )[0]!
    corretoras.set(c.cnpj, row)

    const [uex] = await tx
      .select()
      .from(vendasUnidades)
      .where(and(escopoWhere(vendasUnidades, c.escopo, tenantDe(c.escopo)), eq(vendasUnidades.nome, c.unidade.nome)))
      .limit(1)
    conta('unidades', !uex)
    const urow =
      uex ??
      (
        await tx
          .insert(vendasUnidades)
          .values({
            scope: c.escopo,
            tenantId: tenantDe(c.escopo),
            corretoraId: row.id,
            nome: c.unidade.nome,
            tipo: 'corretora',
            endereco: { logradouro: c.unidade.logradouro, numero: c.unidade.numero, bairro: c.unidade.bairro, cidade: 'Rio de Janeiro', uf: 'RJ' },
          })
          .returning()
      )[0]!
    unidades.set(`${c.escopo}:${c.unidade.nome}`, urow)
  }
  for (const u of UNIDADES_PROPRIAS) {
    const [ex] = await tx
      .select()
      .from(vendasUnidades)
      .where(and(escopoWhere(vendasUnidades, 'tenant', orgId), eq(vendasUnidades.nome, u.nome)))
      .limit(1)
    conta('unidades', !ex)
    const row =
      ex ??
      (await tx.insert(vendasUnidades).values({ scope: 'tenant', tenantId: orgId, corretoraId: null, nome: u.nome, tipo: u.tipo, endereco: u.endereco }).returning())[0]!
    unidades.set(`tenant:${u.nome}`, row)
  }
  for (const e of EQUIPES) {
    const [ex] = await tx
      .select()
      .from(vendasEquipes)
      .where(and(escopoWhere(vendasEquipes, e.escopo, tenantDe(e.escopo)), eq(vendasEquipes.nome, e.nome)))
      .limit(1)
    conta('equipes', !ex)
    const row =
      ex ??
      (
        await tx
          .insert(vendasEquipes)
          .values({
            scope: e.escopo,
            tenantId: tenantDe(e.escopo),
            corretoraId: e.corretoraCnpj ? corretoras.get(e.corretoraCnpj)!.id : null,
            unidadeId: e.unidadeNome ? unidades.get(`${e.escopo}:${e.unidadeNome}`)!.id : null,
            nome: e.nome,
          })
          .returning()
      )[0]!
    equipes.set(`${e.escopo}:${e.nome}`, row)
  }

  // --- Pessoas -------------------------------------------------------------
  const agentes = new Map<string, typeof vendasAgentes.$inferSelect>()

  for (const p of PESSOAS) {
    const email = p.email.toLowerCase()
    const tenantId = tenantDe(p.escopo)
    let [u] = await tx.select().from(user).where(eq(user.email, email)).limit(1)
    conta('contas', !u)
    if (!u) {
      // Mesmos papéis que `provisionarUsuario`: plataforma = platform_seller; clube = user + member 'seller'.
      ;[u] = await tx
        .insert(user)
        .values({ id: randomUUID(), name: p.nome, email, emailVerified: true, role: p.escopo === 'platform' ? 'platform_seller' : 'user' })
        .returning()
    }
    const userId = u!.id

    if (p.escopo === 'tenant') {
      const [vinculo] = await tx.select({ id: member.id }).from(member).where(and(eq(member.organizationId, orgId), eq(member.userId, userId))).limit(1)
      if (!vinculo) await tx.insert(member).values({ id: randomUUID(), organizationId: orgId, userId, role: 'seller' })
      await tx.insert(sellerProfiles).values({ userId, organizationId: orgId }).onConflictDoNothing()
    }

    let [ag] = await tx
      .select()
      .from(vendasAgentes)
      .where(and(eq(vendasAgentes.userId, userId), escopoWhere(vendasAgentes, p.escopo, tenantId)))
      .limit(1)
    conta('agentes', !ag)
    if (!ag) {
      let codigo = gerarCodigoIndicacao()
      for (let t = 0; t < 30; t++) {
        const [dup] = await tx.select({ id: vendasAgentes.id }).from(vendasAgentes).where(eq(vendasAgentes.codigoIndicacao, codigo)).limit(1)
        const [dupLegado] = await tx
          .select({ id: platformSellers.userId })
          .from(platformSellers)
          .where(eq(platformSellers.referralCode, codigo.toLowerCase()))
          .limit(1)
        if (!dup && !dupLegado) break
        codigo = gerarCodigoIndicacao()
      }
      ;[ag] = await tx
        .insert(vendasAgentes)
        .values({
          scope: p.escopo,
          tenantId,
          userId,
          papel: p.papel,
          corretoraId: p.corretoraCnpj ? corretoras.get(p.corretoraCnpj)!.id : null,
          unidadeId: p.unidade ? unidades.get(`${p.escopo}:${p.unidade}`)!.id : null,
          equipeId: p.equipe ? equipes.get(`${p.escopo}:${p.equipe}`)!.id : null,
          codigoIndicacao: codigo,
          ativo: true,
          metaMensal: p.meta,
          nome: p.nome,
          cpf: null,
          telefone: null,
          criadoPorUserId: null,
        })
        .returning()
    }
    agentes.set(p.key, ag!)

    // Perfil legado do vendedor ANNETEC (`platformUsersService.create` cria para todo platform_seller).
    if (p.escopo === 'platform') {
      await tx
        .insert(platformSellers)
        .values({ userId, referralCode: ag!.codigoIndicacao.toLowerCase(), monthlyGoal: p.meta, createdByUserId: null })
        .onConflictDoNothing()
    }

    // Credencial com senha (só as 9 contas de login), com o mesmo `hashPassword` do Better Auth.
    if (p.login) {
      if (!u!.emailVerified) await tx.update(user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(user.id, userId))
      const [cred] = await tx
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
        .limit(1)
      conta('credenciais (login)', !cred)
      if (!cred || redefinirSenhas) {
        const senha = gerarSenha()
        const hash = await hashPassword(senha)
        if (cred) {
          await tx.update(account).set({ password: hash, updatedAt: new Date() }).where(eq(account.id, cred.id))
          await tx.delete(session).where(eq(session.userId, userId))
        } else {
          await tx.insert(account).values({ id: randomUUID(), userId, accountId: userId, providerId: 'credential', issuer: 'local:credential', password: hash })
        }
        credenciais.push({ area: p.login, escopo: p.escopo, email, senha })
      }
    }
  }

  // Gerentes, supervisores e responsáveis das unidades.
  for (const c of CORRETORAS) {
    const corr = corretoras.get(c.cnpj)!
    const gerente = PESSOAS.find(p => p.papel === 'gerente' && p.corretoraCnpj === c.cnpj)
    if (gerente && !corr.gerenteAgenteId) {
      const ag = agentes.get(gerente.key)!
      await tx.update(vendasCorretoras).set({ gerenteAgenteId: ag.id, updatedAt: new Date() }).where(eq(vendasCorretoras.id, corr.id))
      corr.gerenteAgenteId = ag.id
    }
  }
  for (const e of EQUIPES) {
    const eqp = equipes.get(`${e.escopo}:${e.nome}`)!
    const sup = PESSOAS.find(p => p.papel === 'supervisor' && p.escopo === e.escopo && p.equipe === e.nome)
    if (sup && !eqp.supervisorAgenteId) {
      const ag = agentes.get(sup.key)!
      await tx.update(vendasEquipes).set({ supervisorAgenteId: ag.id, updatedAt: new Date() }).where(eq(vendasEquipes.id, eqp.id))
      eqp.supervisorAgenteId = ag.id
    }
  }
  for (const p of PESSOAS.filter(x => x.papel === 'balcao')) {
    const un = unidades.get(`${p.escopo}:${p.unidade}`)!
    if (!un.responsavelAgenteId) {
      const ag = agentes.get(p.key)!
      await tx.update(vendasUnidades).set({ responsavelAgenteId: ag.id, updatedAt: new Date() }).where(eq(vendasUnidades.id, un.id))
      un.responsavelAgenteId = ag.id
    }
  }

  const equipePorId = new Map([...equipes.values()].map(e => [e.id, e]))
  const corretoraPorId = new Map([...corretoras.values()].map(c => [c.id, c]))
  // Mesmo snapshot que `atribuicao.ts` grava (`cadeiaDoAgente` com equipe e corretora do agente).
  const atribuicaoDe = (ag: typeof vendasAgentes.$inferSelect): Atribuicao =>
    cadeiaDoAgente(
      { id: ag.id, papel: ag.papel, equipeId: ag.equipeId, unidadeId: ag.unidadeId, corretoraId: ag.corretoraId },
      ag.equipeId ? (equipePorId.get(ag.equipeId) ?? null) : null,
      ag.corretoraId ? (corretoraPorId.get(ag.corretoraId) ?? null) : null,
    )

  // --- Leads, eventos e comissões -----------------------------------------
  const emailsUsados = new Set<string>()
  const rnd = mulberry32(20261111)

  interface LeadPronto {
    escopo: Escopo
    spec: LeadSpec
    telefone: string
    emailLead: string
    interessePlanoId: string | null
    valorMensal: number
    adesao: number
    refIdx: number
    criadoEm?: Date
    fechadoEm?: Date
    doBalcao?: boolean
  }

  const FASES: EtapaLead[] = ['novo', 'em_contato', 'proposta', 'negociacao', 'ganho']
  const CONTATOS_EMPRESA: { tipo: TipoEventoLead; texto: string }[] = [
    { tipo: 'ligacao', texto: 'Ligação com o responsável: apresentei a plataforma e combinamos o retorno.' },
    { tipo: 'email', texto: 'E-mail enviado com a apresentação comercial e a tabela de planos.' },
    { tipo: 'reuniao', texto: 'Reunião de apresentação com a diretoria.' },
    { tipo: 'whatsapp', texto: 'Conversa por WhatsApp para alinhar o número de vidas.' },
    { tipo: 'visita', texto: 'Visita à sede para entregar a proposta impressa.' },
  ]
  const CONTATOS_PESSOA: { tipo: TipoEventoLead; texto: string }[] = [
    { tipo: 'ligacao', texto: 'Ligação: apresentei o plano e tirei as dúvidas de cobertura.' },
    { tipo: 'whatsapp', texto: 'Conversa por WhatsApp: enviei a tabela de valores e a rede credenciada.' },
    { tipo: 'whatsapp', texto: 'Cliente pediu mais detalhes sobre dependentes.' },
    { tipo: 'email', texto: 'E-mail enviado com o resumo do plano.' },
    { tipo: 'visita', texto: 'Atendimento presencial para tirar dúvidas e simular a economia.' },
  ]
  const PASSOS_TEXTO: Record<string, string> = {
    novo: 'Fazer o primeiro contato',
    em_contato: 'Retomar a conversa e enviar a proposta',
    proposta: 'Cobrar o retorno da proposta',
    negociacao: 'Fechar as condições e enviar o link de adesão',
  }
  const TIPOS_CONTATO = ['ligacao', 'whatsapp', 'email', 'reuniao', 'visita', 'atendimento_balcao']

  async function criarLead(l: LeadPronto): Promise<void> {
    const { spec, escopo } = l
    const tenantId = tenantDe(escopo)
    const rotulo = escopo === 'platform' ? 'plataforma' : 'clube'
    const [ex] = await tx
      .select({ id: vendasLeads.id })
      .from(vendasLeads)
      .where(and(escopoWhere(vendasLeads, escopo, tenantId), eq(vendasLeads.email, l.emailLead)))
      .limit(1)
    conta(`leads (${rotulo})`, !ex)
    if (ex) return
    const agente = spec.dono ? agentes.get(spec.dono)! : null
    if (spec.dono && !agente) throw new Error(`Dono de lead desconhecido: ${spec.dono}`)

    const fechado = spec.etapa === 'ganho' || spec.etapa === 'perdido'
    const fechadoEm =
      l.fechadoEm ??
      (fechado && spec.fecho !== null ? limitarAoPassado(diaSP(-spec.fecho, 9 + Math.floor(rnd() * 8), Math.floor(rnd() * 60))) : null)
    const criadoEm = l.criadoEm ?? limitarAoPassado(diaSP(-spec.idade, 8 + Math.floor(rnd() * 9), Math.floor(rnd() * 60)))

    // Próximo passo (só leads abertos com dono): hoje, futuro ou atrasado.
    let proximoPassoEm: Date | null = null
    if (agente && !fechado && spec.passo) {
      if (spec.passo === 'hoje') {
        const alvo = diaSP(0, 10 + Math.floor(rnd() * 8), Math.floor(rnd() * 4) * 15)
        proximoPassoEm = new Date(Math.min(Math.max(alvo.getTime(), agora.getTime() + 40 * MIN), diaSP(0, 23, 30).getTime()))
      } else if (spec.passo === 'futuro') proximoPassoEm = diaSP(1 + Math.floor(rnd() * 5), 9 + Math.floor(rnd() * 8))
      else proximoPassoEm = diaSP(-(1 + Math.floor(rnd() * 3)), 10 + Math.floor(rnd() * 6))
    }

    // Linha do tempo: (contato -> etapa)* -> contato recente.
    const nFases = FASES.indexOf(spec.etapa === 'perdido' ? 'em_contato' : spec.etapa)
    const fim = l.doBalcao
      ? (fechadoEm ?? mais(criadoEm, 20 * MIN))
      : (fechadoEm ?? (proximoPassoEm && proximoPassoEm < agora ? mais(proximoPassoEm, -5 * H) : mais(agora, -(3 + Math.floor(rnd() * 20)) * H)))
    const limiteFim = l.doBalcao ? fim : new Date(Math.max(fim.getTime(), criadoEm.getTime() + 2 * H))
    const base = spec.tipo === 'empresa' ? CONTATOS_EMPRESA : CONTATOS_PESSOA
    type Passo_ = { tipo: TipoEventoLead; texto: string | null; dados: Record<string, unknown> | null }
    const sequencia: Passo_[] = []
    let c = Math.floor(rnd() * base.length)
    const proximoContato = (): Passo_ => {
      const x = base[c % base.length]!
      c++
      return { tipo: x.tipo, texto: x.texto, dados: null }
    }
    const etapaEvt = (de: string, para: string, extra: Record<string, unknown> = {}): Passo_ => ({
      tipo: 'etapa',
      texto: null,
      dados: { de, para, ...extra },
    })
    if (l.doBalcao) {
      sequencia.push({ tipo: 'atendimento_balcao', texto: `Atendimento no balcão: ${spec.detalhe ?? 'serviço'}.`, dados: null })
      if (spec.etapa === 'ganho') sequencia.push(etapaEvt('novo', 'ganho'))
      if (spec.etapa === 'perdido') sequencia.push(etapaEvt('novo', 'perdido', { motivoPerda: spec.motivo ?? 'Não quis aderir' }))
      if (spec.etapa === 'em_contato') sequencia.push(etapaEvt('novo', 'em_contato'))
    } else {
      for (let i = 1; i <= nFases; i++) {
        sequencia.push(proximoContato())
        sequencia.push(etapaEvt(FASES[i - 1]!, FASES[i]!))
      }
      if (spec.etapa === 'perdido') {
        sequencia.push(proximoContato())
        sequencia.push(etapaEvt('em_contato', 'perdido', { motivoPerda: spec.motivo ?? 'Sem interesse' }))
      } else if (spec.etapa !== 'novo' && spec.etapa !== 'ganho') sequencia.push(proximoContato())
    }
    const t0 = mais(criadoEm, agente ? 30 * MIN : 0)
    const eventos: (Passo_ & { em: Date })[] = sequencia.map((s, i) => ({
      ...s,
      em: new Date(t0.getTime() + (limiteFim.getTime() - t0.getTime()) * ((i + 1) / (sequencia.length + 1))),
    }))
    if (spec.etapa === 'ganho') {
      eventos.push({ tipo: 'conversao', texto: 'Venda confirmada (dado de demonstração).', dados: { demo: true }, em: mais(limiteFim, 3 * MIN) })
    }
    if (proximoPassoEm && agente) {
      const ultimo = eventos.length ? eventos[eventos.length - 1]!.em : t0
      eventos.push({
        tipo: 'proximo_passo',
        texto: PASSOS_TEXTO[spec.etapa] ?? 'Definir o próximo passo',
        dados: { em: proximoPassoEm.toISOString() },
        em: mais(ultimo, 10 * MIN),
      })
    }
    // Nada acontece no futuro.
    for (const e of eventos) e.em = limitarAoPassado(e.em)
    const contatos = eventos.filter(e => TIPOS_CONTATO.includes(e.tipo))
    const ultimoContatoEm = contatos.length ? contatos[contatos.length - 1]!.em : null
    const ultimaAtividade = eventos.length ? new Date(Math.max(...eventos.map(e => e.em.getTime()))) : criadoEm

    const atribuicao = agente && spec.etapa === 'ganho' ? atribuicaoDe(agente) : null
    const ganhoEm = spec.etapa === 'ganho' ? limitarAoPassado(fechadoEm ?? limiteFim) : null
    const [lead] = await tx
      .insert(vendasLeads)
      .values({
        scope: escopo,
        tenantId,
        tipo: spec.tipo,
        nome: spec.nome,
        documento: null,
        email: l.emailLead,
        telefone: l.telefone,
        cidade: spec.cidade,
        uf: 'RJ',
        origem: spec.origem,
        origemDetalhe: spec.detalhe,
        etapa: spec.etapa,
        agenteId: agente?.id ?? null,
        reivindicadoEm: agente && spec.etapa !== 'novo' && !l.doBalcao ? mais(criadoEm, 40 * MIN) : null,
        poolDesde: agente ? null : criadoEm,
        proximoPasso: proximoPassoEm ? (PASSOS_TEXTO[spec.etapa] ?? null) : null,
        proximoPassoEm,
        ultimoContatoEm,
        interessePlanoId: l.interessePlanoId,
        valorEstimado: dinheiro(spec.valor || l.valorMensal),
        vidasEstimadas: spec.vidas,
        atribuicao,
        conversao: null,
        ganhoEm,
        perdidoEm: spec.etapa === 'perdido' ? limitarAoPassado(fechadoEm ?? limiteFim) : null,
        motivoPerda: spec.etapa === 'perdido' ? (spec.motivo ?? 'Sem interesse') : null,
        observacoes: spec.tipo === 'empresa' ? 'Decisão em conjunto com a diretoria; contato pelo RH.' : l.doBalcao ? null : 'Prefere contato por WhatsApp.',
        dados: { demo: MARCA },
        createdByUserId: null,
        createdAt: criadoEm,
        updatedAt: ultimaAtividade,
      })
      .returning()
    const leadRow = lead!

    const linhasEvento = [
      {
        leadId: leadRow.id,
        tipo: 'criado' as TipoEventoLead,
        texto: `Lead cadastrado (${spec.origem === 'balcao' ? 'balcão' : 'origem: ' + (spec.detalhe ?? spec.origem)}).`,
        dados: { origem: spec.origem } as Record<string, unknown> | null,
        porUserId: null,
        porAgenteId: agente?.id ?? null,
        em: criadoEm,
      },
      ...(agente
        ? [
            {
              leadId: leadRow.id,
              tipo: (spec.etapa === 'novo' || l.doBalcao ? 'atribuido' : 'reivindicado') as TipoEventoLead,
              texto: spec.etapa === 'novo' || l.doBalcao ? `Lead atribuído a ${agente.nome}.` : `Lead atendido por ${agente.nome}.`,
              dados: { de: null, para: agente.id } as Record<string, unknown> | null,
              porUserId: null,
              porAgenteId: agente.id,
              em: limitarAoPassado(mais(criadoEm, 5 * MIN)),
            },
          ]
        : []),
      ...eventos.map(e => ({
        leadId: leadRow.id,
        tipo: e.tipo,
        texto: e.texto,
        dados: e.dados,
        porUserId: null,
        porAgenteId: agente?.id ?? null,
        em: e.em,
      })),
    ]
    await tx.insert(vendasLeadEventos).values(linhasEvento)
    conta('eventos de lead', true, linhasEvento.length)

    // Comissões de demonstração (só ganhos com dono): 100/50/25 do vendedor + overrides da cadeia.
    if (agente && atribuicao && ganhoEm) {
      const corr = agente.corretoraId ? corretoraPorId.get(agente.corretoraId) : null
      const overridesCorretora = (corr?.comissaoOverrides ?? null) as OverridesComissao | null
      const refBase = `${PREFIXO_COBRANCA}${escopo === 'platform' ? 'PLAT' : 'CLUBE'}-${String(l.refIdx).padStart(2, '0')}`
      const origemCobranca = escopo === 'platform' ? 'platform' : 'club'
      const linhas: (typeof vendasComissoes.$inferInsert)[] = []
      let prevista = false
      for (let parcela = 1; parcela <= 3; parcela++) {
        const vencimento = new Date(ganhoEm.getTime() + (parcela - 1) * 30 * D)
        const futura = vencimento > agora
        if (futura && (prevista || l.refIdx % 2 === 1)) continue
        if (futura) prevista = true
        const cobrancas: { tipo: 'mensalidade' | 'adesao'; valorPago: number }[] = [{ tipo: 'mensalidade', valorPago: l.valorMensal }]
        if (parcela === 1 && l.adesao > 0) cobrancas.push({ tipo: 'adesao', valorPago: l.adesao })
        for (const cb of cobrancas) {
          const res = comissoesDaCobranca({
            config: configs[escopo],
            overridesCorretora,
            atribuicao,
            agora: vencimento,
            cobranca: { id: `${refBase}-P${parcela}`, origem: origemCobranca, tipo: cb.tipo, parcela, valorPago: cb.valorPago, avulsa: false },
          })
          const diasDesdeCobranca = (agora.getTime() - vencimento.getTime()) / D
          const status = futura ? 'prevista' : diasDesdeCobranca > 25 ? 'paga' : 'a_pagar'
          const quando = futura ? agora : vencimento
          for (const x of res.linhas) {
            linhas.push({
              scope: escopo,
              tenantId,
              leadId: leadRow.id,
              beneficiarioAgenteId: x.beneficiarioAgenteId,
              beneficiarioCorretoraId: x.beneficiarioCorretoraId,
              parte: x.parte,
              tipo: cb.tipo,
              parcela,
              cobrancaOrigem: origemCobranca,
              cobrancaRef: `${refBase}-P${parcela}`,
              base: dinheiro(x.base),
              percentual: String(x.percentual),
              valor: dinheiro(x.valor),
              status,
              mesReferencia: x.mesReferencia,
              pagoEm: status === 'paga' ? mais(vencimento, 18 * D) : null,
              pagamentoRef: status === 'paga' ? `${PREFIXO_COBRANCA}PAG-${String(l.refIdx).padStart(2, '0')}-P${parcela}` : null,
              observacao: 'Dado de demonstração',
              createdAt: quando,
              updatedAt: status === 'paga' ? mais(vencimento, 18 * D) : quando,
            })
          }
        }
      }
      if (linhas.length) {
        const inseridas = await tx.insert(vendasComissoes).values(linhas).onConflictDoNothing().returning({ id: vendasComissoes.id })
        conta(`comissões (${rotulo})`, true, inseridas.length)
        conta(`comissões (${rotulo})`, false, linhas.length - inseridas.length)
      }
    }
  }

  const emailUnico = (nome: string) => {
    let email = `${slugEmail(nome)}@example.com`
    for (let k = 2; emailsUsados.has(email); k++) email = `${slugEmail(nome)}.${k}@example.com`
    emailsUsados.add(email)
    return email
  }

  // Plataforma
  let n = 0
  let refIdx = 0
  for (const spec of LEADS_PLATAFORMA) {
    n++
    const plano = spec.plano !== null && planosPlat.length ? planosPlat[Math.min(spec.plano, planosPlat.length - 1)]! : null
    if (spec.etapa === 'ganho') refIdx++
    await criarLead({
      escopo: 'platform', spec, telefone: fone(n), emailLead: emailUnico(spec.nome), interessePlanoId: plano?.id ?? null,
      valorMensal: spec.valor, adesao: spec.valor, refIdx,
    })
  }

  // Clube
  n = 100
  refIdx = 0
  for (const spec0 of LEADS_CLUBE) {
    n++
    const plano = planoDe(spec0.plano ?? 0)
    const spec: LeadSpec = { ...spec0, valor: Number(plano.priceMonthly) }
    if (spec.etapa === 'ganho') refIdx++
    await criarLead({
      escopo: 'tenant', spec, telefone: fone(n), emailLead: emailUnico(spec.nome), interessePlanoId: plano.id,
      valorMensal: spec.valor, adesao: Number(plano.enrollmentFee ?? 0), refIdx,
    })
  }

  // Balcão: o lead nasce 20 min antes do atendimento (o balcão cadastra e atende na mesma visita).
  n = 200
  let i = 0
  for (const a of ATENDIMENTOS) {
    n++
    i++
    const agente = agentes.get(a.dono)!
    const plano = planoDe(a.plano)
    const desconto = plano.balcaoDescontoPercentual ?? 30
    const sim = simularEconomiaBalcao({
      valorTabela: a.valor,
      descontoPercentual: desconto,
      precoMensal: Number(plano.priceMonthly),
      adesao: Number(plano.enrollmentFee ?? 0),
    })
    const quando =
      a.dias === 0
        ? new Date(Math.max(diaSP(0, 0, 5).getTime(), agora.getTime() - (25 + (i % 5) * 55) * MIN))
        : limitarAoPassado(diaSP(-a.dias, 9 + ((i * 3) % 8), (i * 7) % 60))
    const telefone = fone(n)
    const [ex] = await tx
      .select({ id: vendasAtendimentosBalcao.id })
      .from(vendasAtendimentosBalcao)
      .where(and(eq(vendasAtendimentosBalcao.tenantId, orgId), eq(vendasAtendimentosBalcao.agenteId, agente.id), eq(vendasAtendimentosBalcao.telefone, telefone)))
      .limit(1)
    conta('atendimentos de balcão', !ex)
    if (ex) continue

    const etapa: EtapaLead = a.resultado === 'assinou' ? 'ganho' : a.resultado === 'recusou' ? 'perdido' : 'em_contato'
    const passo: Passo = a.resultado === 'vai_pensar' ? (a.dias <= 3 ? 'futuro' : 'atrasado') : null
    const emailLead = emailUnico(a.nome)
    if (etapa === 'ganho') refIdx++
    const spec: LeadSpec = {
      nome: a.nome, tipo: 'pessoa', cidade: 'Rio de Janeiro', origem: 'balcao', detalhe: a.servico, etapa, dono: a.dono,
      valor: Number(plano.priceMonthly), vidas: 1, plano: a.plano, idade: a.dias, fecho: etapa === 'em_contato' ? null : a.dias, passo,
      motivo: a.resultado === 'recusou' ? 'Não quis aderir no balcão' : null,
    }
    await criarLead({
      escopo: 'tenant', spec, telefone, emailLead, interessePlanoId: plano.id, valorMensal: Number(plano.priceMonthly),
      adesao: Number(plano.enrollmentFee ?? 0), refIdx, criadoEm: mais(quando, -20 * MIN),
      fechadoEm: etapa === 'em_contato' ? undefined : quando, doBalcao: true,
    })
    const [leadRow] = await tx
      .select({ id: vendasLeads.id })
      .from(vendasLeads)
      .where(and(escopoWhere(vendasLeads, 'tenant', orgId), eq(vendasLeads.email, emailLead)))
      .limit(1)
    await tx.insert(vendasAtendimentosBalcao).values({
      tenantId: orgId,
      agenteId: agente.id,
      unidadeId: agente.unidadeId,
      leadId: leadRow?.id ?? null,
      nome: a.nome,
      documento: null,
      telefone,
      servico: a.servico,
      valorTabela: dinheiro(a.valor),
      descontoPercentual: desconto,
      valorComPlano: dinheiro(sim.valorComPlano),
      planoId: plano.id,
      resultado: a.resultado,
      observacoes: `${nomePrimeiro(a.nome)} ${a.resultado === 'assinou' ? 'aderiu ao ' + plano.name : a.resultado === 'vai_pensar' ? 'vai conversar em casa antes de decidir' : 'não quis aderir agora'}. Economia simulada de R$ ${dinheiro(sim.economiaNaConsulta).replace('.', ',')} nesta consulta.`,
      assinaturaId: null,
      createdAt: quando,
      updatedAt: quando,
    })
  }
}

// ---------------------------------------------------------------------------
// Remoção
// ---------------------------------------------------------------------------

async function removerDemo(tx: Tx, orgId: string) {
  const rel: [string, number][] = []
  const reg = (k: string, v: number) => rel.push([k, v])
  const avisos: string[] = []

  const usuarios = await tx.select({ id: user.id, email: user.email }).from(user).where(inArray(user.email, EMAILS_DEMO))
  const userIds = usuarios.map(u => u.id)
  const ags = userIds.length ? await tx.select().from(vendasAgentes).where(inArray(vendasAgentes.userId, userIds)) : []
  const agIds = ags.map(a => a.id)

  // 1) Comissões demo (prefixo DEMO-).
  const cm = await tx.delete(vendasComissoes).where(like(vendasComissoes.cobrancaRef, `${PREFIXO_COBRANCA}%`)).returning({ id: vendasComissoes.id })
  reg('comissões', cm.length)

  // 2) Leads demo (marca em `dados`) e seus eventos (cascade).
  const marcaLead = dsql`${vendasLeads.dados}->>'demo' = ${MARCA}`
  const leadsDemo = await tx.select({ id: vendasLeads.id }).from(vendasLeads).where(marcaLead)
  let nEventos = 0
  if (leadsDemo.length) {
    const r = await tx
      .select({ n: dsql<number>`count(*)::int` })
      .from(vendasLeadEventos)
      .where(inArray(vendasLeadEventos.leadId, leadsDemo.map(l => l.id)))
    nEventos = r[0]?.n ?? 0
  }
  reg('eventos de lead', nEventos)
  const ld = await tx.delete(vendasLeads).where(marcaLead).returning({ id: vendasLeads.id })
  reg('leads', ld.length)

  // 3) Atendimentos demo: agente demo + telefone fictício.
  let nAt = 0
  if (agIds.length) {
    const at = await tx
      .delete(vendasAtendimentosBalcao)
      .where(and(inArray(vendasAtendimentosBalcao.agenteId, agIds), dsql`${vendasAtendimentosBalcao.telefone} ~ '^21900000[0-9]{3}$'`))
      .returning({ id: vendasAtendimentosBalcao.id })
    nAt = at.length
  }
  reg('atendimentos de balcão', nAt)

  // 4) Lead REAL atribuído a agente demo: volta ao pool (nunca é apagado).
  let devolvidos = 0
  if (agIds.length) {
    const reais = await tx.select({ id: vendasLeads.id, agenteId: vendasLeads.agenteId }).from(vendasLeads).where(inArray(vendasLeads.agenteId, agIds))
    if (reais.length) {
      await tx
        .update(vendasLeads)
        .set({ agenteId: null, reivindicadoEm: null, poolDesde: new Date(), updatedAt: new Date() })
        .where(inArray(vendasLeads.id, reais.map(r => r.id)))
      await tx.insert(vendasLeadEventos).values(
        reais.map(r => ({
          leadId: r.id,
          tipo: 'devolvido_pool' as TipoEventoLead,
          texto: 'Devolvido ao pool: o agente de demonstração foi removido.',
          dados: { motivo: 'remocao_demo', agenteAnteriorId: r.agenteId } as Record<string, unknown>,
          porUserId: null,
          porAgenteId: null,
          em: new Date(),
        })),
      )
      devolvidos = reais.length
    }
  }
  reg('leads reais devolvidos ao pool (preservados)', devolvidos)

  // 5) Agentes: quem ainda tem atendimento ou comissão REAIS fica (inativo, com a conta).
  const retidos = new Set<string>()
  if (agIds.length) {
    const comAt = await tx.selectDistinct({ id: vendasAtendimentosBalcao.agenteId }).from(vendasAtendimentosBalcao).where(inArray(vendasAtendimentosBalcao.agenteId, agIds))
    const comCm = await tx.selectDistinct({ id: vendasComissoes.beneficiarioAgenteId }).from(vendasComissoes).where(inArray(vendasComissoes.beneficiarioAgenteId, agIds))
    for (const r of [...comAt, ...comCm]) if (r.id) retidos.add(r.id)
    if (retidos.size) {
      await tx.update(vendasAgentes).set({ ativo: false, updatedAt: new Date() }).where(inArray(vendasAgentes.id, [...retidos]))
      avisos.push(`${retidos.size} agente(s) com atendimento/comissão real foram mantidos (inativos) junto com a conta.`)
    }
  }
  const apagarAg = agIds.filter(id => !retidos.has(id))
  let nAg = 0
  if (apagarAg.length) nAg = (await tx.delete(vendasAgentes).where(inArray(vendasAgentes.id, apagarAg)).returning({ id: vendasAgentes.id })).length
  reg('agentes', nAg)
  reg('agentes mantidos (dado real vinculado)', retidos.size)

  // 6) Estrutura, pelos nomes/CNPJs fixos. Só apaga se nada mais aponta para ela; senão inativa.
  const escopos: { escopo: Escopo; tenantId: string | null }[] = [
    { escopo: 'platform', tenantId: null },
    { escopo: 'tenant', tenantId: orgId },
  ]
  let eqDel = 0, unDel = 0, coDel = 0, inat = 0
  for (const { escopo, tenantId } of escopos) {
    for (const e of EQUIPES.filter(x => x.escopo === escopo)) {
      const [row] = await tx.select().from(vendasEquipes).where(and(escopoWhere(vendasEquipes, escopo, tenantId), eq(vendasEquipes.nome, e.nome))).limit(1)
      if (!row) continue
      const [ref] = await tx.select({ id: vendasAgentes.id }).from(vendasAgentes).where(eq(vendasAgentes.equipeId, row.id)).limit(1)
      if (ref) {
        await tx.update(vendasEquipes).set({ status: 'inativa', updatedAt: new Date() }).where(eq(vendasEquipes.id, row.id))
        inat++
      } else {
        await tx.delete(vendasEquipes).where(eq(vendasEquipes.id, row.id))
        eqDel++
      }
    }
    const nomesUn = [
      ...CORRETORAS.filter(c => c.escopo === escopo).map(c => c.unidade.nome),
      ...(escopo === 'tenant' ? UNIDADES_PROPRIAS.map(u => u.nome) : []),
    ]
    for (const nome of nomesUn) {
      const [row] = await tx.select().from(vendasUnidades).where(and(escopoWhere(vendasUnidades, escopo, tenantId), eq(vendasUnidades.nome, nome))).limit(1)
      if (!row) continue
      const [ref] = await tx.select({ id: vendasAgentes.id }).from(vendasAgentes).where(eq(vendasAgentes.unidadeId, row.id)).limit(1)
      const [refEq] = await tx.select({ id: vendasEquipes.id }).from(vendasEquipes).where(eq(vendasEquipes.unidadeId, row.id)).limit(1)
      const [refAt] = await tx.select({ id: vendasAtendimentosBalcao.id }).from(vendasAtendimentosBalcao).where(eq(vendasAtendimentosBalcao.unidadeId, row.id)).limit(1)
      if (ref || refEq || refAt) {
        await tx.update(vendasUnidades).set({ status: 'inativa', updatedAt: new Date() }).where(eq(vendasUnidades.id, row.id))
        inat++
      } else {
        await tx.delete(vendasUnidades).where(eq(vendasUnidades.id, row.id))
        unDel++
      }
    }
    for (const c of CORRETORAS.filter(x => x.escopo === escopo)) {
      const [row] = await tx.select().from(vendasCorretoras).where(and(escopoWhere(vendasCorretoras, escopo, tenantId), eq(vendasCorretoras.cnpj, c.cnpj))).limit(1)
      if (!row) continue
      const [ref] = await tx.select({ id: vendasAgentes.id }).from(vendasAgentes).where(eq(vendasAgentes.corretoraId, row.id)).limit(1)
      const [cmRef] = await tx.select({ id: vendasComissoes.id }).from(vendasComissoes).where(eq(vendasComissoes.beneficiarioCorretoraId, row.id)).limit(1)
      if (ref || cmRef) {
        await tx.update(vendasCorretoras).set({ status: 'inativa', updatedAt: new Date() }).where(eq(vendasCorretoras.id, row.id))
        inat++
      } else {
        await tx.delete(vendasCorretoras).where(eq(vendasCorretoras.id, row.id))
        coDel++
      }
    }
  }
  reg('equipes', eqDel)
  reg('unidades', unDel)
  reg('corretoras', coDel)
  reg('estruturas mantidas e inativadas (ainda referenciadas)', inat)

  // 7) Contas: member, seller_profiles, platform_sellers, account, session, user.
  const apagarUser = usuarios.filter(u => !ags.some(a => a.userId === u.id && retidos.has(a.id)))
  let mb = 0, sp = 0, ps = 0, ac = 0, se = 0, us = 0
  for (const u of apagarUser) {
    // Conta com vínculo em OUTRO clube não é só demo: fica.
    const [outro] = await tx
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.userId, u.id), dsql`${member.organizationId} <> ${orgId}`))
      .limit(1)
    if (outro) {
      avisos.push(`Conta ${u.email} tem vínculo com outro clube: mantida.`)
      continue
    }
    try {
      await tx.transaction(async sub => {
        mb += (await sub.delete(member).where(eq(member.userId, u.id)).returning({ id: member.id })).length
        sp += (await sub.delete(sellerProfiles).where(eq(sellerProfiles.userId, u.id)).returning({ id: sellerProfiles.userId })).length
        ps += (await sub.delete(platformSellers).where(eq(platformSellers.userId, u.id)).returning({ id: platformSellers.userId })).length
        ac += (await sub.delete(account).where(eq(account.userId, u.id)).returning({ id: account.id })).length
        se += (await sub.delete(session).where(eq(session.userId, u.id)).returning({ id: session.id })).length
        us += (await sub.delete(user).where(eq(user.id, u.id)).returning({ id: user.id })).length
      })
    } catch (e) {
      avisos.push(`Conta ${u.email} não pôde ser apagada (referenciada por outro dado): ${(e as Error).message.slice(0, 120)}`)
    }
  }
  reg('member', mb)
  reg('seller_profiles', sp)
  reg('platform_sellers', ps)
  reg('account', ac)
  reg('session', se)
  reg('user', us)

  // 8) Catálogo do seed-mepcard-rio (só com --remover-catalogo).
  if (removerCatalogo) {
    let pDel = 0, pInat = 0
    for (const nome of CATALOGO_PLANOS) {
      const [pl] = await tx.select().from(clubPlans).where(and(eq(clubPlans.organizationId, orgId), eq(clubPlans.name, nome))).limit(1)
      if (!pl) continue
      const [sub] = await tx.select({ id: clubSubscriptions.id }).from(clubSubscriptions).where(eq(clubSubscriptions.clubPlanId, pl.id)).limit(1)
      if (sub) {
        await tx.update(clubPlans).set({ status: 'inactive' }).where(eq(clubPlans.id, pl.id))
        pInat++
        avisos.push(`Plano "${nome}" tem assinatura vinculada: NÃO foi apagado, ficou inativo.`)
      } else {
        await tx.delete(clubPlans).where(eq(clubPlans.id, pl.id))
        pDel++
      }
    }
    reg('planos', pDel)
    reg('planos mantidos e inativados (têm assinatura)', pInat)
    const b = await tx.delete(benefits).where(and(eq(benefits.organizationId, orgId), inArray(benefits.name, CATALOGO_BENEFICIOS))).returning({ id: benefits.id })
    reg('benefícios', b.length)
    const pa = await tx.delete(partners).where(and(eq(partners.organizationId, orgId), inArray(partners.name, CATALOGO_PARCEIROS))).returning({ id: partners.id })
    reg('parceiros', pa.length)
  }
  return { rel, avisos }
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

async function main() {
  const [org] = await db.select().from(organization).where(eq(organization.slug, slug)).limit(1)
  if (!org) {
    console.error(`Clube "${slug}" não existe. Abortado.`)
    await sql.end()
    process.exit(1)
  }
  const modo = remover ? (removerCatalogo ? 'REMOVER DEMO + CATÁLOGO' : 'REMOVER DEMO') : redefinirSenhas ? 'CRIAR + REDEFINIR SENHAS' : 'CRIAR'
  console.log(`Clube: ${org.name} (${org.slug})  modo: ${modo}  ${dryRun ? 'DRY-RUN (nada é gravado)' : 'GRAVAR'}`)

  const credenciais: Credencial[] = []
  let relatorio: { rel: [string, number][]; avisos: string[] } | null = null
  try {
    await db.transaction(async tx => {
      if (remover) relatorio = await removerDemo(tx, org.id)
      else await criarDemo(tx, org.id, credenciais)
      if (dryRun) throw new Desfazer()
    })
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e
  }

  const rem = relatorio as { rel: [string, number][]; avisos: string[] } | null
  if (remover && rem) {
    console.log(dryRun ? '\nResumo da remoção (DRY-RUN: nada foi alterado; contagens do que seria afetado):' : '\nResumo da remoção (contagens):')
    for (const [k, v] of rem.rel) console.log(`  ${k}: ${v}`)
    if (rem.avisos.length) {
      console.log('\nAvisos:')
      for (const a of rem.avisos) console.log(`  - ${a}`)
    }
  } else {
    console.log(dryRun ? '\nResumo (DRY-RUN, nada gravado):' : '\nResumo:')
    for (const [tipo, r] of resumo) console.log(`  ${tipo}: ${dryRun ? 'criaria' : 'criado'} ${r.criado} / já existia ${r.existia}`)
    if (dryRun) {
      console.log('\n(dry-run: nenhuma senha é gerada nem exibida)')
    } else if (credenciais.length === 0) {
      console.log('\nNenhuma senha nova nesta execução (as contas já tinham senha). Use --redefinir-senhas para gerar novas.')
    } else {
      const url = (e: Escopo) => (e === 'platform' ? `${WEB}/login` : `${WEB}/${org.slug}/login`)
      console.log('\nCONTAS DE DEMONSTRAÇÃO (anote agora: as senhas não ficam gravadas em lugar nenhum)\n')
      console.log(['Área', 'URL de login', 'E-mail', 'Senha'].join(' | '))
      for (const c of credenciais) console.log([c.area, url(c.escopo), c.email, c.senha].join(' | '))
    }
  }
  await sql.end()
}

main().catch(async err => {
  console.error('Falhou (transação desfeita):', err)
  await sql.end().catch(() => {})
  process.exit(1)
})
