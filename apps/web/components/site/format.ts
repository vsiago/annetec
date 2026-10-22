/**
 * Formatação da vitrine. Funções puras, sem dependência de React — valem
 * para qualquer inquilino, porque tudo o que exibem vem dos dados dele.
 */

export function onlyDigits(value: string | undefined | null): string {
  return (value ?? '').replace(/\D/g, '')
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function brl(value: number): string {
  return BRL.format(value)
}

/** "R$ 49,90" em partes, para o preço grande dos cartões de plano. */
export function priceParts(value: number): { integer: string; cents: string } {
  const [integer = '0', cents = '00'] = value.toFixed(2).split('.')
  return { integer: Number(integer).toLocaleString('pt-BR'), cents }
}

/**
 * Teto "menos de R$ X por dia" para uma mensalidade, arredondado para cima
 * no décimo seguinte — sempre ESTRITAMENTE maior que o custo diário real
 * (mês de 30 dias), para a frase nunca ficar falsa. Acima de R$ 5/dia a
 * comparação deixa de ajudar a vender e não é exibida.
 */
export function perDayCeiling(monthly: number): number | null {
  if (!Number.isFinite(monthly) || monthly <= 0) return null
  const perDay = monthly / 30
  if (perDay >= 5) return null
  return (Math.floor(perDay * 10) + 1) / 10
}

export function formatCnpj(value: string): string {
  const d = onlyDigits(value)
  if (d.length !== 14) return value
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export function formatCep(value: string): string {
  const d = onlyDigits(value)
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : value
}

export function formatPhone(value: string): string {
  const d = onlyDigits(value)
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return value
}

/** Número nacional com DDD → número internacional (+55), sem símbolos. */
function internationalDigits(phone: string | undefined | null): string | null {
  const d = onlyDigits(phone)
  if (d.length === 10 || d.length === 11) return `55${d}`
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d
  return null
}

export function telHref(phone: string | undefined | null): string | null {
  const intl = internationalDigits(phone)
  return intl ? `tel:+${intl}` : null
}

export function whatsappHref(phone: string | undefined | null, message: string): string | null {
  const intl = internationalDigits(phone)
  return intl ? `https://wa.me/${intl}?text=${encodeURIComponent(message)}` : null
}

/** Site de parceiro às vezes vem sem protocolo ("clinica.com.br"). */
export function externalHref(url: string | undefined | null): string | null {
  const value = (url ?? '').trim()
  if (!value) return null
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

export function displayHost(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

/**
 * O painel guarda cidade e UF num campo só ("Cabo Frio - RJ"); a vitrine
 * filtra pelos dois separadamente.
 */
export function splitCityUf(value: string | undefined | null): { city: string; uf: string } {
  const text = (value ?? '').trim()
  const match = /^(.*?)\s*-\s*([A-Za-z]{2})$/.exec(text)
  if (match) return { city: (match[1] ?? '').trim(), uf: (match[2] ?? '').toUpperCase() }
  return { city: text, uf: '' }
}

/** Comparação de texto sem acento e sem caixa, para a busca da rede. */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString('pt-BR')} ${count === 1 ? singular : plural}`
}

export function percent(value: number): string {
  return `${Math.round(value).toLocaleString('pt-BR')}%`
}

/**
 * Logotipo em texto, como imagem SVG. A carteirinha de demonstração
 * (`DigitalCardMockup`) cai no logo da MepCard quando o inquilino não tem
 * logo cadastrado — passar esta imagem no lugar mantém a marca certa no
 * cartão sem mexer no componente compartilhado.
 */
export function wordmarkDataUri(name: string): string {
  const text = name.trim() || 'Clube'
  const fontSize = 44
  const width = Math.max(120, Math.round(text.length * fontSize * 0.62) + 8)
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="64" viewBox="0 0 ${width} 64">` +
    `<text x="0" y="46" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700">${escaped}</text>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
