import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CopiarBotao } from './copiar-botao'

/**
 * Peças das fichas (agente, lead, corretora...): nada vaza do cartão.
 *
 * - `CampoFicha`: célula da grade, com `min-w-0`. `largo` ocupa a linha inteira
 *   (use em e-mail, razão social, endereço...).
 * - `ValorLongo`: e-mail, chave Pix, código. Fica numa linha, com reticências e o
 *   valor completo no `title`, link opcional e botão de copiar discreto.
 * - Texto comum (endereço, observações) quebra só entre palavras: `TextoQuebravel`.
 */
export function CampoFicha({
  rotulo,
  largo,
  children,
  className,
}: {
  rotulo: string
  largo?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', largo && 'col-span-full', className)}>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="m-0 min-w-0 break-words text-sm font-medium text-foreground">{children}</dd>
    </div>
  )
}

export function NaoInformado({ texto = 'Não informado' }: { texto?: string }) {
  return <span className="font-normal italic text-muted-foreground">{texto}</span>
}

/** Texto que pode ter várias linhas, mas só quebra entre palavras (e só parte uma palavra se ela sozinha não couber). */
export function TextoQuebravel({ children }: { children: ReactNode }) {
  return <span className="block min-w-0 break-words">{children}</span>
}

export function ValorLongo({
  texto,
  href,
  icone: Icone,
  rotuloCopiar,
  mensagemCopiar,
  copiar = true,
  mono,
}: {
  texto: string
  href?: string
  icone?: LucideIcon
  rotuloCopiar?: string
  mensagemCopiar?: string
  copiar?: boolean
  mono?: boolean
}) {
  const conteudo = (
    <>
      {Icone ? <Icone className="size-3.5 shrink-0" aria-hidden="true" /> : null}
      <span className="min-w-0 truncate">{texto}</span>
    </>
  )
  const cls = cn('flex min-w-0 flex-1 items-center gap-1', mono && 'font-mono text-[13px]')
  return (
    <span className="flex min-w-0 items-center gap-1">
      {href ? (
        <a href={href} title={texto} className={cn(cls, 'hover:underline')}>
          {conteudo}
        </a>
      ) : (
        <span title={texto} className={cls}>
          {conteudo}
        </span>
      )}
      {copiar ? (
        <CopiarBotao
          texto={texto}
          variante="icone"
          rotulo={rotuloCopiar ?? 'Copiar'}
          mensagem={mensagemCopiar ?? 'Copiado'}
          className="size-8 min-h-8 shrink-0 rounded-lg border-transparent bg-transparent text-muted-foreground"
        />
      ) : null}
    </span>
  )
}
