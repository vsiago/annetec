'use server'

import type {
  Appointment,
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from '@annetec/contracts'
import { ApiError, apiFetch, apiFetchAll, tenantPath } from '@/lib/api/client'

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
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

export async function listOperatorAppointmentsAction(
  tenantSlug: string,
  params?: { status?: 'aguardando' | 'em_atendimento' | 'concluido'; q?: string },
): Promise<ActionResult<Appointment[]>> {
  return run(async () => {
    // Lista completa: os indicadores da tela (fila, em atendimento, concluídos
    // no mês) contam em cima dela.
    return apiFetchAll<Appointment>(tenantPath(tenantSlug, '/atendimentos'), {
      query: { status: params?.status, q: params?.q },
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

async function run<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { success: true, data: await operation() }
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        ...(error.issues ? { fieldErrors: error.toFieldErrors() } : {}),
      }
    }
    return { success: false, error: 'Não foi possível concluir a operação. Tente novamente.' }
  }
}
