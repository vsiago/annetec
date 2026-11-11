import { DEFAULT_MODELOS_MENSAGEM } from '@annetec/contracts'

type ChaveModelo = 'nome' | 'plano' | 'vendedor' | 'link'

/** Monta `https://wa.me/55…?text=…`. Devolve null quando o telefone não parece um número BR válido. */
export function montarWaLink(telefone: string | null | undefined, texto?: string): string | null {
  let d = (telefone ?? '').replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) d = `55${d}`
  if (!(d.length === 12 || d.length === 13) || !d.startsWith('55')) return null
  const query = texto ? `?text=${encodeURIComponent(texto)}` : ''
  return `https://wa.me/${d}${query}`
}

/** Sem plano de interesse, "no plano {{plano}}" viraria "no plano ." ou "no plano nossos planos": ajusta a frase. */
function semPlanoNoTexto(texto: string): string {
  return texto
    .replace(/\bno plano\s*\{\{\s*plano\s*\}\}/gi, 'nos nossos planos')
    .replace(/\bdo plano\s*\{\{\s*plano\s*\}\}/gi, 'dos nossos planos')
    .replace(/\bo plano\s*\{\{\s*plano\s*\}\}/gi, 'os nossos planos')
    .replace(/\bplano\s*\{\{\s*plano\s*\}\}/gi, 'nossos planos')
}

/**
 * Troca `{{nome}}`, `{{plano}}`, `{{vendedor}}`, `{{link}}` pelos valores; o que faltar vira vazio.
 * Plano vazio não deixa "no plano ." na mensagem: a frase vira "nos nossos planos". Espaço antes de
 * pontuação e espaços repetidos (sobra de campo vazio) são limpos; as quebras de linha ficam.
 */
export function preencherModelo(texto: string, valores: Partial<Record<ChaveModelo, string>>): string {
  const base = valores.plano?.trim() ? texto : semPlanoNoTexto(texto)
  return base
    .replace(/\{\{\s*(nome|plano|vendedor|link)\s*\}\}/g, (_trecho, chave: ChaveModelo) => valores[chave] ?? '')
    .replace(/[ \t]+([.,!?:;])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

/**
 * Texto do modelo configurado em Regras (`id` do modelo) já preenchido. Sem modelo com esse id
 * (o administrador apagou), vale o texto padrão da ANNETEC para o mesmo id.
 */
export function mensagemDoModelo(
  modelos: ReadonlyArray<{ id: string; texto: string }> | null | undefined,
  id: string,
  valores: Partial<Record<ChaveModelo, string>>,
): string {
  const modelo = modelos?.find(m => m.id === id) ?? DEFAULT_MODELOS_MENSAGEM.find(m => m.id === id)
  return modelo ? preencherModelo(modelo.texto, valores) : ''
}
