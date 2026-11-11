import { formatarCelular, formatarCpf } from '../ui/mascaras'

export type PassoAtendimento = 'pessoa' | 'dados' | 'oferta' | 'resultado'

export type DadosPessoa = {
  documento: string
  telefone: string
  nome: string
  email: string
  dataNascimento: string
  servico: string
}

export type Rascunho = {
  passo: PassoAtendimento
  dados: DadosPessoa
  valor: number
  planoId: string | null
  busca: { tipo: 'cpf' | 'telefone'; texto: string }
  leadEncontrado: boolean
  /** Volta para este passo depois de corrigir um dado que faltava. */
  retorno: PassoAtendimento | null
}

export const DADOS_VAZIOS: DadosPessoa = { documento: '', telefone: '', nome: '', email: '', dataNascimento: '', servico: '' }

export const RASCUNHO_INICIAL: Rascunho = {
  passo: 'pessoa',
  dados: DADOS_VAZIOS,
  valor: 0,
  planoId: null,
  busca: { tipo: 'cpf', texto: '' },
  leadEncontrado: false,
  retorno: null,
}

const chave = (slug: string) => `balcao:rascunho:${slug}`

export function lerRascunho(slug: string): Rascunho | null {
  try {
    const bruto = sessionStorage.getItem(chave(slug))
    if (!bruto) return null
    const r = JSON.parse(bruto) as Partial<Rascunho>
    if (!r || typeof r !== 'object' || !r.passo) return null
    return { ...RASCUNHO_INICIAL, ...r, dados: { ...DADOS_VAZIOS, ...(r.dados ?? {}) } }
  } catch {
    return null
  }
}

export function gravarRascunho(slug: string, r: Rascunho): void {
  try {
    sessionStorage.setItem(chave(slug), JSON.stringify(r))
  } catch {
    /* sessionStorage indisponível: o fluxo segue sem rascunho */
  }
}

export function limparRascunho(slug: string): void {
  try {
    sessionStorage.removeItem(chave(slug))
  } catch {
    /* idem */
  }
}

export const soDigitos = (v: string | null | undefined): string => (v ?? '').replace(/\D/g, '')

/** Telefone/CPF vindos da API (sem máscara) para o campo. */
export const celularParaCampo = (v: string | null | undefined): string => formatarCelular(v)
export const cpfParaCampo = (v: string | null | undefined): string => formatarCpf(v)

/** Aceita "2005-03-21" do input date e devolve o mesmo; vazio vira undefined. */
export const dataOuUndefined = (v: string): string | undefined => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)
