import 'server-only'
import type { ErrorCode } from '@annetec/contracts'
import { ApiError } from '@/lib/api/client'

/**
 * Envelope de retorno das Server Actions que falam com a API Annetec, e o
 * `run()` que o produz.
 *
 * Vivia copiado em nove arquivos `*-api.ts`. Não podia ser exportado de dentro
 * deles porque um módulo `'use server'` só aceita exportar função async — todo
 * o resto vira erro de build. Daí este arquivo à parte: `'server-only'` para o
 * `ApiError` e o token nunca chegarem ao bundle do browser.
 *
 * Isso vale também para `export type { ActionResult }`: o Next (16.2.6) registra
 * o nome como server reference, o tipo some na compilação e a rota quebra com
 * `ActionResult is not defined`, mesmo com o typecheck passando. Quem precisa
 * do tipo importa daqui, com `import type`.
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | {
      success: false
      error: string
      fieldErrors?: Record<string, string>
      /**
       * A API respondeu 401: a sessão enviada não vale mais (expirou, foi
       * derrubada, ou o vínculo com o clube deixou de estar ativo — associado
       * excluído/bloqueado, equipe desativada). Quem lê sessão (AuthProvider,
       * portal do associado, dados do painel) trata isto em um lugar só:
       * limpa o cookie e manda para o login com o aviso de sessão encerrada.
       *
       * Nas actions de LOGIN um 401 é credencial errada, não sessão caída — o
       * campo vem do mesmo jeito, mas lá ninguém o lê.
       */
      unauthorized?: true
      /** Código do erro da API (`ERROR_CODES`), quando a falha veio dela. */
      code?: ErrorCode
    }

/**
 * Mensagem para quando a API não respondeu — DNS, porta fechada, processo no
 * chão. É separada do erro genérico de propósito: "tente novamente" faz a
 * pessoa clicar de novo contra um servidor que não está lá, enquanto isto
 * aponta para a causa em uma frase.
 */
const API_FORA = 'Não foi possível conectar. Verifique a internet e tente de novo.'

const ERRO_GENERICO = 'Não foi possível concluir a operação. Tente novamente.'

/**
 * `fetch` do Node não lança um erro tipado quando a conexão falha: lança
 * `TypeError: fetch failed` e guarda a causa real (ECONNREFUSED, ENOTFOUND,
 * ETIMEDOUT) em `cause`, às vezes aninhada em `AggregateError.errors`.
 */
const CODIGOS_DE_CONEXAO = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
])

function ehFalhaDeConexao(error: unknown, profundidade = 0): boolean {
  if (profundidade > 3 || !error || typeof error !== 'object') return false

  const codigo = (error as { code?: unknown }).code
  if (typeof codigo === 'string' && CODIGOS_DE_CONEXAO.has(codigo)) return true

  const agregados = (error as { errors?: unknown }).errors
  if (Array.isArray(agregados) && agregados.some(e => ehFalhaDeConexao(e, profundidade + 1))) {
    return true
  }

  return ehFalhaDeConexao((error as { cause?: unknown }).cause, profundidade + 1)
}

/**
 * Executa a chamada e traduz a falha para algo que a tela saiba mostrar.
 *
 * Erro de negócio (`ApiError`) já vem com mensagem pronta e, quando é de
 * validação, com os campos. O resto cai no genérico — mas NÃO em silêncio: o
 * erro real vai para o console do servidor Next. Antes ele era descartado, e
 * "API no chão", "payload inválido" e "bug no mapper" apareciam os três como
 * a mesma frase, sem nada em lugar nenhum para distinguir.
 */
export async function run<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { success: true, data: await operation() }
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        code: error.code,
        ...(error.issues ? { fieldErrors: error.toFieldErrors() } : {}),
        ...(error.status === 401 ? { unauthorized: true as const } : {}),
      }
    }

    console.error('[server action] falha não tratada:', error)
    return { success: false, error: ehFalhaDeConexao(error) ? API_FORA : ERRO_GENERICO }
  }
}
