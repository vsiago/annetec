import Link from 'next/link'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { HEALTH_BAND_TEXT, type AttentionClub } from './derive'
import { formatCount, plural } from './format'

export interface HealthCounts {
  healthy: number
  attention: number
  risk: number
}

const SEGMENTS = [
  { key: 'healthy', label: 'boa', color: '#12B76A' },
  { key: 'attention', label: 'atenção', color: '#FEC84B' },
  { key: 'risk', label: 'crítica', color: '#B42318' },
] as const

/**
 * Saúde dos clubes: barra empilhada Boa/Atenção/Crítica (com as contagens
 * escritas, nunca só a cor) e os clubes que mais pedem atenção.
 */
export function ClubHealthCard({ counts, attention }: { counts: HealthCounts; attention: AttentionClub[] }) {
  const total = counts.healthy + counts.attention + counts.risk
  const description = `${plural(counts.healthy, 'clube', 'clubes')} com saúde boa, ${formatCount(counts.attention)} em atenção e ${formatCount(counts.risk)} ${counts.risk === 1 ? 'crítico' : 'críticos'}`

  return (
    <section
      aria-labelledby="home-saude"
      className="flex min-w-0 flex-[1_1_320px] flex-col gap-[18px] rounded-2xl border border-border bg-white p-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="home-saude" className="m-0 text-base font-bold text-foreground">
          Saúde dos clubes
        </h2>
        <Link
          href="/admin/inquilinos"
          className="text-[13px] font-semibold text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
        >
          Ver todos
        </Link>
      </div>

      {total === 0 ? (
        <p className="m-0 py-6 text-sm text-muted-foreground">Nenhum clube cadastrado ainda.</p>
      ) : (
        <>
          <div role="img" aria-label={description} className="flex h-3 gap-[3px] overflow-hidden rounded-full">
            {SEGMENTS.filter(segment => counts[segment.key] > 0).map(segment => (
              <div
                key={segment.key}
                style={{ flexGrow: counts[segment.key], flexBasis: 0, backgroundColor: segment.color }}
              />
            ))}
          </div>
          <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[13px] text-[#344054]">
            {SEGMENTS.map(segment => (
              <li key={segment.key} className="inline-flex items-center gap-1.5">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: segment.color }}
                  aria-hidden="true"
                />
                {formatCount(counts[segment.key])} {segment.label}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="flex flex-col">
        <p className="m-0 mb-1 text-[13px] font-medium text-muted-foreground">Pedem atenção</p>
        {attention.length === 0 ? (
          <p className="m-0 py-3 text-sm text-muted-foreground">Nenhum clube pede atenção agora.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {attention.map(club => {
              const band = HEALTH_BAND_TEXT[club.band]
              return (
                <li key={club.id} className="border-b border-[#EEF0F3] last:border-b-0">
                  <Link
                    href={`/admin/inquilinos/${encodeURIComponent(club.id)}`}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-md py-3 text-foreground no-underline hover:bg-[#F9FAFB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <strong className="truncate text-sm">{club.name}</strong>
                      <span className="text-[13px] text-muted-foreground">{club.reason}</span>
                    </span>
                    <StatusPill tone={band.tone}>{band.label}</StatusPill>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
