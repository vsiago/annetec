import { notFound } from 'next/navigation'
import { ApiDictionaryContent } from './dicionario-ti-content'

/**
 * Referência de programador: lista todas as rotas da API. Não é tela de
 * operação, então só existe em desenvolvimento — em produção a rota responde
 * 404. Também fora do menu do console; abre-se pelo endereço.
 */
export default function ApiDictionaryPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <ApiDictionaryContent />
}
