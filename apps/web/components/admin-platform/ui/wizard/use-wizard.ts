'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ClipboardCheck, type LucideIcon } from 'lucide-react'
import { isEmptyValue, type FieldErrors, type FieldKey } from './validation'

/**
 * Estado do assistente: valores, etapa atual, validação por etapa, erros que
 * só o servidor sabe e o envio. Não desenha nada — quem desenha é o
 * `WizardDialog`, e os campos recebem `wizard.field('nome')`.
 *
 * Regras de quando o erro aparece:
 *  - enquanto digita: 300 ms depois da última tecla (e some na hora em que
 *    o valor fica certo);
 *  - ao sair do campo: na hora, se a pessoa mexeu nele;
 *  - ao tentar avançar: todos os campos da etapa.
 */

export interface WizardStep<V> {
  /** Identificador da etapa (usado em `renderStep` e `goToStep`). */
  id: string
  /** Nome curto, como aparece na trilha: "Clube", "Contato". */
  title: string
  /** Frase que abre a etapa, abaixo do título. */
  description?: ReactNode
  icon: LucideIcon
  /** Campos da etapa, na ordem da tela — o foco vai para o primeiro inválido. */
  fields: readonly FieldKey<V>[]
  /** Erros por campo. Derive dos schemas de @annetec/contracts com `zodFields`. */
  validate?: (values: V) => FieldErrors<V>
}

export type WizardSubmitResult<V> =
  | { ok: true }
  | {
      ok: false
      /** Mensagem geral, mostrada no topo da etapa do primeiro campo com erro (ou da revisão). */
      message?: string
      /** Erros por campo (use `apiFieldErrors` para traduzir os caminhos da API). */
      fieldErrors?: FieldErrors<V>
    }

export interface UseWizardOptions<V> {
  steps: readonly WizardStep<V>[]
  initialValues: V
  /** Etapa "Revisão" no fim. Padrão: só quando há mais de uma etapa. */
  review?: boolean
  /** Edição de algo que já existe: todas as etapas começam liberadas na trilha. */
  startComplete?: boolean
  onSubmit: (values: V) => Promise<WizardSubmitResult<V>>
  /** Espera para mostrar o erro enquanto a pessoa digita. */
  debounceMs?: number
}

export type WizardStatus = 'editing' | 'submitting' | 'success'
export type StepState = 'current' | 'complete' | 'error' | 'pending'

export interface FieldBinding<T> {
  id: string
  name: string
  value: T
  onValueChange: (value: T) => void
  onBlur: () => void
  /** Mensagem a mostrar agora (já respeitando o tempo de digitação). */
  error?: string
  /** Preenchido e válido — o campo mostra o ✓. */
  valid: boolean
}

export interface WizardStepView {
  id: string
  title: string
  icon: LucideIcon
  description?: ReactNode
  state: StepState
  /** Dá para ir até ela clicando na trilha. */
  selectable: boolean
  isReview: boolean
}

type FocusTarget = 'start' | 'invalid'

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => sameValue(item, b[i]))
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return (
      ka.length === kb.length &&
      ka.every(key => sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
    )
  }
  return false
}

export function useWizard<V extends object>(options: UseWizardOptions<V>) {
  const { steps, debounceMs = 300 } = options
  const hasReview = options.review ?? steps.length > 1
  const reviewIndex = hasReview ? steps.length : -1
  const lastIndex = hasReview ? steps.length : steps.length - 1
  const prefix = `assistente-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  const optionsRef = useRef(options)
  optionsRef.current = options

  const [values, setValues] = useState<V>(options.initialValues)
  const [baseline, setBaseline] = useState<V>(options.initialValues)
  const [index, setIndex] = useState(0)
  const [furthest, setFurthest] = useState(options.startComplete ? lastIndex : 0)
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set())
  const [attempted, setAttempted] = useState<ReadonlySet<number>>(() => new Set())
  const [external, setExternal] = useState<FieldErrors<V>>({})
  const [alert, setAlert] = useState<{ step: number; message: string } | null>(null)
  const [status, setStatus] = useState<WizardStatus>('editing')
  const [focusRequest, setFocusRequest] = useState<{ token: number; target: FocusTarget }>({ token: 0, target: 'start' })
  const [announcement, setAnnouncement] = useState('')
  const timers = useRef(new Map<string, number>())
  const submittingRef = useRef(false)

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(timer => window.clearTimeout(timer))
      pending.clear()
    }
  }, [])

  const stepOfField = useMemo(() => {
    const map = new Map<string, number>()
    steps.forEach((step, i) => step.fields.forEach(field => map.set(field, i)))
    return map
  }, [steps])

  const localErrors = useMemo(() => {
    const all: FieldErrors<V> = {}
    for (const step of steps) {
      const result: FieldErrors<V> = step.validate?.(values) ?? {}
      for (const key of Object.keys(result) as FieldKey<V>[]) {
        if (!all[key] && result[key]) all[key] = result[key]
      }
    }
    return all
  }, [steps, values])

  const errors = useMemo<FieldErrors<V>>(() => {
    const merged: FieldErrors<V> = { ...localErrors }
    for (const key of Object.keys(external) as FieldKey<V>[]) {
      if (external[key]) merged[key] = external[key]
    }
    return merged
  }, [localErrors, external])

  const invalidFields = useCallback(
    (stepIndex: number): FieldKey<V>[] => (steps[stepIndex]?.fields ?? []).filter(field => !!errors[field]),
    [steps, errors],
  )

  const dirty = useMemo(
    () =>
      (Object.keys(values) as FieldKey<V>[]).some(
        key => !sameValue((values as Record<string, unknown>)[key], (baseline as Record<string, unknown>)[key]),
      ),
    [values, baseline],
  )

  const totalSteps = steps.length + (hasReview ? 1 : 0)
  const titleOf = (i: number) => (i === reviewIndex ? 'Revisão' : steps[i]?.title ?? '')

  // Tudo o que os comandos (estáveis) precisam ler do render atual.
  const latest = useRef({ index, furthest, errors, values, status, invalidFields, totalSteps, titleOf })
  latest.current = { index, furthest, errors, values, status, invalidFields, totalSteps, titleOf }

  const reveal = useCallback((keys: Iterable<string>) => {
    setRevealed(current => {
      let changed = false
      const next = new Set(current)
      for (const key of keys) {
        if (!next.has(key)) {
          next.add(key)
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [])

  const requestFocus = useCallback((target: FocusTarget) => {
    setFocusRequest(current => ({ token: current.token + 1, target }))
  }, [])

  const set = useCallback(
    <K extends FieldKey<V>>(key: K, value: V[K]) => {
      setValues(current => (Object.is(current[key], value) ? current : { ...current, [key]: value }))
      setExternal(current => {
        if (!(key in current)) return current
        const next = { ...current }
        delete next[key]
        return next
      })
      const pending = timers.current.get(key)
      if (pending) window.clearTimeout(pending)
      timers.current.set(
        key,
        window.setTimeout(() => {
          timers.current.delete(key)
          reveal([key])
        }, optionsRef.current.debounceMs ?? 300),
      )
    },
    [reveal],
  )

  /** Vários campos de uma vez (ex.: preenchimento pela Receita). `reveal` mostra o ✓/erro na hora. */
  const setMany = useCallback(
    (patch: Partial<V>, opts: { reveal?: boolean } = {}) => {
      const keys = Object.keys(patch)
      if (keys.length === 0) return
      setValues(current => ({ ...current, ...patch }))
      setExternal(current => {
        if (!keys.some(key => key in current)) return current
        const next = { ...current }
        for (const key of keys) delete next[key as FieldKey<V>]
        return next
      })
      if (opts.reveal) reveal(keys)
    },
    [reveal],
  )

  const blur = useCallback(
    (key: FieldKey<V>) => {
      const pending = timers.current.get(key)
      if (pending) {
        window.clearTimeout(pending)
        timers.current.delete(key)
      }
      // Passar pelo campo sem mexer não acusa erro; quem digitou (ou já tinha valor) vê na hora.
      const { values: current } = latest.current
      const value = (current as Record<string, unknown>)[key]
      const changed = !sameValue(value, (baseline as Record<string, unknown>)[key])
      if (changed || !isEmptyValue(value)) reveal([key])
    },
    [baseline, reveal],
  )

  const setExternalError = useCallback((key: FieldKey<V>, message: string | null) => {
    setExternal(current => {
      if (!message) {
        if (!(key in current)) return current
        const next = { ...current }
        delete next[key]
        return next
      }
      return current[key] === message ? current : { ...current, [key]: message }
    })
    if (message) reveal([key])
  }, [reveal])

  const move = useCallback(
    (target: number) => {
      setIndex(target)
      setFurthest(current => Math.max(current, target))
      requestFocus('start')
      const { totalSteps: total, titleOf: title } = latest.current
      setAnnouncement(`Etapa ${target + 1} de ${total}: ${title(target)}`)
    },
    [requestFocus],
  )

  const fail = useCallback(
    (stepIndex: number) => {
      const { invalidFields: invalid, titleOf: title } = latest.current
      const fields = invalid(stepIndex)
      setIndex(stepIndex)
      setAttempted(current => (current.has(stepIndex) ? current : new Set(current).add(stepIndex)))
      reveal(fields)
      requestFocus('invalid')
      const count = fields.length
      setAnnouncement(
        `${count === 1 ? 'Falta corrigir 1 campo' : `Faltam corrigir ${count} campos`} na etapa ${title(stepIndex)}.`,
      )
    },
    [reveal, requestFocus],
  )

  const submit = useCallback(async () => {
    const state = latest.current
    // `status` só muda no próximo render: a ref barra um 2º envio no mesmo instante.
    if (state.status !== 'editing' || submittingRef.current) return
    const firstInvalid = optionsRef.current.steps.findIndex((_, i) => state.invalidFields(i).length > 0)
    if (firstInvalid >= 0) {
      fail(firstInvalid)
      return
    }

    submittingRef.current = true
    setStatus('submitting')
    setAlert(null)
    let result: WizardSubmitResult<V>
    try {
      result = await optionsRef.current.onSubmit(state.values)
    } catch {
      result = { ok: false, message: 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.' }
    } finally {
      submittingRef.current = false
    }

    if (result.ok) {
      setStatus('success')
      return
    }

    setStatus('editing')
    const fieldErrors: FieldErrors<V> = {}
    for (const key of Object.keys(result.fieldErrors ?? {}) as FieldKey<V>[]) {
      const message = result.fieldErrors?.[key]
      if (message) fieldErrors[key] = message
    }
    const keys = Object.keys(fieldErrors) as FieldKey<V>[]
    if (keys.length > 0) {
      setExternal(current => ({ ...current, ...fieldErrors }))
      reveal(keys)
      const target = optionsRef.current.steps.findIndex(step => step.fields.some(field => fieldErrors[field]))
      if (target >= 0) {
        setIndex(target)
        setAttempted(current => new Set(current).add(target))
        setAlert({ step: target, message: result.message ?? 'Confira o campo destacado e tente de novo.' })
        requestFocus('invalid')
        return
      }
    }
    setAlert({ step: state.index, message: result.message ?? 'Não foi possível concluir. Tente de novo.' })
  }, [fail, reveal, requestFocus])

  const next = useCallback(() => {
    const state = latest.current
    if (state.status !== 'editing') return
    const review = optionsRef.current.review ?? optionsRef.current.steps.length > 1
    const last = review ? optionsRef.current.steps.length : optionsRef.current.steps.length - 1
    if (state.index >= last) {
      void submit()
      return
    }
    if (state.invalidFields(state.index).length > 0) {
      fail(state.index)
      return
    }
    move(state.index + 1)
  }, [fail, move, submit])

  const back = useCallback(() => {
    const state = latest.current
    if (state.status !== 'editing' || state.index === 0) return
    move(state.index - 1)
  }, [move])

  const goTo = useCallback(
    (target: number) => {
      const state = latest.current
      if (state.status !== 'editing' || target === state.index || target < 0) return
      if (target < state.index) {
        move(target)
        return
      }
      if (target > state.furthest) return
      for (let i = state.index; i < target; i++) {
        if (state.invalidFields(i).length > 0) {
          fail(i)
          return
        }
      }
      move(target)
    },
    [fail, move],
  )

  const goToStep = useCallback(
    (id: string) => {
      const target = optionsRef.current.steps.findIndex(step => step.id === id)
      if (target >= 0) goTo(target)
    },
    [goTo],
  )

  const reset = useCallback(
    (nextValues?: V) => {
      timers.current.forEach(timer => window.clearTimeout(timer))
      timers.current.clear()
      const initial = nextValues ?? optionsRef.current.initialValues
      const review = optionsRef.current.review ?? optionsRef.current.steps.length > 1
      setValues(initial)
      setBaseline(initial)
      setIndex(0)
      setFurthest(optionsRef.current.startComplete ? optionsRef.current.steps.length - (review ? 0 : 1) : 0)
      setRevealed(new Set())
      setAttempted(new Set())
      setExternal({})
      setAlert(null)
      setStatus('editing')
      setAnnouncement('')
      requestFocus('start')
    },
    [requestFocus],
  )

  const fieldId = useCallback((key: string) => `${prefix}-${key}`, [prefix])

  const isShown = (key: FieldKey<V>) => {
    if (revealed.has(key) || key in external) return true
    const stepIndex = stepOfField.get(key)
    return stepIndex !== undefined && attempted.has(stepIndex)
  }

  function field<K extends FieldKey<V>>(key: K): FieldBinding<V[K]> {
    const shown = isShown(key)
    const error = errors[key]
    return {
      id: fieldId(key),
      name: key,
      value: values[key],
      onValueChange: value => set(key, value),
      onBlur: () => blur(key),
      error: shown ? error : undefined,
      valid: shown && !error && !isEmptyValue(values[key]),
    }
  }

  const stepState = (i: number): StepState => {
    const invalid = i === reviewIndex ? false : invalidFields(i).length > 0
    if (i === index) return attempted.has(i) && invalid ? 'error' : 'current'
    if (status === 'success') return 'complete'
    if (i === reviewIndex) return 'pending'
    if (invalid) return attempted.has(i) || i < furthest ? 'error' : 'pending'
    return i <= furthest ? 'complete' : 'pending'
  }

  const stepViews: WizardStepView[] = [
    ...steps.map((step, i) => ({
      id: step.id,
      title: step.title,
      icon: step.icon,
      description: step.description,
      state: stepState(i),
      selectable: status === 'editing' && i !== index && i <= furthest,
      isReview: false,
    })),
  ]
  if (hasReview) {
    stepViews.push({
      id: '__revisao',
      title: 'Revisão',
      icon: ClipboardCheck,
      state: stepState(reviewIndex),
      selectable: status === 'editing' && reviewIndex !== index && reviewIndex <= furthest,
      isReview: true,
    })
  }

  return {
    /** Valores atuais do formulário. */
    values,
    set,
    setMany,
    field,
    fieldId,
    /** Erros de todos os campos (mostrados ou não). */
    errors,
    setExternalError,
    steps: stepViews,
    stepIndex: index,
    currentStep: index === reviewIndex ? null : steps[index] ?? null,
    isReview: index === reviewIndex,
    hasReview,
    isLastDataStep: index === steps.length - 1,
    /** Campos com erro na etapa atual, depois de a pessoa tentar avançar. */
    pendingErrors: attempted.has(index) ? invalidFields(index).length : 0,
    alert: alert && alert.step === index ? alert.message : null,
    status,
    dirty,
    announcement,
    focusRequest,
    next,
    back,
    goTo,
    goToStep,
    submit,
    reset,
  }
}

export type Wizard<V extends object> = ReturnType<typeof useWizard<V>>
