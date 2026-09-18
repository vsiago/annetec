'use client'

import { useMemo, useState } from 'react'
import {
  Accessibility,
  Building2,
  CircleCheckBig,
  CircleX,
  FileText,
  IdCard,
  Mail,
  MapPin,
  MoreHorizontal,
  ParkingSquare,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Star,
  Stethoscope,
  UserRound,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/dashboard/page-header'
import { SectionTab, SectionTabsList } from '@/components/dashboard/section-tabs'
import { StatCard } from '@/components/dashboard/stat-card'
import {
  FilterSelect,
  SearchInput,
  StatusPill,
  TableFooter,
} from '@/components/dashboard/table-controls'
import { buildClinics, type MockClinic } from '@/lib/mock-operations'
import { cn } from '@/lib/utils'

const kindMeta: Record<MockClinic['kind'], { label: string; className: string }> = {
  propria: { label: 'Própria', className: 'bg-rose-50 text-rose-700' },
  credenciada: { label: 'Credenciada', className: 'bg-sky-50 text-sky-700' },
}

export default function AdminClinicasPage() {
  const clinics = useMemo(() => buildClinics(), [])

  const [tab, setTab] = useState('todas')
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('all')
  const [city, setCity] = useState('all')
  const [specialty, setSpecialty] = useState('all')
  const [eligibility, setEligibility] = useState('all')
  const [perPage, setPerPage] = useState('10')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const cities = useMemo(() => [...new Set(clinics.map(c => c.city))].sort(), [clinics])
  const specialties = useMemo(
    () => [...new Set(clinics.flatMap(c => c.specialties))].sort(),
    [clinics],
  )

  const own = clinics.filter(c => c.kind === 'propria')
  const accredited = clinics.filter(c => c.kind === 'credenciada')
  const favorites = clinics.filter(c => c.favorite)
  const onlineRate = Math.round(
    (clinics.filter(c => c.eligibility === 'online').length / Math.max(clinics.length, 1)) * 100,
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return clinics.filter(clinic => {
      if (tab === 'proprias' && clinic.kind !== 'propria') return false
      if (tab === 'credenciadas' && clinic.kind !== 'credenciada') return false
      if (tab === 'favoritas' && !clinic.favorite) return false
      if (kind !== 'all' && clinic.kind !== kind) return false
      if (city !== 'all' && clinic.city !== city) return false
      if (specialty !== 'all' && !clinic.specialties.includes(specialty)) return false
      if (eligibility !== 'all' && clinic.eligibility !== eligibility) return false
      if (!term) return true
      return [clinic.name, clinic.city, clinic.address, ...clinic.specialties].some(field =>
        field.toLowerCase().includes(term),
      )
    })
  }, [clinics, tab, search, kind, city, specialty, eligibility])

  const size = Number(perPage)
  const totalPages = Math.max(1, Math.ceil(filtered.length / size))
  const currentPage = Math.min(page, totalPages)
  const visible = filtered.slice((currentPage - 1) * size, currentPage * size)
  const selected = clinics.find(c => c.id === selectedId) ?? visible[0] ?? null

  function withPageReset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clínicas e Elegibilidade"
        description="Gerencie a rede própria e credenciada, serviços e regras de elegibilidade."
        mock
      >
        <Button variant="outline" className="h-11 gap-2">
          <FileText className="h-4 w-4" />
          Ver protocolo de atendimento
        </Button>
        <Button className="h-11 gap-2 px-5">
          <Plus className="h-4 w-4" />
          Nova Clínica
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Building2}
          accent="primary"
          value={own.length}
          label="Clínicas próprias"
          delta={{ value: '25%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={Users}
          accent="info"
          value={accredited.length}
          label="Clínicas credenciadas"
          delta={{ value: '12%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={Stethoscope}
          accent="success"
          value={specialties.length}
          label="Especialidades"
          delta={{ value: '6%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={CircleCheckBig}
          accent="warning"
          value={`${onlineRate}%`}
          label="Taxa de elegibilidade"
          delta={{ value: '3 p.p.', direction: 'up' }}
          comparison="vs. mês anterior"
        />
      </div>

      <Card className="gap-0 py-0 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <SearchInput
            value={search}
            onChange={withPageReset(setSearch)}
            placeholder="Buscar por nome, cidade, especialidade..."
          />
          <FilterSelect
            label="Tipo de clínica"
            value={kind}
            onChange={withPageReset(setKind)}
            allLabel="Todos"
            options={Object.entries(kindMeta).map(([value, meta]) => ({ value, label: meta.label }))}
          />
          <FilterSelect
            label="Cidade"
            value={city}
            onChange={withPageReset(setCity)}
            allLabel="Todas"
            options={cities.map(item => ({ value: item, label: item }))}
          />
          <FilterSelect
            label="Especialidade"
            value={specialty}
            onChange={withPageReset(setSpecialty)}
            allLabel="Todas"
            options={specialties.map(item => ({ value: item, label: item }))}
          />
          <FilterSelect
            label="Elegibilidade"
            value={eligibility}
            onChange={withPageReset(setEligibility)}
            allLabel="Todas"
            options={[
              { value: 'online', label: 'Online' },
              { value: 'manual', label: 'Manual' },
            ]}
          />
        </div>
      </Card>

      <Tabs value={tab} onValueChange={withPageReset(setTab)} className="gap-5">
        <SectionTabsList>
          <SectionTab value="todas">Todas</SectionTab>
          <SectionTab value="proprias" badge={own.length}>
            Próprias
          </SectionTab>
          <SectionTab value="credenciadas" badge={accredited.length}>
            Credenciadas
          </SectionTab>
          <SectionTab value="favoritas" badge={favorites.length}>
            Favoritas
          </SectionTab>
        </SectionTabsList>

        <TabsContent value={tab} className="m-0">
          <div className="grid gap-5 xl:grid-cols-12">
            <Card className="gap-0 py-0 shadow-sm xl:col-span-8">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                        <th className="w-10 py-3 pl-4">
                          <Checkbox aria-label="Selecionar todas" />
                        </th>
                        <th className="px-4 py-3 font-medium">Nome da Clínica</th>
                        <th className="px-4 py-3 font-medium">Tipo</th>
                        <th className="px-4 py-3 font-medium">Cidade</th>
                        <th className="px-4 py-3 font-medium">Especialidades</th>
                        <th className="px-4 py-3 font-medium">Elegibilidade</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 text-right font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-muted-foreground">
                            Nenhuma clínica encontrada com os filtros atuais.
                          </td>
                        </tr>
                      )}
                      {visible.map(clinic => (
                        <tr
                          key={clinic.id}
                          onClick={() => setSelectedId(clinic.id)}
                          className={cn(
                            'cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40',
                            selected?.id === clinic.id && 'bg-primary/5',
                          )}
                        >
                          <td className="py-3 pl-4" onClick={event => event.stopPropagation()}>
                            <Checkbox aria-label={`Selecionar ${clinic.name}`} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span
                                className={cn(
                                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                                  kindMeta[clinic.kind].className,
                                )}
                              >
                                <Building2 className="h-4 w-4" />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-primary">{clinic.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {clinic.address}
                                </span>
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill {...kindMeta[clinic.kind]} />
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{clinic.city}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            <span className="block truncate">{clinic.specialties[0]}</span>
                            {clinic.specialties.length > 1 && (
                              <span className="text-xs">+{clinic.specialties.length - 1}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1.5 text-xs font-medium',
                                clinic.eligibility === 'online' ? 'text-emerald-600' : 'text-slate-500',
                              )}
                            >
                              {clinic.eligibility === 'online' ? (
                                <CircleCheckBig className="h-4 w-4" />
                              ) : (
                                <CircleX className="h-4 w-4" />
                              )}
                              {clinic.eligibility === 'online' ? 'Online' : 'Manual'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill
                              label={clinic.active ? 'Ativa' : 'Inativa'}
                              className={
                                clinic.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                              }
                            />
                          </td>
                          <td className="px-4 py-3 text-right" onClick={event => event.stopPropagation()}>
                            <ClinicActions />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>

              <TableFooter
                page={currentPage}
                perPage={perPage}
                total={filtered.length}
                noun="clínicas"
                onPageChange={setPage}
                onPerPageChange={withPageReset(setPerPage)}
              />
            </Card>

            <div className="xl:col-span-4">{selected && <ClinicPanel clinic={selected} />}</div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ClinicPanel({ clinic }: { clinic: MockClinic }) {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <div className="relative flex h-32 items-center justify-center rounded-t-xl bg-linear-to-br from-primary/15 to-primary/5">
        <Building2 className="h-10 w-10 text-primary/50" />
        <span className="absolute right-3 top-3 flex items-center gap-2">
          <StatusPill
            label={clinic.active ? 'Ativa' : 'Inativa'}
            className={clinic.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}
          />
          <span
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-lg bg-card shadow-sm',
              clinic.favorite ? 'text-amber-500' : 'text-muted-foreground',
            )}
          >
            <Star className={cn('h-4 w-4', clinic.favorite && 'fill-current')} />
          </span>
        </span>
      </div>

      <div className="space-y-1 p-4 pb-0">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-base font-bold text-foreground">{clinic.name}</h2>
          <StatusPill {...kindMeta[clinic.kind]} />
        </div>
        <p className="text-xs text-muted-foreground">{clinic.tagline}</p>
      </div>

      <Tabs defaultValue="info" className="gap-0">
        <SectionTabsList className="mt-3 px-2">
          <SectionTab value="info">Informações</SectionTab>
          <SectionTab value="especialidades">Especialidades</SectionTab>
          <SectionTab value="horarios">Horários</SectionTab>
        </SectionTabsList>

        <TabsContent value="info" className="m-0 space-y-2.5 p-4 text-sm">
          <PanelRow icon={MapPin} label="Endereço">
            {clinic.address}
            <br />
            <span className="text-muted-foreground">{clinic.city}</span>
          </PanelRow>
          <PanelRow icon={Phone} label="Telefone">{clinic.phone}</PanelRow>
          <PanelRow icon={Mail} label="E-mail">{clinic.email}</PanelRow>
          <PanelRow icon={Building2} label="Tipo">{kindMeta[clinic.kind].label}</PanelRow>
          <PanelRow icon={IdCard} label="CNPJ">{clinic.cnpj}</PanelRow>
          <PanelRow icon={UserRound} label="Responsável">{clinic.manager}</PanelRow>
          <PanelRow icon={ShieldCheck} label="Elegibilidade">
            <span className={clinic.eligibility === 'online' ? 'text-emerald-600' : 'text-slate-500'}>
              {clinic.eligibility === 'online' ? 'Online (tempo real)' : 'Manual'}
            </span>
          </PanelRow>
          <PanelRow icon={Stethoscope} label="Atendimento">{clinic.service}</PanelRow>
          <PanelRow icon={ParkingSquare} label="Estacionamento">{clinic.parking ? 'Sim' : 'Não'}</PanelRow>
          <PanelRow icon={Accessibility} label="Acessibilidade">
            {clinic.accessibility ? 'Sim' : 'Não'}
          </PanelRow>
        </TabsContent>

        <TabsContent value="especialidades" className="m-0 space-y-2 p-4">
          {clinic.specialties.map(item => (
            <div
              key={item}
              className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2.5 text-sm text-foreground"
            >
              <Stethoscope className="h-4 w-4 text-primary" />
              {item}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="horarios" className="m-0 space-y-2 p-4 text-sm">
          {[
            ['Segunda a sexta', '07h às 19h'],
            ['Sábado', '08h às 13h'],
            ['Domingo e feriados', 'Fechado'],
          ].map(([day, hours]) => (
            <div
              key={day}
              className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2.5"
            >
              <span className="text-foreground">{day}</span>
              <span className="text-muted-foreground">{hours}</span>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <div className="flex gap-2 border-t border-border p-4">
        <Button variant="outline" className="flex-1 gap-2">
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
        <Button className="flex-1 gap-2">
          <MapPin className="h-4 w-4" />
          Ver no mapa
        </Button>
      </div>
    </Card>
  )
}

function PanelRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Phone
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 wrap-break-word text-right text-foreground">{children}</span>
    </div>
  )
}

function ClinicActions() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Ações da clínica</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem>
          <Pencil className="mr-2 h-4 w-4" />
          Editar clínica
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Star className="mr-2 h-4 w-4" />
          Marcar como favorita
        </DropdownMenuItem>
        <DropdownMenuItem>
          <ShieldCheck className="mr-2 h-4 w-4" />
          Regras de elegibilidade
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive">Desativar</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
