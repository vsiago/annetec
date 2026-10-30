'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertCircle, ArrowLeft, ArrowRight, Check, ClipboardCheck, Loader2, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/admin-platform/ui/button'
import { cn } from '@/lib/utils'
import type { Wizard } from './use-wizard'
import { WizardStepper } from './wizard-stepper'

/**
 * Moldura do assistente: modal largo (840 px, altura fixa — não "pula" entre
 * etapas; o conteúdo rola por dentro), tela cheia no celular, cabeçalho com
 * ícone, trilha de etapas, rodapé fixo e a tela de sucesso.
 *
 * Fechar (X, Esc, clique fora, "Cancelar") com algo preenchido pede
 * confirmação. Durante o envio nada fecha. Ver a documentação completa em
 * `./index.ts`.
 */

export interface WizardDialogProps<V extends object> {
  open: boolean
  onOpenChange: (open: boolean) => void
  wizard: Wizard<V>
  icon: LucideIcon
  title: string
  description?: ReactNode
  /** Botão final: verbo + objeto ("Cadastrar clube", "Criar plano"). */
  submitLabel: string
  /** Texto do botão durante o envio ("Cadastrando…"). */
  submittingLabel?: string
  /** Conteúdo de cada etapa, pelo `id`. */
  renderStep: (stepId: string) => ReactNode
  /** Conteúdo da etapa de revisão (use `ReviewSection`/`ReviewItem`). */
  renderReview?: () => ReactNode
  /** Tela de sucesso (use `WizardSuccess`). Sem ela, o modal fecha ao concluir. */
  renderSuccess?: () => ReactNode
  /** `lg` (padrão): várias etapas, altura fixa. `md`: formulário curto de uma etapa. */
  size?: 'lg' | 'md'
  /** Na tela de sucesso, Esc e clique fora não fecham (ex.: senha que só aparece agora). */
  lockSuccess?: boolean
  /** Ao abrir, recomeça do zero (padrão). */
  resetOnOpen?: boolean
  discardTitle?: string
  discardDescription?: string
  /** Rótulo do primeiro botão do rodapé na primeira etapa. */
  cancelLabel?: string
}

const ESCAPE_HINT = 'Esc'

export function WizardDialog<V extends object>({
  open,
  onOpenChange,
  wizard,
  icon: Icon,
  title,
  description,
  submitLabel,
  submittingLabel = 'Salvando…',
  renderStep,
  renderReview,
  renderSuccess,
  size = 'lg',
  lockSuccess = false,
  resetOnOpen = true,
  discardTitle = 'Descartar o cadastro?',
  discardDescription = 'O que você preencheu será perdido.',
  cancelLabel = 'Cancelar',
}: WizardDialogProps<V>) {
  const [confirming, setConfirming] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const confirmId = useId()
  const descriptionId = useId()

  const { status, stepIndex, isReview, hasReview, isLastDataStep, focusRequest } = wizard
  const multi = wizard.steps.length > 1
  const submitting = status === 'submitting'
  const success = status === 'success'

  // Ao abrir: recomeça do zero (o foco vai para o 1º campo pelo pedido de foco do reset).
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      setConfirming(false)
      if (resetOnOpen) wizard.reset()
    }
    wasOpen.current = open
    // `wizard.reset` é estável.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resetOnOpen])

  // Sem tela de sucesso, concluir fecha o modal.
  useEffect(() => {
    if (success && !renderSuccess && open) onOpenChange(false)
  }, [success, renderSuccess, open, onOpenChange])

  // Foco: 1º campo da etapa ao entrar; 1º campo inválido ao tentar avançar com erro.
  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      const body = bodyRef.current
      if (!body) return
      if (focusRequest.target === 'invalid') {
        const fields = wizard.currentStep?.fields ?? []
        const key = fields.find(field => wizard.errors[field])
        const element = key ? document.getElementById(wizard.fieldId(key)) : null
        if (element) {
          element.focus({ preventScroll: true })
          element.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
          return
        }
      }
      body.scrollTop = 0
      if (wizard.isReview) {
        headingRef.current?.focus()
        return
      }
      const first = body.querySelector<HTMLElement>(
        '[data-autofocus], input:not([type=hidden]):not([type=radio]):not(:disabled), input[type=radio]:checked, select:not(:disabled), textarea:not(:disabled), [role=switch]:not(:disabled)',
      )
      if (first) first.focus({ preventScroll: true })
      else headingRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
    // Só reage a um novo pedido de foco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest.token, open])

  const close = () => {
    setConfirming(false)
    onOpenChange(false)
  }

  const requestClose = (source: 'dismiss' | 'button') => {
    if (submitting) return
    if (success) {
      if (lockSuccess && source === 'dismiss') return
      close()
      return
    }
    if (wizard.dirty) {
      restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setConfirming(true)
      return
    }
    close()
  }

  const cancelDiscard = () => {
    setConfirming(false)
    window.requestAnimationFrame(() => restoreFocus.current?.focus())
  }

  const onFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      wizard.next()
    }
  }

  const isFinal = isReview || (!hasReview && stepIndex === wizard.steps.length - 1)
  const primaryLabel = isFinal ? (submitting ? submittingLabel : submitLabel) : hasReview && isLastDataStep ? 'Revisar' : 'Continuar'
  const current = wizard.steps[stepIndex]

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={next => {
        if (!next) requestClose('dismiss')
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[110] bg-[#0B1220]/55 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={description ? descriptionId : undefined}
          onOpenAutoFocus={event => event.preventDefault()}
          onEscapeKeyDown={event => {
            if (confirming) {
              event.preventDefault()
              cancelDiscard()
            }
          }}
          onPointerDownOutside={event => {
            if (confirming || submitting) event.preventDefault()
          }}
          className={cn(
            'fixed inset-0 z-[110] flex flex-col overflow-hidden bg-white outline-none',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100vw-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-border sm:shadow-[0_24px_64px_-16px_rgba(16,29,54,0.35)]',
            size === 'lg'
              ? 'sm:h-[min(800px,calc(100dvh-48px))] sm:max-w-[860px]'
              : 'sm:max-h-[calc(100dvh-48px)] sm:max-w-[640px]',
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col" inert={confirming || undefined}>
            {/* Cabeçalho */}
            <header className="flex shrink-0 items-start gap-3.5 border-b border-border px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:gap-4 sm:px-7 sm:pt-5">
              <span
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-secondary ring-1 ring-inset ring-secondary/10"
                aria-hidden="true"
              >
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <DialogPrimitive.Title className="m-0 text-lg font-bold leading-snug text-foreground">{title}</DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description id={descriptionId} className="m-0 mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                    {description}
                  </DialogPrimitive.Description>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => requestClose('button')}
                disabled={submitting}
                aria-label="Fechar"
                aria-keyshortcuts="Escape"
                title={`Fechar (${ESCAPE_HINT})`}
                className="-mr-1.5 grid size-10 shrink-0 place-items-center rounded-[10px] text-[#667085] outline-none transition-colors hover:bg-[#F2F4F7] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-secondary/30 disabled:opacity-50"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </header>

            {multi && !success ? (
              <div className="shrink-0 border-b border-border bg-[#FCFCFD] px-5 py-3 sm:px-7 sm:py-4">
                <WizardStepper steps={wizard.steps} current={stepIndex} onSelect={wizard.goTo} />
              </div>
            ) : null}

            {success ? (
              renderSuccess?.()
            ) : (
              <form
                noValidate
                onSubmit={event => {
                  event.preventDefault()
                  wizard.next()
                }}
                onKeyDown={onFormKeyDown}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">
                  {multi ? (
                    <div className="mb-6 flex items-start gap-3">
                      <span
                        className="hidden size-9 shrink-0 place-items-center rounded-lg bg-[#FDECEF] text-[#C2304D] sm:grid"
                        aria-hidden="true"
                      >
                        {isReview ? <ClipboardCheck className="size-[18px]" /> : current ? <current.icon className="size-[18px]" /> : null}
                      </span>
                      <div className="min-w-0">
                        <p className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                          Etapa {stepIndex + 1} de {wizard.steps.length}
                        </p>
                        <h3 ref={headingRef} tabIndex={-1} className="m-0 mt-0.5 text-[17px] font-semibold text-foreground outline-none">
                          {isReview ? 'Revise antes de concluir' : current?.title}
                        </h3>
                        {isReview ? (
                          <p className="m-0 mt-1 text-[13px] leading-relaxed text-muted-foreground">
                            Confira os dados. Para mudar alguma coisa, use “Editar” no bloco correspondente.
                          </p>
                        ) : wizard.currentStep?.description ? (
                          <p className="m-0 mt-1 text-[13px] leading-relaxed text-muted-foreground">{wizard.currentStep.description}</p>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <h3 ref={headingRef} tabIndex={-1} className="sr-only">
                      {title}
                    </h3>
                  )}

                  {wizard.alert ? (
                    <div
                      role="alert"
                      className="mb-5 flex items-start gap-3 rounded-xl border border-[#FDA29B] bg-[#FEF3F2] p-3.5 text-sm text-[#B42318]"
                    >
                      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span className="leading-relaxed">{wizard.alert}</span>
                    </div>
                  ) : wizard.pendingErrors > 0 ? (
                    <div
                      role="alert"
                      className="mb-5 flex items-start gap-3 rounded-xl border border-[#FDA29B] bg-[#FEF3F2] p-3.5 text-sm text-[#B42318]"
                    >
                      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span className="leading-relaxed">
                        {wizard.pendingErrors === 1
                          ? 'Falta corrigir 1 campo para continuar. Ele está destacado abaixo.'
                          : `Faltam corrigir ${wizard.pendingErrors} campos para continuar. Eles estão destacados abaixo.`}
                      </span>
                    </div>
                  ) : null}

                  <fieldset disabled={submitting} className="m-0 min-w-0 border-0 p-0">
                    <legend className="sr-only">{isReview ? 'Revisão' : current?.title ?? title}</legend>
                    {isReview ? renderReview?.() : current ? renderStep(current.id) : null}
                  </fieldset>
                </div>

                {/* Rodapé fixo */}
                <footer className="flex shrink-0 items-center gap-3 border-t border-border bg-[#F9FAFB] px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5 sm:px-7">
                  {stepIndex === 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => requestClose('button')}
                      disabled={submitting}
                      className="h-11 flex-1 rounded-[10px] border-[#D0D5DD] px-4 text-sm font-semibold text-[#344054] sm:flex-none"
                    >
                      {cancelLabel}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={wizard.back}
                      disabled={submitting}
                      className="h-11 flex-1 rounded-[10px] border-[#D0D5DD] px-4 text-sm font-semibold text-[#344054] sm:flex-none"
                    >
                      <ArrowLeft aria-hidden="true" />
                      Voltar
                    </Button>
                  )}
                  <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground md:flex" aria-hidden="true">
                    <kbd className="rounded-md border border-border bg-white px-1.5 py-0.5 font-sans text-[11px] font-semibold text-[#344054] shadow-[0_1px_0_#D0D5DD]">
                      Enter
                    </kbd>
                    {isFinal ? 'para concluir' : 'para continuar'}
                  </span>
                  <Button
                    type="submit"
                    disabled={submitting}
                    aria-keyshortcuts="Enter Control+Enter Meta+Enter"
                    className="h-11 flex-[2] rounded-[10px] px-5 text-sm font-semibold sm:flex-none md:ml-0"
                  >
                    {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                    {primaryLabel}
                    {!submitting && !isFinal ? <ArrowRight aria-hidden="true" /> : null}
                    {!submitting && isFinal ? <Check aria-hidden="true" /> : null}
                  </Button>
                </footer>
              </form>
            )}
          </div>

          <div aria-live="polite" className="sr-only">
            {wizard.announcement}
          </div>

          {confirming ? (
            <div className="absolute inset-0 z-10 flex items-end justify-center bg-[#0B1220]/45 p-4 sm:items-center">
              <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={`${confirmId}-titulo`}
                aria-describedby={`${confirmId}-texto`}
                className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none"
              >
                <span className="grid size-10 place-items-center rounded-full bg-[#FFFAEB] text-[#B54708]" aria-hidden="true">
                  <TriangleAlert className="size-5" />
                </span>
                <h3 id={`${confirmId}-titulo`} className="m-0 mt-4 text-base font-semibold text-foreground">
                  {discardTitle}
                </h3>
                <p id={`${confirmId}-texto`} className="m-0 mt-1 text-sm leading-relaxed text-muted-foreground">
                  {discardDescription}
                </p>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    autoFocus
                    onClick={cancelDiscard}
                    className="h-11 rounded-[10px] border-[#D0D5DD] px-4 font-semibold text-[#344054]"
                  >
                    Continuar preenchendo
                  </Button>
                  <Button type="button" variant="destructive" onClick={close} className="h-11 rounded-[10px] px-4 font-semibold">
                    Descartar
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
