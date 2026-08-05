"use client"

import { useState } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { Menu, X, ChevronDown, Info, Landmark, Shield, UserCog, Building2, Building, Users, Briefcase, Store, HeartHandshake, FileEdit, BookDown, GraduationCap, Stethoscope } from "lucide-react"
import { Button } from "@/components/ui/button"

const FaviconIcon = ({ className }: { className?: string }) => (
  <img src="/favicon.png" alt="" className={className} style={{ objectFit: 'contain' }} />
)

const navItems = [
  {
    label: "A Associação",
    href: "/#sobre",
    dropdown: [
      {
        icon: FaviconIcon,
        iconColor: "",
        iconBg: "bg-pink-100",
        label: "Sobre nós",
        href: "/#sobre"
      },
      {
        icon: Landmark,
        iconColor: "text-gray-700",
        iconBg: "bg-transparent",
        label: "Servidor Público",
        href: "/#publico-servidor"
      },
      {
        icon: Shield,
        iconColor: "text-gray-700",
        iconBg: "bg-transparent",
        label: "Militar",
        href: "/#publico-militar"
      },
      {
        icon: UserCog,
        iconColor: "text-gray-700",
        iconBg: "bg-transparent",
        label: "Profissional, Técnico e Tecnólogo",
        href: "/#publico-profissional"
      },
      {
        icon: Building2,
        iconColor: "text-gray-700",
        iconBg: "bg-transparent",
        label: "Entidades Associativas",
        href: "/#publico-entidades"
      }
    ]
  },
  {
    label: "Club de Saúde & Benefícios",
    href: "/planos",
    dropdown: [
      {
        icon: Stethoscope,
        iconColor: "text-gray-700",
        iconBg: "bg-transparent",
        label: "Gestão de Saúde",
        href: "/planos#gestao"
      },
      {
        icon: FaviconIcon,
        iconColor: "",
        iconBg: "bg-pink-100",
        label: "Planos para sua associação",
        href: "/planos#associacao"
      },
      {
        icon: Building,
        iconColor: "text-gray-700",
        iconBg: "bg-transparent",
        label: "Planos para sua empresa",
        href: "/planos#empresa"
      },
      {
        icon: Users,
        iconColor: "text-gray-700",
        iconBg: "bg-transparent",
        label: "Planos para você",
        href: "/planos#voce"
      }
    ]
  },
  {
    label: "Entidades Conveniadas",
    href: "/entidades",
    dropdown: [
      {
        icon: Briefcase,
        iconColor: "text-gray-700",
        iconBg: "bg-transparent",
        label: "Associações Comerciais",
        href: "/entidades#associacoes-comerciais"
      },
      {
        icon: Store,
        iconColor: "text-gray-700",
        iconBg: "bg-transparent",
        label: "CDL - Câmaras Lojistas",
        href: "/entidades#cdl"
      },
      {
        icon: Users,
        iconColor: "text-gray-700",
        iconBg: "bg-transparent",
        label: "Sindicatos",
        href: "/entidades#sindicatos"
      },
      {
        icon: Building2,
        iconColor: "text-gray-700",
        iconBg: "bg-transparent",
        label: "Outras associações",
        href: "/entidades#outras-associacoes"
      },
      {
        icon: HeartHandshake,
        iconColor: "text-gray-700",
        iconBg: "bg-transparent",
        label: "Parcerias na saúde, odonto e bem-estar",
        href: "/entidades#parcerias-saude"
      }
    ]
  },
  {
    label: "Materiais Gratuitos",
    href: "/materiais",
    dropdown: [
      {
        icon: FileEdit,
        iconColor: "text-gray-700",
        iconBg: "bg-transparent",
        label: "Blog",
        href: "/materiais#blog"
      },
      {
        icon: BookDown,
        iconColor: "text-gray-700",
        iconBg: "bg-transparent",
        label: "eBook",
        href: "/materiais#ebooks"
      },
      {
        icon: GraduationCap,
        iconColor: "text-gray-700",
        iconBg: "bg-transparent",
        label: "Cursos gratuitos",
        href: "/materiais#cursos"
      }
    ]
  },
  {
    label: "Cadastre-se",
    href: "/cadastro",
    dropdown: []
  },
  {
    label: "Contato",
    href: "/#contato",
    dropdown: []
  },
]

export function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 bg-[#e84364] shadow-md transition-all duration-300"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <img src="/annetec-light.svg" alt="Annetec" className="h-10 md:h-12 object-contain" />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-3 xl:gap-5">
            {navItems.map((item) => (
              <div key={item.label} className="relative group shrink-0">
                <Link
                  href={item.href}
                  className="flex items-center gap-1.5 py-6 text-[15px] font-bold text-white hover:text-white/80 transition-colors whitespace-nowrap"
                >
                  {item.label}
                  {item.dropdown && item.dropdown.length > 0 && (
                    <ChevronDown className="w-4 h-4 text-white/80 transition-transform duration-200 group-hover:rotate-180" />
                  )}
                </Link>

                {/* Dropdown Menu */}
                {item.dropdown && item.dropdown.length > 0 && (
                  <div className="absolute top-full left-0 pt-2 opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-200 z-50">
                    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-3 min-w-[320px] flex flex-col gap-1 relative before:absolute before:-top-2 before:left-6 before:w-4 before:h-4 before:bg-white before:rotate-45 before:border-t before:border-l before:border-gray-100">
                      {item.dropdown.map((subItem) => (
                        <Link
                          key={subItem.label}
                          href={subItem.href}
                          className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                        >
                          {subItem.icon === FaviconIcon ? (
                            <subItem.icon className="w-8 h-8 shrink-0 object-contain" />
                          ) : (
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${subItem.iconBg}`}>
                              <subItem.icon className={`w-5 h-5 ${subItem.iconColor}`} strokeWidth={2} />
                            </div>
                          )}
                          <span className="font-bold text-[16px] text-gray-900 leading-tight">
                            {subItem.label}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden lg:flex items-center gap-4 shrink-0">
            <Link
              href="/login"
              className="text-white hover:text-white/80 font-bold text-[15px] transition-colors px-3 py-2 whitespace-nowrap"
            >
              Login
            </Link>
            <Button
              className="bg-white text-[#e84364] hover:bg-gray-100 font-extrabold shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 rounded-full px-7 py-2.5 text-sm uppercase tracking-wider whitespace-nowrap"
              asChild
            >
              <Link href="/#contrate">ASSOCIE-SE</Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 text-white hover:text-white/80 transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? "Fechar menu" : "Abrir menu"}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </nav>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="lg:hidden bg-white border-t border-border/50"
          >
            <div className="px-4 py-4 space-y-2 max-h-[80vh] overflow-y-auto">
              {navItems.map((item) => (
                <div key={item.label} className="space-y-1">
                  <Link
                    href={item.href}
                    className="flex items-center justify-between px-4 py-3 text-sm font-bold text-gray-900 hover:text-[#e84364] hover:bg-[#e84364]/5 rounded-lg transition-colors"
                    onClick={() => !item.dropdown?.length && setIsMobileMenuOpen(false)}
                  >
                    {item.label}
                    {item.dropdown && item.dropdown.length > 0 && (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </Link>
                  {/* Mobile Submenu */}
                  {item.dropdown && item.dropdown.length > 0 && (
                    <div className="pl-6 pr-2 py-2 space-y-1">
                      {item.dropdown.map((subItem) => (
                        <Link
                          key={subItem.label}
                          href={subItem.href}
                          className="flex items-center gap-3 py-2 text-sm font-semibold text-gray-600 hover:text-[#e84364]"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          <subItem.icon className="w-4 h-4" />
                          {subItem.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="pt-4 space-y-2 border-t border-border/50">
                <Button
                  variant="ghost"
                  className="w-full justify-center text-[#26365f] font-bold"
                  asChild
                >
                  <Link href="/login">Entrar</Link>
                </Button>
                <Button
                  className="w-full bg-[#e84364] hover:bg-[#d12d4f] text-white font-bold rounded-full"
                  asChild
                >
                  <Link href="/#contrate">Contrate Agora!</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
