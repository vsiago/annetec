'use client'

import { useMemo } from 'react'
import { useTenant } from '@/contexts/tenant-context'
import { lighten, darken } from './theme'

// Recharts takes concrete color values (fill/stroke props), not Tailwind
// classes, so charts can't inherit the tenant theme through CSS. This reads
// the palette straight from the tenant record instead.
export function useChartColors() {
  const { tenant } = useTenant()
  const primary = tenant?.branding.primaryColor ?? '#e84364'
  const secondary = tenant?.branding.secondaryColor ?? '#26365f'

  return useMemo(
    () => ({
      primary,
      secondary,
      // Categorical ramp for pies/stacked series, brand-first then neutrals
      // that stay distinguishable against any tenant palette.
      palette: [secondary, primary, lighten(secondary, 0.35), lighten(primary, 0.35), darken(secondary, 0.25)],
      success: '#22c55e',
      warning: '#f59e0b',
      grid: '#e2e8f0',
    }),
    [primary, secondary]
  )
}
