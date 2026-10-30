'use client'

import { useEffect, useState } from 'react'
import { onboardingPlanInput } from '@annetec/contracts'
import { saveOnboardingPlanAction } from '@/lib/actions/contratacao-api'
import { orphanErrors, validate, type FieldErrors } from '@/lib/adapters/contratacao'
import { safeAction, usePlatformOffers } from '../hooks'
import { PlanPicker, recommendedPlanId } from '../plan-picker'
import { ApprovalFirstBadge } from '../quote-summary'
import { StepFooter } from '../step-footer'
import { ActionError, StepHeading } from '../ui'
import type { StepContext } from './types'

export function PlanStep({ ctx }: { ctx: StepContext }) {
  const { view, proposalId, chave, onSaved, goBack } = ctx
  const { offers, error: offersError, loading, reload } = usePlatformOffers()
  const [lives, setLives] = useState(view.plan.expectedLives || 500)
  const [planId, setPlanId] = useState<string | null>(view.plan.planId)
  const [touched, setTouched] = useState(Boolean(view.plan.planId))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (touched) return
    const recommended = recommendedPlanId(offers, lives)
    if (recommended && recommended !== planId) setPlanId(recommended)
  }, [offers, lives, touched, planId])

  const unchanged = planId === view.plan.planId && lives === view.plan.expectedLives

  async function save() {
    setError(null)
    const parsed = validate(onboardingPlanInput, { planId, expectedLives: lives })
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    if (unchanged) {
      ctx.goNext()
      return
    }
    setBusy(true)
    const result = await safeAction(() => saveOnboardingPlanAction(proposalId, chave, parsed.data))
    setBusy(false)
    if (!result.success) {
      setError(result.error)
      setErrors(result.fieldErrors ?? {})
      return
    }
    onSaved(result.data, { advance: true, message: 'Plano salvo' })
  }

  return (
    <div className="space-y-6">
      <StepHeading
        id="wizard-step-plan"
        eyebrow="Plano"
        title="Plano e número de vidas"
        description="Ajuste a simulação se precisar. A mensalidade inclui até o limite de vidas do plano; acima dele, cada vida ativa é cobrada pelo valor unitário do plano."
      />
      <PlanPicker
        offers={offers}
        loading={loading}
        error={offersError}
        onRetry={() => void reload()}
        lives={lives}
        onLivesChange={value => {
          setLives(value)
          setErrors(current => ({ ...current, expectedLives: '' }))
        }}
        planId={planId}
        onPlanChange={id => {
          setPlanId(id)
          setTouched(true)
        }}
        errors={{ planId: errors.planId || undefined, expectedLives: errors.expectedLives || undefined }}
        // Proposta do vendedor ANNETEC: o plano dele pode não estar na vitrine, e o desconto aprovado já vale.
        proposalOffer={view.plan.offer}
        discount={view.plan.discount}
      />
      <ApprovalFirstBadge />
      <ActionError message={error} details={orphanErrors(errors, ['planId', 'expectedLives'])} />
      <StepFooter onBack={goBack} onPrimary={() => void save()} busy={busy} primaryLabel={unchanged ? 'Continuar' : 'Salvar e continuar'} />
    </div>
  )
}
