'use client'

import { Landmark, MapPin, UserRound } from 'lucide-react'
import { UFS, cnpj as cnpjSchema, cpf as cpfSchema, email as emailSchema, telefone as telefoneSchema } from '@annetec/contracts'
import {
  FieldSection,
  Notice,
  SelectField,
  TextField,
  maskCep,
  maskCpf,
  maskDigits,
  maskPhone,
  onlyDigits,
  useCepLookup,
  type FieldBinding,
  type FieldErrors,
  type FieldKey,
  type Wizard,
} from '@/components/admin-platform/ui/wizard'

/**
 * Blocos de campos que se repetem nos cadastros da Rede (gerente da corretora,
 * agente, unidade, corretora): dados da pessoa, endereço com busca por CEP e
 * dados de repasse (Pix ou conta). Todos os valores do assistente são texto;
 * a conversão para o contrato da API fica nas funções `*Payload`.
 *
 * Os componentes não conhecem o assistente: recebem `campo(chave)` e
 * `preencher(...)`, montados por `binder(wizard)` e `preenchedor(wizard)`. O
 * `prefixo` permite dois endereços no mesmo assistente (ex.: corretora e gerente).
 */

export type Binder = (chave: string) => FieldBinding<string>
export type Preencher = (patch: Record<string, string>, opcoes?: { reveal?: boolean }) => void

export function binder<V extends object>(wizard: Wizard<V>): Binder {
  return chave => wizard.field(chave as FieldKey<V>) as unknown as FieldBinding<string>
}

export function preenchedor<V extends object>(wizard: Wizard<V>): Preencher {
  return (patch, opcoes) => wizard.setMany(patch as Partial<V>, opcoes)
}

type Texto = Record<string, string>

// ---------------------------------------------------------------------------
// Valores
// ---------------------------------------------------------------------------

export const CHAVES_PESSOA = ['nome', 'email', 'cpf', 'telefone', 'dataNascimento', 'metaMensal'] as const
export const CHAVES_ENDERECO = ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'] as const
export const CHAVES_REPASSE = ['repasseTipo', 'chavePix', 'banco', 'agencia', 'conta', 'titular', 'repasseDocumento'] as const

export const PESSOA_VAZIA = {
  nome: '',
  email: '',
  cpf: '',
  telefone: '',
  dataNascimento: '',
  metaMensal: '',
}

export const ENDERECO_VAZIO = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' }

export const REPASSE_VAZIO = {
  repasseTipo: 'nenhum',
  chavePix: '',
  banco: '',
  agencia: '',
  conta: '',
  titular: '',
  repasseDocumento: '',
}

/** Prefixa as chaves de um bloco de valores ("end_cep"). */
export function prefixar<T extends Record<string, string>>(prefixo: string, valores: T): Record<string, string> {
  return Object.fromEntries(Object.entries(valores).map(([k, v]) => [`${prefixo}${k.charAt(0).toUpperCase()}${k.slice(1)}`, v]))
}

const chave = (prefixo: string, nome: string) => (prefixo ? `${prefixo}${nome.charAt(0).toUpperCase()}${nome.slice(1)}` : nome)

// ---------------------------------------------------------------------------
// Validação (a mesma regra da API, em frases para quem digita)
// ---------------------------------------------------------------------------

function uma<V extends object>(erros: FieldErrors<V>, campo: string, mensagem: string | undefined) {
  if (mensagem) (erros as Record<string, string>)[campo] = mensagem
}

function primeiroErro(schema: { safeParse: (v: unknown) => { success: boolean } }, valor: unknown, mensagem: string): string | undefined {
  return schema.safeParse(valor).success ? undefined : mensagem
}

export function validarPessoa<V extends object>(prefixo = '') {
  return (valores: V): FieldErrors<V> => {
    const v = valores as unknown as Texto
    const k = (n: string) => chave(prefixo, n)
    const erros: FieldErrors<V> = {}
    const nome = (v[k('nome')] ?? '').trim()
    if (!nome) uma(erros, k('nome'), 'Informe o nome completo.')
    else if (nome.length < 2) uma(erros, k('nome'), 'Use pelo menos 2 letras.')
    uma(erros, k('email'), (v[k('email')] ?? '').trim() ? primeiroErro(emailSchema, v[k('email')], 'Informe um e-mail válido, como nome@exemplo.com.br.') : 'Informe o e-mail: é o login da pessoa.')
    uma(erros, k('cpf'), (v[k('cpf')] ?? '').trim() ? primeiroErro(cpfSchema, v[k('cpf')], 'Este CPF não existe. Confira os números digitados.') : 'Informe o CPF.')
    uma(
      erros,
      k('telefone'),
      (v[k('telefone')] ?? '').trim() ? primeiroErro(telefoneSchema, v[k('telefone')], 'Informe o celular com DDD, como (21) 99999-9999.') : 'Informe o celular com DDD.',
    )
    const nasc = v[k('dataNascimento')] ?? ''
    if (nasc && (!/^\d{4}-\d{2}-\d{2}$/.test(nasc) || nasc > new Date().toISOString().slice(0, 10) || nasc < '1900-01-01')) {
      uma(erros, k('dataNascimento'), 'Informe uma data de nascimento válida.')
    }
    const meta = v[k('metaMensal')] ?? ''
    if (meta && Number(onlyDigits(meta)) > 100000) uma(erros, k('metaMensal'), 'Use um valor até 100.000.')
    return erros
  }
}

export function validarEndereco<V extends object>(prefixo = '') {
  return (valores: V): FieldErrors<V> => {
    const v = valores as unknown as Texto
    const erros: FieldErrors<V> = {}
    const cep = onlyDigits(v[chave(prefixo, 'cep')] ?? '')
    if (cep && cep.length !== 8) uma(erros, chave(prefixo, 'cep'), 'Informe o CEP com 8 números.')
    return erros
  }
}

export function validarRepasse<V extends object>() {
  return (valores: V): FieldErrors<V> => {
    const v = valores as unknown as Texto
    const erros: FieldErrors<V> = {}
    if (v.repasseTipo === 'pix' && !(v.chavePix ?? '').trim()) uma(erros, 'chavePix', 'Informe a chave Pix.')
    if (v.repasseTipo === 'conta') {
      for (const [campo, rotulo] of [
        ['banco', 'o banco'],
        ['agencia', 'a agência'],
        ['conta', 'a conta'],
      ] as const) {
        if (!(v[campo] ?? '').trim()) uma(erros, campo, `Informe ${rotulo}.`)
      }
    }
    return erros
  }
}

export function validarCnpj(valor: string): string | undefined {
  if (!valor.trim()) return 'Informe o CNPJ da corretora.'
  return primeiroErro(cnpjSchema, valor, 'Este CNPJ não existe. Confira os números digitados.')
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export function enderecoPayload(v: Texto, prefixo = '') {
  const g = (n: string) => (v[chave(prefixo, n)] ?? '').trim()
  const preenchido = CHAVES_ENDERECO.some(n => g(n) !== '')
  if (!preenchido) return null
  return {
    cep: onlyDigits(g('cep')) || undefined,
    logradouro: g('logradouro') || undefined,
    numero: g('numero') || undefined,
    complemento: g('complemento') || undefined,
    bairro: g('bairro') || undefined,
    cidade: g('cidade') || undefined,
    uf: (UFS as readonly string[]).includes(g('uf')) ? (g('uf') as (typeof UFS)[number]) : null,
  }
}

export function repassePayload(v: Texto) {
  if (v.repasseTipo === 'pix') {
    return { tipo: 'pix' as const, chavePix: (v.chavePix ?? '').trim(), titular: (v.titular ?? '').trim() || undefined }
  }
  if (v.repasseTipo === 'conta') {
    return {
      tipo: 'conta' as const,
      banco: (v.banco ?? '').trim(),
      agencia: (v.agencia ?? '').trim(),
      conta: (v.conta ?? '').trim(),
      titular: (v.titular ?? '').trim() || undefined,
      documento: onlyDigits(v.repasseDocumento ?? '') || undefined,
    }
  }
  return null
}

export function pessoaPayload(v: Texto) {
  const meta = onlyDigits(v.metaMensal ?? '')
  return {
    nome: (v.nome ?? '').trim(),
    email: (v.email ?? '').trim().toLowerCase(),
    cpf: onlyDigits(v.cpf ?? ''),
    telefone: onlyDigits(v.telefone ?? ''),
    dataNascimento: v.dataNascimento ? v.dataNascimento : null,
    endereco: enderecoPayload(v),
    repasse: repassePayload(v),
    metaMensal: meta ? Number(meta) : null,
  }
}

/** Tudo o que a API pode devolver em erro de campo, levado para as chaves do assistente. */
export const ALIAS_API: Record<string, string> = {
  nome: 'nome',
  email: 'email',
  cpf: 'cpf',
  telefone: 'telefone',
  dataNascimento: 'dataNascimento',
  metaMensal: 'metaMensal',
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

export function CamposPessoa({ campo, comMeta = true, emailBloqueado = false }: { campo: Binder; comMeta?: boolean; emailBloqueado?: boolean }) {
  return (
    <FieldSection title="Dados da pessoa" description="Cadastro completo: o acesso e os repasses saem daqui." icon={UserRound}>
      <TextField {...campo('nome')} label="Nome completo" required span={12} maxLength={120} autoComplete="off" />
      <TextField {...campo('cpf')} label="CPF" required span={5} inputMode="numeric" mask={maskCpf} maxLength={14} placeholder="000.000.000-00" />
      <TextField
        {...campo('dataNascimento')}
        label="Data de nascimento"
        optional
        span={7}
        type="date"
        min="1900-01-01"
        max={new Date().toISOString().slice(0, 10)}
      />
      <TextField
        {...campo('email')}
        label="E-mail"
        disabled={emailBloqueado}
        required
        span={7}
        type="email"
        inputMode="email"
        autoComplete="off"
        placeholder="nome@exemplo.com.br"
        hint="É o login. O convite com o acesso vai para este endereço."
      />
      <TextField
        {...campo('telefone')}
        label="Celular"
        required
        span={5}
        type="tel"
        inputMode="tel"
        mask={maskPhone}
        maxLength={15}
        placeholder="(21) 99999-9999"
      />
      {comMeta ? (
        <TextField
          {...campo('metaMensal')}
          label="Meta mensal"
          optional
          span={5}
          inputMode="numeric"
          mask={valor => maskDigits(valor, 6)}
          suffix="vendas/mês"
          hint="Em branco, vale a meta padrão das Regras."
        />
      ) : null}
    </FieldSection>
  )
}

export function CamposEndereco({
  campo,
  preencher,
  prefixo = '',
  titulo = 'Endereço',
  descricao = 'Opcional. Digite o CEP e o resto é preenchido sozinho.',
}: {
  campo: Binder
  preencher: Preencher
  prefixo?: string
  titulo?: string
  descricao?: string
}) {
  const k = (n: string) => chave(prefixo, n)
  const cep = campo(k('cep'))
  const estado = useCepLookup(cep.value, achado =>
    preencher(
      {
        [k('logradouro')]: achado.street,
        [k('bairro')]: achado.neighborhood,
        [k('cidade')]: achado.city,
        [k('uf')]: achado.state,
      },
      { reveal: true },
    ),
  )
  return (
    <FieldSection title={titulo} description={descricao} icon={MapPin}>
      <TextField
        {...cep}
        label="CEP"
        optional
        span={4}
        inputMode="numeric"
        mask={maskCep}
        maxLength={9}
        placeholder="00000-000"
        status={estado === 'loading' ? <span className="text-xs text-muted-foreground">Buscando…</span> : null}
        hint={estado === 'not-found' ? 'CEP não encontrado. Preencha o endereço à mão.' : undefined}
      />
      <TextField {...campo(k('logradouro'))} label="Rua" optional span={8} maxLength={160} autoComplete="off" />
      <TextField {...campo(k('numero'))} label="Número" optional span={3} maxLength={20} autoComplete="off" />
      <TextField {...campo(k('complemento'))} label="Complemento" optional span={9} maxLength={80} autoComplete="off" />
      <TextField {...campo(k('bairro'))} label="Bairro" optional span={5} maxLength={80} autoComplete="off" />
      <TextField {...campo(k('cidade'))} label="Cidade" optional span={5} maxLength={80} autoComplete="off" />
      <SelectField
        {...campo(k('uf'))}
        label="UF"
        optional
        span={2}
        placeholder="UF"
        options={UFS.map(u => ({ value: u, label: u }))}
      />
    </FieldSection>
  )
}

export function CamposRepasse({ campo, tipo }: { campo: Binder; tipo: string }) {
  return (
    <FieldSection
      title="Repasse da comissão"
      description="Para onde vai o pagamento das comissões. Pode ficar para depois."
      icon={Landmark}
    >
      <SelectField
        {...campo('repasseTipo')}
        label="Forma de repasse"
        span={5}
        options={[
          { value: 'nenhum', label: 'Informar depois' },
          { value: 'pix', label: 'Pix' },
          { value: 'conta', label: 'Conta bancária' },
        ]}
      />
      {tipo === 'pix' ? (
        <TextField
          {...campo('chavePix')}
          label="Chave Pix"
          required
          span={7}
          maxLength={140}
          autoComplete="off"
          placeholder="CPF, e-mail, celular ou chave aleatória"
        />
      ) : null}
      {tipo === 'conta' ? (
        <>
          <TextField {...campo('banco')} label="Banco" required span={5} maxLength={80} autoComplete="off" />
          <TextField {...campo('agencia')} label="Agência" required span={3} maxLength={20} inputMode="numeric" autoComplete="off" />
          <TextField {...campo('conta')} label="Conta" required span={4} maxLength={30} autoComplete="off" />
          <TextField {...campo('titular')} label="Titular" optional span={7} maxLength={120} autoComplete="off" />
          <TextField
            {...campo('repasseDocumento')}
            label="CPF ou CNPJ do titular"
            optional
            span={5}
            inputMode="numeric"
            mask={valor => maskDigits(valor, 14)}
          />
        </>
      ) : null}
      {tipo === 'pix' ? <TextField {...campo('titular')} label="Titular da chave" optional span={12} maxLength={120} autoComplete="off" /> : null}
      {tipo === 'nenhum' ? (
        <Notice tone="neutral">Sem dados de repasse a comissão fica registrada, mas não há para onde pagar. Complete na ficha da pessoa.</Notice>
      ) : null}
    </FieldSection>
  )
}

