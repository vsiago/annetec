'use server'

import type {
  Appointment,
  AppointmentMessage,
  CreateAppointmentInput,
  CreateAppointmentMessageInput,
  UpdateAppointmentInput,
} from '@annetec/contracts'
import { apiFetch, apiFetchAll, tenantPath } from '@/lib/api/client'
import { run, type ActionResult } from './_api-result'

/**
 * Atendimento / teleorientação — `/api/v1/t/:tenantSlug/atendimentos`.
 *
 * Dado próprio da Annetec: o chamado nasce e vive aqui. Quando o inquilino
 * tem o módulo de atendimento da Digital Saúde contratado, o ERP devolve um
 * protocolo que fica guardado junto — mas o histórico não depende disso, e
 * por isso a fila não é um espelho do upstream.
 *
 * O recorte de quem vê o quê é do servidor: admin e vendedor recebem a fila
 * do inquilino, o associado só os chamados dele.
 */

export async function listOperatorAppointmentsAction(
  tenantSlug: string,
  params?: { status?: string; canal?: string; responsavelId?: string; q?: string },
): Promise<ActionResult<Appointment[]>> {
  return run(async () => {
    // Lista completa: os indicadores da mesa (fila, em atendimento, resolvidos
    // no mês) contam em cima dela, então uma página truncada vira número
    // errado na tela.
    return apiFetchAll<Appointment>(tenantPath(tenantSlug, '/atendimentos'), {
      query: {
        status: params?.status,
        canal: params?.canal,
        responsavelId: params?.responsavelId,
        q: params?.q,
      },
    })
  })
}

export async function createOperatorAppointmentAction(
  tenantSlug: string,
  input: CreateAppointmentInput,
): Promise<ActionResult<Appointment>> {
  return run(async () => {
    const { data } = await apiFetch<Appointment>(tenantPath(tenantSlug, '/atendimentos'), {
      method: 'POST',
      body: input,
    })
    return data
  })
}

export async function updateOperatorAppointmentAction(
  tenantSlug: string,
  id: string,
  patch: UpdateAppointmentInput,
): Promise<ActionResult<Appointment>> {
  return run(async () => {
    const { data } = await apiFetch<Appointment>(tenantPath(tenantSlug, `/atendimentos/${id}`), {
      method: 'PATCH',
      body: patch,
    })
    return data
  })
}

export async function deleteOperatorAppointmentAction(
  tenantSlug: string,
  id: string,
): Promise<ActionResult<null>> {
  return run(async () => {
    await apiFetch(tenantPath(tenantSlug, `/atendimentos/${id}`), { method: 'DELETE' })
    return null
  })
}

/**
 * Nova mensagem na thread. Devolve só a mensagem criada — quem chama encaixa
 * no chamado que já tem em memória.
 */
export async function addOperatorAppointmentMessageAction(
  tenantSlug: string,
  id: string,
  input: CreateAppointmentMessageInput,
): Promise<ActionResult<AppointmentMessage>> {
  return run(async () => {
    const { data } = await apiFetch<AppointmentMessage>(
      tenantPath(tenantSlug, `/atendimentos/${id}/mensagens`),
      { method: 'POST', body: input },
    )
    return data
  })
}
