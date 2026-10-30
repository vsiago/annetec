'use client'

import { useMemo } from 'react'
import { Gift, Handshake, MapPin, Plus, UserRound } from 'lucide-react'
import {
  UFS,
  createBenefitInput,
  createPartnerInput,
  formatPhone,
  type Benefit,
  type BenefitCategory,
  type Partner,
  type PartnerCategory,
  type UF,
} from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import {
  ChoiceField,
  FieldGrid,
  ReviewItem,
  ReviewList,
  ReviewSection,
  SelectField,
  TextField,
  TextareaField,
  WizardDialog,
  WizardSuccess,
  combineValidators,
  decimalInput,
  maskDecimal,
  maskPhone,
  parseDecimal,
  successButton,
  useWizard,
  zodFields,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import {
  createOperatorBenefitAction,
  createOperatorPartnerAction,
  updateOperatorBenefitAction,
  updateOperatorPartnerAction,
} from '@/lib/actions/operator-network-api'

/**
 * "Novo parceiro" / "Editar parceiro" e "Novo benefício" / "Editar benefício"
 * da Rede de Parceiros (/admin/parceiros). Mesmas ações e mesmo payload de antes;
 * a validação sai de `createPartnerInput` / `createBenefitInput`.
 */

const PARTNER_CATEGORY_LABEL: Record<PartnerCategory, string> = {
  health: 'Saúde',
  dental: 'Odonto',
  pharmacy: 'Farmácia',
  wellness: 'Bem-estar',
  food: 'Alimentação',
  education: 'Educação',
  other: 'Outro',
}

const BENEFIT_CATEGORY_LABEL: Record<BenefitCategory, string> = {
  health: 'Saúde',
  dental: 'Odonto',
  pharmacy: 'Farmácia',
  funeral: 'Funeral',
  discount: 'Desconto',
}

const PARTNER_CATEGORY_OPTIONS = Object.entries(PARTNER_CATEGORY_LABEL).map(([value, title]) => ({ value, title }))
const BENEFIT_CATEGORY_OPTIONS = Object.entries(BENEFIT_CATEGORY_LABEL).map(([value, label]) => ({ value, label }))
const UF_OPTIONS = UFS.map(uf => ({ value: uf, label: uf }))

// ---------------------------------------------------------------------------
// Parceiro
// ---------------------------------------------------------------------------

interface PartnerValues {
  name: string
  category: string
  discountPercent: string
  address: string
  phone: string
  city: string
  state: string
}

const EMPTY_PARTNER: PartnerValues = {
  name: '',
  category: 'health',
  discountPercent: '',
  address: '',
  phone: '',
  city: '',
  state: '',
}

const PARTNER_STEPS: readonly WizardStep<PartnerValues>[] = [
  {
    id: 'parceiro',
    title: 'Parceiro',
    icon: Handshake,
    description: 'Quem é o parceiro e quanto de desconto ele dá aos associados.',
    fields: ['name', 'category', 'discountPercent'],
    validate: zodFields<PartnerValues>(createPartnerInput.pick({ name: true, category: true, discountPercent: true }), {
      input: v => ({ name: v.name.trim(), category: v.category, discountPercent: parseDecimal(v.discountPercent) }),
      messages: {
        name: { required: 'Informe o nome do parceiro.' },
        category: 'Escolha a categoria do parceiro.',
        discountPercent: {
          required: 'Informe o desconto do parceiro, de 0 a 100.',
          invalid: 'O desconto deve estar entre 0% e 100%.',
        },
      },
    }),
  },
  {
    id: 'contato',
    title: 'Contato e local',
    icon: MapPin,
    description: 'Onde encontrar o parceiro. Tudo aqui é opcional.',
    fields: ['address', 'phone', 'city', 'state'],
    validate: zodFields<PartnerValues>(createPartnerInput.pick({ address: true, phone: true, city: true, state: true }), {
      input: v => ({ address: v.address || null, phone: v.phone || null, city: v.city || null, state: v.state || null }),
      messages: { state: 'Escolha um estado da lista.' },
    }),
  },
]

function partnerToValues(partner: Partner | null): PartnerValues {
  if (!partner) return EMPTY_PARTNER
  return {
    name: partner.name,
    category: partner.category,
    discountPercent: decimalInput(partner.discountPercent),
    address: partner.address ?? '',
    // `formatPhone`: só formata o que já tem DDD + número; telefone antigo em outro formato volta como está.
    phone: partner.phone ? formatPhone(partner.phone) : '',
    city: partner.city ?? '',
    state: partner.state ?? '',
  }
}

/** Cria ou edita — `editing` decide qual. Inclui o botão "Novo parceiro". */
export function PartnerWizard({
  open,
  onOpenChange,
  tenantSlug,
  editing,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  editing: Partner | null
  onCreated: () => void
}) {
  const initialValues = useMemo(() => partnerToValues(editing), [editing])

  const wizard = useWizard<PartnerValues>({
    initialValues,
    steps: PARTNER_STEPS,
    startComplete: !!editing,
    onSubmit: async values => {
      // Esta é a visão da equipe Annetec, que cadastra o essencial do parceiro.
      // Vitrine (frase, site, especialidades, início do credenciamento) é do
      // painel do clube — aqui os campos são preservados na edição em vez de
      // zerados, senão salvar daqui apagaria o que o clube escreveu.
      const payload = {
        name: values.name.trim(),
        tagline: editing?.tagline ?? null,
        category: values.category as PartnerCategory,
        discountPercent: parseDecimal(values.discountPercent) ?? 0,
        address: values.address || null,
        phone: values.phone || null,
        email: editing?.email ?? null,
        website: editing?.website ?? null,
        city: values.city || null,
        state: (values.state || null) as UF | null,
        specialties: editing?.specialties ?? [],
        since: editing?.since ?? null,
        status: editing?.status ?? ('active' as const),
      }
      const result = editing
        ? await updateOperatorPartnerAction(tenantSlug, editing.id, payload)
        : await createOperatorPartnerAction(tenantSlug, payload)
      if (!result.success) return { ok: false, message: result.error }
      onCreated()
      return { ok: true }
    },
  })

  const v = wizard.values
  const categoryLabel = PARTNER_CATEGORY_LABEL[v.category as PartnerCategory] ?? v.category

  return (
    <>
      <Button className="h-11 rounded-[10px] px-4 font-semibold" onClick={() => onOpenChange(true)}>
        <Plus aria-hidden="true" /> Novo parceiro
      </Button>
      <WizardDialog
        open={open}
        onOpenChange={onOpenChange}
        wizard={wizard}
        icon={Handshake}
        size="lg"
        title={editing ? 'Editar parceiro' : 'Cadastrar parceiro'}
        description={
          editing ? 'Altere os dados do parceiro e confira antes de salvar.' : 'Preencha os dados do parceiro da rede credenciada.'
        }
        submitLabel={editing ? 'Salvar alterações' : 'Cadastrar parceiro'}
        submittingLabel={editing ? 'Salvando…' : 'Cadastrando…'}
        discardTitle={editing ? 'Descartar as alterações?' : undefined}
        discardDescription={editing ? 'O que você mudou será perdido.' : undefined}
        renderStep={id =>
          id === 'parceiro' ? (
            <FieldGrid>
              <TextField {...wizard.field('name')} label="Nome do parceiro" required span={12} maxLength={120} autoComplete="off" />
              <ChoiceField
                {...wizard.field('category')}
                label="Categoria"
                required
                span={12}
                columns={3}
                options={PARTNER_CATEGORY_OPTIONS}
              />
              <TextField
                {...wizard.field('discountPercent')}
                label="Desconto para associados"
                hint="De 0 a 100."
                required
                span={6}
                inputMode="decimal"
                mask={maskDecimal}
                suffix="%"
                placeholder="10"
              />
            </FieldGrid>
          ) : (
            <FieldGrid>
              <TextField {...wizard.field('address')} label="Endereço" optional span={12} autoComplete="off" />
              <TextField
                {...wizard.field('phone')}
                label="Telefone"
                optional
                span={6}
                type="tel"
                inputMode="tel"
                mask={maskPhone}
                placeholder="(11) 99999-9999"
              />
              <TextField {...wizard.field('city')} label="Cidade" optional span={4} autoComplete="off" />
              <SelectField {...wizard.field('state')} label="UF" optional span={2} options={UF_OPTIONS} placeholder="UF" />
            </FieldGrid>
          )
        }
        renderReview={() => (
          <ReviewList>
            <ReviewSection title="Parceiro" icon={Handshake} onEdit={() => wizard.goToStep('parceiro')}>
              <ReviewItem label="Nome" value={v.name} />
              <ReviewItem label="Categoria" value={categoryLabel} />
              <ReviewItem label="Desconto" value={v.discountPercent ? `${v.discountPercent}%` : ''} />
            </ReviewSection>
            <ReviewSection title="Contato e local" icon={MapPin} onEdit={() => wizard.goToStep('contato')}>
              <ReviewItem label="Endereço" value={v.address} wide />
              <ReviewItem label="Telefone" value={v.phone} />
              <ReviewItem label="Cidade / UF" value={[v.city, v.state].filter(Boolean).join(' / ')} />
            </ReviewSection>
          </ReviewList>
        )}
        renderSuccess={() => (
          <WizardSuccess
            title={editing ? 'Alterações salvas' : 'Parceiro cadastrado'}
            description={
              editing ? `Os dados de ${v.name.trim()} foram atualizados.` : `${v.name.trim()} já faz parte da rede credenciada.`
            }
            actions={
              <>
                <Button variant="outline" className={successButton.secondary} onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
                {editing ? null : (
                  <Button className={successButton.primary} onClick={() => wizard.reset()}>
                    <UserRound aria-hidden="true" /> Cadastrar outro
                  </Button>
                )}
              </>
            }
          />
        )}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Benefício
// ---------------------------------------------------------------------------

interface BenefitValues {
  name: string
  description: string
  category: string
  discountPercent: string
  provider: string
}

const EMPTY_BENEFIT: BenefitValues = { name: '', description: '', category: 'discount', discountPercent: '', provider: '' }

const BENEFIT_STEPS: readonly WizardStep<BenefitValues>[] = [
  {
    id: 'beneficio',
    title: 'Benefício',
    icon: Gift,
    fields: ['name', 'description', 'category', 'discountPercent', 'provider'],
    validate: combineValidators<BenefitValues>(
      zodFields<BenefitValues>(
        createBenefitInput.pick({ name: true, description: true, category: true, discountPercent: true, provider: true }),
        {
          input: v => ({
            name: v.name.trim(),
            description: v.description,
            category: v.category,
            discountPercent: v.discountPercent.trim() === '' ? null : parseDecimal(v.discountPercent),
            provider: v.provider || null,
          }),
          messages: {
            name: { required: 'Informe o nome do benefício.' },
            category: 'Escolha a categoria do benefício.',
            discountPercent: 'O desconto deve estar entre 0% e 100%.',
          },
        },
      ),
      // Regra já existente no formulário antigo: a descrição é obrigatória.
      v => (v.description.trim() === '' ? { description: 'Descreva o benefício para o associado.' } : {}),
    ),
  },
]

function benefitToValues(benefit: Benefit | null): BenefitValues {
  if (!benefit) return EMPTY_BENEFIT
  return {
    name: benefit.name,
    description: benefit.description,
    category: benefit.category,
    discountPercent: decimalInput(benefit.discountPercent),
    provider: benefit.provider ?? '',
  }
}

/** Cria ou edita — `editing` decide qual. Inclui o botão "Novo benefício". */
export function BenefitWizard({
  open,
  onOpenChange,
  tenantSlug,
  editing,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  editing: Benefit | null
  onCreated: () => void
}) {
  const initialValues = useMemo(() => benefitToValues(editing), [editing])

  const wizard = useWizard<BenefitValues>({
    initialValues,
    steps: BENEFIT_STEPS,
    onSubmit: async values => {
      const payload = {
        name: values.name.trim(),
        description: values.description,
        category: values.category as BenefitCategory,
        discountPercent: values.discountPercent.trim() === '' ? null : parseDecimal(values.discountPercent),
        provider: values.provider || null,
        locations: editing?.locations ?? [],
      }
      const result = editing
        ? await updateOperatorBenefitAction(tenantSlug, editing.id, payload)
        : await createOperatorBenefitAction(tenantSlug, payload)
      if (!result.success) return { ok: false, message: result.error }
      onCreated()
      return { ok: true }
    },
  })

  const name = wizard.values.name.trim()

  return (
    <>
      <Button className="h-11 rounded-[10px] px-4 font-semibold" onClick={() => onOpenChange(true)}>
        <Plus aria-hidden="true" /> Novo benefício
      </Button>
      <WizardDialog
        open={open}
        onOpenChange={onOpenChange}
        wizard={wizard}
        icon={Gift}
        size="md"
        title={editing ? 'Editar benefício' : 'Cadastrar benefício'}
        description="Vantagem oferecida aos associados do clube."
        submitLabel={editing ? 'Salvar alterações' : 'Cadastrar benefício'}
        submittingLabel={editing ? 'Salvando…' : 'Cadastrando…'}
        discardTitle={editing ? 'Descartar as alterações?' : undefined}
        discardDescription={editing ? 'O que você mudou será perdido.' : undefined}
        renderStep={() => (
          <FieldGrid>
            <TextField {...wizard.field('name')} label="Nome do benefício" required span={12} maxLength={120} autoComplete="off" />
            <TextareaField
              {...wizard.field('description')}
              label="Descrição"
              hint="O que o associado recebe e como usar."
              required
              span={12}
              rows={3}
            />
            <SelectField
              {...wizard.field('category')}
              label="Categoria"
              required
              span={6}
              options={BENEFIT_CATEGORY_OPTIONS}
              placeholder="Escolha a categoria"
            />
            <TextField
              {...wizard.field('discountPercent')}
              label="Desconto"
              hint="De 0 a 100."
              optional
              span={6}
              inputMode="decimal"
              mask={maskDecimal}
              suffix="%"
            />
            <TextField {...wizard.field('provider')} label="Fornecedor" optional span={12} autoComplete="off" />
          </FieldGrid>
        )}
        renderSuccess={() => (
          <WizardSuccess
            title={editing ? 'Alterações salvas' : 'Benefício cadastrado'}
            description={editing ? `${name} foi atualizado.` : `${name} já aparece para os associados.`}
            actions={
              <>
                <Button variant="outline" className={successButton.secondary} onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
                {editing ? null : (
                  <Button className={successButton.primary} onClick={() => wizard.reset()}>
                    <Gift aria-hidden="true" /> Cadastrar outro
                  </Button>
                )}
              </>
            }
          />
        )}
      />
    </>
  )
}
