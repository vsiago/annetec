"use client"

import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowRight, CheckCircle2 } from "lucide-react"

export function HeroSection() {
  return (
    <section className="relative min-h-screen min-h-[100dvh] flex flex-col justify-center overflow-hidden bg-gradient-to-br from-white via-[#f2f6fa] to-[#d6e5f5] pt-16 md:pt-20 pb-6 md:pb-10">
      {/* Soft Ambient Background Glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-[#e84364]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 right-0 w-[500px] h-[500px] bg-[#102a56]/15 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Left Column - Free Standing Image */}
          <div className="lg:col-span-5 flex justify-center lg:justify-start order-2 lg:order-1">
            <div className="relative w-full max-w-[440px] lg:max-w-[480px]">
              <img
                src="/images/hero-girl-clean.png"
                alt="Associada ANNETEC"
                className="w-full h-auto object-cover rounded-3xl transition-transform duration-300 hover:scale-[1.01]"
              />
            </div>
          </div>

          {/* Right Column - Free Standing Copy & Actions */}
          <div className="lg:col-span-7 flex flex-col justify-center text-left order-1 lg:order-2">
            
            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] xl:text-[3.75rem] font-extrabold text-[#102a56] leading-[1.12] tracking-tight">
              A melhor plataforma de <br className="hidden sm:inline" />
              benefícios para os associados
            </h1>

            {/* Subheadline */}
            <p className="mt-6 text-xl sm:text-2xl font-semibold text-[#e84364] leading-relaxed">
              Planos de Saúde, Odontológicos e Planos de Assistência Familiar.
            </p>

            {/* Brand Tagline */}
            <div className="mt-6 flex flex-wrap items-center gap-2 text-xl sm:text-2xl font-extrabold">
              <span className="text-[#e84364]">ANNETEC</span>
              <span className="text-gray-400 font-light mx-1">|</span>
              <span className="text-[#102a56]">União Inteligente</span>
            </div>

            {/* CTA Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="bg-[#e84364] hover:bg-[#d12d4f] text-white text-base sm:text-lg font-extrabold px-8 py-6 rounded-full shadow-md hover:shadow-lg transition-all duration-300 hover:scale-[1.02] uppercase tracking-wider flex items-center justify-center gap-2"
                asChild
              >
                <Link href="#contrate">
                  ASSOCIE-SE
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-[#102a56] text-[#102a56] hover:bg-[#102a56] hover:text-white text-base sm:text-lg font-bold px-8 py-6 rounded-full transition-all duration-300 flex items-center justify-center"
                asChild
              >
                <Link href="#beneficios">Conheça os Benefícios</Link>
              </Button>
            </div>

            {/* Quick Feature Highlights */}
            <div className="mt-10 pt-6 border-t border-[#102a56]/15 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-2.5 text-sm font-semibold text-[#102a56]">
                <CheckCircle2 className="w-5 h-5 text-[#e84364] shrink-0" />
                <span>Sem taxa de adesão</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm font-semibold text-[#102a56]">
                <CheckCircle2 className="w-5 h-5 text-[#e84364] shrink-0" />
                <span>Cobertura Ampla</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm font-semibold text-[#102a56]">
                <CheckCircle2 className="w-5 h-5 text-[#e84364] shrink-0" />
                <span>Telemedicina 24h</span>
              </div>
            </div>

          </div>

        </div>
      </div>
    </section>
  )
}
