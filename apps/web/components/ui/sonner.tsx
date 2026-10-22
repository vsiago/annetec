'use client'

import { useTheme } from 'next-themes'
import { Toaster as Sonner, ToasterProps } from 'sonner'

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          // Um pouco mais largo que o padrão (356px): cabe o toast de uma linha
          // do backoffice ("MapCard2 · Pagamento R$ 49,90 · Ver detalhes").
          '--width': '420px',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
