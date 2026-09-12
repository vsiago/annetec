"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Landmark,
  Shield,
  UserCog,
  Building2,
  Building,
  Users,
  Briefcase,
  Store,
  HeartHandshake,
  BookOpen,
  Stethoscope,
  Smile,
  Pill,
  Phone,
  HelpCircle,
  Flower2,
  ClipboardList,
  IdCard,
  LogIn,
} from "lucide-react"

/**
 * Header do site institucional. Uma faixa só.
 *
 * ── Contraste ────────────────────────────────────────────────────────────
 * O rosa original da marca (#e84364) é um meio-tom: contra ele o branco dá
 * 3,88:1 e o marinho 3,91:1 — os dois abaixo do mínimo de 4,5:1 da WCAG AA.
 * Nenhuma cor de texto resolve isso; o que resolve é aprofundar o campo.
 * O #d12d4f usado aqui já era o tom de hover da marca no próprio código, e
 * com branco por cima dá 5,00:1. Mesma identidade, contraste aprovado.
 *
 * ── Composição ───────────────────────────────────────────────────────────
 * Três zonas: logo à esquerda, menu centralizado, entrar à direita. O
 * contêiner externo é `justify-between` e o menu ocupa o meio com `flex-1`,
 * então ele fica centrado no vão entre os dois extremos — e continua centrado
 * quando o logo ou o botão mudam de largura.
 *
 * ── Hierarquia ───────────────────────────────────────────────────────────
 * Sobre o rosa existe um único bloco branco sólido: o CTA. O ENTRAR é
 * contornado, não preenchido, então lê como ação secundária sem sumir.
 */
const ROSE = "#d12d4f"
const INK = "#16203a"

type SubItem = {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  label: string
  href: string
  descricao?: string
}

type NavItem = {
  label: string
  href: string
  /** Ação principal — pílula branca sólida, sem submenu. */
  destaque?: boolean
  /** Listas longas respiram melhor em duas colunas do que numa pilha. */
  colunas?: 1 | 2
  dropdown?: SubItem[]
}

const navItems: NavItem[] = [
  {
    label: "A Associação",
    href: "/#sobre",
    dropdown: [
      { icon: Landmark, label: "Sobre nós", href: "/#sobre", descricao: "Quem somos e o que defendemos" },
      { icon: Users, label: "Quem atendemos", href: "/#publicos", descricao: "Os públicos que representamos" },
      { icon: Building2, label: "Entidades conveniadas", href: "/entidades", descricao: "Quem já caminha com a gente" },
      { icon: BookOpen, label: "Materiais gratuitos", href: "/materiais", descricao: "Blog, e-books e cursos" },
    ],
  },
  {
    label: "Para Você",
    href: "/#publicos",
    dropdown: [
      { icon: Landmark, label: "Servidor público", href: "/#publico-servidor" },
      { icon: Shield, label: "Militar", href: "/#publico-militar" },
      { icon: UserCog, label: "Profissional, técnico e tecnólogo", href: "/#publico-profissional" },
      { icon: IdCard, label: "Planos para você", href: "/planos#voce", descricao: "Cobertura individual e familiar" },
    ],
  },
  {
    label: "Para Entidades",
    href: "/entidades",
    colunas: 2,
    dropdown: [
      { icon: Briefcase, label: "Associações comerciais", href: "/entidades#associacoes-comerciais" },
      { icon: Store, label: "CDL — Dirigentes Lojistas", href: "/entidades#cdl" },
      { icon: Users, label: "Sindicatos", href: "/entidades#sindicatos" },
      { icon: Building2, label: "Outras associações", href: "/entidades#outras-associacoes" },
      { icon: HeartHandshake, label: "Planos para sua associação", href: "/planos#associacao" },
      { icon: Building, label: "Planos para sua empresa", href: "/planos#empresa" },
    ],
  },
  {
    label: "Crie seu cartão de benefícios",
    href: "/cadastro",
    destaque: true,
  },
  {
    label: "Planos de Saúde & Benefícios",
    href: "/planos",
    colunas: 2,
    dropdown: [
      { icon: Stethoscope, label: "Gestão de saúde", href: "/planos#gestao" },
      { icon: ClipboardList, label: "Consultas e exames", href: "/#consultas" },
      { icon: Smile, label: "Odontológico", href: "/#odonto" },
      { icon: Pill, label: "Farmácia", href: "/#farmacia" },
      { icon: Phone, label: "Teleorientação 24h", href: "/#teleorientacao" },
      { icon: Flower2, label: "Assistência funeral", href: "/#funeral" },
      { icon: HeartHandshake, label: "Parcerias em saúde e bem-estar", href: "/entidades#parcerias-saude" },
    ],
  },
  {
    label: "Fale Conosco",
    href: "/#contato",
    dropdown: [
      { icon: Phone, label: "Fale com a gente", href: "/#contato", descricao: "Time comercial e atendimento" },
      { icon: HelpCircle, label: "Dúvidas frequentes", href: "/#faq", descricao: "As perguntas que mais chegam" },
    ],
  },
]

/** Fecha o submenu só depois de um respiro, para o mouse atravessar o vão. */
const ATRASO_AO_SAIR = 140
/** A partir daqui a barra compacta e ganha sombra. */
const LIMIAR_SCROLL = 24

export function Navbar() {
  const pathname = usePathname()
  const [menuMobileAberto, setMenuMobileAberto] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)
  const [acordeaoMobile, setAcordeaoMobile] = useState<string | null>(null)
  const [compacto, setCompacto] = useState(false)
  const cabecalhoRef = useRef<HTMLElement>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function aoRolar() {
      setCompacto(window.scrollY > LIMIAR_SCROLL)
    }
    aoRolar()
    window.addEventListener("scroll", aoRolar, { passive: true })
    return () => window.removeEventListener("scroll", aoRolar)
  }, [])

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return
      setAberto(null)
      setMenuMobileAberto(false)
    }
    function aoClicarFora(evento: MouseEvent) {
      if (!cabecalhoRef.current?.contains(evento.target as Node)) setAberto(null)
    }
    document.addEventListener("keydown", aoTeclar)
    document.addEventListener("mousedown", aoClicarFora)
    return () => {
      document.removeEventListener("keydown", aoTeclar)
      document.removeEventListener("mousedown", aoClicarFora)
    }
  }, [])

  // Trocar de página fecha tudo — sem isso o menu fica aberto sobre o destino.
  useEffect(() => {
    setAberto(null)
    setMenuMobileAberto(false)
  }, [pathname])

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current)
    },
    [],
  )

  function abrir(label: string) {
    if (temporizador.current) clearTimeout(temporizador.current)
    setAberto(label)
  }

  function agendarFechamento() {
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => setAberto(null), ATRASO_AO_SAIR)
  }

  return (
    <header
      ref={cabecalhoRef}
      style={{ backgroundColor: ROSE }}
      className={`fixed inset-x-0 top-0 z-50 transition-shadow duration-300 ${
        compacto ? "shadow-xl shadow-black/25" : "shadow-lg shadow-black/10"
      }`}
    >
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <nav
          aria-label="Principal"
          className={`flex items-center justify-between gap-4 transition-[height] duration-300 ${
            compacto ? "h-16" : "h-16 xl:h-[78px]"
          }`}
        >
          {/* ── esquerda: logo ─────────────────────────────────────────── */}
          <Link
            href="/"
            className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#d12d4f]"
          >
            <img
              src="/annetec-light.svg"
              alt="Annetec — página inicial"
              className={`object-contain transition-[height] duration-300 ${compacto ? "h-9" : "h-9 xl:h-11"}`}
            />
          </Link>

          {/* ── centro: menu ───────────────────────────────────────────────
              `flex-1` + `justify-center` mantém o menu centrado no vão entre
              logo e botão, independente da largura dos dois. */}
          <div className="hidden flex-1 items-center justify-center gap-0.5 xl:flex 2xl:gap-1.5">
            {navItems.map(item => {
              const temSubmenu = Boolean(item.dropdown?.length)
              const estaAberto = aberto === item.label

              if (item.destaque) {
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    style={{ color: ROSE }}
                    className="mx-1.5 whitespace-nowrap rounded-full bg-white px-4 py-2.5 text-[11.5px] font-extrabold uppercase tracking-wide shadow-md ring-1 ring-black/5 transition-all duration-200 hover:-translate-y-px hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#d12d4f] 2xl:px-5 2xl:text-[12.5px]"
                  >
                    {item.label}
                  </Link>
                )
              }

              return (
                <div
                  key={item.label}
                  className="relative"
                  onMouseEnter={() => temSubmenu && abrir(item.label)}
                  onMouseLeave={() => temSubmenu && agendarFechamento()}
                >
                  <Link
                    href={item.href}
                    aria-haspopup={temSubmenu || undefined}
                    aria-expanded={temSubmenu ? estaAberto : undefined}
                    onFocus={() => temSubmenu && abrir(item.label)}
                    className="group relative flex items-center gap-1 rounded-lg px-2.5 py-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-white/12 focus-visible:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white 2xl:px-3 2xl:text-[13.5px]"
                  >
                    <span className="whitespace-nowrap">{item.label}</span>
                    {temSubmenu && (
                      <ChevronDown
                        className={`size-3.5 shrink-0 text-white/75 transition-transform duration-200 ${
                          estaAberto ? "rotate-180" : ""
                        }`}
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={`pointer-events-none absolute inset-x-2.5 bottom-1 h-[2px] origin-left rounded-full bg-white transition-transform duration-200 ${
                        estaAberto ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                      }`}
                    />
                  </Link>

                  <AnimatePresence>
                    {temSubmenu && estaAberto && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        className={`absolute top-full z-50 pt-2 ${
                          // Submenus largos perto da borda direita abrem para
                          // dentro, senão saem da tela.
                          item.colunas === 2 ? "left-1/2 -translate-x-1/2" : "left-0"
                        }`}
                      >
                        <div
                          className={`relative rounded-2xl border border-black/5 bg-white p-2.5 shadow-2xl ${
                            item.colunas === 2 ? "w-[620px]" : "w-[350px]"
                          }`}
                        >
                          <span
                            className={`absolute -top-1.5 size-3 rotate-45 border-l border-t border-black/5 bg-white ${
                              item.colunas === 2 ? "left-1/2 -ml-1.5" : "left-8"
                            }`}
                          />
                          <ul
                            className={`relative gap-0.5 ${
                              item.colunas === 2 ? "grid grid-cols-2" : "flex flex-col"
                            }`}
                          >
                            {item.dropdown!.map(sub => (
                              <li key={sub.href}>
                                <Link
                                  href={sub.href}
                                  onClick={() => setAberto(null)}
                                  className="group/sub flex h-full items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d12d4f]"
                                >
                                  <span className="mt-px flex size-9 shrink-0 items-center justify-center rounded-full bg-[#d12d4f]/10 transition-colors group-hover/sub:bg-[#d12d4f]">
                                    <sub.icon
                                      className="size-[18px] text-[#d12d4f] transition-colors group-hover/sub:text-white"
                                      strokeWidth={2}
                                    />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-[14px] font-bold leading-snug text-[#16203a]">
                                      {sub.label}
                                    </span>
                                    {sub.descricao && (
                                      <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-500">
                                        {sub.descricao}
                                      </span>
                                    )}
                                  </span>
                                  <ChevronRight
                                    className="mt-2 size-4 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover/sub:opacity-100"
                                    aria-hidden="true"
                                  />
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>

          {/* ── direita: entrar ────────────────────────────────────────────
              Contornado, não preenchido: o único preenchimento branco da
              barra é o CTA, para não haver dúvida sobre qual é a ação. */}
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className="hidden items-center gap-1.5 rounded-full border-2 border-white/70 px-4 py-2 text-[12px] font-extrabold uppercase tracking-wider text-white transition-colors hover:border-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#d12d4f] sm:flex xl:text-[12.5px]"
            >
              <LogIn className="size-3.5" aria-hidden="true" />
              Entrar
            </Link>

            <button
              type="button"
              className="rounded-lg p-2 text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white xl:hidden"
              onClick={() => setMenuMobileAberto(v => !v)}
              aria-expanded={menuMobileAberto}
              aria-label={menuMobileAberto ? "Fechar menu" : "Abrir menu"}
            >
              {menuMobileAberto ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </nav>
      </div>

      {/* ── gaveta (abaixo de xl) ──────────────────────────────────────── */}
      <AnimatePresence>
        {menuMobileAberto && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-white/20 bg-white xl:hidden"
          >
            <div className="max-h-[75vh] space-y-1 overflow-y-auto px-4 py-4">
              {navItems.map(item => {
                const temSubmenu = Boolean(item.dropdown?.length)
                const expandido = acordeaoMobile === item.label

                if (item.destaque) {
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setMenuMobileAberto(false)}
                      style={{ backgroundColor: ROSE }}
                      className="my-2 flex items-center justify-center rounded-full px-4 py-3.5 text-center text-[13px] font-extrabold uppercase tracking-wide text-white shadow-md"
                    >
                      {item.label}
                    </Link>
                  )
                }

                return (
                  <div key={item.label}>
                    <div className="flex items-stretch">
                      <Link
                        href={item.href}
                        onClick={() => setMenuMobileAberto(false)}
                        style={{ color: INK }}
                        className="flex-1 rounded-lg px-4 py-3 text-[15px] font-bold transition-colors hover:bg-slate-50"
                      >
                        {item.label}
                      </Link>
                      {temSubmenu && (
                        <button
                          type="button"
                          onClick={() => setAcordeaoMobile(expandido ? null : item.label)}
                          aria-expanded={expandido}
                          aria-label={`${expandido ? "Recolher" : "Expandir"} ${item.label}`}
                          className="rounded-lg px-3 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#d12d4f]"
                        >
                          <ChevronDown
                            className={`size-4 transition-transform duration-200 ${expandido ? "rotate-180" : ""}`}
                          />
                        </button>
                      )}
                    </div>

                    {temSubmenu && expandido && (
                      <ul className="mb-1 ml-4 space-y-0.5 border-l-2 border-[#d12d4f]/25 pl-3">
                        {item.dropdown!.map(sub => (
                          <li key={sub.href}>
                            <Link
                              href={sub.href}
                              onClick={() => setMenuMobileAberto(false)}
                              className="flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-[14px] font-semibold text-slate-600 transition-colors hover:text-[#d12d4f]"
                            >
                              <sub.icon className="size-4 shrink-0 text-[#d12d4f]" strokeWidth={2} />
                              {sub.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}

              <div className="border-t border-slate-200 pt-3">
                <Link
                  href="/login"
                  onClick={() => setMenuMobileAberto(false)}
                  style={{ color: INK, borderColor: INK }}
                  className="flex items-center justify-center gap-2 rounded-full border-2 px-4 py-3 text-[13px] font-extrabold uppercase tracking-wider"
                >
                  <LogIn className="size-4" aria-hidden="true" />
                  Entrar
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
