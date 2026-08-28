"use client"

import { motion } from "framer-motion"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState } from "react"
import { CheckCircle, Send } from "lucide-react"
import Link from "next/link"
import { useTenant } from "@/contexts/tenant-context"
import { useTenantData } from "@/contexts/tenant-data-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const cadastroSchema = z.object({
  name: z.string().min(3, "Informe seu nome completo"),
  phone: z.string().min(8, "Informe um telefone válido"),
  email: z.string().email("Informe um e-mail válido"),
  subject: z.string().min(1, "Selecione um assunto"),
})

type CadastroValues = z.infer<typeof cadastroSchema>

const subjects = [
  { value: "Quero me associar", label: "Quero me associar" },
  { value: "Quero contratar um plano", label: "Quero contratar um plano" },
  { value: "Quero ser afiliado ou consultor de vendas", label: "Quero ser afiliado ou consultor de vendas" },
  { value: "Outro assunto", label: "Outro assunto" },
]

export default function CadastroPage() {
  const { tenant } = useTenant()
  const { createLead } = useTenantData()
  const [isSubmitted, setIsSubmitted] = useState(false)

  const form = useForm<CadastroValues>({
    resolver: zodResolver(cadastroSchema),
    defaultValues: { name: "", phone: "", email: "", subject: "" },
  })

  const onSubmit = async (values: CadastroValues) => {
    if (!tenant) return
    await createLead({
      name: values.name,
      email: values.email,
      phone: values.phone,
      source: "Cadastro no site",
      status: "new",
      notes: values.subject,
      value: 0,
      sellerId: "",
    })
    setIsSubmitted(true)
    form.reset()
  }

  return (
    <main className="min-h-screen">
      <header className="h-20 flex items-center px-6 border-b border-border">
        <Link href={`/${tenant?.slug ?? ""}`} className="flex items-center gap-2">
          {tenant?.branding.logoUrl ? (
            <img src={tenant.branding.logoUrl} alt={tenant.name} className="h-8" />
          ) : (
            <span className="font-bold text-secondary text-lg">{tenant?.name}</span>
          )}
        </Link>
      </header>

      <section className="pt-20 pb-20 lg:pt-24 lg:pb-32 bg-gradient-to-b from-white to-[#f0f4f9]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-secondary mb-6 text-balance">
              Cadastre-<span className="text-primary">se</span>
            </h1>
            <p className="text-lg text-muted-foreground">
              Preencha seus dados e a equipe {tenant?.name} entrará em contato para te ajudar.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="bg-white rounded-3xl p-8 shadow-xl border border-border/50"
          >
            {isSubmitted ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-green-100 rounded-full mx-auto flex items-center justify-center mb-4">
                  <CheckCircle size={32} className="text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-secondary mb-2">Cadastro Enviado!</h3>
                <p className="text-muted-foreground mb-6">Entraremos em contato em breve.</p>
                <Button variant="ghost" className="text-secondary" onClick={() => setIsSubmitted(false)}>
                  Fazer novo cadastro
                </Button>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-secondary">Nome completo</FormLabel>
                        <FormControl>
                          <Input placeholder="Seu nome completo" className="h-12" {...field} />
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
                        <FormLabel className="text-secondary">Celular / Telefone</FormLabel>
                        <FormControl>
                          <Input placeholder="(00) 00000-0000" className="h-12" {...field} />
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
                        <FormLabel className="text-secondary">E-mail</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="seu@email.com" className="h-12" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-secondary">Assunto</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-12 w-full">
                              <SelectValue placeholder="Selecione um assunto" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {subjects.map((subject) => (
                              <SelectItem key={subject.value} value={subject.value}>
                                {subject.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-primary hover:opacity-90 text-white h-14"
                  >
                    <Send size={18} className="mr-2" />
                    Enviar Cadastro
                  </Button>
                </form>
              </Form>
            )}
          </motion.div>

          <p className="text-center text-sm text-muted-foreground mt-8">
            Já é associado?{" "}
            <Link href={`/${tenant?.slug ?? ""}/login`} className="text-primary font-medium hover:underline">
              Acesse sua conta
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}
