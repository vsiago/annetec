/** Formatadores de exibição (pt-BR). Aceitam entrada suja e nunca lançam erro. */

const soDigitos = (v: string | null | undefined): string => (v ?? '').replace(/\D/g, '')

export function formatarCpf(valor: string | null | undefined): string {
  const d = soDigitos(valor).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

export function formatarCnpj(valor: string | null | undefined): string {
  const d = soDigitos(valor).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

/** CPF (até 11 dígitos) ou CNPJ (acima disso), escolhido pelo tamanho. */
export function formatarDocumento(valor: string | null | undefined): string {
  return soDigitos(valor).length > 11 ? formatarCnpj(valor) : formatarCpf(valor)
}

/** (11) 91234-5678 ou (11) 1234-5678. Ignora o prefixo 55 quando há 12–13 dígitos. */
export function formatarCelular(valor: string | null | undefined): string {
  let d = soDigitos(valor)
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  d = d.slice(0, 11)
  if (d.length <= 2) return d ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const BRL_INTEIRO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export function formatarMoeda(valor: number | null | undefined, opcoes?: { inteiro?: boolean }): string {
  const n = typeof valor === 'number' && Number.isFinite(valor) ? valor : 0
  return (opcoes?.inteiro ? BRL_INTEIRO : BRL).format(n)
}

export function formatarPercentual(valor: number | null | undefined, casas = 0): string {
  const n = typeof valor === 'number' && Number.isFinite(valor) ? valor : 0
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 })} %`
}

/** "terça-feira, 10 de novembro". */
export function dataPorExtenso(data: Date = new Date()): string {
  return data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** Bom dia (até 11h59), Boa tarde (até 17h59), Boa noite. */
export function saudacaoPorHora(data: Date = new Date()): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  const h = data.getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** Primeiro nome com inicial maiúscula ("MARIA DA SILVA" vira "Maria"). */
export function primeiroNome(nome: string | null | undefined): string {
  const p = (nome ?? '').trim().split(/\s+/)[0] ?? ''
  return p ? p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR') : ''
}

/** Variação percentual atual vs anterior, ou null quando não há base de comparação. */
export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior) || anterior === 0) return null
  return Math.round(((atual - anterior) / Math.abs(anterior)) * 100)
}
