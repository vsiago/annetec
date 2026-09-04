/**
 * Confere, contra o upstream de verdade, as correções feitas a partir da sonda:
 *   1. tabela de preço deixa de vir vazia (lê `tabelaPrecoApiList`);
 *   2. `estadoCivil` deixa de chegar nulo (grafia certa);
 *   3. busca sem resultado vira lista vazia em vez de erro (400 "Nenhum ...");
 *   4. o 401 por operação diz o que realmente aconteceu;
 *   5. `raw` volta a ser realmente cru (passthrough).
 */
import 'dotenv/config'
import { createDigitalSaudeClient } from '../src/integrations/digitalsaude/client'
import { mapContract, mapConvenio, mapPlan, mapPriceTable } from '../src/integrations/digitalsaude/mappers'

const client = createDigitalSaudeClient({
  baseUrl: process.env.DIGITALSAUDE_BASE_URL!,
  appToken: process.env.DIGITALSAUDE_APP_TOKEN!,
  apiPassword: process.env.DIGITALSAUDE_API_PASSWORD!,
  label: 'verify',
})

let falhas = 0
function checa(rotulo: string, ok: boolean, detalhe: string) {
  console.log(`${ok ? 'OK  ' : 'FALHA'} ${rotulo}`)
  console.log(`      ${detalhe}`)
  if (!ok) falhas++
}

async function main() {
  const convenios = await client.call('convenioListar')
  const convenio = mapConvenio(convenios[0]!)
  checa(
    '1a. convenio traz estipulante e proximo reajuste',
    convenio.stipulatorName !== null || convenio.nextAdjustmentDate !== null,
    `estipulante=${convenio.stipulatorName} proximoReajuste=${convenio.nextAdjustmentDate} diaVigencia=${convenio.effectiveDay}`,
  )

  const tabelas = await client.call('tabelaPorConvenio', { codigoConvenio: convenios[0]!.codigo! })
  const tabela = mapPriceTable(tabelas[0]!)
  checa(
    '1b. tabela de preco com faixas e valores',
    tabela.entries.length > 0 && tabela.entries.some(e => (e.chargeValue ?? 0) > 0),
    `${tabela.name}: ${tabela.entries.length} faixa(s), grupo=${tabela.groupCodigo}, 1a faixa=${tabela.entries[0]?.ageRangeName} R$ ${tabela.entries[0]?.chargeValue}`,
  )

  const planos = await client.call('planoPorProduto', { codigoProduto: convenios[0]!.produto!.codigo! })
  const plano = mapPlan(planos[0]!)
  checa(
    '1c. plano traz registro ANS, abrangencia e status',
    plano.ansRegistration !== null,
    `${plano.name}: ANS=${plano.ansRegistration} abrangencia=${plano.coverage} status=${plano.status} acomodacao=${plano.accommodation}`,
  )

  // ------------------------------------------------ contrato / estado civil
  const vencidas = await client.call('faturaVencidas')
  const fatura = await client.one('faturaPorCodigo', { codigoFatura: vencidas[0]! })
  const cpf = fatura?.beneficiario?.cpf?.replace(/\D/g, '')
  const contratos = cpf ? await client.call('contratoPorCpfTitular', { cpf }) : []
  const contrato = contratos[0] ? mapContract(contratos[0]) : null

  checa(
    '2. beneficiario com estado civil',
    contrato?.beneficiaries.some(b => b.maritalStatus !== null) ?? false,
    contrato?.beneficiaries.map(b => `${b.name.slice(0, 18)}=${b.maritalStatus}`).join(' · ') ?? 'sem contrato',
  )

  checa(
    '2b. cadeia comercial do contrato',
    contrato?.brokerUpstreamCodigo !== null || contrato?.supervisorUpstreamCodigo !== null,
    `produtor=${contrato?.sellerUpstreamCodigo} corretora=${contrato?.brokerName} supervisor=${contrato?.supervisorUpstreamCodigo} gerente=${contrato?.managerUpstreamCodigo} grupo=${contrato?.groupName}`,
  )

  checa(
    '5. raw preserva campo nao declarado no Swagger',
    contrato != null && 'id' in (contrato.raw as object) && 'corretora' in (contrato.raw as object),
    `chaves em raw: ${Object.keys((contrato?.raw ?? {}) as object).length}`,
  )

  // --------------------------------------------- busca vazia nao e mais erro
  try {
    const atendimentos = await client.call('atendimentoPorContrato', {
      codigoContrato: contrato?.upstreamCodigo ?? 'X',
      codigoTipoAtendimento: '1',
    })
    checa(
      '3a. atendimento sem resultado devolve lista vazia',
      Array.isArray(atendimentos) && atendimentos.length === 0,
      `retorno=${JSON.stringify(atendimentos)}`,
    )
  } catch (error) {
    checa('3a. atendimento sem resultado devolve lista vazia', false, `ainda lanca: ${(error as Error).message}`)
  }

  try {
    const produtores = await client.call('produtorPorLogin', { loginProdutor: 'inexistente-annetec' })
    checa(
      '3b. produtor por login inexistente devolve lista vazia',
      Array.isArray(produtores) && produtores.length === 0,
      `retorno=${JSON.stringify(produtores)}`,
    )
  } catch (error) {
    checa('3b. produtor por login inexistente devolve lista vazia', false, `ainda lanca: ${(error as Error).message}`)
  }

  // ------------------------------------------------------ 401 por operacao
  try {
    await client.call('calculoSimular', {
      nome: 'Teste',
      uf: 'RJ',
      calculoVidaList: [{ idade: 30, parentesco: { id: 1 } }],
    })
    checa('4. mensagem do 401 nomeia a operacao', false, 'calculo passou (endpoint foi liberado?)')
  } catch (error) {
    const msg = (error as Error).message
    checa('4. mensagem do 401 nomeia a operacao', msg.includes('calculoSimular'), msg)
  }

  // ---------------------------------------------------- produtor completo
  if (contrato?.sellerUpstreamCodigo) {
    const produtor = await client.one('produtorPorCodigo', { codigoProdutor: contrato.sellerUpstreamCodigo })
    checa(
      '6. produtor expoe grupoProdutor (fim da digitacao manual)',
      produtor?.grupoProdutor?.codigo != null,
      `grupoProdutor=${produtor?.grupoProdutor?.codigo} (${produtor?.grupoProdutor?.nome}) filial=${produtor?.filial?.codigo} login=${JSON.stringify(produtor?.login)}`,
    )
  }

  console.log(`\n${falhas === 0 ? 'TODAS AS CORRECOES CONFERIDAS' : `${falhas} verificacao(oes) falharam`}`)
  process.exit(falhas === 0 ? 0 : 1)
}

main().catch(error => {
  console.error('verificacao falhou:', error)
  process.exit(1)
})
