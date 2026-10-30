'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CircleCheckBig,
  Copy,
  Gift,
  Handshake,
  Landmark,
  Link2,
  Package,
  Rocket,
  UserCog,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { copyToClipboard, useActionData } from '@/components/admin/faturamento/use-action-data'
import { useTenantData } from '@/contexts/tenant-data-context'
import { getBillingSettingsAction } from '@/lib/actions/faturamento-api'
import { listOperatorBenefitsAction, listOperatorPartnersAction } from '@/lib/actions/operator-network-api'
import { listClubPlansAction } from '@/lib/actions/planos-api'
import { RECEIVING_ACCOUNT_CHANGED_EVENT } from '@/lib/receiving-account-events'
import { cn } from '@/lib/utils'

interface Step {
  key: string
  title: string
  description: string
  icon: LucideIcon
  /** `null` = não deu para verificar agora (não conta como feito nem como pendente). */
  done: boolean | null
  href?: string
  cta?: string
}

const sharedKey = (slug: string) => `annetec_admin_site_shared_${slug}`

/**
 * "Deixe o clube pronto para vender": checklist calculada com os dados reais
 * do clube (conta de recebimento, planos, benefícios, rede, equipe). Some
 * sozinha quando tudo está feito. Cada passo leva direto à tela que resolve.
 */
export function GettingStarted({ slug, base }: { slug: string; base: string }) {
  const { users } = useTenantData()

  const settings = useActionData(slug ? () => getBillingSettingsAction(slug) : null, [slug])
  const plans = useActionData(slug ? () => listClubPlansAction(slug) : null, [slug])
  const benefits = useActionData(slug ? () => listOperatorBenefitsAction(slug) : null, [slug])
  const partners = useActionData(slug ? () => listOperatorPartnersAction(slug) : null, [slug])

  const [shared, setShared] = useState(false)

  useEffect(() => {
    try {
      setShared(window.localStorage.getItem(sharedKey(slug)) === 'true')
    } catch {
      // Sem armazenamento: o passo só vale até recarregar.
    }
  }, [slug])

  const reloadSettings = settings.reload
  useEffect(() => {
    const onChanged = () => void reloadSettings({ silent: true })
    window.addEventListener(RECEIVING_ACCOUNT_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(RECEIVING_ACCOUNT_CHANGED_EVENT, onChanged)
  }, [reloadSettings])

  const copyLink = useCallback(
    async (path: string, label: string) => {
      const url = `${window.location.origin}${path}`
      const ok = await copyToClipboard(url)
      if (!ok) {
        toast.error('Não foi possível copiar', { description: url })
        return
      }
      toast.success(`${label} copiado`, { description: url })
      setShared(true)
      try {
        window.localStorage.setItem(sharedKey(slug), 'true')
      } catch {
        // Sem armazenamento: segue valendo na tela.
      }
    },
    [slug],
  )

  const steps = useMemo<Step[]>(() => {
    const doneOf = <T,>(data: T | null, error: string | null, check: (value: T) => boolean): boolean | null =>
      data ? check(data) : error ? null : null

    const sellers = users.filter(
      user => user.role === 'seller' && (user.accessStatus ?? (user.active === false ? 'removed' : 'active')) === 'active',
    ).length
    const admins = users.filter(
      user => user.role === 'admin' && (user.accessStatus ?? (user.active === false ? 'removed' : 'active')) === 'active',
    ).length

    return [
      {
        key: 'receiving',
        title: 'Conectar a conta de recebimento',
        description: 'Sem a conta Asaas do clube, ninguém consegue assinar nem pagar.',
        icon: Landmark,
        // Só o gateway Asaas pede conta própria.
        done: doneOf(settings.data, settings.error, value => value.gateway !== 'asaas' || value.asaasConfigured),
        href: `${base}/faturamento?tab=recebimento`,
        cta: 'Conectar conta',
      },
      {
        key: 'plans',
        title: 'Ter ao menos 1 plano ativo',
        description: 'O plano é o que o associado contrata no site.',
        icon: Package,
        done: doneOf(plans.data, plans.error, value => value.some(plan => plan.status === 'active')),
        href: `${base}/planos`,
        cta: 'Criar plano',
      },
      {
        key: 'benefits',
        title: 'Cadastrar os benefícios',
        description: 'O que o associado ganha: descontos, assistências e vantagens.',
        icon: Gift,
        done: doneOf(benefits.data, benefits.error, value => value.length > 0),
        href: `${base}/beneficios`,
        cta: 'Cadastrar benefícios',
      },
      {
        key: 'network',
        title: 'Cadastrar a rede credenciada',
        description: 'Clínicas, farmácias e parceiros onde o associado usa o clube.',
        icon: Handshake,
        done: doneOf(partners.data, partners.error, value => value.length > 0),
        href: `${base}/parceiros`,
        cta: 'Cadastrar rede',
      },
      {
        key: 'team',
        title: 'Convidar a equipe e os vendedores',
        description: 'Quem vende ou ajuda a administrar recebe o próprio acesso.',
        icon: UserCog,
        done: sellers > 0 || admins > 1,
        href: `${base}/usuarios?novo=vendedor`,
        cta: 'Convidar pessoa',
      },
      {
        key: 'share',
        title: 'Divulgar o site do clube',
        description: 'Copie o endereço e envie para quem pode se associar.',
        icon: Link2,
        done: shared,
      },
    ]
  }, [base, benefits.data, benefits.error, partners.data, partners.error, plans.data, plans.error, settings.data, settings.error, shared, users])

  const loading = [settings, plans, benefits, partners].some(item => item.loading && !item.data && !item.error)
  if (!slug || loading) return null

  const countable = steps.filter(step => step.done !== null)
  const doneCount = countable.filter(step => step.done).length
  const allDone = steps.every(step => step.done === true)
  if (allDone) return null

  const percent = Math.round((doneCount / Math.max(countable.length, 1)) * 100)

  return (
    <Card className="border-primary/20 bg-primary/5 py-0 shadow-sm" aria-labelledby="primeiros-passos">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Rocket className="h-5 w-5" />
            </span>
            <div className="space-y-0.5">
              <h2 id="primeiros-passos" className="text-lg font-bold tracking-tight text-foreground">
                Deixe o clube pronto para vender
              </h2>
              <p className="text-sm text-muted-foreground">
                {doneCount} de {countable.length} passos concluídos. Cada passo leva direto à tela que resolve.
              </p>
            </div>
          </div>
          <div className="w-full sm:w-48">
            <Progress value={percent} aria-label={`${percent}% dos primeiros passos concluídos`} />
          </div>
        </div>

        <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {steps.map(step => {
            const Icon = step.icon
            return (
              <li
                key={step.key}
                className={cn(
                  'flex flex-col gap-3 rounded-xl border bg-card p-4',
                  step.done ? 'border-emerald-200/70' : 'border-border/70',
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      step.done ? 'bg-emerald-50 text-emerald-600' : 'bg-primary/10 text-primary',
                    )}
                  >
                    {step.done ? <CircleCheckBig className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm font-semibold',
                        step.done ? 'text-muted-foreground line-through decoration-1' : 'text-foreground',
                      )}
                    >
                      {step.title}
                      {step.done && <span className="sr-only"> (concluído)</span>}
                    </p>
                    <p className="text-xs leading-snug text-muted-foreground">
                      {step.done === null ? 'Não foi possível verificar agora.' : step.description}
                    </p>
                  </div>
                </div>

                {step.key === 'share' ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void copyLink(`/${slug}`, 'Link do site')}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copiar link do site
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void copyLink(`/${slug}/assinar`, 'Link de adesão')}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copiar link de adesão
                    </Button>
                  </div>
                ) : (
                  !step.done &&
                  step.href && (
                    <Button asChild size="sm" variant={step.done === null ? 'outline' : 'default'} className="w-fit">
                      <Link href={step.href}>{step.cta}</Link>
                    </Button>
                  )
                )}
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
