'use client'

import { MailCheck, MailWarning, ShieldCheck } from 'lucide-react'
import { Notice, SecretValue } from '@/components/admin-platform/ui/wizard'
import type { ConviteResultado } from './tipos'

/** Frase curta do que aconteceu com o convite (usada em toast e na tela de sucesso). */
export function fraseDoConvite(convite: ConviteResultado, email: string): string {
  if (convite.status === 'nao_enviado') return 'Cadastro criado sem enviar o convite.'
  if (convite.enviado) return `Convite enviado para ${email}.`
  return `Cadastro criado, mas o convite para ${email} não foi enviado.`
}

/**
 * Bloco de resultado do convite, para a tela de sucesso dos cadastros de
 * agente e de gerente. A senha provisória (se a API devolver) aparece uma
 * única vez, com botão de copiar.
 */
export function ResultadoConviteBloco({ convite, email, nome }: { convite: ConviteResultado; email: string; nome: string }) {
  const primeiro = nome.trim().split(/\s+/)[0] ?? nome
  return (
    <div className="flex flex-col gap-3 text-left">
      {convite.status === 'nao_enviado' ? (
        <Notice tone="neutral" icon={ShieldCheck} title="Convite não enviado">
          Você escolheu não convidar agora. Use “Reenviar convite” na ficha de {primeiro} quando quiser liberar o acesso.
        </Notice>
      ) : convite.enviado ? (
        <Notice tone="success" icon={MailCheck} title={`Convite enviado para ${email}`}>
          {convite.contaNova === false
            ? `${primeiro} já tinha conta e entra com a senha que já usa.`
            : `${primeiro} recebe o acesso por e-mail e define o uso no primeiro login.`}
        </Notice>
      ) : (
        <Notice tone="warning" icon={MailWarning} title="O convite não foi enviado">
          O cadastro foi criado. Abra a ficha de {primeiro} e use “Reenviar convite” para tentar de novo.
        </Notice>
      )}
      {convite.senhaProvisoria ? (
        <SecretValue label="Senha provisória" value={convite.senhaProvisoria} caption={`Envie para ${primeiro} por um canal seguro. Ela não aparece de novo.`} />
      ) : null}
    </div>
  )
}
