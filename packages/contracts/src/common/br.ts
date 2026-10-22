/**
 * Helpers brasileiros PUROS (sem dependência, sem I/O) — rodam igual no
 * browser, no Next e na API. Máscara de campo, formatação de exibição e as
 * poucas regras de documento/cartão que a tela e o servidor precisam aplicar
 * do MESMO jeito.
 *
 * Convenções:
 *  - `mask*` é progressiva: serve para `onChange` de input e aceita valor
 *    incompleto ("123.4");
 *  - `format*` é de exibição: espera o valor completo e, se não estiver,
 *    devolve a entrada sem mexer (nunca inventa dígito).
 *
 * A validação de CPF/CNPJ continua em `primitives.ts` (`isValidCpf`,
 * `isValidCnpj`) — aqui só o que faltava.
 */

/** Remove tudo que não é dígito. */
export function onlyDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

// ---------------------------------------------------------------------------
// Dinheiro e datas
// ---------------------------------------------------------------------------

const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** `49.9` → `"R$ 49,90"` (o espaço é o não separável do Intl). */
export function formatBRL(value: number | null | undefined): string {
  return brlFormatter.format(Number.isFinite(value) ? (value as number) : 0)
}

/**
 * Lê valor digitado com teclado brasileiro: `"1.234,56"`, `"49,9"`, `"49.90"`
 * e `"R$ 10"`. Devolve `null` quando não há número ali.
 */
export function parseBRL(input: string | null | undefined): number | null {
  const raw = (input ?? '').replace(/[^\d,.-]/g, '')
  if (!raw) return null
  // Com vírgula, ela é o separador decimal e os pontos são milhar.
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
  const value = Number(normalized)
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null
}

/** Arredonda para centavos sem o erro clássico de ponto flutuante (0.1 + 0.2). */
export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * `"2026-09-27"` ou ISO completo → `"27/09/2026"`.
 *
 * Data-só (`yyyy-MM-dd`) é formatada por TEXTO, nunca via `new Date()`: em
 * UTC-3 `new Date('2026-09-27')` é 26/09 às 21h e a tela mostraria o dia
 * anterior — o bug clássico de vencimento de boleto.
 */
export function formatDateBR(value: string | Date | null | undefined): string {
  if (!value) return ''
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (match) return `${match[3]}/${match[2]}/${match[1]}`
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/** Idade completa em `ref` a partir de `yyyy-MM-dd`; `null` se a data for inválida. */
export function ageOn(birthDate: string, ref: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  let age = ref.getFullYear() - year
  const beforeBirthday = ref.getMonth() + 1 < month || (ref.getMonth() + 1 === month && ref.getDate() < day)
  if (beforeBirthday) age -= 1
  return age
}

// ---------------------------------------------------------------------------
// Documentos e contato
// ---------------------------------------------------------------------------

/** Progressiva: `"1234567"` → `"123.456.7"`. */
export function maskCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** `"12345678909"` → `"123.456.789-09"`; incompleto volta como veio. */
export function formatCpf(value: string | null | undefined): string {
  const d = onlyDigits(value)
  return d.length === 11 ? maskCpf(d) : (value ?? '')
}

/** `"12345678909"` → `"***.456.789-**"` — CPF exibido fora da área logada. */
export function maskCpfPartially(value: string | null | undefined): string {
  const d = onlyDigits(value)
  if (d.length !== 11) return ''
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
}

/**
 * CPF VÁLIDO (dígitos verificadores corretos) para demonstração e testes.
 * Com `seed`, é determinístico — o seed da demo gera sempre os mesmos.
 * Nunca usar para cadastro real.
 */
export function generateCpf(seed?: number): string {
  let base: number[]
  if (seed === undefined) {
    base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10))
  } else {
    const digits = String(Math.abs(Math.trunc(seed * 7919 + 104_729)) % 1_000_000_000).padStart(9, '0')
    base = digits.split('').map(Number)
  }
  // Evita a sequência repetida (000000000...), que `isValidCpf` recusa.
  if (base.every(n => n === base[0])) base[8] = ((base[8] ?? 0) + 1) % 10
  const dv = (digits: number[]) => {
    const sum = digits.reduce((acc, n, i) => acc + n * (digits.length + 1 - i), 0)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  const d1 = dv(base)
  const d2 = dv([...base, d1])
  return [...base, d1, d2].join('')
}

/** Progressiva: `"2004002"` → `"20040-02"`. */
export function maskCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8)
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`
}

/** `"20040020"` → `"20040-020"`; incompleto volta como veio. */
export function formatCep(value: string | null | undefined): string {
  const d = onlyDigits(value)
  return d.length === 8 ? maskCep(d) : (value ?? '')
}

/** Progressiva: `"2199998"` → `"(21) 99998"`; celular (11) e fixo (10). */
export function maskPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** `"21999987654"` → `"(21) 99998-7654"`; incompleto volta como veio. */
export function formatPhone(value: string | null | undefined): string {
  const d = onlyDigits(value)
  return d.length === 10 || d.length === 11 ? maskPhone(d) : (value ?? '')
}

// ---------------------------------------------------------------------------
// Cartão de crédito
// ---------------------------------------------------------------------------

export const CARD_BRANDS = [
  'visa',
  'mastercard',
  'elo',
  'amex',
  'hipercard',
  'diners',
  'discover',
  'jcb',
  'outra',
] as const
export type CardBrand = (typeof CARD_BRANDS)[number]

export const CARD_BRAND_LABELS: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  elo: 'Elo',
  amex: 'American Express',
  hipercard: 'Hipercard',
  diners: 'Diners Club',
  discover: 'Discover',
  jcb: 'JCB',
  outra: 'Cartão',
}

/**
 * Bandeira pelo BIN. Elo e Hipercard vêm antes de Visa/Master porque parte
 * dos BINs deles começa com 4/5/6. Devolve `null` enquanto não dá para saber
 * (poucos dígitos digitados); `'outra'` para número longo sem padrão conhecido.
 */
export function detectCardBrand(value: string): CardBrand | null {
  const d = onlyDigits(value)
  if (d.length < 2) return null
  if (/^(4011(78|79)|43(1274|8935)|45(1416|7393|763(1|2))|50(4175|6699|67[0-7][0-9]|9000)|627780|63(6297|6368)|650(0(3([1-3]|[5-9])|4([0-9])|5[0-1])|4(0[5-9]|[1-3][0-9]|8[5-9]|9[0-9])|5([0-2][0-9]|3[0-8]|4[1-9]|[5-8][0-9]|9[0-8])|7(0[0-9]|1[0-8]|2[0-7])|9(0[1-9]|[1-6][0-9]|7[0-8]))|6516(5[2-9]|[6-7][0-9])|6550([0-1][0-9]|2[1-9]|[3-4][0-9]|5[0-8]))/.test(d)) {
    return 'elo'
  }
  if (/^(606282|3841(0|4|6)0)/.test(d)) return 'hipercard'
  if (/^3[47]/.test(d)) return 'amex'
  if (/^3(0[0-5]|[68])/.test(d)) return 'diners'
  if (/^35(2[89]|[3-8])/.test(d)) return 'jcb'
  if (/^(6011|65|64[4-9])/.test(d)) return 'discover'
  if (/^4/.test(d)) return 'visa'
  if (/^(5[1-5]|2(2[2-9]|[3-6]|7[01]|720))/.test(d)) return 'mastercard'
  return d.length >= 6 ? 'outra' : null
}

/** Algoritmo de Luhn — pega número digitado errado antes de ir ao gateway. */
export function isValidCardNumber(value: string): boolean {
  const d = onlyDigits(value)
  if (d.length < 13 || d.length > 19) return false
  let sum = 0
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum % 10 === 0
}

/** Progressiva: grupos de 4 (Amex: 4-6-5). */
export function maskCardNumber(value: string): string {
  const d = onlyDigits(value).slice(0, 19)
  if (/^3[47]/.test(d)) {
    return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' ')
  }
  return d.replace(/(\d{4})(?=\d)/g, '$1 ')
}

/** Progressiva: `"1228"` → `"12/28"`. */
export function maskCardExpiry(value: string): string {
  const d = onlyDigits(value).slice(0, 4)
  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`
}

/** Últimos 4 dígitos — o único pedaço do número que pode ser guardado e exibido. */
export function cardLast4(value: string): string {
  return onlyDigits(value).slice(-4)
}

// ---------------------------------------------------------------------------
// Boleto
// ---------------------------------------------------------------------------

/**
 * Linha digitável de 47 dígitos no formato impresso:
 * `"AAAAA.AAAAA BBBBB.BBBBBB CCCCC.CCCCCC D EEEEEEEEEEEEEE"`.
 * Com outro tamanho, devolve a entrada sem mexer.
 */
export function formatBoletoLine(value: string | null | undefined): string {
  const d = onlyDigits(value)
  if (d.length !== 47) return value ?? ''
  return [
    `${d.slice(0, 5)}.${d.slice(5, 10)}`,
    `${d.slice(10, 15)}.${d.slice(15, 21)}`,
    `${d.slice(21, 26)}.${d.slice(26, 32)}`,
    d.slice(32, 33),
    d.slice(33),
  ].join(' ')
}
