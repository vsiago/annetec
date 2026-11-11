'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Controller, useFieldArray, useForm, useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Info, Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  CANAIS_MENSAGEM,
  DEFAULT_MODELOS_MENSAGEM,
  DEFAULT_VENDAS_CONFIG,
  MODELO_MENSAGEM_PLACEHOLDERS,
  updateConfigInput,
  type VendasConfig,
  type VendasConfigResposta,
  type VendasEu,
} from '@annetec/contracts'
import { LoadError, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getConfigAction, updateConfigAction } from '@/lib/actions/vendas-rede-gestao-api'
import { cn } from '@/lib/utils'
import { formatarMoeda } from '../ui/mascaras'
import { preencherModelo } from '../ui/wa-link'
import { CabecalhoTela, PortaoDePapel } from './comum'
import type { EscopoRede } from './tipos'

/**
 * Regras (master): comissão do vendedor por parcela, adesão, repasses da
 * cadeia (supervisor, gerente, corretora), escala própria do balcão,
 * distribuição de leads, retorno ao pool, presença, desconto do balcão, meta
 * padrão e modelos de mensagem. A pré-visualização à direita recalcula a cada
 * tecla ("Numa mensalidade de R$ 100: vendedor R$ 100 / 50 / 25…"). A ação
 * principal é "Salvar regras", numa barra que só aparece com alterações.
 */

const numero = (msg: string) => z.number({ invalid_type_error: msg, required_error: msg })
const pct = numero('Informe uma porcentagem.').min(0, 'Use de 0 a 100.').max(100, 'Use de 0 a 100.')
const pctInt = pct.int('Use números inteiros.')

const schema = z
  .object({
    escala: z.array(z.object({ pct: pctInt })).min(1, 'Informe ao menos a 1ª parcela.').max(12, 'No máximo 12 parcelas.'),
    percentualAdesao: pct,
    supervisor: pct,
    gerente: pct,
    corretora: pct,
    balcaoPersonalizado: z.boolean(),
    balcaoEscala: z.array(z.object({ pct: pctInt })).max(12, 'No máximo 12 parcelas.'),
    distribuicao: z.enum(['pool', 'automatica']),
    poolRetornoHoras: numero('Informe as horas.').int('Use números inteiros.').min(1, 'Use pelo menos 1 hora.').max(720, 'Use no máximo 720 horas (30 dias).'),
    presencaMinutos: numero('Informe os minutos.').int('Use números inteiros.').min(1, 'Use pelo menos 1 minuto.').max(60, 'Use no máximo 60 minutos.'),
    balcaoDescontoPadrao: numero('Informe o desconto.').int('Use números inteiros.').min(0, 'Use de 0 a 100.').max(100, 'Use de 0 a 100.'),
    metaMensalPadrao: numero('Informe a meta.').int('Use números inteiros.').min(0, 'Use 0 ou mais.').max(100000, 'Use até 100.000.'),
    modelos: z
      .array(
        z.object({
          id: z.string().min(1).max(60),
          titulo: z.string().trim().min(1, 'Dê um título ao modelo.').max(80, 'Use até 80 caracteres.'),
          canal: z.enum(CANAIS_MENSAGEM),
          texto: z.string().trim().min(1, 'Escreva a mensagem.').max(2000, 'Use até 2.000 caracteres.'),
        }),
      )
      .max(30, 'No máximo 30 modelos.'),
  })
  .superRefine((v, ctx) => {
    if (v.balcaoPersonalizado && v.balcaoEscala.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['balcaoEscala'], message: 'Informe ao menos a 1ª parcela do balcão.' })
    }
  })

type Form = z.infer<typeof schema>

function deConfig(c: VendasConfig): Form {
  return {
    escala: c.escalaMensal.map(v => ({ pct: v })),
    percentualAdesao: c.percentualAdesao,
    supervisor: c.overrides.supervisor,
    gerente: c.overrides.gerente,
    corretora: c.overrides.corretora,
    balcaoPersonalizado: c.balcaoPercentual !== null,
    balcaoEscala: (c.balcaoPercentual ?? c.escalaMensal).map(v => ({ pct: v })),
    distribuicao: c.distribuicao,
    poolRetornoHoras: c.poolRetornoHoras,
    presencaMinutos: c.presencaMinutos,
    balcaoDescontoPadrao: c.balcaoDescontoPadrao,
    metaMensalPadrao: c.metaMensalPadrao,
    modelos: c.modelosMensagem.map(m => ({ ...m })),
  }
}

function padroes(escopo: EscopoRede): Form {
  return {
    escala: [...DEFAULT_VENDAS_CONFIG.escalaMensal].map(v => ({ pct: v })),
    percentualAdesao: escopo.kind === 'platform' ? DEFAULT_VENDAS_CONFIG.percentualAdesaoPlatform : DEFAULT_VENDAS_CONFIG.percentualAdesaoTenant,
    supervisor: DEFAULT_VENDAS_CONFIG.overrides.supervisor,
    gerente: DEFAULT_VENDAS_CONFIG.overrides.gerente,
    corretora: DEFAULT_VENDAS_CONFIG.overrides.corretora,
    balcaoPersonalizado: false,
    balcaoEscala: [...DEFAULT_VENDAS_CONFIG.escalaMensal].map(v => ({ pct: v })),
    distribuicao: 'pool',
    poolRetornoHoras: DEFAULT_VENDAS_CONFIG.poolRetornoHoras,
    presencaMinutos: DEFAULT_VENDAS_CONFIG.presencaMinutos,
    balcaoDescontoPadrao: DEFAULT_VENDAS_CONFIG.balcaoDescontoPadrao,
    metaMensalPadrao: DEFAULT_VENDAS_CONFIG.metaMensalPadrao,
    modelos: DEFAULT_MODELOS_MENSAGEM.map(m => ({ ...m })),
  }
}

function paraPayload(f: Form) {
  return {
    escalaMensal: f.escala.map(e => e.pct),
    percentualAdesao: f.percentualAdesao,
    overrides: { supervisor: f.supervisor, gerente: f.gerente, corretora: f.corretora },
    balcaoPercentual: f.balcaoPersonalizado ? f.balcaoEscala.map(e => e.pct) : null,
    distribuicao: f.distribuicao,
    poolRetornoHoras: f.poolRetornoHoras,
    presencaMinutos: f.presencaMinutos,
    balcaoDescontoPadrao: f.balcaoDescontoPadrao,
    metaMensalPadrao: f.metaMensalPadrao,
    modelosMensagem: f.modelos.map(m => ({ ...m, titulo: m.titulo.trim(), texto: m.texto.trim() })),
  }
}

export function RegrasPage({ escopo }: { escopo: EscopoRede }) {
  return <PortaoDePapel escopo={escopo} tela="regras">{eu => <RegrasConteudo escopo={escopo} eu={eu} />}</PortaoDePapel>
}

export function RegrasConteudo({ escopo }: { escopo: EscopoRede; eu?: VendasEu }) {
  const chave = escopo.kind === 'platform' ? 'platform' : escopo.slug
  const config = useConsoleData<VendasConfigResposta>(() => getConfigAction(escopo), [chave])
  const completa = config.data?.completa ?? null

  if (config.loading && !config.data) return <TableSkeleton rows={6} />
  if (!config.data) return <LoadError message={config.error ?? 'Não foi possível carregar as regras.'} onRetry={() => void config.reload()} />
  if (!completa) return <LoadError message="Só o master vê e altera as regras da rede." framed />

  return <FormularioRegras escopo={escopo} atual={completa} aoSalvar={nova => config.setData(nova)} />
}

function FormularioRegras({ escopo, atual, aoSalvar }: { escopo: EscopoRede; atual: VendasConfig; aoSalvar: (c: VendasConfigResposta) => void }) {
  const inicial = useMemo(() => deConfig(atual), [atual])
  const [salvando, setSalvando] = useState(false)
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: inicial, mode: 'onChange' })
  const { control, register, handleSubmit, reset, setValue, formState } = form
  const { errors, isDirty } = formState

  useEffect(() => {
    reset(inicial)
  }, [inicial, reset])

  const escala = useFieldArray({ control, name: 'escala' })
  const balcao = useFieldArray({ control, name: 'balcaoEscala' })
  const modelos = useFieldArray({ control, name: 'modelos' })
  const personalizado = useWatch({ control, name: 'balcaoPersonalizado' })

  const salvar = handleSubmit(
    async valores => {
      const payload = paraPayload(valores)
      const conferido = updateConfigInput.safeParse(payload)
      if (!conferido.success) {
        toast.error('Alguma regra está fora do permitido.', { description: conferido.error.issues[0]?.message })
        return
      }
      setSalvando(true)
      const r = await updateConfigAction(escopo, conferido.data)
      setSalvando(false)
      if (!r.success) {
        toast.error(r.error, r.fieldErrors ? { description: Object.values(r.fieldErrors).slice(0, 3).join(' · ') } : undefined)
        return
      }
      toast.success('Regras salvas. Valem para as próximas comissões e leads.')
      aoSalvar(r.data)
      if (r.data.completa) reset(deConfig(r.data.completa))
    },
    () => toast.error('Corrija os campos destacados antes de salvar.'),
  )

  return (
    <form onSubmit={salvar} noValidate className="flex flex-col gap-6 pb-24">
      <CabecalhoTela
        titulo="Regras"
        descricao="Quanto cada papel ganha, como os leads são distribuídos e o que o vendedor envia ao cliente. Mudanças valem daqui para frente."
        acao={
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => {
              reset(padroes(escopo), { keepDefaultValues: true })
              toast.info('Valores padrão carregados. Revise e clique em Salvar regras.')
            }}
          >
            <RotateCcw aria-hidden="true" />
            Restaurar padrões
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] xl:items-start">
        <div className="flex flex-col gap-6">
          <SectionCard title="Comissão do vendedor" description="Porcentagem da mensalidade paga que vira comissão, parcela a parcela.">
            <div className="flex flex-col gap-5">
              <EscalaEditor
                nome="escala"
                rotulo="Mensalidade"
                campos={escala.fields}
                register={register}
                aoAdicionar={() => escala.append({ pct: 0 })}
                aoRemover={i => escala.remove(i)}
                erros={errors}
              />
              <CampoNumero
                id="percentualAdesao"
                rotulo="Taxa de adesão"
                sufixo="%"
                ajuda="Porcentagem da taxa de adesão paga que vira comissão. Use 0 se não houver comissão sobre a adesão."
                registro={register('percentualAdesao', { valueAsNumber: true })}
                erro={errors.percentualAdesao?.message}
                step="0.01"
              />
            </div>
          </SectionCard>

          <SectionCard title="Repasse para a cadeia" description="Quem está acima do vendedor ganha uma porcentagem da comissão dele, na mesma parcela. Vendedor solo fica com 100% e não gera repasses.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <CampoNumero id="supervisor" rotulo="Supervisor" sufixo="%" registro={register('supervisor', { valueAsNumber: true })} erro={errors.supervisor?.message} step="0.01" />
              <CampoNumero id="gerente" rotulo="Gerente" sufixo="%" registro={register('gerente', { valueAsNumber: true })} erro={errors.gerente?.message} step="0.01" />
              <CampoNumero id="corretora" rotulo="Corretora" sufixo="%" registro={register('corretora', { valueAsNumber: true })} erro={errors.corretora?.message} step="0.01" />
            </div>
          </SectionCard>

          <SectionCard title="Balcão" description="Quem atende no balcão pode ter uma escala própria e um desconto sugerido ao cliente.">
            <div className="flex flex-col gap-5">
              <Controller
                control={control}
                name="balcaoPersonalizado"
                render={({ field }) => (
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={e => {
                        field.onChange(e.target.checked)
                        if (e.target.checked && balcao.fields.length === 0) setValue('balcaoEscala', escala.fields.map(f => ({ pct: Number(f.pct) || 0 })))
                      }}
                      className="mt-1 size-4"
                    />
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold">Escala própria para o balcão</span>
                      <span className="text-[13px] text-muted-foreground">Desligado, o balcão usa a mesma escala do vendedor.</span>
                    </span>
                  </label>
                )}
              />
              {personalizado ? (
                <EscalaEditor
                  nome="balcaoEscala"
                  rotulo="Balcão"
                  campos={balcao.fields}
                  register={register}
                  aoAdicionar={() => balcao.append({ pct: 0 })}
                  aoRemover={i => balcao.remove(i)}
                  erros={errors}
                />
              ) : null}
              <CampoNumero
                id="balcaoDescontoPadrao"
                rotulo="Desconto padrão oferecido ao cliente"
                sufixo="%"
                ajuda="Aparece no simulador do balcão: “Com o plano: −30 %”."
                registro={register('balcaoDescontoPadrao', { valueAsNumber: true })}
                erro={errors.balcaoDescontoPadrao?.message}
                className="sm:max-w-xs"
              />
            </div>
          </SectionCard>

          <SectionCard title="Leads novos" description="Como um lead que chega do site ou de um link encontra o vendedor.">
            <div className="flex flex-col gap-5">
              <Controller
                control={control}
                name="distribuicao"
                render={({ field }) => (
                  <fieldset className="m-0 grid min-w-0 grid-cols-1 gap-3 border-0 p-0 md:grid-cols-2">
                    <legend className="sr-only">Distribuição de leads</legend>
                    {(
                      [
                        { value: 'pool', titulo: 'Pool (quem pegar primeiro)', texto: 'O lead fica visível para todos os agentes online, exceto balcão. Quem clicar em “Atender” primeiro fica com ele.' },
                        { value: 'automatica', titulo: 'Automática', texto: 'O sistema entrega o lead ao vendedor ou supervisor online com menos leads nos últimos 7 dias. Sem ninguém online, ele vai para o pool.' },
                      ] as const
                    ).map(o => (
                      <label
                        key={o.value}
                        className={cn(
                          'flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                          field.value === o.value ? 'border-[#1E2A4A] bg-[#F5F8FC]' : 'border-border hover:bg-[#F8F9FB]',
                        )}
                      >
                        <input type="radio" name={field.name} value={o.value} checked={field.value === o.value} onChange={() => field.onChange(o.value)} className="mt-1 size-4" />
                        <span className="flex flex-col gap-0.5">
                          <span className="text-sm font-semibold">{o.titulo}</span>
                          <span className="text-[13px] leading-relaxed text-muted-foreground">{o.texto}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <CampoNumero
                  id="poolRetornoHoras"
                  rotulo="Retorno ao pool"
                  sufixo="horas"
                  ajuda="Lead sem nenhum contato registrado por este tempo volta ao pool para outro agente."
                  registro={register('poolRetornoHoras', { valueAsNumber: true })}
                  erro={errors.poolRetornoHoras?.message}
                />
                <CampoNumero
                  id="presencaMinutos"
                  rotulo="Presença"
                  sufixo="minutos"
                  ajuda="Sem sinal do navegador por este tempo, o agente aparece como offline e deixa de receber leads."
                  registro={register('presencaMinutos', { valueAsNumber: true })}
                  erro={errors.presencaMinutos?.message}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Meta" description="Vale para quem não tem uma meta individual cadastrada.">
            <CampoNumero
              id="metaMensalPadrao"
              rotulo="Meta mensal padrão"
              sufixo="vendas/mês"
              registro={register('metaMensalPadrao', { valueAsNumber: true })}
              erro={errors.metaMensalPadrao?.message}
              className="sm:max-w-xs"
            />
          </SectionCard>

          <SectionCard
            title="Modelos de mensagem"
            description="Textos prontos que o vendedor envia por WhatsApp ou e-mail, já preenchidos com os dados do lead."
            actions={
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={modelos.fields.length >= 30}
                onClick={() => modelos.append({ id: `modelo-${Date.now().toString(36)}`, titulo: '', canal: 'whatsapp', texto: '' })}
              >
                <Plus aria-hidden="true" />
                Novo modelo
              </Button>
            }
          >
            <ModelosEditor control={control} register={register} campos={modelos.fields} erros={errors} aoRemover={i => modelos.remove(i)} setValue={setValue} />
          </SectionCard>
        </div>

        <aside aria-label="Pré-visualização" className="xl:sticky xl:top-4">
          <Previa control={control} />
        </aside>
      </div>

      {isDirty ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(16,24,40,0.08)] backdrop-blur" role="region" aria-label="Alterações não salvas">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-sm font-medium">Você tem alterações não salvas.</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={salvando} onClick={() => reset(inicial)}>
                Descartar
              </Button>
              <Button type="submit" disabled={salvando} className="gap-2 bg-[var(--vr-accent,#1E2A4A)] text-[var(--vr-accent-fg,#fff)] hover:brightness-110">
                {salvando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                Salvar regras
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

function CampoNumero({
  id,
  rotulo,
  sufixo,
  ajuda,
  registro,
  erro,
  step = '1',
  className,
}: {
  id: string
  rotulo: string
  sufixo?: string
  ajuda?: ReactNode
  registro: ReturnType<UseFormRegister<Form>>
  erro?: string
  step?: string
  className?: string
}) {
  const descricao = [ajuda ? `${id}-ajuda` : null, erro ? `${id}-erro` : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </Label>
      <div className="relative">
        <Input id={id} type="number" inputMode="decimal" step={step} aria-invalid={erro ? true : undefined} aria-describedby={descricao} className={cn('h-11', sufixo && 'pr-20')} {...registro} />
        {sufixo ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{sufixo}</span> : null}
      </div>
      {ajuda ? (
        <p id={`${id}-ajuda`} className="m-0 text-[13px] leading-relaxed text-muted-foreground">
          {ajuda}
        </p>
      ) : null}
      {erro ? (
        <p id={`${id}-erro`} role="alert" className="m-0 text-[13px] font-medium text-[#B42318]">
          {erro}
        </p>
      ) : null}
    </div>
  )
}

function EscalaEditor({
  nome,
  rotulo,
  campos,
  register,
  aoAdicionar,
  aoRemover,
  erros,
}: {
  nome: 'escala' | 'balcaoEscala'
  rotulo: string
  campos: { id: string }[]
  register: UseFormRegister<Form>
  aoAdicionar: () => void
  aoRemover: (indice: number) => void
  erros: FieldErrors<Form>
}) {
  const erroGeral = (erros[nome] as { message?: string; root?: { message?: string } } | undefined)?.message ?? (erros[nome] as { root?: { message?: string } } | undefined)?.root?.message
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="mb-1 p-0 text-sm font-medium">{rotulo}: % por parcela paga</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {campos.map((c, i) => {
          const erro = erros[nome]?.[i]?.pct?.message
          const id = `${nome}-${i}`
          return (
            <div key={c.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={id} className="text-[13px] text-muted-foreground">
                  {i + 1}ª parcela
                </Label>
                {campos.length > 1 && i === campos.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => aoRemover(i)}
                    aria-label={`Remover a ${i + 1}ª parcela`}
                    className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-[#F2F4F7] hover:text-[#B42318] focus-visible:ring-2 focus-visible:ring-[#1E2A4A]"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <div className="relative">
                <Input id={id} type="number" inputMode="numeric" step="1" aria-invalid={erro ? true : undefined} aria-describedby={erro ? `${id}-erro` : undefined} className="h-11 pr-9" {...register(`${nome}.${i}.pct` as const, { valueAsNumber: true })} />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
              </div>
              {erro ? (
                <p id={`${id}-erro`} role="alert" className="m-0 text-xs font-medium text-[#B42318]">
                  {erro}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
      {erroGeral ? (
        <p role="alert" className="m-0 text-[13px] font-medium text-[#B42318]">
          {erroGeral}
        </p>
      ) : null}
      <div>
        <Button type="button" variant="outline" size="sm" className="gap-2" disabled={campos.length >= 12} onClick={aoAdicionar}>
          <Plus aria-hidden="true" />
          Adicionar parcela
        </Button>
      </div>
    </fieldset>
  )
}

// ---------------------------------------------------------------------------
// Modelos de mensagem
// ---------------------------------------------------------------------------

const EXEMPLO = { nome: 'Maria', plano: 'Plano Essencial', vendedor: 'João', link: 'https://exemplo.com.br/contratar?ref=joao' }

function ModelosEditor({
  control,
  register,
  campos,
  erros,
  aoRemover,
  setValue,
}: {
  control: Control<Form>
  register: UseFormRegister<Form>
  campos: { id: string }[]
  erros: FieldErrors<Form>
  aoRemover: (i: number) => void
  setValue: (nome: `modelos.${number}.texto`, valor: string, opcoes?: { shouldDirty?: boolean; shouldValidate?: boolean }) => void
}) {
  const modelos = useWatch({ control, name: 'modelos' })
  if (campos.length === 0) {
    return (
      <p className="m-0 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Nenhum modelo cadastrado. Sem modelos, o vendedor escreve cada mensagem do zero. Use “Novo modelo” para criar o primeiro.
      </p>
    )
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {campos.map((c, i) => {
        const e = erros.modelos?.[i]
        const atual = modelos?.[i]
        const idTexto = `modelo-texto-${i}`
        return (
          <li key={c.id} className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`modelo-titulo-${i}`} className="text-sm font-medium">
                  Título
                </Label>
                <Input id={`modelo-titulo-${i}`} maxLength={80} aria-invalid={e?.titulo ? true : undefined} className="h-11" {...register(`modelos.${i}.titulo` as const)} />
                {e?.titulo ? <p role="alert" className="m-0 text-[13px] font-medium text-[#B42318]">{e.titulo.message}</p> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`modelo-canal-${i}`} className="text-sm font-medium">
                  Canal
                </Label>
                <Controller
                  control={control}
                  name={`modelos.${i}.canal` as const}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id={`modelo-canal-${i}`} className="w-full data-[size=default]:h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="email">E-mail</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <Button type="button" variant="ghost" className="gap-2 text-[#B42318] hover:text-[#B42318]" onClick={() => aoRemover(i)} aria-label={`Remover o modelo ${atual?.titulo || i + 1}`}>
                <Trash2 aria-hidden="true" />
                Remover
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={idTexto} className="text-sm font-medium">
                Mensagem
              </Label>
              <Textarea id={idTexto} rows={4} maxLength={2000} aria-invalid={e?.texto ? true : undefined} {...register(`modelos.${i}.texto` as const)} />
              {e?.texto ? <p role="alert" className="m-0 text-[13px] font-medium text-[#B42318]">{e.texto.message}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Inserir:</span>
                {MODELO_MENSAGEM_PLACEHOLDERS.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      const el = document.getElementById(idTexto) as HTMLTextAreaElement | null
                      const texto = atual?.texto ?? ''
                      const ini = el?.selectionStart ?? texto.length
                      const fim = el?.selectionEnd ?? texto.length
                      setValue(`modelos.${i}.texto`, `${texto.slice(0, ini)}{{${p}}}${texto.slice(fim)}`, { shouldDirty: true, shouldValidate: true })
                      el?.focus()
                    }}
                    className="min-h-8 rounded-full border border-border bg-[#F8F9FB] px-2.5 text-xs font-medium outline-none hover:bg-[#EEF2F7] focus-visible:ring-2 focus-visible:ring-[#1E2A4A]"
                  >
                    {`{{${p}}}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-[#F8F9FB] p-3">
              <p className="m-0 mb-1 text-xs font-medium text-muted-foreground">Como o cliente vê (exemplo)</p>
              <p className="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed">{preencherModelo(atual?.texto ?? '', EXEMPLO) || '—'}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Pré-visualização ao vivo
// ---------------------------------------------------------------------------

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function Previa({ control }: { control: Control<Form> }) {
  const v = useWatch({ control })
  const [base, setBase] = useState('100')
  const valorBase = Math.max(0, Number(base.replace(',', '.')) || 0)

  const escala = (v.escala ?? []).map(e => n(e?.pct))
  const balcao = v.balcaoPersonalizado ? (v.balcaoEscala ?? []).map(e => n(e?.pct)) : null
  const sup = n(v.supervisor)
  const ger = n(v.gerente)
  const cor = n(v.corretora)
  const parcelas = Math.max(escala.length, balcao?.length ?? 0)

  const vend = (i: number) => (valorBase * (escala[i] ?? 0)) / 100
  const celula = (valor: number) => <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatarMoeda(valor)}</td>
  const linhaCadeia = (i: number) => vend(i) * (1 + (sup + ger + cor) / 100)

  const adesaoVend = (valorBase * n(v.percentualAdesao)) / 100

  return (
    <SectionCard title="Pré-visualização" description="O que cada papel recebe com as regras acima." icon={Info}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="previa-base" className="text-sm font-medium">
            Numa mensalidade de
          </Label>
          <div className="relative sm:max-w-[12rem]">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">R$</span>
            <Input id="previa-base" inputMode="decimal" value={base} onChange={e => setBase(e.target.value.replace(/[^\d.,]/g, ''))} className="h-11 pl-10" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Comissão por papel e por parcela paga</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Papel</th>
                {Array.from({ length: parcelas }, (_, i) => (
                  <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    {i + 1}ª
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/60">
                <th scope="row" className="px-3 py-2 text-left font-semibold">Vendedor</th>
                {Array.from({ length: parcelas }, (_, i) => (i < escala.length ? <FragmentoCelula key={i}>{celula(vend(i))}</FragmentoCelula> : <td key={i} className="px-3 py-2 text-right text-muted-foreground">—</td>))}
              </tr>
              <tr className="border-b border-border/60">
                <th scope="row" className="px-3 py-2 text-left font-semibold">Supervisor <span className="font-normal text-muted-foreground">({sup}%)</span></th>
                {Array.from({ length: parcelas }, (_, i) => (i < escala.length ? <FragmentoCelula key={i}>{celula((vend(i) * sup) / 100)}</FragmentoCelula> : <td key={i} className="px-3 py-2 text-right text-muted-foreground">—</td>))}
              </tr>
              <tr className="border-b border-border/60">
                <th scope="row" className="px-3 py-2 text-left font-semibold">Gerente <span className="font-normal text-muted-foreground">({ger}%)</span></th>
                {Array.from({ length: parcelas }, (_, i) => (i < escala.length ? <FragmentoCelula key={i}>{celula((vend(i) * ger) / 100)}</FragmentoCelula> : <td key={i} className="px-3 py-2 text-right text-muted-foreground">—</td>))}
              </tr>
              <tr className="border-b border-border/60">
                <th scope="row" className="px-3 py-2 text-left font-semibold">Corretora <span className="font-normal text-muted-foreground">({cor}%)</span></th>
                {Array.from({ length: parcelas }, (_, i) => (i < escala.length ? <FragmentoCelula key={i}>{celula((vend(i) * cor) / 100)}</FragmentoCelula> : <td key={i} className="px-3 py-2 text-right text-muted-foreground">—</td>))}
              </tr>
              {balcao ? (
                <tr className="border-b border-border/60">
                  <th scope="row" className="px-3 py-2 text-left font-semibold">Balcão</th>
                  {Array.from({ length: parcelas }, (_, i) => (i < balcao.length ? <FragmentoCelula key={i}>{celula((valorBase * (balcao[i] ?? 0)) / 100)}</FragmentoCelula> : <td key={i} className="px-3 py-2 text-right text-muted-foreground">—</td>))}
                </tr>
              ) : null}
              <tr className="bg-[#F8F9FB]">
                <th scope="row" className="px-3 py-2 text-left font-bold">Custo total da cadeia</th>
                {Array.from({ length: parcelas }, (_, i) => (i < escala.length ? <FragmentoCelula key={i}>{<td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums">{formatarMoeda(linhaCadeia(i))}</td>}</FragmentoCelula> : <td key={i} className="px-3 py-2 text-right text-muted-foreground">—</td>))}
              </tr>
            </tbody>
          </table>
        </div>

        <dl className="m-0 flex flex-col gap-2 text-sm">
          <div className="flex items-baseline justify-between gap-3 rounded-lg bg-[#F8F9FB] px-3 py-2">
            <dt className="text-muted-foreground">Taxa de adesão de {formatarMoeda(valorBase)}: vendedor</dt>
            <dd className="m-0 font-semibold tabular-nums">{formatarMoeda(adesaoVend)}</dd>
          </div>
        </dl>

        <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">
          Vendedor solo recebe 100% da comissão dele e não gera repasse para supervisor, gerente nem corretora. Na distribuição{' '}
          <strong className="font-semibold text-foreground">{v.distribuicao === 'automatica' ? 'automática' : 'por pool'}</strong>,{' '}
          {v.distribuicao === 'automatica'
            ? 'o lead vai para quem está online com menos leads recentes.'
            : 'o lead espera por quem atender primeiro.'}{' '}
          Sem contato em {n(v.poolRetornoHoras)} h, ele volta ao pool.
        </p>
      </div>
    </SectionCard>
  )
}

function FragmentoCelula({ children }: { children: ReactNode }) {
  return <>{children}</>
}
