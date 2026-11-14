'use client'

import { useEffect, useMemo, useState } from 'react'
import { UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  CANDIDATURA_ATUACAO_LABELS,
  CANDIDATURA_PAPEIS_APROVACAO,
  PAPEL_COMERCIAL_LABELS,
  papelDaAtuacao,
  type CandidaturaDetalhe,
} from '@annetec/contracts'
import { ConfirmDialog } from '@/components/admin-platform/billing/console-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { Notice, SelectField, SwitchField, TextareaField } from '@/components/admin-platform/ui/wizard'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { aprovarCandidaturaAction, recusarCandidaturaAction } from '@/lib/actions/vendas-candidaturas-gestao-api'
import { fraseDoConvite, ResultadoConviteBloco } from './convite-resultado'
import { avisarCandidaturasAtualizadas } from './candidaturas-pendentes'
import { useLookupsRede } from './lookups-rede'
import type { ConviteResultado, EscopoRede } from './tipos'

/** Decisão do master sobre uma candidatura: aprovar (cria o acesso) ou recusar (com motivo). */

type Papel = (typeof CANDIDATURA_PAPEIS_APROVACAO)[number]

export function AprovarCandidaturaDialog({
  escopo,
  candidatura,
  aberto,
  aoMudarAberto,
  aoDecidir,
}: {
  escopo: EscopoRede
  candidatura: CandidaturaDetalhe
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
  /** Chamado após a aprovação (atualiza lista e ficha). */
  aoDecidir: (c: CandidaturaDetalhe) => void
}) {
  const ehCorretora = candidatura.atuacao === 'corretora'
  const lookups = useLookupsRede(escopo, aberto && !ehCorretora)
  const sugerido = candidatura.vinculoSugerido
  const [papel, setPapel] = useState<Papel>(papelDaAtuacao(candidatura.atuacao))
  const [corretoraId, setCorretoraId] = useState('')
  const [unidadeId, setUnidadeId] = useState('')
  const [equipeId, setEquipeId] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [enviarConvite, setEnviarConvite] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [erroCorretora, setErroCorretora] = useState<string | undefined>()
  const [resultado, setResultado] = useState<{ convite: ConviteResultado } | null>(null)

  useEffect(() => {
    if (!aberto) return
    setPapel(papelDaAtuacao(candidatura.atuacao))
    setCorretoraId(sugerido.corretoraId ?? '')
    setUnidadeId(sugerido.unidadeId ?? '')
    setEquipeId(sugerido.equipeId ?? '')
    setObservacoes('')
    setEnviarConvite(true)
    setEnviando(false)
    setErro(null)
    setErroCorretora(undefined)
    setResultado(null)
    // Reinicia a cada abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, candidatura.id])

  const opcoesCorretora = useMemo(() => lookups.corretoras.filter(c => c.ativa).map(c => ({ value: c.id, label: c.nome })), [lookups.corretoras])
  const opcoesUnidade = useMemo(
    () => lookups.unidades.map(u => ({ value: u.id, label: u.corretoraNome ? `${u.nome} · ${u.corretoraNome}` : `${u.nome} · unidade própria` })),
    [lookups.unidades],
  )
  const opcoesEquipe = useMemo(() => lookups.equipes.map(e => ({ value: e.id, label: e.rotulo })), [lookups.equipes])

  const comEquipe = papel === 'vendedor' && !!equipeId

  const aprovar = async () => {
    setErro(null)
    if (!ehCorretora && papel === 'gerente' && !corretoraId) {
      setErroCorretora('O gerente precisa de uma corretora.')
      return
    }
    setErroCorretora(undefined)
    setEnviando(true)
    const r = await aprovarCandidaturaAction(escopo, candidatura.id, {
      ...(ehCorretora ? {} : { papel }),
      // A API deduz corretora e unidade da equipe escolhida; só manda o que foi definido.
      ...(!ehCorretora && !comEquipe && corretoraId ? { corretoraId } : {}),
      ...(!ehCorretora && !comEquipe && papel !== 'gerente' && unidadeId ? { unidadeId } : {}),
      ...(!ehCorretora && comEquipe ? { equipeId } : {}),
      ...(observacoes.trim() ? { observacoes: observacoes.trim() } : {}),
      enviarConvite,
    })
    setEnviando(false)
    if (!r.success) {
      setErro(r.error || 'Não foi possível aprovar. Confira o vínculo e tente de novo.')
      toast.error(r.error || 'Não foi possível aprovar a candidatura.')
      return
    }
    toast.success(fraseDoConvite(r.data.convite, candidatura.email))
    setResultado({ convite: r.data.convite })
    avisarCandidaturasAtualizadas()
    aoDecidir(r.data.candidatura)
  }

  const nomeCorretora = candidatura.nomeFantasia ?? candidatura.razaoSocial

  return (
    <Dialog open={aberto} onOpenChange={v => !enviando && aoMudarAberto(v)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{resultado ? 'Candidatura aprovada' : `Aprovar ${candidatura.nome}`}</DialogTitle>
          <DialogDescription>
            {resultado
              ? 'O cadastro foi criado na Rede Comercial.'
              : `${CANDIDATURA_ATUACAO_LABELS[candidatura.atuacao]}. Confirme o papel e o vínculo antes de liberar o acesso.`}
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <>
            <ResultadoConviteBloco convite={resultado.convite} email={candidatura.email} nome={candidatura.nome} />
            <DialogFooter>
              <Button type="button" onClick={() => aoMudarAberto(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              {ehCorretora ? (
                <Notice tone="info" icon={UserCheck} title="Papel: gerente comercial">
                  A corretora será criada com os dados da pessoa jurídica{nomeCorretora ? ` (${nomeCorretora})` : ''}, e {candidatura.nome} entra como
                  gerente dela.
                </Notice>
              ) : (
                <>
                  <SelectField
                    id="aprovar-papel"
                    name="papel"
                    label="Papel na rede"
                    required
                    value={papel}
                    valid={false}
                    onBlur={() => undefined}
                    onValueChange={v => {
                      const novo = v as Papel
                      setPapel(novo)
                      setErroCorretora(undefined)
                      if (novo === 'gerente') {
                        setEquipeId('')
                        setUnidadeId('')
                      }
                    }}
                    options={CANDIDATURA_PAPEIS_APROVACAO.map(p => ({ value: p, label: PAPEL_COMERCIAL_LABELS[p] }))}
                  />
                  {sugerido.motivo ? (
                    <Notice tone="neutral" title="Vínculo sugerido">
                      {sugerido.motivo}
                    </Notice>
                  ) : null}
                  {lookups.erro ? (
                    <Notice
                      tone="warning"
                      role="alert"
                      action={
                        <Button type="button" size="sm" variant="outline" onClick={lookups.recarregar}>
                          Tentar de novo
                        </Button>
                      }
                    >
                      Não foi possível carregar corretoras e equipes: {lookups.erro}
                    </Notice>
                  ) : null}
                  {papel === 'vendedor' ? (
                    <SelectField
                      id="aprovar-equipe"
                      name="equipeId"
                      label="Equipe"
                      optional
                      value={equipeId}
                      valid={false}
                      onBlur={() => undefined}
                      onValueChange={setEquipeId}
                      placeholder={lookups.carregando ? 'Carregando…' : 'Sem equipe (vendedor solo)'}
                      options={opcoesEquipe}
                    />
                  ) : null}
                  {!comEquipe ? (
                    <>
                      <SelectField
                        id="aprovar-corretora"
                        name="corretoraId"
                        label="Corretora"
                        required={papel === 'gerente'}
                        optional={papel !== 'gerente'}
                        value={corretoraId}
                        valid={false}
                        error={erroCorretora}
                        onBlur={() => undefined}
                        onValueChange={setCorretoraId}
                        placeholder={lookups.carregando ? 'Carregando…' : papel === 'gerente' ? 'Escolha a corretora' : 'Nenhuma'}
                        options={opcoesCorretora}
                      />
                      {papel !== 'gerente' ? (
                        <SelectField
                          id="aprovar-unidade"
                          name="unidadeId"
                          label="Unidade"
                          optional
                          value={unidadeId}
                          valid={false}
                          onBlur={() => undefined}
                          onValueChange={setUnidadeId}
                          placeholder={lookups.carregando ? 'Carregando…' : 'Nenhuma'}
                          options={opcoesUnidade}
                        />
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
              <TextareaField
                id="aprovar-observacoes"
                name="observacoes"
                label="Observações"
                optional
                rows={2}
                maxLength={500}
                showCounter
                value={observacoes}
                valid={false}
                onBlur={() => undefined}
                onValueChange={setObservacoes}
                placeholder="Anotação interna sobre a aprovação."
              />
              <SwitchField
                id="aprovar-convite"
                name="enviarConvite"
                label="Enviar convite por e-mail"
                description="A pessoa recebe o acesso agora. Desligado, você libera depois pela ficha do agente."
                value={enviarConvite}
                valid={false}
                onBlur={() => undefined}
                onValueChange={setEnviarConvite}
              />
              {erro ? (
                <Notice tone="danger" role="alert">
                  {erro}
                </Notice>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={enviando} onClick={() => aoMudarAberto(false)}>
                Voltar
              </Button>
              <Button type="button" disabled={enviando} onClick={() => void aprovar()}>
                {enviando ? 'Aprovando…' : 'Aprovar candidatura'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function RecusarCandidaturaDialog({
  escopo,
  candidatura,
  aberto,
  aoMudarAberto,
  aoDecidir,
}: {
  escopo: EscopoRede
  candidatura: CandidaturaDetalhe
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
  aoDecidir: (c: CandidaturaDetalhe) => void
}) {
  return (
    <ConfirmDialog
      open={aberto}
      onOpenChange={aoMudarAberto}
      title={`Recusar a candidatura de ${candidatura.nome}?`}
      description="O motivo é enviado por e-mail ao candidato, que não terá acesso à Rede Comercial. Essa decisão não pode ser desfeita."
      confirmLabel="Recusar candidatura"
      destructive
      reason={{ label: 'Motivo da recusa', placeholder: 'Explique ao candidato por que a candidatura não foi aprovada.', minLength: 10, maxLength: 1000 }}
      onConfirm={async motivo => {
        const r = await recusarCandidaturaAction(escopo, candidatura.id, { motivo })
        if (!r.success) {
          toast.error(r.error || 'Não foi possível recusar a candidatura.')
          return false
        }
        toast.success('Candidatura recusada. O candidato foi avisado por e-mail.')
        avisarCandidaturasAtualizadas()
        aoDecidir(r.data.candidatura)
        return true
      }}
    />
  )
}
