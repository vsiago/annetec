import { redirect } from 'next/navigation'

/**
 * A antiga `/cadastro` da ANNETEC era um formulário de "associação" que só
 * mostrava "Cadastro Recebido!" e descartava os dados, com planos e preços
 * fixos que não existem no catálogo. Não há cadastro de pessoa física no nível
 * da plataforma — o associado entra pelo site do próprio clube
 * (`/[tenant]/cadastro`, que grava lead de verdade) e o clube contrata a
 * plataforma em `/contratar`. O endereço antigo continua funcionando.
 */
export default function CadastroRedirect() {
  redirect('/contratar')
}
