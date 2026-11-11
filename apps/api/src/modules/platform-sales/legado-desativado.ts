import { ERROR_CODES } from '@annetec/contracts'
import { createMiddleware } from 'hono/factory'
import { AppError } from '@/http/errors'
import type { AppEnv } from '@/http/types'

/**
 * Escritas do módulo comercial ANTIGO (vendedores/comissões/configuração da plataforma e CRM de
 * inquilino) estão desligadas: os dados novos vivem na Rede Comercial (`/vendas`, `vendas_*`) e uma
 * escrita aqui divergiria deles (pagamento em duplicidade, vendedor sem perfil de agente, regra de
 * comissão que não alimenta mais o cálculo). Leituras seguem funcionando. Resposta: 410.
 */
export const MENSAGEM_LEGADO_DESATIVADO =
  'Esta função foi desativada: use a Rede Comercial (menu Comercial) para gerenciar vendedores, leads e comissões.'

export function legadoDesativadoError(): AppError {
  return new AppError(ERROR_CODES.RECURSO_LEGADO_DESATIVADO, MENSAGEM_LEGADO_DESATIVADO)
}

/** Handler final da rota legada de escrita (depois dos guards de papel: quem não pode continua recebendo 401/403). */
export const legadoDesativado = createMiddleware<AppEnv>(async () => {
  throw legadoDesativadoError()
})

/** Middleware de grupo: tudo que não é leitura (GET/HEAD/OPTIONS) responde 410. */
export const bloquearEscritaLegada = createMiddleware<AppEnv>(async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next()
  throw legadoDesativadoError()
})
