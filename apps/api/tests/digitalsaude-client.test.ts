import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDigitalSaudeClient } from '@/integrations/digitalsaude/client'
import { AppError } from '@/http/errors'

/**
 * Testa o contrato do cliente HTTP contra um `fetch` falso: headers de
 * autenticação, montagem de caminho/query, retry e tradução de erro. Nenhuma
 * chamada real sai daqui.
 */
type FetchArgs = Parameters<typeof fetch>

function stubFetch(handler: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const spy = vi.fn(async (input: FetchArgs[0], init?: FetchArgs[1]) => {
    const url = input instanceof URL ? input : new URL(String(input))
    return handler(url, (init ?? {}) as RequestInit)
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

const credentials = {
  baseUrl: 'https://digitalsaude.com.br/api/v2',
  appToken: 'token-de-teste',
  apiPassword: 'senha-de-teste',
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('autenticação', () => {
  it('envia token e senhaApi como headers em toda chamada', async () => {
    const spy = stubFetch(() => jsonResponse([]))
    await createDigitalSaudeClient(credentials).call('convenioListar')

    const init = spy.mock.calls[0]![1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.token).toBe('token-de-teste')
    expect(headers.senhaApi).toBe('senha-de-teste')
  })
})

describe('montagem da requisição', () => {
  it('interpola parâmetros de caminho', async () => {
    const spy = stubFetch(() => jsonResponse([{ codigo: 'C1' }]))
    await createDigitalSaudeClient(credentials).call('contratoPorCodigo', {
      codigoContrato: 'C1',
    })

    expect(String(spy.mock.calls[0]![0])).toBe(
      'https://digitalsaude.com.br/api/v2/contrato/C1',
    )
  })

  it('monta a query string a partir do schema do endpoint', async () => {
    const spy = stubFetch(() => jsonResponse([]))
    await createDigitalSaudeClient(credentials).call('faturaPorContrato', {
      codigoContrato: 'C1',
      idStatusFatura: 2,
    })

    const url = spy.mock.calls[0]![0] as URL
    expect(url.pathname).toBe('/api/v2/fatura/procurarPorContrato')
    expect(url.searchParams.get('codigoContrato')).toBe('C1')
    expect(url.searchParams.get('idStatusFatura')).toBe('2')
  })

  it('rejeita entrada inválida antes de sair para a rede', async () => {
    const spy = stubFetch(() => jsonResponse([]))
    const client = createDigitalSaudeClient(credentials)

    await expect(client.call('contratoPorClientePortal', { cpf: '1', email: 'x' })).rejects.toThrow(
      AppError,
    )
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('respostas', () => {
  it('one() desembrulha o array de um elemento que o upstream sempre devolve', async () => {
    stubFetch(() => jsonResponse([{ codigo: 'PL1', nome: 'Plano Ouro' }]))
    const plan = await createDigitalSaudeClient(credentials).one('planoPorCodigo', {
      codigoPlano: 'PL1',
    })
    expect(plan?.nome).toBe('Plano Ouro')
  })

  it('one() devolve null quando o array vem vazio', async () => {
    stubFetch(() => jsonResponse([]))
    const plan = await createDigitalSaudeClient(credentials).one('planoPorCodigo', {
      codigoPlano: 'PL1',
    })
    expect(plan).toBeNull()
  })

  it('aceita texto puro nos endpoints de envio de e-mail', async () => {
    stubFetch(
      () => new Response('E-mail enviado com sucesso', { headers: { 'content-type': 'text/plain' } }),
    )
    const message = await createDigitalSaudeClient(credentials).call('contratoEnviarCarteira', {
      codigoContrato: 'C1',
    })
    expect(message).toBe('E-mail enviado com sucesso')
  })

  it('decodifica ISO-8859-1 sem corromper acento', async () => {
    const latin1 = new Uint8Array([0x43, 0x6f, 0x6e, 0x76, 0xea, 0x6e, 0x69, 0x6f]) // "Convênio"
    stubFetch(
      () =>
        new Response(latin1, {
          status: 400,
          headers: { 'content-type': 'text/plain;charset=ISO-8859-1' },
        }),
    )

    await expect(
      createDigitalSaudeClient(credentials).call('convenioListar'),
    ).rejects.toMatchObject({ message: 'Convênio' })
  })
})

describe('tradução de erros', () => {
  it('converte 401 do upstream em UPSTREAM_UNAUTHORIZED', async () => {
    stubFetch(() => new Response('401 - Acesso Não Autorizado', { status: 401 }))
    await expect(
      createDigitalSaudeClient(credentials).call('convenioListar'),
    ).rejects.toMatchObject({ code: 'UPSTREAM_UNAUTHORIZED' })
  })

  it('sinaliza contrato quebrado quando a resposta não bate com o schema', async () => {
    stubFetch(() => jsonResponse({ inesperado: true }))
    await expect(
      createDigitalSaudeClient(credentials).call('convenioListar'),
    ).rejects.toMatchObject({ code: 'UPSTREAM_CONTRACT_MISMATCH' })
  })
})

describe('retry', () => {
  it('repete GET em 500 e devolve o sucesso seguinte', async () => {
    let attempts = 0
    stubFetch(() => {
      attempts += 1
      return attempts === 1 ? new Response('boom', { status: 500 }) : jsonResponse([])
    })

    await expect(createDigitalSaudeClient(credentials).call('convenioListar')).resolves.toEqual([])
    expect(attempts).toBe(2)
  })

  it('nunca repete POST — uma adesão duplicada é um problema real', async () => {
    let attempts = 0
    stubFetch(() => {
      attempts += 1
      return new Response('boom', { status: 500 })
    })

    await expect(
      createDigitalSaudeClient(credentials).call('calculoSimular', {
        nome: 'Teste',
        uf: 'RJ',
        calculoVidaList: [{ idade: 30, parentesco: { id: 1 } }],
      }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' })
    expect(attempts).toBe(1)
  })
})

/**
 * Regressões apuradas contra o ambiente de produção em 04/09/2026 pela sonda
 * `scripts/probe-digitalsaude.ts`. Cada caso aqui reproduz um comportamento
 * real do upstream que antes derrubava uma tela.
 */
describe('comportamentos reais do upstream', () => {
  it('trata 400 "Nenhum X foi localizado" como lista vazia, não como erro', async () => {
    stubFetch(
      () =>
        new Response('400 - Requisição Inválida\r\nNenhum atendimento foi localizado', {
          status: 400,
          headers: { 'content-type': 'text/plain;charset=ISO-8859-1' },
        }),
    )

    const resultado = await createDigitalSaudeClient(credentials).call('atendimentoPorContrato', {
      codigoContrato: 'C1',
      codigoTipoAtendimento: '1',
    })

    expect(resultado).toEqual([])
  })

  it('devolve null em busca por chave única sem resultado', async () => {
    stubFetch(
      () =>
        new Response('Nenhum produtor foi localizado com o código informado', {
          status: 400,
          headers: { 'content-type': 'text/plain' },
        }),
    )

    const resultado = await createDigitalSaudeClient(credentials).one('produtorPorCodigo', {
      codigoProdutor: 'X',
    })

    expect(resultado).toBeNull()
  })

  it('mantém 400 de verdade como erro', async () => {
    stubFetch(
      () =>
        new Response('400 - Requisição Inválida\r\nCampo obrigatório ausente', {
          status: 400,
          headers: { 'content-type': 'text/plain' },
        }),
    )

    await expect(
      createDigitalSaudeClient(credentials).call('convenioListar'),
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' })
  })

  it('nomeia a operação no 401 — o 401 do upstream é por endpoint, não por credencial', async () => {
    stubFetch(() => new Response('401 - Acesso Não Autorizado', { status: 401 }))

    await expect(
      createDigitalSaudeClient(credentials).call('calculoSimular', {
        nome: 'Teste',
        uf: 'RJ',
        calculoVidaList: [{ idade: 30, parentesco: { id: 1 } }],
      }),
    ).rejects.toThrow(/calculoSimular/)
  })

  it('reconhece o limite de chamadas por token e desiste com código próprio', async () => {
    const spy = stubFetch(
      () =>
        new Response('Ultrapassado Rate Limit para o TOKEN ABC123', {
          status: 429,
          headers: { 'content-type': 'text/plain' },
        }),
    )

    const promessa = createDigitalSaudeClient(credentials).call('faturaVencidas')
    await expect(promessa).rejects.toMatchObject({ code: 'UPSTREAM_RATE_LIMITED' })
    // Tentou de novo antes de desistir, em vez de falhar na primeira.
    expect(spy.mock.calls.length).toBeGreaterThan(1)
  }, 20_000)
})
