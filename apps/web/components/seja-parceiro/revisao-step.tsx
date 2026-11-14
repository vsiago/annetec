'use client'

import { useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import {
  CANDIDATURA_ATUACAO_LABELS,
  CANDIDATURA_DOCUMENTO_KIND_LABELS,
  CANDIDATURA_TERMOS,
  CANDIDATURA_TERMOS_VERSAO,
  CANDIDATURA_TIPO_PESSOA_LABELS,
  enviarCandidaturaInput,
  formatCep,
  formatCpf,
  formatPhone,
} from '@annetec/contracts'
import { ActionError, Notice, StepHeading, SubPanel, TextField } from '@/components/contratar/ui'
import { StepFooter } from '@/components/contratar/step-footer'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { enviarCandidaturaAction } from '@/lib/actions/vendas-candidaturas-api'
import { maskCnpj } from './escopo'
import { FALHA_SERVIDOR, type StepContext } from './steps'

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  if (!valor) return null
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-muted-foreground sm:w-44">{rotulo}</dt>
      <dd className="min-w-0 break-words font-medium text-foreground">{valor}</dd>
    </div>
  )
}

export function RevisaoStep({ ctx }: { ctx: StepContext }) {
  const { escopo, view, chave, onViewChange, goBack } = ctx
  const [aceite, setAceite] = useState(false)
  const [assinatura, setAssinatura] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)

  const endereco = view.endereco
  const [titulo, ...clausulas] = CANDIDATURA_TERMOS
  const pendencias = view.pendencias

  async function send() {
    if (busy) return
    setError(null)
    const parsed = enviarCandidaturaInput.safeParse({ aceiteTermos: aceite, nomeAssinatura: assinatura })
    if (!parsed.success) {
      const found: Record<string, string> = {}
      for (const issue of parsed.error.issues) found[String(issue.path[0])] ??= issue.message
      setErrors(found)
      setError('Aceite o termo e assine com o seu nome completo.')
      window.setTimeout(() => errorRef.current?.focus(), 0)
      return
    }
    setErrors({})
    setBusy(true)
    try {
      const result = await enviarCandidaturaAction(escopo, view.id, chave, parsed.data)
      if (result.success) {
        toast.success('Candidatura enviada!')
        onViewChange(result.data)
        window.scrollTo({ top: 0, behavior: 'smooth' })
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
      <StepHeading title="Revisão e envio" description="Confira seus dados, leia o termo de parceria e envie a candidatura para análise." />

      {error ? (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          <ActionError message={error} />
        </div>
      ) : null}

      {pendencias.length > 0 ? (
        <Notice tone="warning" title="Antes de enviar, falta:">
          <ul className="list-disc space-y-0.5 pl-4">
            {pendencias.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <SubPanel title="Resumo da candidatura">
        <dl className="space-y-2 text-sm">
          <Linha rotulo="Atuação" valor={CANDIDATURA_ATUACAO_LABELS[view.atuacao]} />
          <Linha rotulo="Tipo" valor={CANDIDATURA_TIPO_PESSOA_LABELS[view.tipoPessoa]} />
          <Linha rotulo="Nome" valor={view.nome} />
          <Linha rotulo="E-mail" valor={view.email} />
          <Linha rotulo="Telefone" valor={formatPhone(view.telefone)} />
          <Linha rotulo="CPF" valor={formatCpf(view.cpf)} />
          <Linha rotulo="CNPJ" valor={view.cnpj ? maskCnpj(view.cnpj) : null} />
          <Linha rotulo="Razão social" valor={view.razaoSocial} />
          <Linha rotulo="Nome fantasia" valor={view.nomeFantasia} />
          <Linha rotulo="Indicado por" valor={view.indicadoPor?.nome} />
          <Linha
            rotulo="Endereço"
            valor={
              endereco
                ? `${endereco.logradouro}, ${endereco.numero}${endereco.complemento ? ` (${endereco.complemento})` : ''} · ${endereco.bairro} · ${endereco.cidade}/${endereco.uf} · CEP ${formatCep(endereco.cep)}`
                : null
            }
          />
          <Linha
            rotulo="Documentos"
            valor={view.documentos.length ? view.documentos.map(doc => CANDIDATURA_DOCUMENTO_KIND_LABELS[doc.kind]).join(', ') : 'Nenhum enviado'}
          />
        </dl>
      </SubPanel>

      <section aria-labelledby="termo-titulo" className="space-y-2">
        <h3 id="termo-titulo" className="text-sm font-semibold text-foreground">
          {titulo} <span className="font-normal text-muted-foreground">· versão {CANDIDATURA_TERMOS_VERSAO}</span>
        </h3>
        <div
          tabIndex={0}
          role="region"
          aria-label="Texto do termo de parceria comercial"
          className="max-h-64 space-y-3 overflow-y-auto rounded-xl border bg-muted/25 p-4 text-sm leading-relaxed text-foreground/90 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {clausulas.map(clausula => (
            <p key={clausula}>{clausula}</p>
          ))}
        </div>
      </section>

      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="aceite-termos"
            checked={aceite}
            onCheckedChange={value => {
              setAceite(value === true)
              setErrors(current => ({ ...current, aceiteTermos: '' }))
            }}
            aria-invalid={errors.aceiteTermos ? true : undefined}
            aria-describedby={errors.aceiteTermos ? 'aceite-termos-erro' : undefined}
            className="mt-0.5"
          />
          <div>
            <Label htmlFor="aceite-termos" className="text-sm leading-snug">
              Li e aceito o termo de parceria comercial.
            </Label>
            {errors.aceiteTermos ? (
              <p id="aceite-termos-erro" className="mt-1 text-[13px] text-destructive">
                {errors.aceiteTermos}
              </p>
            ) : null}
          </div>
        </div>
        <TextField
          label="Seu nome completo, como assinatura"
          hint={`Digite exatamente: ${view.nome}`}
          value={assinatura}
          onChange={event => {
            setAssinatura(event.target.value)
            setErrors(current => ({ ...current, nomeAssinatura: '' }))
          }}
          error={errors.nomeAssinatura || undefined}
          autoComplete="off"
        />
      </div>

      <StepFooter
        onBack={goBack}
        onPrimary={() => void send()}
        primaryLabel="Enviar candidatura"
        busy={busy}
        busyLabel="Enviando…"
        disabled={pendencias.length > 0}
        primaryIcon={<Send className="size-5" aria-hidden />}
      />
    </div>
  )
}
