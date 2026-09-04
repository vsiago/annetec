/**
 * Sonda de cobertura da Digital Saúde — SOMENTE LEITURA.
 *
 * Percorre todos os módulos legíveis do ERP encadeando descobertas (um convênio
 * revela produto e filial; uma tabela revela o grupo; uma fatura vencida revela
 * o CPF do titular, que revela o contrato) e registra, endpoint a endpoint, o
 * que responde, o que vem vazio e o que quebra. É o levantamento que diz até
 * onde a integração chega sem passo manual no portal.
 *
 * Nenhuma chamada aqui cria, altera ou dispara e-mail. `calculo` é POST mas é
 * simulação de preço, sem efeito colateral.
 *
 * Uso: pnpm --filter @annetec/api exec tsx scripts/probe-digitalsaude.ts
 */
import 'dotenv/config'
import { writeFileSync } from 'node:fs'
import { createDigitalSaudeClient } from '../src/integrations/digitalsaude/client'

type Row = {
  modulo: string
  endpoint: string
  entrada: string
  resultado: 'OK' | 'VAZIO' | 'ERRO'
  itens: number | null
  detalhe: string
}

const rows: Row[] = []
const discovered = {
  convenios: [] as { codigo: string; nome: string }[],
  produtos: new Set<string>(),
  filiais: new Map<string, string>(),
  grupos: new Map<string, string>(),
  planos: new Set<string>(),
  carencias: new Set<string>(),
  tabelas: new Set<string>(),
  contratos: new Set<string>(),
  cpfs: new Set<string>(),
  produtores: new Map<string, string>(),
  faturas: new Set<string>(),
  statusFaturaIds: new Map<number, string>(),
  statusContrato: new Map<string, string>(),
}

const client = createDigitalSaudeClient({
  baseUrl: process.env.DIGITALSAUDE_BASE_URL!,
  appToken: process.env.DIGITALSAUDE_APP_TOKEN!,
  apiPassword: process.env.DIGITALSAUDE_API_PASSWORD!,
  label: 'probe',
})

async function probe<T>(
  modulo: string,
  endpoint: string,
  entrada: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    const result = await fn()
    const itens = Array.isArray(result) ? result.length : result == null ? 0 : 1
    rows.push({
      modulo,
      endpoint,
      entrada,
      resultado: itens === 0 ? 'VAZIO' : 'OK',
      itens,
      detalhe: itens === 0 ? '-' : preview(result),
    })
    return result
  } catch (error) {
    rows.push({
      modulo,
      endpoint,
      entrada,
      resultado: 'ERRO',
      itens: null,
      detalhe: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

function preview(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value
  if (first == null) return '-'
  if (typeof first !== 'object') return String(first).slice(0, 80)
  return Object.entries(first as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .slice(0, 4)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? '{..}' : String(v).slice(0, 24)}`)
    .join(' ')
}

async function main() {
  const started = Date.now()
  console.log('=== SONDA DIGITAL SAUDE (somente leitura) ===\n')

  // ---------------------------------------------------------------- catálogo
  console.log('[1/7] catalogo - convenio, produto, filial')
  const convenios = await probe('convenio', 'convenioListar', '-', () => client.call('convenioListar'))
  for (const c of convenios ?? []) {
    if (c.codigo) discovered.convenios.push({ codigo: c.codigo, nome: c.nome ?? '' })
    if (c.produto?.codigo) discovered.produtos.add(c.produto.codigo)
    for (const f of c.filialList ?? []) if (f.codigo) discovered.filiais.set(f.codigo, f.nome ?? '')
  }
  const amostraConvenios = discovered.convenios.slice(0, 3)
  for (const c of amostraConvenios) {
    await probe('convenio', 'convenioPorCodigo', c.codigo, () =>
      client.one('convenioPorCodigo', { codigoConvenio: c.codigo }),
    )
  }

  // ------------------------------------------------------------------ plano
  console.log('[2/7] plano / carencia / tabela')
  for (const codigoProduto of [...discovered.produtos].slice(0, 3)) {
    const planos = await probe('plano', 'planoPorProduto', `produto=${codigoProduto}`, () =>
      client.call('planoPorProduto', { codigoProduto }),
    )
    for (const p of planos ?? []) if (p.codigo) discovered.planos.add(p.codigo)
  }
  for (const codigoPlano of [...discovered.planos].slice(0, 2)) {
    await probe('plano', 'planoPorCodigo', codigoPlano, () =>
      client.one('planoPorCodigo', { codigoPlano }),
    )
  }
  for (const c of amostraConvenios) {
    const carencias = await probe('carencia', 'carenciaPorConvenio', c.codigo, () =>
      client.call('carenciaPorConvenio', { codigoConvenio: c.codigo }),
    )
    for (const k of carencias ?? []) if (k.codigo) discovered.carencias.add(k.codigo)

    const tabelas = await probe('tabela', 'tabelaPorConvenio', c.codigo, () =>
      client.call('tabelaPorConvenio', { codigoConvenio: c.codigo }),
    )
    for (const t of tabelas ?? []) {
      if (t.codigo) discovered.tabelas.add(t.codigo)
      // A tabela é o único lugar da API de leitura que revela o código do grupo.
      if (t.grupo?.codigo) discovered.grupos.set(t.grupo.codigo, t.grupo.nome ?? '')
    }
  }
  for (const codigoCarencia of [...discovered.carencias].slice(0, 2)) {
    await probe('carencia', 'carenciaPorCodigo', codigoCarencia, () =>
      client.one('carenciaPorCodigo', { codigoCarencia }),
    )
  }
  for (const codigoTabela of [...discovered.tabelas].slice(0, 2)) {
    await probe('tabela', 'tabelaPorCodigo', codigoTabela, () =>
      client.one('tabelaPorCodigo', { codigoTabela }),
    )
  }

  // ---------------------------------------------------------------- cálculo
  console.log('[3/7] calculo (cotacao)')
  const nomeCotacao = amostraConvenios[0]?.nome ?? 'AMEP'
  await probe('calculo', 'calculoSimular', `nome=${nomeCotacao} uf=RJ 1 vida 30a`, () =>
    client.call('calculoSimular', {
      nome: nomeCotacao,
      uf: 'RJ',
      calculoVidaList: [{ idade: 30, parentesco: { id: 1 } }],
    }),
  )

  // ----------------------------------------------------- faturas → carteira
  console.log('[4/7] fatura vencida -> CPF -> contrato')
  const vencidas = await probe('fatura', 'faturaVencidas', '-', () => client.call('faturaVencidas'))
  for (const codigo of (vencidas ?? []).slice(0, 8)) {
    discovered.faturas.add(codigo)
    const fatura = await probe('fatura', 'faturaPorCodigo', codigo, () =>
      client.one('faturaPorCodigo', { codigoFatura: codigo }),
    )
    const cpf = fatura?.beneficiario?.cpf
    if (cpf) discovered.cpfs.add(cpf.replace(/\D/g, ''))
    if (fatura?.statusFatura?.id != null) {
      discovered.statusFaturaIds.set(fatura.statusFatura.id, fatura.statusFatura.nome ?? '')
    }
  }

  console.log('[5/7] contrato')
  for (const cpf of [...discovered.cpfs].slice(0, 4)) {
    const contratos = await probe('contrato', 'contratoPorCpfTitular', `cpf=***${cpf.slice(-4)}`, () =>
      client.call('contratoPorCpfTitular', { cpf }),
    )
    for (const ct of contratos ?? []) {
      if (ct.codigo) discovered.contratos.add(ct.codigo)
      if (ct.produtor?.codigo) discovered.produtores.set(ct.produtor.codigo, ct.produtor.nome ?? '')
      if (ct.grupo?.codigo) discovered.grupos.set(ct.grupo.codigo, ct.grupo.nome ?? '')
      if (ct.filial?.codigo) discovered.filiais.set(ct.filial.codigo, ct.filial.nome ?? '')
      if (ct.statusContrato?.nome) {
        discovered.statusContrato.set(String(ct.statusContrato.id), ct.statusContrato.nome)
      }
    }
  }
  const contratoAmostra = [...discovered.contratos][0]
  if (contratoAmostra) {
    await probe('contrato', 'contratoPorCodigo', contratoAmostra, () =>
      client.one('contratoPorCodigo', { codigoContrato: contratoAmostra }),
    )
  }

  // --------------------------------------- mapa real de idStatusFatura (1..12)
  console.log('[6/7] varredura de idStatusFatura (tabela nao documentada)')
  if (contratoAmostra) {
    for (let id = 1; id <= 12; id++) {
      const faturas = await probe(
        'fatura',
        'faturaPorContrato',
        `contrato=${contratoAmostra} status=${id}`,
        () => client.call('faturaPorContrato', { codigoContrato: contratoAmostra, idStatusFatura: id }),
      )
      for (const f of faturas ?? []) {
        if (f.statusFatura?.id != null) {
          discovered.statusFaturaIds.set(f.statusFatura.id, f.statusFatura.nome ?? '')
        }
      }
    }
    await probe('demonstrativo', 'demonstrativoPorContrato', contratoAmostra, () =>
      client.call('demonstrativoPorContrato', { codigoContrato: contratoAmostra }),
    )
    for (const tipo of ['1', '2', '3']) {
      await probe('atendimento', 'atendimentoPorContrato', `contrato=${contratoAmostra} tipo=${tipo}`, () =>
        client.call('atendimentoPorContrato', {
          codigoContrato: contratoAmostra,
          codigoTipoAtendimento: tipo,
        }),
      )
    }
  }

  // --------------------------------------------------------------- produtor
  console.log('[7/7] produtor / recibo')
  for (const [codigo] of [...discovered.produtores].slice(0, 2)) {
    const produtor = await probe('produtor', 'produtorPorCodigo', codigo, () =>
      client.one('produtorPorCodigo', { codigoProdutor: codigo }),
    )
    if (produtor?.numeroDocumento) {
      await probe('produtor', 'produtorPorDocumento', 'doc do produtor', () =>
        client.call('produtorPorDocumento', {
          numeroDocumento: produtor.numeroDocumento!.replace(/\D/g, ''),
        }),
      )
    }
  }
  await probe('produtor', 'produtorPorLogin', 'login=teste (sonda)', () =>
    client.call('produtorPorLogin', { loginProdutor: 'teste' }),
  )
  await probe('recibo', 'reciboEmitidos', 'login/senha do produtor (nao temos)', () =>
    client.call('reciboEmitidos', { login: 'probe', senha: 'probe' }),
  )

  // ------------------------------------------------------------- relatório
  const okCount = rows.filter(r => r.resultado === 'OK').length
  const vazioCount = rows.filter(r => r.resultado === 'VAZIO').length
  const erroCount = rows.filter(r => r.resultado === 'ERRO').length

  console.log('\n=== RESULTADO POR CHAMADA ===')
  console.table(rows.map(r => ({ ...r, detalhe: r.detalhe.slice(0, 60) })))

  console.log('\n=== DESCOBERTO SEM TOCAR NO PORTAL ===')
  console.log(`convenios : ${discovered.convenios.length}`)
  console.log(`produtos  : ${discovered.produtos.size} -> ${[...discovered.produtos].join(', ')}`)
  console.log(
    `filiais   : ${discovered.filiais.size} -> ${[...discovered.filiais].map(([c, n]) => `${c}(${n})`).join(', ')}`,
  )
  console.log(
    `GRUPOS    : ${discovered.grupos.size} -> ${[...discovered.grupos].map(([c, n]) => `${c}(${n})`).join(', ')}`,
  )
  console.log(`planos    : ${discovered.planos.size}`)
  console.log(`carencias : ${discovered.carencias.size}`)
  console.log(`tabelas   : ${discovered.tabelas.size}`)
  console.log(`faturas   : ${discovered.faturas.size}`)
  console.log(`CPFs      : ${discovered.cpfs.size}`)
  console.log(`contratos : ${discovered.contratos.size} -> ${[...discovered.contratos].join(', ')}`)
  console.log(
    `produtores: ${discovered.produtores.size} -> ${[...discovered.produtores].map(([c, n]) => `${c}(${n})`).join(', ')}`,
  )
  console.log(
    `idStatusFatura observados: ${[...discovered.statusFaturaIds].map(([id, n]) => `${id}=${n}`).join(', ') || 'nenhum'}`,
  )
  console.log(
    `statusContrato observados: ${[...discovered.statusContrato].map(([id, n]) => `${id}=${n}`).join(', ') || 'nenhum'}`,
  )

  console.log(
    `\n${okCount} OK · ${vazioCount} vazio · ${erroCount} erro · ${Math.round((Date.now() - started) / 1000)}s`,
  )

  writeFileSync(
    'probe-digitalsaude.json',
    JSON.stringify({ rows, discovered: serialize(discovered) }, null, 2),
  )
  console.log('\nRelatorio salvo em apps/api/probe-digitalsaude.json')
}

function serialize(d: typeof discovered) {
  return {
    ...d,
    produtos: [...d.produtos],
    filiais: Object.fromEntries(d.filiais),
    grupos: Object.fromEntries(d.grupos),
    planos: [...d.planos],
    carencias: [...d.carencias],
    tabelas: [...d.tabelas],
    contratos: [...d.contratos],
    cpfs: [...d.cpfs].map(c => `***${c.slice(-4)}`),
    produtores: Object.fromEntries(d.produtores),
    faturas: [...d.faturas],
    statusFaturaIds: Object.fromEntries(d.statusFaturaIds),
    statusContrato: Object.fromEntries(d.statusContrato),
  }
}

main().catch(error => {
  console.error('\nSonda falhou:', error)
  process.exit(1)
})
