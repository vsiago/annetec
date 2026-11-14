'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  CANDIDATURA_ATUACOES,
  CANDIDATURA_ATUACAO_DESCRICOES,
  CANDIDATURA_ATUACAO_LABELS,
  PAPEL_COMERCIAL_LABELS,
  UFS,
  candidaturaDadosInput,
  maskCep,
  onlyDigits,
  type PapelComercial,
} from '@annetec/contracts'
import { useCnpjLookup } from '@/components/contratar/hooks'
import { ActionError, SelectField, StepHeading, TextAreaField, TextField } from '@/components/contratar/ui'
import { StepFooter } from '@/components/contratar/step-footer'
import { consultarCodigoIndicacaoAction, salvarDadosCandidaturaAction } from '@/lib/actions/vendas-candidaturas-api'
import { issuesToFieldErrors } from './escopo'
import { FALHA_SERVIDOR, type StepContext } from './steps'

interface Form {
  atuacao: string
  codigoIndicacao: string
  dataNascimento: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  razaoSocial: string
  nomeFantasia: string
  regiaoAtuacao: string
  comoConheceu: string
  experiencia: string
}

function initialForm(view: StepContext['view']): Form {
  const e = view.endereco
  return {
    atuacao: view.atuacao,
    codigoIndicacao: view.codigoIndicacao ?? '',
    dataNascimento: view.dataNascimento ?? '',
    cep: e ? maskCep(e.cep) : '',
    logradouro: e?.logradouro ?? '',
    numero: e?.numero ?? '',
    complemento: e?.complemento ?? '',
    bairro: e?.bairro ?? '',
    cidade: e?.cidade ?? '',
    uf: e?.uf ?? '',
    razaoSocial: view.razaoSocial ?? '',
    nomeFantasia: view.nomeFantasia ?? '',
    regiaoAtuacao: view.regiaoAtuacao ?? '',
    comoConheceu: view.comoConheceu ?? '',
    experiencia: view.experiencia ?? '',
  }
}

/** Endereço pelo CEP (ViaCEP, direto do navegador). Falha não bloqueia nada. */
async function lookupCep(cep: string): Promise<{ street: string; neighborhood: string; city: string; state: string } | null> {
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
    if (!response.ok) return null
    const data = (await response.json()) as { erro?: unknown; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
    if (data.erro) return null
    return { street: data.logradouro ?? '', neighborhood: data.bairro ?? '', city: data.localidade ?? '', state: data.uf ?? '' }
  } catch {
    return null
  }
}

export function DadosStep({ ctx }: { ctx: StepContext }) {
  const { escopo, view, chave, onViewChange, goNext } = ctx
  const pj = view.tipoPessoa === 'pj'
  const [form, setForm] = useState<Form>(() => initialForm(view))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cepBusy, setCepBusy] = useState(false)
  const [indicador, setIndicador] = useState<{ nome: string; papel: PapelComercial } | null>(view.indicadoPor)
  const lastCep = useRef(onlyDigits(form.cep))
  const errorRef = useRef<HTMLDivElement>(null)

  const atuacoes = CANDIDATURA_ATUACOES.filter(a => pj || a !== 'corretora')
  const equipe = form.atuacao === 'vendedor_equipe'

  function set<K extends keyof Form>(key: K, value: Form[K], errorKey?: string) {
    setForm(current => ({ ...current, [key]: value }))
    const name = errorKey ?? key
    setErrors(current => {
      if (!(name in current)) return current
      const { [name]: _removed, ...rest } = current
      return rest
    })
  }

  // CEP completo → preenche rua/bairro/cidade/UF.
  const cepDigits = onlyDigits(form.cep)
  useEffect(() => {
    if (cepDigits.length !== 8 || cepDigits === lastCep.current) return
    lastCep.current = cepDigits
    let alive = true
    setCepBusy(true)
    void lookupCep(cepDigits).then(found => {
      if (!alive) return
      setCepBusy(false)
      if (!found) return
      setForm(current => ({
        ...current,
        logradouro: found.street || current.logradouro,
        bairro: found.neighborhood || current.bairro,
        cidade: found.city || current.cidade,
        uf: found.state || current.uf,
      }))
    })
    return () => {
      alive = false
    }
  }, [cepDigits])

  // PJ: pré-preenche razão social e nome fantasia pela Receita, só se estiverem vazios.
  const { lookup } = useCnpjLookup(view.cnpj ?? '')
  useEffect(() => {
    if (!pj || lookup.state !== 'done' || !lookup.response.result) return
    const { legalName, tradeName } = lookup.response.result
    setForm(current => ({
      ...current,
      razaoSocial: current.razaoSocial || legalName || '',
      nomeFantasia: current.nomeFantasia || tradeName || legalName || '',
    }))
  }, [pj, lookup])

  // Quem é o dono do código de indicação.
  const codigo = form.codigoIndicacao.trim()
  useEffect(() => {
    if (!equipe || codigo.length < 4) {
      setIndicador(null)
      return
    }
    if (view.indicadoPor && codigo === view.codigoIndicacao) {
      setIndicador(view.indicadoPor)
      return
    }
    let alive = true
    const timer = window.setTimeout(async () => {
      try {
        const result = await consultarCodigoIndicacaoAction(escopo, codigo)
        if (alive) setIndicador(result.success ? result.data : null)
      } catch {
        if (alive) setIndicador(null)
      }
    }, 400)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [codigo, equipe, escopo, view.codigoIndicacao, view.indicadoPor])

  async function save() {
    if (busy) return
    setError(null)
    const parsed = candidaturaDadosInput.safeParse({
      atuacao: form.atuacao,
      codigoIndicacao: equipe ? form.codigoIndicacao : undefined,
      dataNascimento: form.dataNascimento,
      endereco: {
        cep: form.cep,
        logradouro: form.logradouro,
        numero: form.numero,
        complemento: form.complemento,
        bairro: form.bairro,
        cidade: form.cidade,
        uf: form.uf,
      },
      razaoSocial: form.razaoSocial,
      nomeFantasia: form.nomeFantasia,
      experiencia: form.experiencia,
      regiaoAtuacao: form.regiaoAtuacao,
      comoConheceu: form.comoConheceu,
    })
    const found = parsed.success ? {} : issuesToFieldErrors(parsed.error.issues)
    if (equipe && !form.codigoIndicacao.trim()) found.codigoIndicacao = 'Informe o código de quem vai indicar você'
    if (pj && !form.razaoSocial.trim()) found.razaoSocial = 'Informe a razão social'
    if (pj && !form.nomeFantasia.trim()) found.nomeFantasia = 'Informe o nome fantasia'
    if (!parsed.success || Object.keys(found).length > 0) {
      setErrors(found)
      setError('Confira os campos destacados.')
      window.setTimeout(() => errorRef.current?.focus(), 0)
      return
    }

    setBusy(true)
    try {
      const result = await salvarDadosCandidaturaAction(escopo, view.id, chave, parsed.data)
      if (result.success) {
        onViewChange(result.data)
        goNext()
        return
      }
      setErrors(result.fieldErrors ?? {})
      setError(result.error)
      window.setTimeout(() => errorRef.current?.focus(), 0)
    } catch {
      setError(FALHA_SERVIDOR)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <StepHeading
        title="Seus dados"
        description="Conte como você quer atuar e onde você está. Você pode voltar e ajustar depois, até enviar a candidatura."
      />
      {error ? (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          <ActionError message={error} />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Como você quer atuar"
          value={form.atuacao}
          onChange={value => set('atuacao', value)}
          options={atuacoes.map(a => ({ value: a, label: CANDIDATURA_ATUACAO_LABELS[a] }))}
          hint={CANDIDATURA_ATUACAO_DESCRICOES[form.atuacao as keyof typeof CANDIDATURA_ATUACAO_DESCRICOES]}
          error={errors.atuacao}
          containerClassName="sm:col-span-2"
        />
        {equipe ? (
          <div className="space-y-2 sm:col-span-2">
            <TextField
              label="Código de indicação"
              value={form.codigoIndicacao}
              onChange={event => set('codigoIndicacao', event.target.value)}
              error={errors.codigoIndicacao}
              autoComplete="off"
            />
            <p role="status" aria-live="polite" className="text-[13px] font-medium text-emerald-700">
              {indicador
                ? `Você entrará na equipe de ${indicador.nome} (${PAPEL_COMERCIAL_LABELS[indicador.papel].toLowerCase()}).`
                : ''}
            </p>
          </div>
        ) : null}

        {pj ? (
          <>
            <TextField
              label="Razão social"
              value={form.razaoSocial}
              onChange={event => set('razaoSocial', event.target.value)}
              error={errors.razaoSocial}
              hint={lookup.state === 'loading' ? 'Consultando a Receita…' : undefined}
            />
            <TextField
              label="Nome fantasia"
              value={form.nomeFantasia}
              onChange={event => set('nomeFantasia', event.target.value)}
              error={errors.nomeFantasia}
            />
          </>
        ) : null}

        <TextField
          label={pj ? 'Data de nascimento do representante' : 'Data de nascimento'}
          type="date"
          optional
          value={form.dataNascimento}
          onChange={event => set('dataNascimento', event.target.value)}
          error={errors.dataNascimento}
          autoComplete="bday"
        />
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground">{pj ? 'Endereço da empresa' : 'Endereço'}</legend>
        <div className="grid gap-4 sm:grid-cols-6">
          <TextField
            label="CEP"
            inputMode="numeric"
            placeholder="00000-000"
            value={form.cep}
            onChange={event => set('cep', maskCep(event.target.value), 'endereco.cep')}
            error={errors['endereco.cep']}
            adornment={cepBusy ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Buscando o CEP" /> : null}
            autoComplete="postal-code"
            containerClassName="sm:col-span-2"
          />
          <TextField
            label="Rua"
            value={form.logradouro}
            onChange={event => set('logradouro', event.target.value, 'endereco.logradouro')}
            error={errors['endereco.logradouro']}
            autoComplete="address-line1"
            containerClassName="sm:col-span-4"
          />
          <TextField
            label="Número"
            value={form.numero}
            onChange={event => set('numero', event.target.value, 'endereco.numero')}
            error={errors['endereco.numero']}
            containerClassName="sm:col-span-2"
          />
          <TextField
            label="Complemento"
            optional
            value={form.complemento}
            onChange={event => set('complemento', event.target.value, 'endereco.complemento')}
            error={errors['endereco.complemento']}
            containerClassName="sm:col-span-4"
          />
          <TextField
            label="Bairro"
            value={form.bairro}
            onChange={event => set('bairro', event.target.value, 'endereco.bairro')}
            error={errors['endereco.bairro']}
            containerClassName="sm:col-span-2"
          />
          <TextField
            label="Cidade"
            value={form.cidade}
            onChange={event => set('cidade', event.target.value, 'endereco.cidade')}
            error={errors['endereco.cidade']}
            containerClassName="sm:col-span-3"
          />
          <SelectField
            label="UF"
            value={form.uf}
            onChange={value => set('uf', value, 'endereco.uf')}
            options={UFS.map(uf => ({ value: uf, label: uf }))}
            error={errors['endereco.uf']}
            containerClassName="sm:col-span-1"
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground">Sobre você (opcional)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Região onde pretende atuar"
            optional
            value={form.regiaoAtuacao}
            onChange={event => set('regiaoAtuacao', event.target.value)}
            error={errors.regiaoAtuacao}
          />
          <TextField
            label="Como conheceu a rede comercial"
            optional
            value={form.comoConheceu}
            onChange={event => set('comoConheceu', event.target.value)}
            error={errors.comoConheceu}
          />
          <TextAreaField
            label="Experiência com vendas"
            optional
            value={form.experiencia}
            onChange={event => set('experiencia', event.target.value)}
            error={errors.experiencia}
            containerClassName="sm:col-span-2"
          />
        </div>
      </fieldset>

      <StepFooter onBack={null} onPrimary={() => void save()} busy={busy} />
    </div>
  )
}
