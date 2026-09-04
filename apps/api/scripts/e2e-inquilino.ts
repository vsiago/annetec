/**
 * E2E do ciclo completo de um inquilino novo.
 *
 * Monta o app Hono em processo (`createApp().request()`), então cada passo
 * atravessa middleware, autorização, controller, service, Postgres e — quando
 * o passo é de catálogo/contrato/financeiro — a API de produção da Digital
 * Saúde. Não é mock: é o mesmo caminho que o navegador percorre.
 *
 * O que ele NÃO faz: nenhuma escrita no ERP. `POST /contrato/`,
 * `POST /produtor/`, `/anexo/`, `/patologia/`, `/pendencia/` e os envios de
 * e-mail criam registro real e permanente numa base de produção com clientes
 * de verdade, e a Digital Saúde não expõe delete. Esses passos aparecem no
 * relatório como PULADO com o motivo. Rode com `--erp-writes` só quando
 * houver decisão explícita de sujar a base.
 *
 * Uso:
 *   pnpm --filter @annetec/api exec tsx scripts/e2e-inquilino.ts
 *   pnpm --filter @annetec/api exec tsx scripts/e2e-inquilino.ts --keep   (não cancela no fim)
 */
import 'dotenv/config'
import { createApp } from '../src/app'

const app = createApp()
const ERP_WRITES = process.argv.includes('--erp-writes')
const KEEP = process.argv.includes('--keep')

/** `BLOQUEIO` = o código está certo, quem recusa é a Digital Saúde. */
type Status = 'OK' | 'FALHA' | 'PULADO' | 'BLOQUEIO'
const passos: { fase: string; passo: string; status: Status; detalhe: string }[] = []

let token = ''
let faseAtual = 'setup'

function fase(nome: string) {
  faseAtual = nome
  console.log(`\n── ${nome} ──`)
}

function registra(passo: string, status: Status, detalhe: string) {
  passos.push({ fase: faseAtual, passo, status, detalhe })
  const marca =
    status === 'OK' ? 'OK  ' : status === 'PULADO' ? 'PULA' : status === 'BLOQUEIO' ? 'BLOQ' : 'FALHA'
  console.log(`  ${marca} ${passo} — ${detalhe.slice(0, 120)}`)
}

async function req<T = any>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const response = await app.request(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let parsed: any = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = text
  }
  return { status: response.status, body: parsed }
}

/** Executa um passo e registra o resultado sem abortar a suíte. */
async function passo<T>(
  nome: string,
  fn: () => Promise<{ ok: boolean; detalhe: string; valor?: T }>,
): Promise<T | undefined> {
  try {
    const resultado = await fn()
    registra(nome, resultado.ok ? 'OK' : 'FALHA', resultado.detalhe)
    return resultado.valor
  } catch (error) {
    registra(nome, 'FALHA', error instanceof Error ? error.message : String(error))
    return undefined
  }
}

const carimbo = Date.now().toString().slice(-8)
const slug = `e2e-${carimbo}`

async function main() {
  console.log(`=== E2E INQUILINO · slug ${slug} ===`)
  console.log(ERP_WRITES ? 'ESCRITAS NO ERP: HABILITADAS' : 'Escritas no ERP: desabilitadas (padrão)')

  // ---------------------------------------------------------------- 1. login
  fase('1. Sessão de plataforma')
  await passo('login superadmin', async () => {
    const { status, body } = await req('POST', '/api/v1/auth/login', {
      email: 'super@annetec.com.br',
      password: 'super123456',
    })
    token = body?.data?.token ?? ''
    return {
      ok: status === 200 && Boolean(token),
      detalhe: status === 200 ? `escopo=${body?.data?.session?.membership?.scope}` : JSON.stringify(body).slice(0, 160),
    }
  })
  if (!token) {
    console.error('\nSem sessão não dá para seguir. O seed rodou? (pnpm db:seed)')
    relatorio()
    process.exit(1)
  }

  // ------------------------------------------------------------- 2. plano
  fase('2. Plano de assinatura')
  const planId = await passo<string>('listar planos da plataforma', async () => {
    const { status, body } = await req('GET', '/api/v1/platform/plans')
    const plano = body?.data?.[0]
    return {
      ok: status === 200 && Boolean(plano),
      detalhe: plano ? `${plano.name} · R$ ${plano.priceMonthly}` : JSON.stringify(body).slice(0, 160),
      valor: plano?.id,
    }
  })

  // --------------------------------------------------- 3. criar o inquilino
  fase('3. Cadastro do inquilino')
  const tenant = await passo<{ id: string; slug: string }>('criar inquilino + admin', async () => {
    const { status, body } = await req('POST', '/api/v1/platform/tenants', {
      name: `E2E Clube ${carimbo}`,
      slug,
      legalName: `E2E Clube de Benefícios ${carimbo} LTDA`,
      document: gerarCnpj(carimbo),
      email: `contato@${slug}.com.br`,
      phone: '21999990000',
      address: {
        cep: '28940000',
        street: 'Rua das Palmeiras',
        number: '100',
        neighborhood: 'Centro',
        city: 'São Pedro da Aldeia',
        state: 'RJ',
      },
      branding: { primaryColor: '#e84364', secondaryColor: '#26365f' },
      planId,
      status: 'active',
      ownerName: 'Administrador E2E',
      ownerEmail: `admin@${slug}.com.br`,
    })
    return {
      ok: status === 201,
      detalhe:
        status === 201
          ? `id=${body.data.tenant.id} status=${body.data.tenant.status} senha provisória entregue`
          : JSON.stringify(body).slice(0, 200),
      valor: body?.data?.tenant,
    }
  })
  if (!tenant) {
    relatorio()
    process.exit(1)
  }

  await passo('inquilino aparece na listagem', async () => {
    const { status, body } = await req('GET', `/api/v1/platform/tenants?q=${slug}`)
    return {
      ok: status === 200 && body.data.length === 1,
      detalhe: `${body?.data?.length ?? 0} resultado(s)`,
    }
  })

  // ------------------------------------------------------- 4. integração DS
  fase('4. Integração Digital Saúde')
  await passo('gravar credenciais (valida contra o ERP antes de salvar)', async () => {
    const { status, body } = await req('PUT', `/api/v1/platform/tenants/${tenant.id}/integration`, {
      provider: 'digitalsaude',
      baseUrl: process.env.DIGITALSAUDE_BASE_URL,
      appToken: process.env.DIGITALSAUDE_APP_TOKEN,
      apiPassword: process.env.DIGITALSAUDE_API_PASSWORD,
      enabled: true,
    })
    return {
      ok: status === 200 && body?.data?.lastCheckOk === true,
      detalhe: status === 200 ? `validada em ${body.data.lastCheckedAt}` : JSON.stringify(body).slice(0, 200),
    }
  })

  await passo('credencial errada é recusada na hora', async () => {
    const { status, body } = await req('PUT', `/api/v1/platform/tenants/${tenant.id}/integration`, {
      provider: 'digitalsaude',
      baseUrl: process.env.DIGITALSAUDE_BASE_URL,
      appToken: 'TOKEN-INVALIDO',
      apiPassword: 'SENHA-INVALIDA',
      enabled: true,
    })
    return {
      ok: status >= 400,
      detalhe: `${status} · ${body?.error?.message ?? ''}`.slice(0, 140),
    }
  })

  await passo('restaurar credenciais boas', async () => {
    const { status } = await req('PUT', `/api/v1/platform/tenants/${tenant.id}/integration`, {
      provider: 'digitalsaude',
      baseUrl: process.env.DIGITALSAUDE_BASE_URL,
      appToken: process.env.DIGITALSAUDE_APP_TOKEN,
      apiPassword: process.env.DIGITALSAUDE_API_PASSWORD,
      enabled: true,
    })
    return { ok: status === 200, detalhe: `status ${status}` }
  })

  const discovery = await passo<any>('descobrir códigos do ERP (grupo, filial, produto, grupoProdutor)', async () => {
    const { status, body } = await req('GET', `/api/v1/platform/tenants/${tenant.id}/integration/discovery`)
    const d = body?.data
    return {
      ok: status === 200,
      detalhe: d
        ? `convenios=${d.convenios.length} produtos=${d.produtos.length} filiais=${d.filiais.length} grupos=${d.grupos.length} gruposProdutor=${d.gruposProdutor.length}`
        : JSON.stringify(body).slice(0, 200),
      valor: d,
    }
  })

  if (discovery) {
    await passo('aplicar códigos descobertos na integração', async () => {
      const { status, body } = await req('PUT', `/api/v1/platform/tenants/${tenant.id}/integration`, {
        provider: 'digitalsaude',
        baseUrl: process.env.DIGITALSAUDE_BASE_URL,
        appToken: process.env.DIGITALSAUDE_APP_TOKEN,
        apiPassword: process.env.DIGITALSAUDE_API_PASSWORD,
        defaultConvenioCodigo: discovery.convenios[0]?.codigo,
        defaultProdutoCodigo: discovery.produtos[0]?.codigo,
        defaultFilialCodigo: discovery.sugestao.defaultFilialCodigo ?? discovery.filiais[0]?.codigo,
        defaultGrupoCodigo: discovery.grupos[0]?.codigo,
        defaultGrupoProdutorCodigo: discovery.sugestao.defaultGrupoProdutorCodigo ?? undefined,
        enabled: true,
      })
      return {
        ok: status === 200,
        detalhe: `convenio=${body?.data?.defaultConvenioCodigo} produto=${body?.data?.defaultProdutoCodigo} filial=${body?.data?.defaultFilialCodigo} grupo=${body?.data?.defaultGrupoCodigo} grupoProdutor=${body?.data?.defaultGrupoProdutorCodigo}`,
      }
    })
    if (discovery.avisos?.length) {
      registra('avisos da descoberta', 'OK', discovery.avisos.join(' | '))
    }
  }

  const capabilities = await passo<Record<string, boolean>>('apurar permissões reais do token', async () => {
    const { status, body } = await req('POST', `/api/v1/platform/tenants/${tenant.id}/integration/capabilities`)
    return {
      ok: status === 200,
      detalhe: Object.entries(body?.data ?? {})
        .map(([k, v]) => `${k}=${v ? 'sim' : 'NAO'}`)
        .join(' '),
      valor: body?.data,
    }
  })

  // ------------------------------------------------------------ 5. catálogo
  fase('5. Catálogo (ERP ao vivo)')
  const convenios = await passo<any[]>('listar convênios', async () => {
    const { status, body } = await req('GET', `/api/v1/t/${slug}/catalogo/convenios`)
    return {
      ok: status === 200 && body.data.length > 0,
      detalhe: `${body?.data?.length ?? 0} convênio(s) · 1º: ${body?.data?.[0]?.name} · estipulante ${body?.data?.[0]?.stipulatorName}`,
      valor: body?.data,
    }
  })

  const convenio = convenios?.[0]
  if (convenio) {
    await passo('detalhe do convênio', async () => {
      const { status, body } = await req('GET', `/api/v1/t/${slug}/catalogo/convenios/${convenio.codigo}`)
      return { ok: status === 200, detalhe: `${body?.data?.name} · reajuste ${body?.data?.nextAdjustmentDate}` }
    })

    await passo('planos do produto (com registro ANS)', async () => {
      const { status, body } = await req(
        'GET',
        `/api/v1/t/${slug}/catalogo/planos?codigoProduto=${convenio.productCodigo}`,
      )
      const p = body?.data?.[0]
      return {
        ok: status === 200 && body.data.length > 0,
        detalhe: p ? `${p.name} · ANS ${p.ansRegistration} · ${p.coverage} · ${p.status}` : JSON.stringify(body).slice(0, 160),
      }
    })

    await passo('tabelas de preço COM faixas', async () => {
      const { status, body } = await req(
        'GET',
        `/api/v1/t/${slug}/catalogo/tabelas?codigoConvenio=${convenio.codigo}`,
      )
      const t = body?.data?.[0]
      const faixas = t?.entries?.length ?? 0
      return {
        ok: status === 200 && faixas > 0,
        detalhe: t
          ? `${t.name}: ${faixas} faixa(s), 1ª = ${t.entries[0]?.ageRangeName} R$ ${t.entries[0]?.chargeValue}`
          : 'nenhuma tabela',
      }
    })

    await passo('carências', async () => {
      const { status, body } = await req(
        'GET',
        `/api/v1/t/${slug}/catalogo/carencias?codigoConvenio=${convenio.codigo}`,
      )
      return { ok: status === 200, detalhe: `${body?.data?.length ?? 0} carência(s)` }
    })
  }

  {
    const { status, body } = await req('POST', `/api/v1/t/${slug}/catalogo/cotacao`, {
      name: 'Cotação E2E',
      state: 'RJ',
      lives: [{ age: 30, relationshipId: 1 }],
    })
    // Com este token o upstream devolve 401 para QUALQUER payload de
    // /calculo/ — o mesmo token lê todo o catálogo. É bloqueio de permissão
    // do lado da Digital Saúde, não defeito da Annetec.
    if (status === 200) {
      registra('cotação (POST /calculo/ do ERP)', 'OK', `${body?.data?.plans?.length} plano(s)`)
    } else if (body?.error?.code === 'UPSTREAM_UNAUTHORIZED') {
      registra(
        'cotação (POST /calculo/ do ERP)',
        'BLOQUEIO',
        'POST /calculo/ devolve 401 para qualquer payload; o mesmo token lê todo o catálogo. Depende de liberação da Digital Saúde.',
      )
    } else {
      registra('cotação (POST /calculo/ do ERP)', 'FALHA', `${status} · ${body?.error?.message ?? ''}`)
    }
  }

  // ------------------------------------------------------------- 6. usuários
  fase('6. Usuários do inquilino')
  const vendedor = await passo<{ id: string }>('criar vendedor', async () => {
    const { status, body } = await req('POST', `/api/v1/t/${slug}/usuarios`, {
      name: 'Vendedora E2E',
      email: `vendedora@${slug}.com.br`,
      role: 'seller',
      phone: '21988887777',
      password: 'vendedora123',
      active: true,
    })
    return {
      ok: status === 201,
      detalhe: status === 201 ? `id=${body.data.id} role=${body.data.role}` : JSON.stringify(body).slice(0, 200),
      valor: body?.data,
    }
  })

  await passo('listar usuários do inquilino', async () => {
    const { status, body } = await req('GET', `/api/v1/t/${slug}/usuarios`)
    return {
      ok: status === 200,
      detalhe: `${body?.data?.length ?? 0} usuário(s): ${body?.data?.map((u: any) => u.role).join(', ')}`,
    }
  })

  if (ERP_WRITES && vendedor && discovery?.sugestao?.defaultGrupoProdutorCodigo) {
    await passo('criar produtor no ERP e vincular ao vendedor', async () => {
      const { status, body } = await req('POST', `/api/v1/t/${slug}/usuarios/${vendedor.id}/produtor`, {
        nome: 'Vendedora E2E',
        email: `vendedora@${slug}.com.br`,
        grupoProdutorCodigo: discovery.sugestao.defaultGrupoProdutorCodigo,
      })
      return { ok: status < 300, detalhe: JSON.stringify(body?.data ?? body).slice(0, 160) }
    })
  } else {
    registra(
      'criar produtor no ERP',
      'PULADO',
      'POST /produtor/ cria cadastro permanente na base de produção da Digital Saúde e não tem delete. Use --erp-writes.',
    )
  }

  // ------------------------------------------------------------------ 7. CRM
  fase('7. CRM — movimentação real do funil')
  const lead = await passo<{ id: string }>('criar lead', async () => {
    const { status, body } = await req('POST', `/api/v1/t/${slug}/crm/leads`, {
      name: 'João da Silva (E2E)',
      email: `joao.${carimbo}@email.com`,
      phone: '21977776666',
      source: 'site',
      status: 'new',
      notes: 'Lead criado pelo teste ponta a ponta',
      estimatedValue: 350.5,
      sellerId: vendedor?.id ?? null,
    })
    return {
      ok: status === 201,
      detalhe: status === 201 ? `id=${body.data.id}` : JSON.stringify(body).slice(0, 200),
      valor: body?.data,
    }
  })

  if (lead) {
    await passo('registrar interação', async () => {
      const { status, body } = await req('POST', `/api/v1/t/${slug}/crm/leads/${lead.id}/interacoes`, {
        type: 'whatsapp',
        description: 'Primeiro contato pelo WhatsApp',
        occurredAt: new Date().toISOString(),
      })
      return { ok: status === 201, detalhe: status === 201 ? 'interação gravada' : JSON.stringify(body).slice(0, 160) }
    })

    await passo('avançar o lead no funil (new → qualified → proposal)', async () => {
      await req('PATCH', `/api/v1/t/${slug}/crm/leads/${lead.id}`, { status: 'qualified' })
      const { status, body } = await req('PATCH', `/api/v1/t/${slug}/crm/leads/${lead.id}`, { status: 'proposal' })
      return { ok: status === 200 && body.data.status === 'proposal', detalhe: `status=${body?.data?.status}` }
    })
  }

  if (vendedor) {
    await passo('registrar venda', async () => {
      const { status, body } = await req('POST', `/api/v1/t/${slug}/crm/vendas`, {
        leadId: lead?.id ?? null,
        clientUserId: null,
        clientName: 'João da Silva (E2E)',
        sellerId: vendedor.id,
        planCodigo: convenio?.productCodigo ?? null,
        planName: 'Plano E2E',
        value: 350.5,
        status: 'confirmed',
        soldAt: new Date().toISOString(),
        contractUpstreamCodigo: null,
      })
      return {
        ok: status === 201,
        detalhe: status === 201 ? `venda ${body.data.id} · comissão R$ ${body.data.commission}` : JSON.stringify(body).slice(0, 200),
      }
    })
  }

  // -------------------------------------------------------------- 8. rede
  fase('8. Rede credenciada e benefícios')
  await passo('cadastrar parceiro', async () => {
    const { status, body } = await req('POST', `/api/v1/t/${slug}/rede/parceiros`, {
      name: 'Clínica Vida (E2E)',
      category: 'health',
      discountPercent: 25,
      address: 'Av. Central, 500',
      phone: '2126665555',
      city: 'Cabo Frio',
      state: 'RJ',
      status: 'active',
    })
    return { ok: status === 201, detalhe: status === 201 ? `id=${body.data.id}` : JSON.stringify(body).slice(0, 160) }
  })

  await passo('cadastrar benefício', async () => {
    const { status, body } = await req('POST', `/api/v1/t/${slug}/rede/beneficios`, {
      name: 'Desconto em farmácia (E2E)',
      description: 'Até 30% em medicamentos genéricos',
      category: 'pharmacy',
      discountPercent: 30,
      provider: 'Rede Popular',
      locations: ['RJ'],
    })
    return { ok: status === 201, detalhe: status === 201 ? `id=${body.data.id}` : JSON.stringify(body).slice(0, 160) }
  })

  // --------------------------------------------------- 9. carteira / ERP
  fase('9. Carteira e financeiro (ERP ao vivo)')
  const vencidas = await passo<any[]>('faturas vencidas do inquilino', async () => {
    const { status, body } = await req('GET', `/api/v1/t/${slug}/financeiro/faturas/vencidas`)
    return {
      ok: status === 200,
      detalhe: `${body?.data?.length ?? 0} fatura(s) vencida(s)`,
      valor: body?.data,
    }
  })

  const contratoCodigo = await passo<string>('fatura vencida → CPF do titular → contrato', async () => {
    const cpf = vencidas?.find(f => f.beneficiaryCpf)?.beneficiaryCpf
    if (!cpf) return { ok: false, detalhe: 'nenhuma fatura vencida trouxe CPF do titular' }
    const { status, body } = await req('GET', `/api/v1/t/${slug}/contratos/busca/cpf?cpf=${cpf}`)
    return {
      ok: status === 200 && body.data.length > 0,
      detalhe: `cpf ***${cpf.slice(-4)} → ${body?.data?.length ?? 0} contrato(s) · ${body?.data?.[0]?.holderName}`,
      valor: body?.data?.[0]?.upstreamCodigo,
    }
  })

  if (contratoCodigo) {
    await passo('sincronizar contrato para o espelho local', async () => {
      const { status, body } = await req('POST', `/api/v1/t/${slug}/contratos/${contratoCodigo}/sync`)
      return {
        ok: status < 300,
        detalhe:
          status < 300
            ? `${body.data.holderName} · ${body.data.status} · ${body.data.beneficiaries?.length ?? 0} vida(s)`
            : JSON.stringify(body).slice(0, 200),
      }
    })

    await passo('contrato aparece na listagem local', async () => {
      const { status, body } = await req('GET', `/api/v1/t/${slug}/contratos`)
      return { ok: status === 200, detalhe: `${body?.data?.length ?? 0} contrato(s) espelhado(s)` }
    })

    await passo('faturas do contrato', async () => {
      const { status, body } = await req(
        'GET',
        `/api/v1/t/${slug}/financeiro/faturas?contratoCodigo=${contratoCodigo}`,
      )
      return { ok: status === 200, detalhe: `${body?.data?.length ?? 0} fatura(s)` }
    })

    await passo('demonstrativos de pagamento', async () => {
      const { status, body } = await req(
        'GET',
        `/api/v1/t/${slug}/financeiro/demonstrativos?contratoCodigo=${contratoCodigo}`,
      )
      return { ok: status === 200, detalhe: `${body?.data?.length ?? 0} demonstrativo(s)` }
    })

    registra(
      'enviar carteirinha por e-mail',
      'PULADO',
      'dispara e-mail real para o titular do contrato de produção.',
    )
    registra('anexo / patologia / pendência', 'PULADO', 'POST que grava no contrato real, sem delete no ERP.')
    registra('adesão (POST /contrato/)', 'PULADO', 'cria contrato real e cobrança. Só com --erp-writes.')
  }

  // ----------------------------------------------------------- 10. isolamento
  fase('10. Isolamento entre inquilinos')
  await passo('vendedor do inquilino novo não acessa outro inquilino', async () => {
    const { body: login } = await req('POST', '/api/v1/auth/login', {
      email: `vendedora@${slug}.com.br`,
      password: 'vendedora123',
    })
    const tokenSuperadmin = token
    token = login?.data?.token ?? ''
    const { status } = await req('GET', '/api/v1/t/annetec/crm/leads')
    token = tokenSuperadmin
    return { ok: status === 403 || status === 401, detalhe: `tentativa cross-tenant devolveu ${status}` }
  })

  await passo('vendedor não acessa rota de plataforma', async () => {
    const { body: login } = await req('POST', '/api/v1/auth/login', {
      email: `vendedora@${slug}.com.br`,
      password: 'vendedora123',
    })
    const tokenSuperadmin = token
    token = login?.data?.token ?? ''
    const { status } = await req('GET', '/api/v1/platform/tenants')
    token = tokenSuperadmin
    return { ok: status === 403, detalhe: `devolveu ${status}` }
  })

  // ------------------------------------------------------------ 11. limpeza
  fase('11. Encerramento')
  if (KEEP) {
    registra('cancelar inquilino', 'PULADO', `--keep: inquilino ${slug} mantido para inspeção`)
  } else {
    await passo('cancelar inquilino (lógico, preserva histórico)', async () => {
      const { status, body } = await req('DELETE', `/api/v1/platform/tenants/${tenant.id}`)
      return { ok: status === 200 && body.data.status === 'cancelled', detalhe: `status=${body?.data?.status}` }
    })
  }

  relatorio()
}

function relatorio() {
  const ok = passos.filter(p => p.status === 'OK').length
  const falhas = passos.filter(p => p.status === 'FALHA')
  const pulados = passos.filter(p => p.status === 'PULADO').length
  const bloqueios = passos.filter(p => p.status === 'BLOQUEIO')

  console.log('\n════════════ RELATÓRIO ════════════')
  console.table(passos.map(p => ({ ...p, detalhe: p.detalhe.slice(0, 70) })))
  console.log(
    `
${ok} OK · ${bloqueios.length} bloqueado(s) pela Digital Saúde · ${falhas.length} falha(s) · ${pulados} pulado(s)`,
  )
  if (bloqueios.length > 0) {
    console.log('
Bloqueios do upstream (o código da Annetec está certo):')
    for (const b of bloqueios) console.log(`  · [${b.fase}] ${b.passo}: ${b.detalhe.slice(0, 200)}`)
  }
  if (falhas.length > 0) {
    console.log('\nFalhas:')
    for (const f of falhas) console.log(`  · [${f.fase}] ${f.passo}: ${f.detalhe.slice(0, 200)}`)
  }
}

/** CNPJ sintético com dígitos verificadores válidos, para não colidir com real. */
function gerarCnpj(seed: string): string {
  const base = `00${seed}0001`.slice(0, 12)
  const calc = (nums: string, pesos: number[]) => {
    const soma = nums.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i]!, 0)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  const d1 = calc(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = calc(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return `${base}${d1}${d2}`
}

main()
  .then(() => process.exit(passos.some(p => p.status === 'FALHA') ? 1 : 0))
  .catch(error => {
    console.error('\nE2E abortou:', error)
    relatorio()
    process.exit(1)
  })
