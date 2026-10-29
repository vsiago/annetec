'use client'

import { useState } from 'react'
import { CheckCheck, Loader2, MessageSquarePlus, Save } from 'lucide-react'
import {
  complianceChecklistItem,
  type ComplianceChecklistItem,
  type OnboardingProposalDetail,
} from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { runCommand } from '@/components/admin-platform/billing/console-kit'
import { updateComplianceChecklistAction } from '@/lib/actions/platform-onboarding-api'
import { checklistLabel, formatDateTimeBR, formatRelative } from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Itens a conferir pela equipe (§0.6: aprovar exige todos). Cada item salva na
 * hora — marcar é uma decisão, não um rascunho — e registra quem e quando.
 * `pep_due_diligence` só entra quando há pessoa politicamente exposta.
 */
export function ChecklistPanel({
  proposal,
  onUpdated,
  editable,
}: {
  proposal: OnboardingProposalDetail
  onUpdated: (detail: OnboardingProposalDetail) => void
  editable: boolean
}) {
  const [saving, setSaving] = useState<ComplianceChecklistItem | 'all' | null>(null)
  const [noteFor, setNoteFor] = useState<ComplianceChecklistItem | null>(null)
  const [noteText, setNoteText] = useState('')

  const items = complianceChecklistItem.options.filter(item => item !== 'pep_due_diligence' || proposal.hasPep)
  const checked = items.filter(item => proposal.checklist?.[item]?.checked).length
  const pct = items.length === 0 ? 0 : Math.round((checked / items.length) * 100)

  const save = async (
    changes: { item: ComplianceChecklistItem; checked: boolean; note?: string }[],
    target: ComplianceChecklistItem | 'all',
    message?: string,
  ) => {
    setSaving(target)
    const detail = await runCommand(updateComplianceChecklistAction(proposal.id, { items: changes }), message)
    setSaving(null)
    if (detail) onUpdated(detail)
    return !!detail
  }

  const toggle = (item: ComplianceChecklistItem, value: boolean) => {
    const current = proposal.checklist?.[item]
    void save([{ item, checked: value, note: current?.note ?? undefined }], item)
  }

  const markAll = () => {
    const pending = items.filter(item => !proposal.checklist?.[item]?.checked)
    if (pending.length === 0) return
    void save(
      pending.map(item => ({ item, checked: true, note: proposal.checklist?.[item]?.note ?? undefined })),
      'all',
      'Todos os itens marcados',
    )
  }

  const openNote = (item: ComplianceChecklistItem) => {
    setNoteFor(item)
    setNoteText(proposal.checklist?.[item]?.note ?? '')
  }

  const saveNote = async (item: ComplianceChecklistItem) => {
    const ok = await save(
      [{ item, checked: proposal.checklist?.[item]?.checked ?? false, note: noteText.trim() || undefined }],
      item,
      'Nota salva',
    )
    if (ok) setNoteFor(null)
  }

  return (
    <Card className="gap-4 shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Itens a conferir</CardTitle>
        <CardDescription>
          {checked} de {items.length} itens conferidos
          {proposal.hasPep ? ' · inclui a conferência da pessoa politicamente exposta' : ''}
        </CardDescription>
        {editable && checked < items.length && (
          <CardAction>
            <Button variant="ghost" size="sm" className="gap-2" onClick={markAll} disabled={saving !== null}>
              {saving === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              Marcar todos os itens
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={pct} className={cn('h-1.5', pct === 100 && '[&>div]:bg-emerald-500')} />
        <ul className="space-y-1">
          {items.map(item => {
            const entry = proposal.checklist?.[item]
            const isSaving = saving === item
            const isPep = item === 'pep_due_diligence'
            return (
              <li
                key={item}
                className={cn(
                  'rounded-lg border border-transparent px-3 py-2.5 transition-colors',
                  entry?.checked ? 'bg-emerald-50/50 dark:bg-emerald-500/5' : 'hover:bg-muted/40',
                  isPep && !entry?.checked && 'border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Checkbox
                        id={`check-${item}`}
                        checked={!!entry?.checked}
                        disabled={!editable || saving !== null}
                        onCheckedChange={value => toggle(item, value === true)}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={`check-${item}`}
                      className={cn('text-sm', editable ? 'cursor-pointer' : 'cursor-default', entry?.checked && 'text-foreground')}
                    >
                      {checklistLabel(item)}
                    </label>
                    {entry?.checked && entry.checkedAt && (
                      <p className="text-xs text-muted-foreground" title={formatDateTimeBR(entry.checkedAt)}>
                        Conferido{entry.checkedBy ? ` por ${entry.checkedBy}` : ''} {formatRelative(entry.checkedAt)}
                      </p>
                    )}
                    {entry?.note && noteFor !== item && (
                      <p className="mt-1 rounded-md bg-muted/60 px-2 py-1 text-xs text-foreground">{entry.note}</p>
                    )}
                    {noteFor === item && (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          value={noteText}
                          onChange={event => setNoteText(event.target.value)}
                          rows={2}
                          maxLength={500}
                          placeholder="Ex.: poderes conferidos no art. 12 do estatuto"
                          autoFocus
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setNoteFor(null)} disabled={isSaving}>
                            Cancelar
                          </Button>
                          <Button size="sm" className="gap-1.5" onClick={() => saveNote(item)} disabled={isSaving}>
                            <Save className="h-3.5 w-3.5" />
                            Salvar nota
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  {editable && noteFor !== item && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openNote(item)}
                      disabled={saving !== null}
                      aria-label="Adicionar nota ao item"
                      title="Adicionar nota"
                    >
                      <MessageSquarePlus className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
