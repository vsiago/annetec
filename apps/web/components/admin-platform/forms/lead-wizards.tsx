'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Contact, MessageSquare, Plus, Target, Trophy, TriangleAlert, UserPlus, Wallet } from 'lucide-react'
import {
  createInteractionInput,
  createLeadInput,
  createSaleInput,
  type Interaction,
  type Lead,
  type TenantUser,
} from '@annetec/contracts'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/admin-platform/ui/button'
import {
  ChoiceField,
  FieldGrid,
  Notice,
  ReviewItem,
  ReviewList,
  ReviewSection,
  SelectField,
  TextField,
  TextareaField,
  WizardDialog,
  WizardSuccess,
  apiFieldErrors,
  maskMoney,
  maskPhone,
  moneyInput,
  parseMoney,
  readableMessage,
  successButton,
  useWizard,
  zodFields,
  type FieldErrors,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import { addOperatorLeadInteractionAction, createOperatorLeadAction, createOperatorSaleAction } from '@/lib/actions/operator-crm-api'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function sellerOptions(sellers: readonly TenantUser[]) {
  return sellers.map(s => ({ value: s.id, label: s.name }))
}

/** Telefone digitado: mesma regra do contrato (`telefone`) para campo opcional, aplicada à tela. */
function phoneError(phone: string): string | undefined {
  if (phone.trim() === '') return undefined
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 11 ? undefined : 'Informe o telefone com DDD, como (21) 99999-9999.'
}

// ---------------------------------------------------------------------------
// Novo lead
// ---------------------------------------------------------------------------

interface LeadValues {
  name: string
  email: string
  phone: string
  source: string
  estimatedValue: string
  sellerId: string
  notes: string
}

const EMPTY_LEAD: LeadValues = { name: '', email: '', phone: '', source: '', estimatedValue: '', sellerId: '', notes: '' }

const LEAD_FIELDS = ['name', 'email', 'phone', 'source', 'estimatedValue', 'sellerId', 'notes'] as const
const SOURCE_SUGGESTIONS = ['Indicação', 'Site', 'Evento', 'WhatsApp'] as const

/** O que a tela manda para a API (vazio → null), como o formulário antigo. */
function leadPayload(v: LeadValues) {
  return {
    name: v.name.trim(),
    email: v.email.trim() || null,
    phone: v.phone || null,
    source: v.source || null,
    status: 'new' as const,
    notes: v.notes || null,
    estimatedValue: parseMoney(v.estimatedValue),
    sellerId: v.sellerId || null,
  }
}

const validateLeadContact = (v: LeadValues): FieldErrors<LeadValues> => {
  const errors = zodFields<LeadValues>(createLeadInput.pick({ name: true, email: true }), {
    input: x => ({ name: x.name.trim(), email: x.email.trim() || null }),
    messages: { name: { required: 'Informe o nome do lead.' } },
  })(v)
  const phone = phoneError(v.phone)
  if (phone) errors.phone = phone
  return errors
}

const validateLeadDeal = zodFields<LeadValues>(createLeadInput.pick({ estimatedValue: true, sellerId: true, source: true, notes: true }), {
  input: x => leadPayload(x),
  messages: { sellerId: { invalid: 'Escolha um vendedor da lista.' } },
})

export function NewLeadWizard({
  open,
  onOpenChange,
  tenantSlug,
  sellers,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  sellers: TenantUser[]
  onCreated: () => void
}) {
  const router = useRouter()
  const [created, setCreated] = useState<Lead | null>(null)

  const steps: readonly WizardStep<LeadValues>[] = [
    {
      id: 'contato',
      title: 'Contato',
      icon: Contact,
      description: 'Quem é a pessoa interessada e como falar com ela.',
      fields: ['name', 'email', 'phone'],
      validate: validateLeadContact,
    },
    {
      id: 'negocio',
      title: 'Negócio',
      icon: Wallet,
      description: 'De onde veio o lead e quanto ele pode render.',
      fields: ['source', 'estimatedValue', 'sellerId', 'notes'],
      validate: validateLeadDeal,
    },
  ]

  const wizard = useWizard<LeadValues>({
    steps,
    initialValues: EMPTY_LEAD,
    onSubmit: async values => {
      const result = await createOperatorLeadAction(tenantSlug, leadPayload(values))
      if (!result.success) {
        return {
          ok: false,
          message: result.error,
          fieldErrors: apiFieldErrors<LeadValues>(result.fieldErrors, LEAD_FIELDS),
        }
      }
      setCreated(result.data)
      onCreated()
      return { ok: true }
    },
  })
  const { values } = wizard

  const sellerName = sellers.find(s => s.id === values.sellerId)?.name

  return (
    <WizardDialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next)
        if (!next) setCreated(null)
      }}
      wizard={wizard}
      icon={UserPlus}
      title="Novo lead"
      description="Entra no funil como Novo."
      submitLabel="Criar lead"
      submittingLabel="Criando…"
      renderStep={id =>
        id === 'contato' ? (
          <FieldGrid>
            <TextField {...wizard.field('name')} label="Nome" required autoComplete="off" placeholder="Nome da pessoa ou da empresa" />
            <TextField
              {...wizard.field('email')}
              label="E-mail"
              optional
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="nome@exemplo.com.br"
              span={6}
            />
            <TextField
              {...wizard.field('phone')}
              label="Telefone"
              optional
              type="tel"
              inputMode="tel"
              autoComplete="off"
              mask={maskPhone}
              placeholder="(21) 99999-9999"
              span={6}
            />
          </FieldGrid>
        ) : (
          <FieldGrid>
            <div className="flex flex-col gap-2 sm:col-span-12">
              <TextField
                {...wizard.field('source')}
                label="Origem"
                optional
                autoComplete="off"
                placeholder="Indicação, site…"
                hint="Digite ou escolha uma sugestão abaixo."
              />
              <div role="group" aria-label="Sugestões de origem" className="flex flex-wrap items-center gap-2">
                {SOURCE_SUGGESTIONS.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => wizard.set('source', item)}
                    aria-pressed={values.source === item}
                    className={
                      values.source === item
                        ? 'inline-flex min-h-8 items-center rounded-full border border-secondary bg-accent px-3 text-[13px] font-medium text-secondary outline-none focus-visible:ring-2 focus-visible:ring-secondary/40'
                        : 'inline-flex min-h-8 items-center rounded-full border border-dashed border-[#98A2B3] px-3 text-[13px] text-[#344054] outline-none hover:border-secondary hover:text-secondary focus-visible:ring-2 focus-visible:ring-secondary/40'
                    }
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <TextField
              {...wizard.field('estimatedValue')}
              label="Valor estimado"
              optional
              inputMode="numeric"
              autoComplete="off"
              prefix="R$"
              mask={maskMoney}
              placeholder="0,00"
              span={5}
            />
            <SelectField
              {...wizard.field('sellerId')}
              label="Vendedor responsável"
              optional
              placeholder="Sem vendedor"
              options={sellerOptions(sellers)}
              span={7}
            />
            <TextareaField
              {...wizard.field('notes')}
              label="Observações"
              optional
              rows={3}
              maxLength={1000}
              placeholder="Qualquer informação útil para quem for atender."
            />
          </FieldGrid>
        )
      }
      renderReview={() => (
        <ReviewList>
          <ReviewSection title="Contato" icon={Contact} onEdit={() => wizard.goToStep('contato')}>
            <ReviewItem label="Nome" value={values.name.trim()} />
            <ReviewItem label="E-mail" value={values.email.trim()} />
            <ReviewItem label="Telefone" value={values.phone} />
          </ReviewSection>
          <ReviewSection title="Negócio" icon={Wallet} onEdit={() => wizard.goToStep('negocio')}>
            <ReviewItem label="Origem" value={values.source} />
            <ReviewItem
              label="Valor estimado"
              value={parseMoney(values.estimatedValue) === null ? '' : BRL.format(parseMoney(values.estimatedValue) as number)}
            />
            <ReviewItem label="Vendedor responsável" value={sellerName} empty="Sem vendedor" />
            <ReviewItem label="Observações" value={values.notes} wide />
          </ReviewSection>
        </ReviewList>
      )}
      renderSuccess={() =>
        created ? (
          <WizardSuccess
            title="Lead criado"
            description="Entrou no funil como Novo."
            actions={
              <>
                <Button type="button" variant="outline" className={successButton.secondary} onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={successButton.secondary}
                  onClick={() => {
                    setCreated(null)
                    wizard.reset()
                  }}
                >
                  <Plus aria-hidden="true" />
                  Cadastrar outro
                </Button>
                <Button
                  type="button"
                  className={successButton.primary}
                  onClick={() => {
                    onOpenChange(false)
                    router.push(`/admin/leads/${created.id}`)
                  }}
                >
                  <Target aria-hidden="true" />
                  Abrir lead
                </Button>
              </>
            }
          />
        ) : null
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Converter em venda
// ---------------------------------------------------------------------------

interface SaleValues {
  sellerId: string
  value: string
  planCodigo: string
  planName: string
}

const SALE_FIELDS = ['sellerId', 'value', 'planCodigo', 'planName'] as const

const validateSale = zodFields<SaleValues>(createSaleInput.pick({ sellerId: true, value: true, planCodigo: true, planName: true }), {
  input: v => ({
    sellerId: v.sellerId,
    value: parseMoney(v.value) ?? undefined,
    planCodigo: v.planCodigo || null,
    planName: v.planName || null,
  }),
  messages: {
    sellerId: { required: 'Escolha o vendedor da venda.', invalid: 'Escolha um vendedor da lista.' },
    value: { required: 'Informe o valor da venda.' },
  },
})

export function ConvertToSaleWizard({
  open,
  onOpenChange,
  tenantSlug,
  lead,
  sellers,
  onConverted,
  onRegistered,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  lead: Lead
  sellers: TenantUser[]
  /** "Ir para os leads". */
  onConverted: () => void
  /** Fechar o assistente depois de registrar a venda (a página recarrega o lead). */
  onRegistered?: () => void
}) {
  const [registered, setRegistered] = useState(false)

  const wizard = useWizard<SaleValues>({
    steps: [
      {
        id: 'venda',
        title: 'Venda',
        icon: Trophy,
        fields: ['sellerId', 'value', 'planCodigo', 'planName'],
        validate: validateSale,
      },
    ],
    initialValues: {
      sellerId: lead.sellerId ?? '',
      value: lead.estimatedValue ? moneyInput(lead.estimatedValue) : '',
      planCodigo: '',
      planName: '',
    },
    onSubmit: async values => {
      const result = await createOperatorSaleAction(tenantSlug, {
        leadId: lead.id,
        clientUserId: null,
        clientName: lead.name,
        sellerId: values.sellerId,
        planCodigo: values.planCodigo || null,
        planName: values.planName || null,
        value: parseMoney(values.value) as number,
        status: 'confirmed',
        soldAt: new Date().toISOString(),
        contractUpstreamCodigo: null,
      })
      if (!result.success) {
        return {
          ok: false,
          message: result.error,
          fieldErrors: apiFieldErrors<SaleValues>(result.fieldErrors, SALE_FIELDS),
        }
      }
      setRegistered(true)
      return { ok: true }
    },
  })

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
    if (!next && registered) {
      setRegistered(false)
      onRegistered?.()
    }
  }

  return (
    <WizardDialog
      open={open}
      onOpenChange={handleOpenChange}
      wizard={wizard}
      size="md"
      icon={Trophy}
      title="Converter em venda"
      description={`Registra a venda e fecha o lead ${lead.name}.`}
      submitLabel="Registrar venda"
      submittingLabel="Registrando…"
      renderStep={() => (
        <FieldGrid>
          <SelectField
            {...wizard.field('sellerId')}
            label="Vendedor"
            required
            placeholder="Selecione o vendedor"
            options={sellerOptions(sellers)}
            span={7}
          />
          <TextField
            {...wizard.field('value')}
            label="Valor"
            required
            inputMode="numeric"
            autoComplete="off"
            prefix="R$"
            mask={maskMoney}
            placeholder="0,00"
            span={5}
          />
          <TextField {...wizard.field('planCodigo')} label="Código do plano" optional autoComplete="off" mono span={5} />
          <TextField {...wizard.field('planName')} label="Nome do plano" optional autoComplete="off" span={7} />
          <Notice tone="warning" icon={TriangleAlert}>
            <p>
              Isso não cria o contrato na Digital Saúde. Depois de registrar a venda, use “Nova adesão” para criar o
              contrato.
            </p>
          </Notice>
        </FieldGrid>
      )}
      renderSuccess={() => (
        <WizardSuccess
          title="Venda registrada"
          description={`O lead ${lead.name} foi fechado como venda.`}
          actions={
            <>
              <Button type="button" variant="outline" className={successButton.secondary} onClick={() => handleOpenChange(false)}>
                Fechar
              </Button>
              <Button type="button" className={successButton.primary} onClick={onConverted}>
                Ir para os leads
              </Button>
            </>
          }
        />
      )}
    />
  )
}

// ---------------------------------------------------------------------------
// Registrar interação
// ---------------------------------------------------------------------------

type InteractionType = Interaction['type']

interface InteractionValues {
  type: InteractionType
  description: string
}

const INTERACTION_FIELDS = ['type', 'description'] as const

const validateInteraction = zodFields<InteractionValues>(createInteractionInput.pick({ type: true, description: true }), {
  input: v => ({ type: v.type, description: v.description.trim() }),
  messages: {
    type: 'Escolha o tipo da interação.',
    description: { required: 'Descreva o que aconteceu na interação.' },
  },
})

export function AddInteractionWizard({
  open,
  onOpenChange,
  tenantSlug,
  leadId,
  onAdded,
  labels,
  icons,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  leadId: string
  onAdded: (lead: Lead) => void
  /** Nome de cada tipo (a página já tem este mapa). */
  labels: Record<InteractionType, string>
  icons: Record<InteractionType, LucideIcon>
}) {
  const [added, setAdded] = useState(false)

  const wizard = useWizard<InteractionValues>({
    steps: [
      {
        id: 'interacao',
        title: 'Interação',
        icon: MessageSquare,
        fields: ['type', 'description'],
        validate: validateInteraction,
      },
    ],
    initialValues: { type: 'call', description: '' },
    onSubmit: async values => {
      const result = await addOperatorLeadInteractionAction(tenantSlug, leadId, {
        type: values.type,
        description: values.description.trim(),
        occurredAt: new Date().toISOString(),
      })
      if (!result.success) {
        const fieldErrors: FieldErrors<InteractionValues> = apiFieldErrors<InteractionValues>(result.fieldErrors, INTERACTION_FIELDS)
        return { ok: false, message: result.error ? readableMessage(result.error) : undefined, fieldErrors }
      }
      setAdded(true)
      onAdded(result.data)
      return { ok: true }
    },
  })

  const types = Object.keys(labels) as InteractionType[]

  return (
    <WizardDialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next)
        if (!next) setAdded(false)
      }}
      wizard={wizard}
      size="md"
      icon={MessageSquare}
      title="Registrar interação"
      description="Anote o contato que você teve com o lead."
      submitLabel="Registrar interação"
      submittingLabel="Registrando…"
      renderStep={() => (
        <FieldGrid>
          <ChoiceField
            {...wizard.field('type')}
            onValueChange={value => wizard.set('type', value as InteractionType)}
            label="Tipo"
            columns={3}
            options={types.map(type => ({ value: type, title: labels[type], icon: icons[type] }))}
          />
          <TextareaField
            {...wizard.field('description')}
            label="Descrição"
            required
            rows={4}
            maxLength={1000}
            placeholder="O que foi conversado, combinado ou decidido?"
          />
        </FieldGrid>
      )}
      renderSuccess={() =>
        added ? (
          <WizardSuccess
            title="Interação registrada"
            description="Ela já aparece no histórico do lead."
            actions={
              <>
                <Button type="button" variant="outline" className={successButton.secondary} onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
                <Button
                  type="button"
                  className={successButton.primary}
                  onClick={() => {
                    setAdded(false)
                    wizard.reset()
                  }}
                >
                  <Plus aria-hidden="true" />
                  Registrar outra
                </Button>
              </>
            }
          />
        ) : null
      }
    />
  )
}

