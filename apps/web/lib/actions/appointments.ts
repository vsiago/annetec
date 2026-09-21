/**
 * (Aposentado) Mock em localStorage. O painel não lê mais daqui: atendimento
 * agora vem de `/atendimentos` e os planos do clube de `/rede/planos`, ambos
 * via `contexts/tenant-data-context.tsx`.
 *
 * O arquivo só continua de pé por causa de `purgeTenant*`, chamado pelo mock
 * de exclusão de inquilino em `lib/actions/tenants.ts`. Some junto com ele.
 */
import type { Appointment } from '@/lib/types'
import { seedAppointments } from '@/lib/mock-seed'
import { createEntityActions } from './_factory'
import { delay, genId, type ActionResult } from './_shared'

const appointments = createEntityActions<Appointment>('appointments', seedAppointments)

export const updateAppointment = appointments.update

export async function listAppointmentsByClient(tenantId: string, clientId: string): Promise<ActionResult<Appointment[]>> {
  await delay()
  return {
    success: true,
    data: appointments.collection
      .getAll()
      .filter(a => a.tenantId === tenantId && a.clientId === clientId),
  }
}

export async function listAppointments(tenantId: string): Promise<ActionResult<Appointment[]>> {
  await delay()
  return { success: true, data: appointments.collection.getAll().filter(a => a.tenantId === tenantId) }
}

export async function createAppointment(
  input: Omit<Appointment, 'id' | 'createdAt' | 'status'>
): Promise<ActionResult<Appointment>> {
  await delay()
  return {
    success: true,
    data: appointments.collection.create({
      ...input,
      id: genId('appt'),
      status: 'aguardando',
      createdAt: new Date(),
    }),
  }
}

export const purgeTenantAppointments = appointments.purgeByTenant
