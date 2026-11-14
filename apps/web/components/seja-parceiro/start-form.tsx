'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import {
  CANDIDATURA_ATUACOES,
  CANDIDATURA_ATUACAO_DESCRICOES,
  CANDIDATURA_ATUACAO_LABELS,
  CANDIDATURA_TIPOS_PESSOA,
  CANDIDATURA_TIPO_PESSOA_LABELS,
  PAPEL_COMERCIAL_LABELS,
  iniciarCandidaturaInput,
  maskCpf,
  maskPhone,
  type CandidaturaAtuacao,
  type CandidaturaTipoPessoa,
  type PapelComercial,
} from '@annetec/contracts'
import { ChoiceCard, Notice, TextField } from '@/components/contratar/ui'
import { Button } from '@/components/ui/button'
import { consultarCodigoIndicacaoAction, iniciarCandidaturaAction } from '@/lib/actions/vendas-candidaturas-api'
import { cn } from '@/lib/utils'
import { issuesToFieldErrors, maskCnpj, type Escopo } from './escopo'
import { RecuperarAcessoDialog } from './recuperar-acesso'

type Values = {
  tipoPessoa: CandidaturaTipoPessoa
  atuacao: CandidaturaAtuacao
  nome: string
  email: string
  telefone: string
  cpf: string
  cnpj: string
  codigoIndicacao: string
  website: string
}

const INITIAL: Values = {
  tipoPessoa: 'pf',
  atuacao: 'vendedor_solo',
  nome: '',
  email: '',
  telefone: '',
  cpf: '',
  cnpj: '',
  codigoIndicacao: '',
  website: '',
}

type CodigoState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ok'; nome: string; papel: PapelComercial }
  | { state: 'invalid'; message: string }

const FALHA = 'Não foi possível falar com o servidor. Verifique a conexão e tente novamente.'

/**
 * Primeiro passo da candidatura: cria o rascunho e leva para a página de
 * acompanhamento (`/seja-parceiro/<id>?chave=…`), onde o resto é preenchido.
 * `variant="home"` é a versão compacta da vitrine do clube.
 */
export function StartForm({ escopo, variant = 'page' }: { escopo: Escopo; variant?: 'page' | 'home' }) {
  const router = useRouter()
  const compact = variant === 'home'
  const [values, setValues] = useState<Values>(INITIAL)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [codigo, setCodigo] = useState<CodigoState>({ state: 'idle' })
  const sequence = useRef(0)
  const errorRef = useRef<HTMLDivElement>(null)

  const slug = escopo.kind === 'tenant' ? escopo.slug : null
  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues(current => ({ ...current, [key]: value }))
    setErrors(current => {
      if (!(key in current)) return current
      const { [key]: _removed, ...rest } = current
      return rest
    })
  }

  const pj = values.tipoPessoa === 'pj'
  const equipe = values.atuacao === 'vendedor_equipe'

  function chooseTipo(tipo: CandidaturaTipoPessoa) {
    setValues(current => ({
      ...current,
      tipoPessoa: tipo,
      atuacao: tipo === 'pf' && current.atuacao === 'corretora' ? 'vendedor_solo' : current.atuacao,
    }))
  }

  function chooseAtuacao(atuacao: CandidaturaAtuacao) {
    setValues(current => ({
      ...current,
      atuacao,
      tipoPessoa: atuacao === 'corretora' ? 'pj' : current.tipoPessoa,
    }))
  }

  // Confere o código de indicação assim que fica com tamanho plausível.
  const codigoDigitado = values.codigoIndicacao.trim()
  useEffect(() => {
    const id = ++sequence.current
    if (!equipe || codigoDigitado.length < 4) {
      setCodigo({ state: 'idle' })
      return
    }
    setCodigo({ state: 'loading' })
    const timer = window.setTimeout(async () => {
      try {
        const result = await consultarCodigoIndicacaoAction(slug ? { kind: 'tenant', slug } : { kind: 'platform' }, codigoDigitado)
        if (id !== sequence.current) return
        setCodigo(
          result.success
            ? { state: 'ok', nome: result.data.nome, papel: result.data.papel }
            : { state: 'invalid', message: 'Código não encontrado. Confira com quem indicou você.' },
        )
      } catch {
        if (id === sequence.current) setCodigo({ state: 'invalid', message: FALHA })
      }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [codigoDigitado, equipe, slug])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setFormError(null)

    const parsed = iniciarCandidaturaInput.safeParse({
      ...values,
      cnpj: pj ? values.cnpj : undefined,
      codigoIndicacao: equipe ? values.codigoIndicacao : undefined,
    })
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues))
      setFormError('Confira os campos destacados.')
      window.setTimeout(() => errorRef.current?.focus(), 0)
      return
    }

    setBusy(true)
    try {
      const result = await iniciarCandidaturaAction(escopo, parsed.data)
      if (result.success) {
        router.push(result.data.acompanhamentoPath)
        return
      }
      setErrors(result.fieldErrors ?? {})
      setFormError(result.error)
      window.setTimeout(() => errorRef.current?.focus(), 0)
    } catch {
      setFormError(FALHA)
    } finally {
      setBusy(false)
    }
  }

  const idPrefix = `parceiro-${variant}`

  return (
    <form onSubmit={submit} noValidate className="space-y-5" aria-label="Começar candidatura de parceiro comercial">
      {formError ? (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          <Notice tone="error" title={formError} />
        </div>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Você atua como</legend>
        <div role="radiogroup" aria-label="Tipo de pessoa" className="grid grid-cols-2 gap-2">
          {CANDIDATURA_TIPOS_PESSOA.map(tipo => (
            <button
              key={tipo}
              type="button"
              role="radio"
              aria-checked={values.tipoPessoa === tipo}
              onClick={() => chooseTipo(tipo)}
              className={cn(
                'h-11 rounded-xl border-2 px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
                values.tipoPessoa === tipo
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background text-foreground/80 hover:border-primary/40',
              )}
            >
              {CANDIDATURA_TIPO_PESSOA_LABELS[tipo]}
            </button>
          ))}
        </div>
        {errors.tipoPessoa ? <p className="text-[13px] text-destructive">{errors.tipoPessoa}</p> : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Como você quer atuar</legend>
        <div role="radiogroup" aria-label="Atuação" className={cn('grid gap-2', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2')}>
          {CANDIDATURA_ATUACOES.map(atuacao => (
            <ChoiceCard
              key={atuacao}
              selected={values.atuacao === atuacao}
              onSelect={() => chooseAtuacao(atuacao)}
              title={CANDIDATURA_ATUACAO_LABELS[atuacao]}
              description={compact ? undefined : CANDIDATURA_ATUACAO_DESCRICOES[atuacao]}
              className={cn(compact && 'p-3')}
            />
          ))}
        </div>
        {errors.atuacao ? <p className="text-[13px] text-destructive">{errors.atuacao}</p> : null}
      </fieldset>

      {equipe ? (
        <div className="space-y-2">
          <TextField
            id={`${idPrefix}-codigo`}
            label="Código de indicação"
            hint="Peça o código ao supervisor ou colega da equipe."
            value={values.codigoIndicacao}
            onChange={event => set('codigoIndicacao', event.target.value)}
            error={errors.codigoIndicacao}
            autoComplete="off"
            autoCapitalize="characters"
          />
          <div role="status" aria-live="polite">
            {codigo.state === 'loading' ? (
              <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Conferindo o código…
              </p>
            ) : codigo.state === 'ok' ? (
              <p className="text-[13px] font-medium text-emerald-700">
                Você entrará na equipe de {codigo.nome} ({PAPEL_COMERCIAL_LABELS[codigo.papel].toLowerCase()}).
              </p>
            ) : codigo.state === 'invalid' ? (
              <p className="text-[13px] text-destructive">{codigo.message}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={cn('grid gap-4', !compact && 'sm:grid-cols-2')}>
        <TextField
          id={`${idPrefix}-nome`}
          label={pj ? 'Nome do representante' : 'Nome completo'}
          value={values.nome}
          onChange={event => set('nome', event.target.value)}
          error={errors.nome}
          autoComplete="name"
          containerClassName={!compact ? 'sm:col-span-2' : undefined}
        />
        <TextField
          id={`${idPrefix}-email`}
          label="E-mail"
          type="email"
          inputMode="email"
          value={values.email}
          onChange={event => set('email', event.target.value)}
          error={errors.email}
          autoComplete="email"
        />
        <TextField
          id={`${idPrefix}-telefone`}
          label="Telefone / WhatsApp"
          inputMode="tel"
          placeholder="(00) 00000-0000"
          value={values.telefone}
          onChange={event => set('telefone', maskPhone(event.target.value))}
          error={errors.telefone}
          autoComplete="tel"
        />
        <TextField
          id={`${idPrefix}-cpf`}
          label={pj ? 'CPF do representante' : 'CPF'}
          inputMode="numeric"
          placeholder="000.000.000-00"
          value={values.cpf}
          onChange={event => set('cpf', maskCpf(event.target.value))}
          error={errors.cpf}
        />
        {pj ? (
          <TextField
            id={`${idPrefix}-cnpj`}
            label="CNPJ da empresa"
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            value={values.cnpj}
            onChange={event => set('cnpj', maskCnpj(event.target.value))}
            error={errors.cnpj}
          />
        ) : null}
      </div>

      {/* Honeypot: invisível para pessoas e para leitores de tela. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Não preencha este campo
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={values.website}
            onChange={event => set('website', event.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" disabled={busy} className="h-12 gap-2 rounded-full px-6 text-base font-semibold">
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
          {busy ? 'Criando sua candidatura…' : 'Começar candidatura'}
          {!busy ? <ArrowRight className="size-5" aria-hidden /> : null}
        </Button>
        {!compact ? <RecuperarAcessoDialog escopo={escopo} /> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        A próxima página é o seu link de acompanhamento: guarde-o ou peça de novo pelo e-mail. Seus dados são usados só para a análise da parceria (LGPD).
      </p>
    </form>
  )
}
