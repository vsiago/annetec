/**
 * O detector de drift mostrou que `tabela` traz DOIS campos de preço:
 * `tabelaPrecoList` (o que models.ts declara) e `tabelaPrecoApiList` (novo).
 * Se o primeiro vier vazio e o segundo cheio, a Annetec está lendo tabela de
 * preço vazia — e cotação sem preço é o coração do fluxo de venda.
 *
 * Mesma dúvida para `estatoCivil` (grafia do Swagger) x `estadoCivil` (o que o
 * servidor devolve de verdade) e para `grupo` x `grupoApi`.
 */
import 'dotenv/config'

const base = process.env.DIGITALSAUDE_BASE_URL!
const headers = {
  token: process.env.DIGITALSAUDE_APP_TOKEN!,
  senhaApi: process.env.DIGITALSAUDE_API_PASSWORD!,
  accept: 'application/json',
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

  console.log('=== TABELA DE PRECO: tabelaPrecoList x tabelaPrecoApiList ===\n')
  for (const c of convenios.slice(0, 4)) {
    const tabelas = (await get(`/tabela/procurarPorConvenio?codigoConvenio=${c.codigo}`)) ?? []
    for (const t of tabelas) {
      const legado = t.tabelaPrecoList?.length ?? 0
      const novo = t.tabelaPrecoApiList?.length ?? 0
      console.log(`${t.nome}`)
      console.log(`   tabelaPrecoList    (nosso schema): ${legado} faixa(s)`)
      console.log(`   tabelaPrecoApiList (descartado)  : ${novo} faixa(s)`)
      console.log(`   grupo (nosso schema): ${JSON.stringify(t.grupo)}`)
      console.log(`   grupoApi (descartado): ${JSON.stringify(t.grupoApi)?.slice(0, 120)}`)
      if (novo > 0) {
        console.log(`   amostra do descartado: ${JSON.stringify(t.tabelaPrecoApiList[0])}`)
      }
      if (legado > 0) {
        console.log(`   amostra do nosso: ${JSON.stringify(t.tabelaPrecoList[0])}`)
      }
      console.log('')
    }
  }

  console.log('=== BENEFICIARIO: estatoCivil (Swagger) x estadoCivil (servidor) ===\n')
  const vencidas = (await get('/fatura/procurarPorVencida')) ?? []
  const fatura = vencidas[0] ? await get(`/fatura/${vencidas[0]}`) : null
  const faturaObj = Array.isArray(fatura) ? fatura[0] : fatura
  const cpf = faturaObj?.beneficiario?.cpf?.replace(/\D/g, '')
  if (cpf) {
    const contratos = (await get(`/contrato/procurarPorCpfTitular?cpf=${cpf}`)) ?? []
    const b = contratos[0]?.beneficiarioList?.[0]
    if (b) {
      console.log(`   'estatoCivil' presente no payload? ${'estatoCivil' in b}`)
      console.log(`   'estadoCivil' presente no payload? ${'estadoCivil' in b}`)
      console.log(`   valor de estadoCivil: ${JSON.stringify(b.estadoCivil)}`)
      console.log(`   declaracaoSaudeList: ${JSON.stringify(b.declaracaoSaudeList)?.slice(0, 200)}`)
    }
    const ct = contratos[0]
    if (ct) {
      console.log('\n=== CONTRATO: hierarquia comercial que descartamos ===\n')
      for (const papel of ['produtor', 'corretora', 'supervisor', 'gerente', 'angariador']) {
        const v = ct[papel]
        console.log(`   ${papel.padEnd(11)}: ${v ? `${v.codigo ?? '?'} ${v.nome ?? ''}`.slice(0, 60) : 'null'}`)
      }
      console.log(`   pendenciaList: ${JSON.stringify(ct.pendenciaList)?.slice(0, 200)}`)
      console.log(`   matricula: ${JSON.stringify(ct.matricula)} · dataExclusao: ${JSON.stringify(ct.dataExclusao)}`)
      console.log(`   origemVenda: ${JSON.stringify(ct.origemVenda)} · entidade: ${JSON.stringify(ct.entidade)}`)
    }
  }

  console.log('\n=== FATURA: pixList (descartado) ===\n')
  if (faturaObj) {
    console.log(`   pixList: ${JSON.stringify(faturaObj.pixList)?.slice(0, 300)}`)
    console.log(`   linhaDigitavel: ${JSON.stringify(faturaObj.linhaDigitavel)?.slice(0, 80)}`)
    console.log(`   dataVencimentoCobranca: ${JSON.stringify(faturaObj.dataVencimentoCobranca)}`)
  }

  console.log('\n=== CONVENIO: estipulante (a entidade mais proxima de "administradora") ===\n')
  console.log(`   ${JSON.stringify(convenios[0]?.estipulante)?.slice(0, 400)}`)
  console.log(`   registroAns do plano, diaVigencia e dataProximoReajuste do convenio:`)
  console.log(`   diaVigencia=${convenios[0]?.diaVigencia} dataProximoReajuste=${convenios[0]?.dataProximoReajuste}`)
}

main().catch(console.error)
