/**
 * Mapa único dos erros da área comercial (funil, lead, rede, balcão).
 *
 * A API devolve `code` (`ERROR_CODES`) e uma `message`. Para alguns códigos a mensagem do
 * servidor está escrita do ponto de vista errado (a venda não depende do vendedor, e sim da
 * conta de recebimento do clube) ou é técnica demais para quem está atendendo; esses vêm
 * daqui. Para os demais vale a mensagem da API, que já está em português e sem jargão.
 *
 * Fica fora de `lib/actions` porque um módulo `'use server'` só exporta função async.
 */

export const ERRO_GENERICO_COMERCIAL = 'Não foi possível concluir. Tente de novo; se persistir, fale com o administrador.'

/** Códigos em que o texto daqui vale mais que o do servidor. */
const MENSAGENS: Record<string, string> = {
  VENDAS_SEM_PERFIL: 'Sua conta ainda não tem perfil de vendas. Peça ao administrador para cadastrar você na Rede Comercial.',
  VENDAS_PERFIL_INATIVO: 'Seu perfil está inativo: você só consulta. Peça ao administrador para reativar.',
  VENDAS_LEAD_JA_REIVINDICADO: 'Outra pessoa atendeu este lead antes de você. Ele saiu de Disponíveis; veja os próximos.',
  VENDAS_SEM_PERMISSAO_NA_REDE: 'Seu perfil não permite esta ação. Fale com o seu supervisor ou gerente.',
  RECEBIMENTO_NAO_CONFIGURADO:
    'O clube ainda não conectou a conta de recebimento, então não dá para gerar o pagamento. Avise o administrador.',
  RATE_LIMITED: 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.',
}

/** Códigos em que a mensagem do servidor (já traduzida) explica melhor; o texto daqui é o reserva. */
const RESERVAS: Record<string, string> = {
  VENDAS_TRANSICAO_INVALIDA: 'Este lead não pode ir para essa etapa agora.',
  VENDAS_ATENDIMENTO_INVALIDO: 'Faltam dados do atendimento.',
}

/**
 * Texto para mostrar no toast ou no aviso. `padrao` é a mensagem que veio da API (ou um texto
 * da própria tela); sem nenhum dos dois, vale o genérico.
 */
export function mensagemDoErro(code: string | null | undefined, padrao?: string | null): string {
  const texto = padrao?.trim()
  if (code && MENSAGENS[code]) return MENSAGENS[code]!
  if (texto) return texto
  if (code && RESERVAS[code]) return RESERVAS[code]!
  return ERRO_GENERICO_COMERCIAL
}
