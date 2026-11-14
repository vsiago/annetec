import {
  CANDIDATURA_ATUACAO_LABELS,
  CANDIDATURA_DOCUMENTO_KIND_LABELS,
  CANDIDATURA_DOCUMENTOS_OBRIGATORIOS,
  papelDaAtuacao,
  type CandidaturaAtuacao,
  type CandidaturaDocumentoKind,
  type CandidaturaTipoPessoa,
  type PapelComercial,
} from '@annetec/contracts'

/**
 * Regras PURAS das candidaturas da Rede Comercial ("Seja um parceiro
 * comercial"): sem banco e sem relógio. Ver `docs/rede-comercial.md`.
 */

export { papelDaAtuacao }

export function documentosObrigatorios(tipoPessoa: CandidaturaTipoPessoa): CandidaturaDocumentoKind[] {
  return [...CANDIDATURA_DOCUMENTOS_OBRIGATORIOS[tipoPessoa]]
}

export interface CandidaturaParaPendencias {
  tipoPessoa: CandidaturaTipoPessoa
  atuacao: CandidaturaAtuacao
  cnpj?: string | null
  razaoSocial?: string | null
  nomeFantasia?: string | null
  dataNascimento?: string | null
  endereco?: { cep?: string | null; logradouro?: string | null; numero?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null } | null
  codigoIndicacao?: string | null
  indicadoPorAgenteId?: string | null
}

export interface DocumentoParaPendencias {
  kind: CandidaturaDocumentoKind
  /** `replaced` não conta. */
  status?: string | null
}

const preenchido = (valor: string | null | undefined) => typeof valor === 'string' && valor.trim() !== ''

/** O que falta para enviar a candidatura, em pt-BR (vazio = pronta). */
export function pendencias(params: { candidatura: CandidaturaParaPendencias; documentos: DocumentoParaPendencias[] }): string[] {
  const { candidatura, documentos } = params
  const faltas: string[] = []

  if (candidatura.atuacao === 'corretora' && candidatura.tipoPessoa !== 'pj') faltas.push('Corretora parceira exige pessoa jurídica')
  if (candidatura.tipoPessoa === 'pj') {
    if (!preenchido(candidatura.cnpj)) faltas.push('Informe o CNPJ')
    if (!preenchido(candidatura.razaoSocial)) faltas.push('Informe a razão social')
    if (!preenchido(candidatura.nomeFantasia)) faltas.push('Informe o nome fantasia')
  }
  if (candidatura.atuacao === 'vendedor_equipe' && !preenchido(candidatura.codigoIndicacao)) {
    faltas.push('Informe o código de quem vai indicar você')
  } else if (candidatura.atuacao === 'vendedor_equipe' && !candidatura.indicadoPorAgenteId) {
    faltas.push('O código de indicação informado não foi encontrado')
  }

  const e = candidatura.endereco
  if (!e || !preenchido(e.cep) || !preenchido(e.logradouro) || !preenchido(e.numero) || !preenchido(e.bairro) || !preenchido(e.cidade) || !preenchido(e.uf)) {
    faltas.push('Preencha o endereço completo')
  }

  const enviados = new Set(documentos.filter(d => d.status !== 'replaced').map(d => d.kind))
  for (const kind of documentosObrigatorios(candidatura.tipoPessoa)) {
    if (!enviados.has(kind)) faltas.push(`Envie o documento: ${CANDIDATURA_DOCUMENTO_KIND_LABELS[kind]}`)
  }

  return faltas
}

export interface IndicadorParaVinculo {
  nome: string
  papel: PapelComercial
  corretoraId?: string | null
  unidadeId?: string | null
  equipeId?: string | null
  /** Equipe que o indicador supervisiona (`vendas_equipes.supervisor_agente_id`), se houver. */
  equipeSupervisionadaId?: string | null
}

export interface VinculoSugerido {
  corretoraId?: string
  unidadeId?: string
  equipeId?: string
  motivo: string
}

const so = <T extends string>(chave: string, valor: T | null | undefined) => (valor ? { [chave]: valor } : {})

/** Onde encaixar o candidato aprovado, a partir de quem o indicou. */
export function vinculoSugerido(indicador: IndicadorParaVinculo | null | undefined): VinculoSugerido {
  if (!indicador) return { motivo: 'Sem indicação: escolha o vínculo na aprovação, se houver.' }

  if (indicador.papel === 'supervisor') {
    const equipeId = indicador.equipeSupervisionadaId ?? indicador.equipeId
    return {
      ...so('corretoraId', indicador.corretoraId),
      ...so('unidadeId', indicador.unidadeId),
      ...so('equipeId', equipeId),
      motivo: `Equipe de ${indicador.nome} (supervisor)`,
    }
  }
  if (indicador.papel === 'vendedor' || indicador.papel === 'balcao') {
    return {
      ...so('corretoraId', indicador.corretoraId),
      ...so('unidadeId', indicador.unidadeId),
      ...so('equipeId', indicador.equipeId),
      motivo: `Mesma equipe de ${indicador.nome} (${indicador.papel === 'vendedor' ? 'vendedor' : 'balcão'})`,
    }
  }
  if (indicador.papel === 'gerente') {
    return { ...so('corretoraId', indicador.corretoraId), motivo: `Corretora de ${indicador.nome} (gerente)` }
  }
  return { motivo: `Indicado por ${indicador.nome} (administrador): escolha o vínculo na aprovação.` }
}

export function rotuloAtuacao(atuacao: CandidaturaAtuacao): string {
  return CANDIDATURA_ATUACAO_LABELS[atuacao]
}
