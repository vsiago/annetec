'use client'

import { AlertTriangle, Paperclip, Stethoscope } from 'lucide-react'
import { attachDocumentInput, declarePathologyInput, type Contract } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import {
  FieldGrid,
  SelectField,
  TextField,
  TextareaField,
  WizardDialog,
  WizardSuccess,
  successButton,
  useWizard,
  zodFields,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'

/**
 * Ações administrativas da ficha do cliente (/admin/clientes/[codigo]):
 * anexar documento, declarar patologia e registrar pendência. Cada uma abre num
 * assistente de uma etapa. `onSubmit` devolve a mensagem de erro da API, ou
 * `null` quando deu certo (quem chama só envia; o assistente mostra o resultado).
 */

type SubmitResult = string | null

function CloseAndAgain({ onClose, onAgain, againLabel }: { onClose: () => void; onAgain: () => void; againLabel: string }) {
  return (
    <>
      <Button variant="outline" className={successButton.secondary} onClick={onClose}>
        Fechar
      </Button>
      <Button className={successButton.primary} onClick={onAgain}>
        {againLabel}
      </Button>
    </>
  )
}

// ---------------------------------------------------------------------------
// Anexar documento
// ---------------------------------------------------------------------------

interface AttachValues {
  fileName: string
  fileUrl: string
}

const ATTACH_STEPS: readonly WizardStep<AttachValues>[] = [
  {
    id: 'documento',
    title: 'Documento',
    icon: Paperclip,
    fields: ['fileName', 'fileUrl'],
    validate: zodFields<AttachValues>(attachDocumentInput.pick({ fileName: true, fileUrl: true }), {
      input: v => ({ fileName: v.fileName.trim(), fileUrl: v.fileUrl.trim() }),
      messages: {
        fileName: { required: 'Informe o nome do arquivo, como RG.pdf.' },
        fileUrl: {
          required: 'Informe o link do arquivo.',
          invalid: 'Informe um link completo, começando com https://.',
        },
      },
    }),
  },
]
const ATTACH_EMPTY: AttachValues = { fileName: '', fileUrl: '' }

export function AttachDocumentDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (fileName: string, fileUrl: string) => Promise<SubmitResult>
}) {
  const wizard = useWizard<AttachValues>({
    initialValues: ATTACH_EMPTY,
    steps: ATTACH_STEPS,
    onSubmit: async values => {
      // Envia o mesmo valor que foi validado (sem espaços nas pontas): vai cru para a Digital Saúde.
      const error = await onSubmit(values.fileName.trim(), values.fileUrl.trim())
      return error ? { ok: false, message: error } : { ok: true }
    },
  })

  return (
    <>
      <Button variant="outline" className="h-10 justify-start" onClick={() => onOpenChange(true)}>
        <Paperclip aria-hidden="true" /> Anexar documento
      </Button>
      <WizardDialog
        open={open}
        onOpenChange={onOpenChange}
        wizard={wizard}
        icon={Paperclip}
        size="md"
        title="Anexar documento"
        description="Envia o link de um arquivo já hospedado. A Digital Saúde não recebe upload direto."
        submitLabel="Anexar documento"
        submittingLabel="Anexando…"
        renderStep={() => (
          <FieldGrid>
            <TextField
              {...wizard.field('fileName')}
              label="Nome do arquivo"
              required
              span={12}
              placeholder="RG.pdf"
              autoComplete="off"
            />
            <TextField
              {...wizard.field('fileUrl')}
              label="Link do arquivo"
              hint="Endereço completo do arquivo, começando com https://."
              required
              span={12}
              type="url"
              inputMode="url"
              placeholder="https://..."
              autoComplete="off"
            />
          </FieldGrid>
        )}
        renderSuccess={() => (
          <WizardSuccess
            title="Documento anexado"
            description="O documento foi anexado ao contrato."
            actions={
              <CloseAndAgain
                onClose={() => onOpenChange(false)}
                onAgain={() => wizard.reset()}
                againLabel="Anexar outro documento"
              />
            }
          />
        )}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Declarar patologia
// ---------------------------------------------------------------------------

interface PathologyValues {
  beneficiaryUpstreamCodigo: string
  name: string
  description: string
}

const PATHOLOGY_STEPS: readonly WizardStep<PathologyValues>[] = [
  {
    id: 'patologia',
    title: 'Patologia',
    icon: Stethoscope,
    fields: ['beneficiaryUpstreamCodigo', 'name', 'description'],
    validate: zodFields<PathologyValues>(
      declarePathologyInput.pick({ beneficiaryUpstreamCodigo: true, name: true, description: true }),
      {
        input: v => ({
          beneficiaryUpstreamCodigo: v.beneficiaryUpstreamCodigo,
          name: v.name.trim(),
          description: v.description || undefined,
        }),
        messages: {
          beneficiaryUpstreamCodigo: 'Escolha o beneficiário.',
          name: { required: 'Informe o nome da patologia, como Hipertensão.' },
        },
      },
    ),
  },
]
const PATHOLOGY_EMPTY: PathologyValues = { beneficiaryUpstreamCodigo: '', name: '', description: '' }

export function DeclarePathologyDialog({
  open,
  onOpenChange,
  beneficiaries,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  beneficiaries: Contract['beneficiaries']
  onSubmit: (input: { beneficiaryUpstreamCodigo: string; name: string; description?: string }) => Promise<SubmitResult>
}) {
  const wizard = useWizard<PathologyValues>({
    initialValues: PATHOLOGY_EMPTY,
    steps: PATHOLOGY_STEPS,
    onSubmit: async values => {
      const error = await onSubmit({
        beneficiaryUpstreamCodigo: values.beneficiaryUpstreamCodigo,
        name: values.name.trim(),
        description: values.description.trim() || undefined,
      })
      return error ? { ok: false, message: error } : { ok: true }
    },
  })

  const options = beneficiaries
    .filter(b => b.upstreamCodigo)
    .map(b => ({ value: b.upstreamCodigo as string, label: b.name }))

  return (
    <>
      <Button variant="outline" className="h-10 justify-start" onClick={() => onOpenChange(true)}>
        <Stethoscope aria-hidden="true" /> Declarar patologia
      </Button>
      <WizardDialog
        open={open}
        onOpenChange={onOpenChange}
        wizard={wizard}
        icon={Stethoscope}
        size="md"
        title="Declarar patologia"
        description="Declaração de saúde do beneficiário, registrada no ERP."
        submitLabel="Declarar patologia"
        submittingLabel="Declarando…"
        renderStep={() => (
          <FieldGrid>
            <SelectField
              {...wizard.field('beneficiaryUpstreamCodigo')}
              label="Beneficiário"
              required
              span={12}
              options={options}
              placeholder="Escolha o beneficiário"
            />
            <TextField
              {...wizard.field('name')}
              label="Nome da patologia"
              required
              span={12}
              placeholder="Hipertensão"
              autoComplete="off"
            />
            <TextareaField {...wizard.field('description')} label="Descrição" optional span={12} rows={3} />
          </FieldGrid>
        )}
        renderSuccess={() => (
          <WizardSuccess
            title="Patologia declarada"
            description="A declaração foi registrada no ERP."
            actions={
              <CloseAndAgain
                onClose={() => onOpenChange(false)}
                onAgain={() => wizard.reset()}
                againLabel="Declarar outra patologia"
              />
            }
          />
        )}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Registrar pendência
// ---------------------------------------------------------------------------

interface PendencyValues {
  pendencyCode: string
}

// A API não tem schema próprio para a pendência: a regra é só "código preenchido".
const PENDENCY_STEPS: readonly WizardStep<PendencyValues>[] = [
  {
    id: 'pendencia',
    title: 'Pendência',
    icon: AlertTriangle,
    fields: ['pendencyCode'],
    validate: v => (v.pendencyCode.trim() === '' ? { pendencyCode: 'Informe o código da pendência.' } : {}),
  },
]
const PENDENCY_EMPTY: PendencyValues = { pendencyCode: '' }

export function RegisterPendencyDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (pendencyCode: string) => Promise<SubmitResult>
}) {
  const wizard = useWizard<PendencyValues>({
    initialValues: PENDENCY_EMPTY,
    steps: PENDENCY_STEPS,
    onSubmit: async values => {
      const error = await onSubmit(values.pendencyCode.trim())
      return error ? { ok: false, message: error } : { ok: true }
    },
  })

  return (
    <>
      <Button variant="outline" className="h-10 justify-start" onClick={() => onOpenChange(true)}>
        <AlertTriangle aria-hidden="true" /> Registrar pendência
      </Button>
      <WizardDialog
        open={open}
        onOpenChange={onOpenChange}
        wizard={wizard}
        icon={AlertTriangle}
        size="md"
        title="Registrar pendência"
        description="Registra no contrato uma pendência já cadastrada na Digital Saúde."
        submitLabel="Registrar pendência"
        submittingLabel="Registrando…"
        renderStep={() => (
          <FieldGrid>
            <TextField
              {...wizard.field('pendencyCode')}
              label="Código da pendência"
              hint="Use o código como está cadastrado na Digital Saúde."
              required
              span={12}
              autoComplete="off"
            />
          </FieldGrid>
        )}
        renderSuccess={() => (
          <WizardSuccess
            title="Pendência registrada"
            description="A pendência foi registrada no contrato."
            actions={
              <Button variant="outline" className={successButton.secondary} onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            }
          />
        )}
      />
    </>
  )
}
