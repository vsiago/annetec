import { cn } from '@/lib/utils'

/**
 * Bolinha de presença. Verde = online, cinza = offline. Nunca só a cor:
 * com `rotulo` mostra "Online"/"Offline" ao lado; sem ele, deixa o texto
 * para leitores de tela.
 */
export function PresencaDot({
  online,
  rotulo = false,
  className,
}: {
  online: boolean
  rotulo?: boolean
  className?: string
}) {
  const texto = online ? 'Online' : 'Offline'
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        aria-hidden="true"
        className={cn('size-2.5 shrink-0 rounded-full ring-2 ring-white', online ? 'bg-[#17B26A]' : 'bg-[#98A2B3]')}
      />
      {rotulo ? (
        <span className={cn('text-xs font-medium', online ? 'text-[#067647]' : 'text-muted-foreground')}>{texto}</span>
      ) : (
        <span className="sr-only">{texto}</span>
      )}
    </span>
  )
}
