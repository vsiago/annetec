/**
 * Detector de campo novo do upstream.
 *
 * `models.ts` foi escrito a partir do Swagger publicado; o servidor de produção
 * devolve mais do que o Swagger declara (o primeiro achado foi
 * `dataProximoReajuste` em convênio). Zod ignora chave extra em silêncio, então
 * esses campos somem sem ninguém notar. Este script bate o JSON cru contra o
 * schema e lista o que estamos jogando fora.
 */
import 'dotenv/config'

const base = process.env.DIGITALSAUDE_BASE_URL!
const headers = {
  token: process.env.DIGITALSAUDE_APP_TOKEN!,
  senhaApi: process.env.DIGITALSAUDE_API_PASSWORD!,
  accept: 'application/json',
}

/** Chaves declaradas em packages/contracts/src/digitalsaude/models.ts. */
const conhecidas: Record<string, string[]> = {
  convenio: ['codigo', 'nome', 'valorTaxaCadastro', 'tipoTaxaCadastro', 'produto', 'filialList'],
  produto: ['codigo', 'nome', 'operadora', 'anexoList', 'opcionalList'],
  plano: ['codigo', 'nome', 'produto', 'acomodacao'],
  tabela: ['codigo', 'nome', 'dataVigencia', 'grupo', 'tabelaPrecoList'],
  tabelaPreco: ['id', 'valorCobranca', 'valorNet', 'dataVigencia', 'plano', 'faixaEtaria'],
  contrato: [
    'codigo', 'nomeTitular', 'numeroProposta', 'dataInclusao', 'dataAssinatura', 'diaVencimento',
    'cpfResponsavel', 'nomeResponsavel', 'saldoDevedor', 'observacao', 'valor', 'plano',
    'statusContrato', 'convenio', 'produtor', 'grupo', 'filial', 'beneficiarioList', 'anexoList',
    'opcionalList',
  ],
  beneficiario: [
    'codigo', 'nome', 'dataNascimento', 'marcaOptica', 'linkCarteiraProvisoria', 'rg', 'orgaoEmissor',
    'cpf', 'dnv', 'cns', 'pis', 'nomeMae', 'endereco', 'numero', 'complemento', 'bairro', 'municipio',
    'uf', 'cep', 'dddTelefone', 'telefone', 'dddCelular', 'celular', 'email', 'emailSecundario',
    'altura', 'peso', 'imc', 'dataVigencia', 'mensalidade', 'carencia', 'estatoCivil',
    'tipoBeneficiario', 'sexo', 'parentesco', 'statusBeneficiario',
  ],
  fatura: [
    'codigo', 'dataFatura', 'dataVencimento', 'numero', 'ano', 'mes', 'valorCobranca', 'linkFatura',
    'linkReciboPagamento', 'linhaDigitavel', 'dataPagamento', 'registrado', 'beneficiario', 'statusFatura',
  ],
  produtor: ['codigo', 'nome', 'numeroDocumento'],
  carencia: ['codigo', 'nome'],
}

const achados: { entidade: string; campo: string; exemplo: string }[] = []

function inspecionar(entidade: string, obj: unknown, profundidade = 0) {
  if (obj == null || typeof obj !== 'object' || profundidade > 2) return
  if (Array.isArray(obj)) {
    if (obj[0]) inspecionar(entidade, obj[0], profundidade)
    return
  }
  const declaradas = conhecidas[entidade]
  if (!declaradas) return
  for (const [chave, valor] of Object.entries(obj as Record<string, unknown>)) {
    if (!declaradas.includes(chave)) {
      const exemplo = typeof valor === 'object' ? JSON.stringify(valor).slice(0, 60) : String(valor).slice(0, 40)
      if (!achados.some(a => a.entidade === entidade && a.campo === chave)) {
        achados.push({ entidade, campo: chave, exemplo })
      }
    }
  }
}

async function get(path: string): Promise<any> {
  const res = await fetch(base + path, { headers })
  const buf = await res.arrayBuffer()
  const charset = /charset=([^;]+)/i.exec(res.headers.get('content-type') ?? '')?.[1]?.trim()
  const text = new TextDecoder(charset && charset.toLowerCase() !== 'utf-8' ? charset : 'utf-8').decode(buf)
  if (!res.ok) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function main() {
  const convenios = (await get('/convenio/')) ?? []
  for (const c of convenios.slice(0, 5)) {
    inspecionar('convenio', c)
    inspecionar('produto', c.produto)
  }

  const codigoProduto = convenios[0]?.produto?.codigo
  if (codigoProduto) {
    const planos = (await get(`/plano/procurarPorProduto?codigoProduto=${codigoProduto}`)) ?? []
    for (const p of planos) inspecionar('plano', p)
  }

  const tabelas = (await get(`/tabela/procurarPorConvenio?codigoConvenio=${convenios[0]?.codigo}`)) ?? []
  for (const t of tabelas) {
    inspecionar('tabela', t)
    for (const tp of t.tabelaPrecoList ?? []) inspecionar('tabelaPreco', tp)
  }

  const vencidas = (await get('/fatura/procurarPorVencida')) ?? []
  const fatura = vencidas[0] ? await get(`/fatura/${vencidas[0]}`) : null
  const faturaObj = Array.isArray(fatura) ? fatura[0] : fatura
  if (faturaObj) {
    inspecionar('fatura', faturaObj)
    inspecionar('beneficiario', faturaObj.beneficiario)
    const cpf = faturaObj.beneficiario?.cpf?.replace(/\D/g, '')
    if (cpf) {
      const contratos = (await get(`/contrato/procurarPorCpfTitular?cpf=${cpf}`)) ?? []
      for (const ct of contratos) {
        inspecionar('contrato', ct)
        inspecionar('produtor', ct.produtor)
        inspecionar('convenio', ct.convenio)
        for (const b of ct.beneficiarioList ?? []) inspecionar('beneficiario', b)
      }
    }
  }

  console.log('=== CAMPOS QUE O UPSTREAM DEVOLVE E O NOSSO SCHEMA DESCARTA ===\n')
  if (achados.length === 0) {
    console.log('nenhum — models.ts cobre tudo que veio nesta amostra')
  } else {
    console.table(achados)
    console.log(`\n${achados.length} campo(s) sendo perdidos silenciosamente.`)
  }
}

main().catch(console.error)
