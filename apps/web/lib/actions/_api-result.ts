import 'server-only'
import { ApiError } from '@/lib/api/client'

/**
 * Envelope de retorno das Server Actions que falam com a API Annetec, e o
 * `run()` que o produz.
 *
 * Vivia copiado em nove arquivos `*-api.ts`. Não podia ser exportado de dentro
 * deles porque um módulo `'use server'` só aceita exportar função async — todo
 * o resto vira erro de build. Daí este arquivo à parte: `'server-only'` para o
 * `ApiError` e o token nunca chegarem ao bundle do browser.
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

/**
 * Mensagem para quando a API não respondeu — DNS, porta fechada, processo no
 * chão. É separada do erro genérico de propósito: "tente novamente" faz a
 * pessoa clicar de novo contra um servidor que não está lá, enquanto isto
 * aponta para a causa em uma frase.
 */
const API_FORA = 'A API não respondeu. Verifique se o servidor está no ar e tente novamente.'

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
        ...(error.issues ? { fieldErrors: error.toFieldErrors() } : {}),
      }
    }

    console.error('[server action] falha não tratada:', error)
    return { success: false, error: ehFalhaDeConexao(error) ? API_FORA : ERRO_GENERICO }
  }
}
