'use client'

import { useMemo, useState } from 'react'
import { BookOpen, Search, Server, Waypoints } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  annetecModules,
  digitalSaudeModules,
  type ApiModule,
  type HttpMethod,
} from '@/lib/api-dictionary'

// Mesma convenção de cor usada nos cartões de estatística do dashboard
// (bg-{cor}-100 / text-{cor}-600|700): fundo sólido o bastante pra não lavar
// contra o branco do card.
const methodStyles: Record<HttpMethod, string> = {
  GET: 'bg-blue-100 text-blue-700',
  POST: 'bg-green-100 text-green-700',
  PATCH: 'bg-yellow-100 text-yellow-800',
  PUT: 'bg-yellow-100 text-yellow-800',
  DELETE: 'bg-red-100 text-[#B42318]',
}

const usageStyles: Record<string, string> = {
  reutilizável: 'bg-green-100 text-green-700',
  adaptável: 'bg-yellow-100 text-yellow-800',
  disponível: 'bg-gray-200 text-gray-700',
}

function filterModules(modules: ApiModule[], query: string): ApiModule[] {
  const q = query.trim().toLowerCase()
  if (!q) return modules

  return modules
    .map((module) => {
      const moduleMatches = module.title.toLowerCase().includes(q) || module.summary.toLowerCase().includes(q)
      const sections = module.sections
        .map((section) => ({
          ...section,
          items: moduleMatches
            ? section.items
            : section.items.filter(
                (item) =>
                  item.route.toLowerCase().includes(q) ||
                  item.description.toLowerCase().includes(q) ||
                  item.access.toLowerCase().includes(q) ||
                  section.heading.toLowerCase().includes(q),
              ),
        }))
        .filter((section) => section.items.length > 0)

      return { ...module, sections }
    })
    .filter((module) => module.sections.length > 0)
}

function countRoutes(module: ApiModule): number {
  return module.sections.reduce((total, section) => total + section.items.length, 0)
}

export function ApiDictionaryContent() {
  const [query, setQuery] = useState('')

  const filteredAnnetec = useMemo(() => filterModules(annetecModules, query), [query])
  const filteredDigitalSaude = useMemo(() => filterModules(digitalSaudeModules, query), [query])

  const isSearching = query.trim().length > 0
  const openAnnetec = isSearching ? filteredAnnetec.map((m) => m.title) : undefined
  const openDigitalSaude = isSearching ? filteredDigitalSaude.map((m) => m.title) : undefined

  return (
    <PageContainer>
      <PageHeader
        icon={BookOpen}
        title="Dicionário de APIs"
        description="Toda rota que a API Annetec expõe — o que é consumido direto da Digital Saúde (o ERP das administradoras) e o que a Annetec construiu como regra de negócio própria."
      />

      <SectionCard>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar rota, descrição ou papel de acesso..."
            aria-label="Buscar rota, descrição ou papel de acesso"
            className="h-11 rounded-[10px] pl-10"
          />
        </div>
      </SectionCard>

      <Tabs defaultValue="annetec" className="w-full gap-4">
        <TabsList>
          <TabsTrigger value="annetec" className="gap-1.5">
            <Waypoints className="h-4 w-4" />
            Annetec — regras de negócio
          </TabsTrigger>
          <TabsTrigger value="digitalsaude" className="gap-1.5">
            <Server className="h-4 w-4" />
            Digital Saúde — ERP externo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="annetec" className="mt-4">
          <p className="text-sm text-muted-foreground mb-4">
            Montadas em <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">apps/api/src/routes.ts</code>.
            Autenticação, vários clubes, CRM, rede credenciada e financeiro — tudo que a Digital Saúde não
            sabe, mais a camada que adapta o que ela sabe às regras da Annetec.
          </p>
          <ModuleList modules={filteredAnnetec} openValues={openAnnetec} emptyLabel="Nenhuma rota encontrada." />
        </TabsContent>

        <TabsContent value="digitalsaude" className="mt-4">
          <div className="text-sm text-muted-foreground mb-4 space-y-3">
            <p>
              Base <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">digitalsaude.com.br/api/v2</code> —
              autenticada por dois headers (<code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">token</code>{' '}
              + <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">senhaApi</code>), um par por clube.
              Toda resposta de sucesso é um array, mesmo em busca por chave única.
            </p>
            <div className="flex flex-wrap gap-2">
              <LegendBadge tone="reutilizável" text="reutilizável — usada como está" />
              <LegendBadge tone="adaptável" text="adaptável — embrulhada em regra própria" />
              <LegendBadge tone="disponível" text="disponível — mapeada, ainda sem tela" />
            </div>
          </div>
          <ModuleList modules={filteredDigitalSaude} openValues={openDigitalSaude} emptyLabel="Nenhuma rota encontrada." />
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

function LegendBadge({ tone, text }: { tone: string; text: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md ${usageStyles[tone]}`}>
      {text}
    </span>
  )
}

function ModuleList({
  modules,
  openValues,
  emptyLabel,
}: {
  modules: ApiModule[]
  openValues?: string[]
  emptyLabel: string
}) {
  if (modules.length === 0) {
    return <EmptyState framed icon={Search} title={emptyLabel} />
  }

  return (
    <Accordion type="multiple" value={openValues} className="flex flex-col gap-4">
      {modules.map((module) => (
        <SectionCard key={module.title} padded={false} className="overflow-hidden">
          <AccordionItem value={module.title} className="border-0">
            <AccordionTrigger className="hover:no-underline px-6 py-4 [&>svg]:text-muted-foreground">
              <div className="flex items-center gap-3 text-left">
                <div className="flex flex-col">
                  <span className="font-semibold text-foreground">{module.title}</span>
                  <code className="text-xs text-muted-foreground font-mono">{module.prefix}</code>
                </div>
                <Badge variant="secondary" className="ml-1 shrink-0 font-medium">
                  {countRoutes(module)} {countRoutes(module) === 1 ? 'rota' : 'rotas'}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <div className="border-t border-border pt-4">
                <p className="text-sm text-foreground/80 mb-4 leading-relaxed">{module.summary}</p>
                {module.controllerRef && (
                  <p className="text-xs text-muted-foreground mb-4">
                    Código:{' '}
                    <code className="bg-muted px-1.5 py-0.5 rounded font-mono">{module.controllerRef}</code>
                  </p>
                )}
                <div className="space-y-5">
                  {module.sections.map((section) => (
                    <div key={section.heading}>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                        {section.heading}
                      </h4>
                      <div className="space-y-2">
                        {section.items.map((item) => (
                          <div
                            key={`${item.method}-${item.route}`}
                            className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 p-3 rounded-xl bg-muted/60"
                          >
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`text-[10px] font-bold px-2 py-1 rounded ${methodStyles[item.method]}`}
                              >
                                {item.method}
                              </span>
                              <code className="text-xs font-mono text-foreground font-medium">{item.route}</code>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground leading-snug">{item.description}</p>
                            </div>
                            <span
                              className={`text-[10px] font-semibold px-2 py-1 rounded shrink-0 self-start ${
                                usageStyles[item.access] ?? 'bg-secondary/10 text-secondary'
                              }`}
                            >
                              {item.access}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </SectionCard>
      ))}
    </Accordion>
  )
}
