'use client'

import { Mail, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CopiarBotao } from './copiar-botao'
import { FOCUS_RING } from './tokens'
import { montarWaLink } from './wa-link'

/**
 * Modelo de mensagem pronto para usar. `texto` já vem com os campos
 * preenchidos (use `preencherModelo`). Duas saídas:
 *  - "Abrir no WhatsApp": link `wa.me` com o texto (só para canal WhatsApp e
 *    telefone válido; sem telefone, o botão fica desligado e explica);
 *  - "Copiar": copia o texto e avisa com toast.
 * Canal e-mail: só "Copiar" (e `mailto:` se houver `email`).
 */
export function ModeloMensagemCard({
  titulo,
  texto,
  canal = 'whatsapp',
  telefone,
  email,
  className,
}: {
  titulo: string
  texto: string
  canal?: 'whatsapp' | 'email'
  telefone?: string | null
  email?: string | null
  className?: string
}) {
  const waLink = canal === 'whatsapp' ? montarWaLink(telefone, texto) : null
  const mailto = canal === 'email' && email ? `mailto:${email}?subject=${encodeURIComponent(titulo)}&body=${encodeURIComponent(texto)}` : null
  const CanalIcone = canal === 'whatsapp' ? MessageCircle : Mail
  return (
    <article className={cn('flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-white p-4', className)}>
      <header className="flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-lg bg-[#E5EDF5] text-[#1E2A4A]" aria-hidden="true">
          <CanalIcone className="size-4" />
        </span>
        <h4 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{titulo}</h4>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {canal === 'whatsapp' ? 'WhatsApp' : 'E-mail'}
        </span>
      </header>
      <p className="m-0 whitespace-pre-line rounded-xl bg-[#F8F9FB] px-3 py-2.5 text-sm leading-relaxed text-[#344054]">{texto}</p>
      <div className="flex flex-wrap items-center gap-2">
        {canal === 'whatsapp' ? (
          waLink ? (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--vr-accent,#1E2A4A)] px-4 text-sm font-semibold text-[var(--vr-accent-fg,#FFFFFF)] hover:brightness-110 sm:flex-none',
                FOCUS_RING,
              )}
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              Abrir no WhatsApp
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">Cadastre um celular válido para abrir no WhatsApp.</span>
          )
        ) : mailto ? (
          <a
            href={mailto}
            className={cn(
              'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--vr-accent,#1E2A4A)] px-4 text-sm font-semibold text-[var(--vr-accent-fg,#FFFFFF)] hover:brightness-110 sm:flex-none',
              FOCUS_RING,
            )}
          >
            <Mail className="size-4" aria-hidden="true" />
            Abrir no e-mail
          </a>
        ) : null}
        <CopiarBotao texto={texto} mensagem="Mensagem copiada" />
      </div>
    </article>
  )
}
