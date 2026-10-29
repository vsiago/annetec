import * as React from 'react'
import { Button as BaseButton, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Botão do console da plataforma. Igual ao `Button` do sistema, com duas
 * diferenças de identidade visual:
 *  - o botão principal (variante padrão) é azul-marinho, não coral: branco
 *    sobre coral tem contraste de ~3,9:1 e não atinge o mínimo para texto de
 *    14px. O coral fica para destaques sem texto pequeno (menu, gráficos);
 *  - o perigo é o vermelho escuro das situações do console (#B42318), para não
 *    se confundir com o coral da marca.
 * O botão do site e do painel do clube continua o de `@/components/ui/button`.
 */
const VARIANT_CLASS = {
  default: 'bg-secondary text-secondary-foreground hover:bg-secondary/90',
  destructive: 'bg-[#B42318] text-white hover:bg-[#B42318]/90 focus-visible:ring-[#B42318]/30',
  link: 'text-secondary',
} as const

function Button({ className, variant, size, ...props }: React.ComponentProps<typeof BaseButton>) {
  const key = variant ?? 'default'
  const brand = key === 'default' || key === 'destructive' || key === 'link' ? VARIANT_CLASS[key] : undefined
  // Alvo de toque mínimo de 40px nos tamanhos de texto (padrão e pequeno).
  const touch = size === undefined || size === null || size === 'default' || size === 'sm' ? 'min-h-10' : undefined
  return <BaseButton variant={variant} size={size} className={cn(brand, touch, className)} {...props} />
}

export { Button, buttonVariants }
