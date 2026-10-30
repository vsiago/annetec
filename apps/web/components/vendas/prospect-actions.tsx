'use client'

import { useCallback, useMemo, useState } from 'react'
import { CalendarDays, Handshake, Mail, MapPin, MessageCircle, MessagesSquare, Phone, StickyNote } from 'lucide-react'
import {
  ONBOARDING_FINAL_STATUSES,
  PROSPECT_INTERACTION_KIND_LABELS,
  PROSPECT_STAGE_LABELS,
  createProspectInteractionInput,
  type Prospect,
  type ProspectDetail,
  type ProspectInteractionKind,
  type ProspectStage,
} from '@annetec/contracts'
import { ConfirmDialog, runCommand } from '@/components/admin-platform/billing/console-kit'
import {
  ChoiceField,
  FieldGrid,
  TextField,
  TextareaField,
  WizardDialog,
  apiFieldErrors,
  combineValidators,
  useWizard,
  zodFields,
  type FieldErrors,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import { MANUAL_STAGES, todaySP } from '@/components/sales/sales-ui'
import { addProspectInteractionAction, updateSellerProspectAction } from '@/lib/actions/vendas-api'

/**
 * Ações sobre um prospect que várias telas usam: mover de etapa (com o motivo
 * obrigatório quando vira "Perdido") e registrar interação.
 *
 * Mover à mão só vale para Novo, Em contato, Proposta enviada e Perdido. Em
 * contratação, Em aprovação e Ganho acompanham a proposta vinculada sozinhos.
 */

/** Proposta vinculada ainda em andamento: a etapa é dela, não do vendedor. */
export function proposalInProgress(prospect: Pick<Prospect, 'proposal'>): boolean {
  const status = prospect.proposal?.status
  return Boolean(status && !(ONBOARDING_FINAL_STATUSES as readonly string[]).includes(status))
}

export function canMoveTo(prospect: Pick<Prospect, 'stage' | 'proposal'>, target: ProspectStage): boolean {
  if (target === prospect.stage) return false
  if (!MANUAL_STAGES.includes(target)) return false
  // Ganho é definitivo (o clube está no ar).
  if (prospect.stage === 'ganho') return false
  if (proposalInProgress(prospect)) return false
  return true
}

export const AUTOMATIC_STAGE_HINT = 'Em contratação, Em aprovação e Ganho acompanham a proposta sozinhos — gere o link de contratação.'

/** Por que não dá para soltar o cartão nesta etapa (aviso do arrastar). */
export function MANUAL_ONLY_HINT(prospect: Pick<Prospect, 'stage' | 'proposal'>, target: ProspectStage): string {
  if (prospect.stage === 'ganho') return 'Este prospect já virou cliente: a etapa não muda mais.'
  if (proposalInProgress(prospect)) {
    return `A etapa acompanha a proposta ${prospect.proposal?.code ?? ''} enquanto ela estiver em andamento.`.replace('  ', ' ')
  }
  if (!MANUAL_STAGES.includes(target)) return AUTOMATIC_STAGE_HINT
  return 'Não dá para mover para esta etapa.'
}

/**
 * Move a etapa: direto para as etapas comuns; para "Perdido" abre a
 * confirmação com o motivo. Devolve o `dialog` para a tela montar.
 */
export function useMoveStage(onMoved: (detail: ProspectDetail) => void) {
  const [lost, setLost] = useState<Prospect | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const move = useCallback(
    async (prospect: Prospect, target: ProspectStage) => {
      if (!canMoveTo(prospect, target)) return
      if (target === 'perdido') {
        setLost(prospect)
        return
      }
      setBusyId(prospect.id)
      const detail = await runCommand(
        updateSellerProspectAction(prospect.id, { stage: target }),
        `${prospect.name} foi para "${PROSPECT_STAGE_LABELS[target]}"`,
      )
      setBusyId(null)
      if (detail) onMoved(detail)
    },
    [onMoved],
  )

  const dialog = (
    <ConfirmDialog
      open={lost !== null}
      onOpenChange={open => !open && setLost(null)}
      title={lost ? `Marcar ${lost.name} como perdido?` : 'Marcar como perdido?'}
      description="O prospect sai do funil ativo. Dá para trazer de volta depois, movendo para outra etapa."
      confirmLabel="Marcar como perdido"
      destructive
      reason={{ label: 'Motivo da perda', placeholder: 'Ex.: fechou com outro fornecedor; achou caro; sem orçamento este ano.', minLength: 3 }}
      onConfirm={async reason => {
        if (!lost) return false
        const detail = await runCommand(
          updateSellerProspectAction(lost.id, { stage: 'perdido', lostReason: reason }),
          `${lost.name} marcado como perdido`,
        )
        if (detail) onMoved(detail)
        return !!detail
      }}
    />
  )

  return { move, dialog, busyId }
}

// ---------------------------------------------------------------------------
// Registrar interação
// ---------------------------------------------------------------------------

interface InteractionValues {
  kind: string
  description: string
  date: string
}

const KIND_ICONS: Record<Exclude<ProspectInteractionKind, 'sistema'>, typeof Phone> = {
  ligacao: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  reuniao: Handshake,
  visita: MapPin,
  nota: StickyNote,
}

const KIND_OPTIONS = (Object.keys(KIND_ICONS) as Exclude<ProspectInteractionKind, 'sistema'>[]).map(kind => ({
  value: kind,
  title: PROSPECT_INTERACTION_KIND_LABELS[kind],
  icon: KIND_ICONS[kind],
}))

const validateInteraction = zodFields<InteractionValues>(createProspectInteractionInput.pick({ kind: true, description: true }), {
  messages: {
    kind: 'Escolha como foi o contato.',
    description: { required: 'Conte o que aconteceu.', invalid: 'Escreva pelo menos 2 caracteres.' },
  },
})

const validateDate = (v: InteractionValues): FieldErrors<InteractionValues> =>
  v.date && v.date > todaySP() ? { date: 'A data não pode ser no futuro.' } : {}

/** Data escolhida → ISO: hoje = agora; outro dia = meio-dia de São Paulo. */
function occurredAtFor(date: string): string | undefined {
  if (!date || date === todaySP()) return undefined
  return new Date(`${date}T12:00:00-03:00`).toISOString()
}

export function InteractionWizard({
  open,
  onOpenChange,
  prospect,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prospect: Pick<Prospect, 'id' | 'name'> | null
  onSaved: (detail: ProspectDetail) => void
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialValues = useMemo<InteractionValues>(() => ({ kind: 'ligacao', description: '', date: todaySP() }), [open])
  const steps = useMemo<WizardStep<InteractionValues>[]>(
    () => [
      {
        id: 'interacao',
        title: 'Interação',
        icon: MessagesSquare,
        fields: ['kind', 'description', 'date'],
        validate: combineValidators(validateInteraction, validateDate),
      },
    ],
    [],
  )
  const wizard = useWizard<InteractionValues>({
    steps,
    initialValues,
    onSubmit: async values => {
      if (!prospect) return { ok: false, message: 'Escolha um prospect.' }
      const result = await addProspectInteractionAction(prospect.id, {
        kind: values.kind as Exclude<ProspectInteractionKind, 'sistema'>,
        description: values.description.trim(),
        occurredAt: occurredAtFor(values.date),
      })
      if (!result.success) {
        return {
          ok: false,
          message: result.error || 'Não foi possível registrar a interação. Tente de novo.',
          fieldErrors: apiFieldErrors<InteractionValues>(result.fieldErrors, ['kind', 'description', 'date'], { occurredAt: 'date' }),
        }
      }
      onSaved(result.data)
      return { ok: true }
    },
  })

  return (
    <WizardDialog
      open={open}
      onOpenChange={onOpenChange}
      wizard={wizard}
      size="md"
      icon={MessagesSquare}
      title="Registrar interação"
      description={prospect ? `Contato com ${prospect.name}. Fica na linha do tempo do prospect.` : undefined}
      submitLabel="Registrar interação"
      submittingLabel="Registrando…"
      discardTitle="Descartar a interação?"
      renderStep={() => (
        <FieldGrid>
          <ChoiceField {...wizard.field('kind')} label="Como foi o contato" required span={12} columns={3} options={KIND_OPTIONS} />
          <TextareaField
            {...wizard.field('description')}
            label="O que aconteceu"
            required
            span={12}
            rows={4}
            maxLength={4000}
            showCounter
            placeholder="Ex.: apresentei o plano Profissional; pediram proposta com 800 vidas e vão decidir na reunião de diretoria."
          />
          <TextField
            {...wizard.field('date')}
            label="Quando"
            span={5}
            type="date"
            max={todaySP()}
            prefix={<CalendarDays className="size-4" />}
            hint="Hoje registra com o horário de agora."
          />
        </FieldGrid>
      )}
    />
  )
}
