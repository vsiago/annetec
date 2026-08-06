'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useTenant } from '@/contexts/tenant-context'
import { useTenantData } from '@/contexts/tenant-data-context'
import { Button } from '@/components/ui/button'
import {
  Stethoscope,
  Smile,
  Pill,
  Shield,
  Percent,
  Gift,
  Phone,
  ShieldCheck,
  Sparkles,
  ArrowRight,
} from 'lucide-react'

const categoryIcons: Record<string, React.ElementType> = {
  health: Stethoscope,
  dental: Smile,
  pharmacy: Pill,
  funeral: Shield,
  discount: Percent,
}

export default function TenantLandingPage() {
  const { tenant } = useTenant()
  const { benefits, partners, isLoading } = useTenantData()

  if (!tenant) return null

  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <header className="h-20 flex items-center justify-between px-6 lg:px-12 border-b border-border">
        {tenant.branding.logoUrl ? (
          <img src={tenant.branding.logoUrl} alt={tenant.name} className="h-11 object-contain" />
        ) : (
          <span className="font-bold text-secondary text-xl">{tenant.name}</span>
        )}
        <div className="flex items-center gap-3">
          <Button variant="ghost" className="text-secondary" asChild>
            <Link href={`/${tenant.slug}/login`}>Entrar</Link>
          </Button>
          <Button className="bg-primary hover:opacity-90 text-white" asChild>
            <Link href={`/${tenant.slug}/cadastro`}>Quero me associar</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-16 pb-20 lg:pt-24 lg:pb-32 bg-gradient-to-b from-white to-[#f0f4f9]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-6">
              <Sparkles size={16} />
              Clube de Benefícios {tenant.name}
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-6xl font-bold text-secondary mb-6 text-balance">
              Saúde, bem-estar e descontos <span className="text-primary">em um só lugar</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
              {tenant.name} reúne teleorientação, rede de parceiros credenciados e descontos exclusivos
              para você e sua família, com uma carteirinha digital sempre à mão.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Button size="lg" className="bg-primary hover:opacity-90 text-white h-14 px-8" asChild>
                <Link href={`/${tenant.slug}/cadastro`}>
                  Quero me associar
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="h-14 px-8" asChild>
                <Link href={`/${tenant.slug}/login`}>Já sou associado</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 lg:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-secondary mb-3">Benefícios do plano</h2>
            <p className="text-muted-foreground">Tudo que você precisa para cuidar de quem ama</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map(benefit => {
              const Icon = categoryIcons[benefit.category] || Gift
              return (
                <div key={benefit.id} className="p-6 rounded-2xl border border-border hover:border-primary/30 hover:shadow-md transition-all">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-secondary mb-2">{benefit.name}</h3>
                  <p className="text-sm text-muted-foreground">{benefit.description}</p>
                </div>
              )
            })}
            {!isLoading && benefits.length === 0 && (
              <p className="text-muted-foreground col-span-full text-center">
                Nenhum benefício cadastrado ainda.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Partner network */}
      {partners.length > 0 && (
        <section className="py-20 lg:py-28 bg-[#f8fafc]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-secondary mb-3">Rede de parceiros credenciados</h2>
              <p className="text-muted-foreground">Descontos exclusivos para associados {tenant.name}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {partners.filter(p => p.status === 'active').map(partner => (
                <div key={partner.id} className="p-5 rounded-xl bg-white border border-border text-center">
                  <p className="font-semibold text-secondary">{partner.name}</p>
                  <p className="text-2xl font-bold text-primary mt-1">{partner.discountPercent}%</p>
                  <p className="text-xs text-muted-foreground">de desconto</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Support */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-gradient-to-r from-secondary to-primary p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-white/10">
                <Phone className="h-7 w-7" />
              </div>
              <div>
                <p className="font-bold text-lg">Teleorientação 24h</p>
                <p className="text-white/80 text-sm">Orientação médica gratuita para associados</p>
              </div>
            </div>
            <p className="text-2xl font-bold">{tenant.phone}</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            {tenant.legalName} — {tenant.document}
          </div>
          <p>&copy; {new Date().getFullYear()} {tenant.name}. Todos os direitos reservados.</p>
        </div>
      </footer>
    </main>
  )
}
