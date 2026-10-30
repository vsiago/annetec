/**
 * Assistente de cadastro do console da plataforma (/admin)
 * =========================================================
 *
 * QUANDO USAR
 * -----------
 * Todo cadastro ou edição do console abre neste modal — nada de formulário
 * solto numa página estreita nem de `Dialog` do shadcn com rolagem comprida.
 *  - Várias etapas (`size="lg"`, padrão): cadastros com mais de ~6 campos ou
 *    com assuntos diferentes (clube, plano, adesão). Ganha trilha, revisão e
 *    tela de sucesso.
 *  - Uma etapa (`size="md"`): cadastros curtos (1 a ~5 campos: responsável,
 *    vendedor, interação). Mesmos campos, mesmo rodapé, sem trilha nem revisão.
 *  - Decisão simples (aprovar, recusar, desativar) NÃO é cadastro: continua
 *    como diálogo de confirmação.
 *
 * COMO USAR
 * ---------
 *   const wizard = useWizard<Values>({
 *     initialValues: EMPTY,
 *     steps: [
 *       {
 *         id: 'clube', title: 'Clube', icon: Building2,
 *         description: 'Como o clube aparece no site e nos documentos.',
 *         fields: ['name', 'slug'],
 *         // Derive da regra da API: .pick()/.shape/.merge() do schema de entrada.
 *         validate: zodFields(createTenantInput.pick({ name: true, slug: true }), {
 *           messages: { name: { required: 'Informe o nome do clube.' } },
 *         }),
 *       },
 *       …
 *     ],
 *     onSubmit: async values => {
 *       const result = await createTenantAction(toPayload(values))
 *       if (!result.success) {
 *         // Caminhos da API ('address.cep') → campos; o assistente leva à etapa certa.
 *         return { ok: false, message: result.error, fieldErrors: apiFieldErrors(result.fieldErrors, FIELDS) }
 *       }
 *       setCreated(result.data)
 *       return { ok: true }
 *     },
 *   })
 *
 *   <WizardDialog
 *     open={open} onOpenChange={setOpen} wizard={wizard}
 *     icon={Building2} title="Cadastrar clube" description="…"
 *     submitLabel="Cadastrar clube" submittingLabel="Cadastrando…"
 *     renderStep={id => id === 'clube' ? (
 *       <FieldGrid>
 *         <TextField {...wizard.field('name')} label="Nome do clube" required span={6} />
 *       </FieldGrid>
 *     ) : …}
 *     renderReview={() => <ReviewList>…</ReviewList>}
 *     renderSuccess={() => <WizardSuccess title="Clube cadastrado" actions={…} />}
 *   />
 *
 * O QUE O ASSISTENTE FAZ SOZINHO
 * ------------------------------
 *  - Valida ao digitar (300 ms depois da última tecla) e ao sair do campo;
 *    mostra o erro com ícone e o ✓ verde no campo preenchido e válido.
 *  - "Continuar" só avança com a etapa válida. Com erro: aviso no topo, foco
 *    e rolagem até o 1º campo inválido, etapa marcada com erro na trilha.
 *  - Enter avança (Ctrl/⌘ + Enter também dentro de áreas de texto); Esc fecha.
 *  - Trilha: clicar numa etapa concluída volta para ela; "Editar" na revisão.
 *  - Envio: botão em "carregando"; erro da API no topo da etapa do campo.
 *  - Fechar com algo preenchido pergunta "Descartar o cadastro?".
 *  - Foco preso no modal, foco no 1º campo de cada etapa, anúncios em
 *    `aria-live` (troca de etapa, erros, sucesso).
 *
 * PEÇAS
 * -----
 *  - `useWizard`, `WizardDialog`            — estado e moldura.
 *  - `FieldGrid` (12 colunas → 1 no celular), `FieldSection`, `Notice`.
 *  - Campos: `TextField` (máscara, prefixo "R$", sufixo "%", contador),
 *    `TextareaField`, `SelectField`, `ChoiceField` (cartões), `SwitchField`,
 *    `ChipsField`, `ColorField`.
 *  - Revisão: `ReviewList`, `ReviewSection`, `ReviewItem`.
 *  - Sucesso: `WizardSuccess`, `SecretValue` (senha com "Copiar").
 *  - Validação: `zodFields`, `combineValidators`, `apiFieldErrors`.
 *  - Máscaras: `maskCnpj`, `maskCpf`, `maskPhone`, `maskCep`, `maskMoney`,
 *    `maskDecimal`, `maskInteger`, `maskDigits` e as leituras `parse*`.
 *
 * Cores: botões em marinho (`secondary`); coral (`primary`) só como destaque
 * (etapa atual, linha de progresso); `accent` nos fundos suaves; verde
 * #067647 e vermelho #B42318 nos estados.
 */

export { useWizard } from './use-wizard'
export type { FieldBinding, StepState, UseWizardOptions, Wizard, WizardStep, WizardStepView, WizardSubmitResult } from './use-wizard'
export { WizardDialog } from './wizard-dialog'
export type { WizardDialogProps } from './wizard-dialog'
export { WizardStepper } from './wizard-stepper'
export {
  ChipsField,
  ChoiceField,
  ColorField,
  FieldGrid,
  FieldSection,
  Notice,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
} from './wizard-fields'
export type { ChoiceOption, FieldSpan, SelectOption } from './wizard-fields'
export { ReviewItem, ReviewList, ReviewSection } from './wizard-review'
export { SecretValue, WizardSuccess, successButton } from './wizard-success'
export { apiFieldErrors, combineValidators, isEmptyValue, readableMessage, zodFields } from './validation'
export type { FieldErrors, FieldKey, FieldMessage, FieldMessages } from './validation'
export * from './masks'
export { useCepLookup } from './lookups'
export type { CepAddress, CepLookupState } from './lookups'
