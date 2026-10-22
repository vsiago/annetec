'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, CheckCircle2, Loader2, Send } from 'lucide-react'
import { isValidCnpj } from '@annetec/contracts'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createPublicLeadAction, type PublicLeadInput } from '@/lib/actions/tenant-public-api'
import { onlyDigits } from './format'
import { useVitrine } from './vitrine-context'

/** "(22) 99987-6543" enquanto a pessoa digita. */
function maskPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 2) return d ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function maskCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

const telefone = z
  .string()
  .trim()
  .refine(value => {
    const d = onlyDigits(value)
    return d.length === 10 || d.length === 11
  }, 'Informe o telefone com DDD')

const email = z.string().trim().max(160, 'E-mail longo demais').email('Informe um e-mail válido')
const opcional = (max: number) => z.string().trim().max(max, `Use até ${max} caracteres`).optional()

/**
 * Honeypot: fora da tela e fora da ordem de tabulação. Gente não vê; robô
 * preenche, e a API descarta o envio sem avisar.
 */
function Honeypot<T extends FieldValues>({ form }: { form: UseFormReturn<T> }) {
  return (
    <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
      <label htmlFor="lead-website">Não preencha este campo</label>
      <input id="lead-website" type="text" tabIndex={-1} autoComplete="off" {...form.register('website' as Path<T>)} />
    </div>
  )
}

function SuccessPanel({ title, text }: { title: string; text: string }) {
  const { paths, whatsapp } = useVitrine()
  return (
    <div className="py-8 text-center" role="status">
      <span className="mx-auto inline-flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <CheckCircle2 className="size-8" aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-2xl font-bold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">{text}</p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <Button size="lg" className="h-12 rounded-full px-6 font-semibold" asChild>
          <Link href={paths.plans}>
            Ver planos e preços
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        {whatsapp && (
          <Button size="lg" variant="outline" className="h-12 rounded-full px-6 font-semibold" asChild>
            <a href={whatsapp} target="_blank" rel="noopener noreferrer">
              Adiantar pelo WhatsApp
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}

/** Aplica os erros de campo que a API devolveu (`phone`, `company.document`…). */
function applyFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  fieldErrors: Record<string, string> | undefined,
  map: Record<string, Path<T>>,
): boolean {
  let applied = false
  for (const [path, message] of Object.entries(fieldErrors ?? {})) {
    const field = map[path]
    if (!field) continue
    form.setError(field, { message })
    applied = true
  }
  return applied
}

const contatoSchema = z.object({
  name: z.string().trim().min(3, 'Informe seu nome completo').max(120, 'Nome longo demais'),
  phone: telefone,
  email,
  subject: z.string().min(1, 'Selecione um assunto'),
  message: opcional(2000),
  website: z.string().optional(),
})
type ContatoValues = z.infer<typeof contatoSchema>

/** Formulário de `/cadastro`: vira lead no CRM do inquilino, sem login. */
export function ContactLeadForm({ planId }: { planId?: string }) {
  const { tenant, content } = useVitrine()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<ContatoValues>({
    resolver: zodResolver(contatoSchema),
    defaultValues: { name: '', phone: '', email: '', subject: '', message: '', website: '' },
  })

  const onSubmit = async (values: ContatoValues) => {
    setError(null)
    const input: PublicLeadInput = {
      origin: 'cadastro',
      name: values.name,
      phone: values.phone,
      email: values.email,
      subject: values.subject,
      message: values.message || undefined,
      planId,
      website: values.website || undefined,
    }
    const result = await createPublicLeadAction(tenant.slug, input)
    if (!result.success) {
      const mapped = applyFieldErrors(form, result.fieldErrors, {
        name: 'name',
        phone: 'phone',
        email: 'email',
        subject: 'subject',
        message: 'message',
      })
      setError(mapped ? 'Confira os campos destacados.' : result.error)
      return
    }
    setSent(true)
    form.reset()
  }

  if (sent) {
    return <SuccessPanel title={content.signup.successTitle} text={content.signup.successText} />
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="relative space-y-5" noValidate>
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome completo</FormLabel>
              <FormControl>
                <Input autoComplete="name" placeholder="Seu nome completo" className="h-12 rounded-xl" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Celular / WhatsApp</FormLabel>
                <FormControl>
                  <Input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="(00) 00000-0000"
                    className="h-12 rounded-xl"
                    {...field}
                    onChange={event => field.onChange(maskPhone(event.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>E-mail</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" placeholder="seu@email.com" className="h-12 rounded-xl" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Assunto</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="h-12 w-full rounded-xl">
                    <SelectValue placeholder="Selecione um assunto" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {content.signup.subjects.map(subject => (
                    <SelectItem key={subject} value={subject}>
                      {subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Mensagem <span className="font-normal text-muted-foreground">(opcional)</span>
              </FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="Conte como podemos ajudar" className="min-h-24 rounded-xl" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Honeypot form={form} />
        <Button type="submit" size="lg" className="h-13 w-full rounded-full text-base font-semibold" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-5" aria-hidden="true" />
          )}
          {form.formState.isSubmitting ? 'Enviando…' : content.signup.submit}
        </Button>
        <p className="text-center text-xs text-muted-foreground">{content.legal.privacyNote}</p>
      </form>
    </Form>
  )
}

const FAIXAS_COLABORADORES = ['1 a 9', '10 a 49', '50 a 99', '100 a 499', '500 ou mais']

const empresaSchema = z.object({
  company: z.string().trim().min(2, 'Informe o nome da empresa').max(160, 'Nome longo demais'),
  document: z
    .string()
    .trim()
    .optional()
    .refine(value => !value || isValidCnpj(value), 'CNPJ inválido'),
  employees: z.string().min(1, 'Selecione o número de colaboradores'),
  name: z.string().trim().min(3, 'Informe seu nome').max(120, 'Nome longo demais'),
  role: opcional(80),
  email,
  phone: telefone,
  message: opcional(2000),
  website: z.string().optional(),
})
type EmpresaValues = z.infer<typeof empresaSchema>

/** Proposta B2B de `/empresas`: lead com origem "empresas" e a empresa nas observações. */
export function CompanyLeadForm() {
  const { tenant, content } = useVitrine()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<EmpresaValues>({
    resolver: zodResolver(empresaSchema),
    defaultValues: {
      company: '',
      document: '',
      employees: '',
      name: '',
      role: '',
      email: '',
      phone: '',
      message: '',
      website: '',
    },
  })

  const onSubmit = async (values: EmpresaValues) => {
    setError(null)
    const input: PublicLeadInput = {
      origin: 'empresas',
      subject: 'Proposta para empresas',
      name: values.name,
      phone: values.phone,
      email: values.email,
      message: values.message || undefined,
      company: {
        name: values.company,
        document: values.document || undefined,
        employees: values.employees,
        role: values.role || undefined,
      },
      website: values.website || undefined,
    }
    const result = await createPublicLeadAction(tenant.slug, input)
    if (!result.success) {
      const mapped = applyFieldErrors(form, result.fieldErrors, {
        name: 'name',
        phone: 'phone',
        email: 'email',
        message: 'message',
        'company.name': 'company',
        'company.document': 'document',
        'company.employees': 'employees',
        'company.role': 'role',
      })
      setError(mapped ? 'Confira os campos destacados.' : result.error)
      return
    }
    setSent(true)
    form.reset()
  }

  if (sent) {
    return (
      <SuccessPanel
        title="Pedido de proposta enviado!"
        text={`Um consultor do ${tenant.name} vai entrar em contato para montar a proposta da sua empresa.`}
      />
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="relative space-y-5" noValidate>
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="company"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Empresa</FormLabel>
                <FormControl>
                  <Input autoComplete="organization" placeholder="Nome da empresa" className="h-12 rounded-xl" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="document"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  CNPJ <span className="font-normal text-muted-foreground">(opcional)</span>
                </FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    placeholder="00.000.000/0000-00"
                    className="h-12 rounded-xl"
                    {...field}
                    onChange={event => field.onChange(maskCnpj(event.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="employees"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número de colaboradores</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="h-12 w-full rounded-xl">
                    <SelectValue placeholder="Selecione a faixa" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {FAIXAS_COLABORADORES.map(faixa => (
                    <SelectItem key={faixa} value={faixa}>
                      {faixa}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Seu nome</FormLabel>
                <FormControl>
                  <Input autoComplete="name" placeholder="Nome do contato" className="h-12 rounded-xl" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Cargo <span className="font-normal text-muted-foreground">(opcional)</span>
                </FormLabel>
                <FormControl>
                  <Input autoComplete="organization-title" placeholder="Ex.: Analista de RH" className="h-12 rounded-xl" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>E-mail corporativo</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" placeholder="voce@empresa.com.br" className="h-12 rounded-xl" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Telefone / WhatsApp</FormLabel>
                <FormControl>
                  <Input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="(00) 00000-0000"
                    className="h-12 rounded-xl"
                    {...field}
                    onChange={event => field.onChange(maskPhone(event.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Mensagem <span className="font-normal text-muted-foreground">(opcional)</span>
              </FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="Conte o que sua empresa procura" className="min-h-24 rounded-xl" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Honeypot form={form} />
        <Button type="submit" size="lg" className="h-13 w-full rounded-full text-base font-semibold" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-5" aria-hidden="true" />
          )}
          {form.formState.isSubmitting ? 'Enviando…' : content.business.primaryCta}
        </Button>
        <p className="text-center text-xs text-muted-foreground">{content.legal.privacyNote}</p>
      </form>
    </Form>
  )
}
