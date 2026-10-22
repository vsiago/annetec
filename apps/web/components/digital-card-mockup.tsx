'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, Wifi, QrCode, Sparkles, CheckCircle2, Copy, Check, Lock, Clock } from 'lucide-react'
import type { Tenant } from '@/lib/types'

/**
 * Situação real da carteirinha (portal do associado). Sem a prop, o cartão
 * aparece como sempre apareceu: selo "ATIVO".
 */
export type DigitalCardStatus = 'active' | 'pending' | 'blocked' | 'canceled'

interface DigitalCardMockupProps {
  tenant: Tenant | null
  clientName?: string
  cardNumber?: string
  planName?: string
  cpf?: string
  contractDate?: Date | string
  dependentsCount?: number
  size?: 'sm' | 'md' | 'lg'
  interactive?: boolean
  showFlip?: boolean
  /** Selo e sobreposição de bloqueio. Ausente = "ATIVO", sem sobreposição. */
  status?: DigitalCardStatus
  /**
   * Quem é o portador. Com a prop, o cartão vira "real": `dependente` troca o
   * rótulo do rodapé e o bloco de dependentes pelo parentesco, e CPF vazio
   * some em vez de mostrar "CPF: ".
   */
  holderKind?: 'titular' | 'dependente'
  /** Parentesco exibido no cartão do dependente (ex.: "Filho(a)"). */
  relationshipLabel?: string
  /** Telefone da teleorientação no verso. Ausente = o número de sempre. */
  supportPhone?: string
}

const STATUS_LOOK: Record<DigitalCardStatus, { badge: string; dot: string; back: string; backClass: string }> = {
  active: { badge: 'ATIVO', dot: 'bg-emerald-400 animate-pulse', back: 'STATUS: VÁLIDO & LIBERADO', backClass: 'text-emerald-300' },
  pending: { badge: 'AGUARDANDO', dot: 'bg-amber-300', back: 'STATUS: AGUARDANDO ATIVAÇÃO', backClass: 'text-amber-200' },
  blocked: { badge: 'BLOQUEADO', dot: 'bg-red-400', back: 'STATUS: BLOQUEADO', backClass: 'text-red-200' },
  canceled: { badge: 'CANCELADO', dot: 'bg-zinc-300', back: 'STATUS: CANCELADO', backClass: 'text-zinc-200' },
}

const NAME_CONNECTORS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

/** Iniciais do clube para o selo do logo: "Clube Vida Plena" → "CV". */
function tenantInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .map(word => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(word => word && !NAME_CONNECTORS.has(word.toLowerCase()))
  const initials = words.slice(0, 2).map(word => word[0]).join('')
  return (initials || name.slice(0, 2)).toUpperCase()
}

export function DigitalCardMockup({
  tenant,
  // Sem dados de uma pessoa real (vitrine), o cartão mostra rótulos genéricos —
  // nunca nome ou CPF de alguém inventado.
  clientName = 'NOME DO ASSOCIADO',
  cardNumber = '0000-0000-00000',
  planName = 'Plano do clube',
  cpf = '000.000.000-00',
  dependentsCount = 0,
  size = 'md',
  interactive = true,
  showFlip = true,
  status,
  holderKind,
  relationshipLabel,
  supportPhone,
}: DigitalCardMockupProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const [copied, setCopied] = useState(false)

  const primaryColor = tenant?.branding?.primaryColor || '#C4737B'
  const secondaryColor = tenant?.branding?.secondaryColor || '#8B4A52'
  // Sem logo cadastrado, o cartão mostra o NOME do próprio clube — nunca a
  // marca de outro inquilino.
  const logoUrl = tenant?.branding?.logoLightUrl || tenant?.branding?.logoUrl || null
  const tenantName = tenant?.name || 'Clube de Benefícios'
  const look = STATUS_LOOK[status ?? 'active']
  const locked = status === 'blocked' || status === 'canceled'
  const realCard = holderKind !== undefined
  const isDependent = holderKind === 'dependente'
  // Número de dependente ("MAP-2026-00042-01") não cabe no corpo grande em tela de celular.
  const compactNumber = realCard && cardNumber.length > 14

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(cardNumber)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Size scale
  const sizeClasses = {
    sm: 'max-w-[340px] p-4 text-xs min-h-[200px]',
    md: 'max-w-[420px] p-6 min-h-[250px]',
    lg: 'max-w-[480px] p-7 min-h-[280px]',
  }[size]

  return (
    <div className="w-full flex flex-col items-center">
      <motion.div
        className="w-full relative perspective-1000 cursor-pointer select-none"
        onClick={() => showFlip && setIsFlipped(!isFlipped)}
        whileHover={interactive ? { scale: 1.02, rotateY: isFlipped ? 180 : 5, rotateX: -3 } : {}}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <motion.div
          className={`w-full ${sizeClasses} mx-auto rounded-2xl shadow-2xl relative overflow-hidden text-white border border-white/20 flex flex-col justify-between${locked ? ' grayscale' : ''}`}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.6 }}
          style={{
            transformStyle: 'preserve-3d',
            background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
          }}
        >
          {/* Holographic / Glossy reflection overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-60 pointer-events-none" />
          
          {/* Checkered / Geometric Background pattern watermark */}
          <div 
            className="absolute inset-0 opacity-10 pointer-events-none" 
            style={{
              backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
              backgroundSize: '16px 16px',
            }}
          />

          {/* Decorative Glow Circles */}
          <div 
            className="absolute -top-12 -right-12 w-48 h-48 rounded-full blur-2xl opacity-40 pointer-events-none"
            style={{ backgroundColor: primaryColor }}
          />
          <div 
            className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full blur-2xl opacity-30 pointer-events-none"
            style={{ backgroundColor: secondaryColor }}
          />

          {!isFlipped ? (
            /* FRONT OF THE CARD */
            <div className="relative z-10 flex flex-col justify-between h-full space-y-6">
              {/* Header: Logo & Active Badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {logoUrl ? (
                    <img src={logoUrl} alt={tenantName} className="h-8 object-contain drop-shadow-sm" />
                  ) : (
                    <>
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20 border border-white/25 text-xs font-extrabold tracking-wide"
                      >
                        {tenantInitials(tenantName)}
                      </span>
                      <span className="font-extrabold text-base sm:text-lg tracking-tight text-white truncate max-w-45">
                        {tenantName}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-xs font-semibold">
                  <span className={`w-2 h-2 rounded-full ${look.dot}`} />
                  <span>{look.badge}</span>
                </div>
              </div>

              {/* EMV Chip & Contactless Symbol */}
              <div className="flex items-center justify-between my-1">
                <div className="flex items-center gap-3">
                  {/* EMV Golden Chip */}
                  <div className="w-11 h-8 bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 rounded-md border border-amber-300/40 p-1 flex flex-col justify-between shadow-md">
                    <div className="w-full h-1/3 border-b border-amber-700/30" />
                    <div className="w-full h-1/3 border-b border-amber-700/30" />
                  </div>
                  {/* Contactless Wifi Waves */}
                  <Wifi className="w-5 h-5 text-white/70 rotate-90" />
                </div>
                <span className="text-[10px] uppercase font-mono font-bold tracking-widest px-2 py-0.5 rounded bg-white/10 text-white/90 border border-white/10">
                  {planName}
                </span>
              </div>

              {/* Card Number */}
              <div>
                <span className="text-[10px] uppercase tracking-widest text-white/60 font-medium block mb-0.5">
                  Número da Carteirinha
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono font-bold drop-shadow ${
                      compactNumber ? 'text-lg sm:text-2xl tracking-wider' : 'text-xl sm:text-2xl tracking-widest'
                    }`}
                  >
                    {cardNumber}
                  </span>
                  {status !== 'pending' && (
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors text-white/80"
                      title="Copiar número"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Footer: Holder Name & Details */}
              <div className={`flex items-end justify-between pt-2 border-t border-white/15${realCard ? ' gap-3' : ''}`}>
                <div className={realCard ? 'min-w-0' : undefined}>
                  <span className="text-[10px] uppercase tracking-widest text-white/60 block mb-0.5">
                    {isDependent ? 'Dependente' : 'Titular do Plano'}
                  </span>
                  <p className="font-bold text-base sm:text-lg tracking-wide uppercase drop-shadow-sm leading-tight">
                    {clientName}
                  </p>
                  {(!realCard || cpf) && <p className="text-xs text-white/80 font-mono mt-0.5">CPF: {cpf}</p>}
                </div>

                {isDependent ? (
                  <div className="text-right shrink-0">
                    <span className="text-[10px] uppercase tracking-widest text-white/60 block mb-0.5">
                      Parentesco
                    </span>
                    <span className="text-sm font-bold bg-white/20 px-2.5 py-0.5 rounded-full border border-white/20">
                      {relationshipLabel || 'Dependente'}
                    </span>
                  </div>
                ) : (
                  <div className="text-right">
                    <span className="text-[10px] uppercase tracking-widest text-white/60 block mb-0.5">
                      Dependentes
                    </span>
                    <span className="text-sm font-bold bg-white/20 px-2.5 py-0.5 rounded-full border border-white/20">
                      {dependentsCount} {dependentsCount === 1 ? 'Pessoa' : 'Pessoas'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* BACK OF THE CARD */
            <div 
              className="relative z-10 flex flex-col justify-between h-full space-y-4"
              style={{ transform: 'scaleX(-1)' }}
            >
              {/* Magnetic Strip */}
              <div className="w-[calc(100%+3.5rem)] -mx-7 -mt-7 h-10 bg-zinc-900 border-b border-white/10 mb-2" />

              {/* QR Code & Barcode Section */}
              <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/20">
                <div className="bg-white p-2 rounded-lg shadow">
                  <QrCode className="w-16 h-16 text-zinc-900" />
                </div>
                <div className="flex-1 text-xs space-y-1">
                  <p className="font-bold text-white text-sm">Validação Digital</p>
                  <p className="text-white/70 text-[11px]">
                    Apresente este QR Code no credenciado para liberar consultas e exames com desconto.
                  </p>
                  <p className={`font-mono text-[10px] ${look.backClass} font-semibold`}>{look.back}</p>
                </div>
              </div>

              {/* Support Contact Notice */}
              <div className="text-[11px] text-white/80 space-y-1 border-t border-white/15 pt-2">
                {(supportPhone || tenant?.phone) && (
                  <p className="flex items-center justify-between">
                    <span>Central do clube:</span>
                    <strong className="font-mono text-white">{supportPhone || tenant?.phone}</strong>
                  </p>
                )}
                <p className="text-[10px] text-white/60 leading-tight">
                  Este cartão é pessoal e intransferível. Válido em toda a rede credenciada do {tenantName}.
                </p>
              </div>
            </div>
          )}

          {/* Bloqueio / aguardando (só na frente): a carteirinha não vale enquanto isso */}
          {!isFlipped && status && status !== 'active' && (
            <div
              className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 px-8 text-center ${
                locked ? 'bg-zinc-950/60 backdrop-blur-[2px]' : 'bg-zinc-950/35'
              }`}
            >
              <span className="rounded-full bg-white/15 border border-white/25 p-3">
                {locked ? <Lock className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
              </span>
              <p className="font-bold uppercase tracking-widest text-sm drop-shadow">
                {status === 'blocked'
                  ? 'Carteirinha bloqueada'
                  : status === 'canceled'
                    ? 'Carteirinha cancelada'
                    : 'Aguardando pagamento'}
              </p>
              <p className="text-xs text-white/85 max-w-70 leading-snug drop-shadow">
                {status === 'blocked'
                  ? 'Regularize o pagamento para liberar os benefícios.'
                  : status === 'canceled'
                    ? 'Esta carteirinha não dá mais acesso aos benefícios.'
                    : 'A carteirinha é liberada assim que o pagamento for confirmado.'}
              </p>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Helper text under card */}
      {showFlip && (
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5 animate-pulse">
          <span>Clique na carteirinha para virar o verso (QR Code)</span>
        </p>
      )}
    </div>
  )
}
