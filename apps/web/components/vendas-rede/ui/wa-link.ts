type ChaveModelo = 'nome' | 'plano' | 'vendedor' | 'link'

/** Monta `https://wa.me/55…?text=…`. Devolve null quando o telefone não parece um número BR válido. */
export function montarWaLink(telefone: string | null | undefined, texto?: string): string | null {
  let d = (telefone ?? '').replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) d = `55${d}`
  if (!(d.length === 12 || d.length === 13) || !d.startsWith('55')) return null
  const query = texto ? `?text=${encodeURIComponent(texto)}` : ''
  return `https://wa.me/${d}${query}`
}

/** Troca `{{nome}}`, `{{plano}}`, `{{vendedor}}`, `{{link}}` pelos valores; o que faltar vira vazio. */
export function preencherModelo(texto: string, valores: Partial<Record<ChaveModelo, string>>): string {
  return texto.replace(/\{\{\s*(nome|plano|vendedor|link)\s*\}\}/g, (_trecho, chave: ChaveModelo) => valores[chave] ?? '')
}
