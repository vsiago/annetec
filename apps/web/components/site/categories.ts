import {
  BadgePercent,
  Dumbbell,
  GraduationCap,
  HeartHandshake,
  Pill,
  Salad,
  Smile,
  Stethoscope,
  Store,
  type LucideIcon,
} from 'lucide-react'
import type { Benefit, PartnerCategory } from '@/lib/types'

interface CategoryMeta {
  label: string
  /** Como a categoria entra numa frase: "descontos em consultas e exames". */
  phrase: string
  icon: LucideIcon
}

export const PARTNER_CATEGORIES: Record<PartnerCategory, CategoryMeta> = {
  health: { label: 'Saúde', phrase: 'consultas e exames', icon: Stethoscope },
  dental: { label: 'Odontologia', phrase: 'dentistas', icon: Smile },
  pharmacy: { label: 'Farmácias', phrase: 'farmácias', icon: Pill },
  wellness: { label: 'Bem-estar', phrase: 'academias e bem-estar', icon: Dumbbell },
  food: { label: 'Alimentação', phrase: 'alimentação saudável', icon: Salad },
  education: { label: 'Educação', phrase: 'cursos', icon: GraduationCap },
  other: { label: 'Outros', phrase: 'outros serviços', icon: Store },
}

/** Ordem de exibição: o que mais pesa no orçamento da família vem primeiro. */
export const PARTNER_CATEGORY_ORDER: PartnerCategory[] = [
  'health',
  'dental',
  'pharmacy',
  'wellness',
  'education',
  'food',
  'other',
]

export const BENEFIT_CATEGORIES: Record<Benefit['category'], { label: string; icon: LucideIcon }> = {
  health: { label: 'Saúde', icon: Stethoscope },
  dental: { label: 'Odontologia', icon: Smile },
  pharmacy: { label: 'Farmácia', icon: Pill },
  funeral: { label: 'Assistência familiar', icon: HeartHandshake },
  discount: { label: 'Descontos', icon: BadgePercent },
}

export const BENEFIT_CATEGORY_ORDER: Benefit['category'][] = [
  'health',
  'dental',
  'pharmacy',
  'discount',
  'funeral',
]

/** "consultas e exames, dentistas e farmácias" a partir das categorias da rede. */
export function categoriesPhrase(categories: PartnerCategory[], max = 3): string {
  const phrases = PARTNER_CATEGORY_ORDER.filter(c => c !== 'other' && categories.includes(c))
    .slice(0, max)
    .map(c => PARTNER_CATEGORIES[c].phrase)
  if (phrases.length === 0) return ''
  if (phrases.length === 1) return phrases[0]!
  return `${phrases.slice(0, -1).join(', ')} e ${phrases[phrases.length - 1]}`
}
