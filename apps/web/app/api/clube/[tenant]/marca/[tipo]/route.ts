import { revalidatePath } from 'next/cache'
import { proxyBrandRequest } from '@/lib/api/brand-proxy'

/**
 * Logo e ícone do clube, pelo admin do próprio clube (ou superadmin):
 * `POST|DELETE /api/clube/<slug>/marca/<logo|icone>` →
 * `POST|DELETE /api/v1/t/<slug>/marca/<logo|icone>`.
 * Depois de aplicar, invalida as páginas do clube (a metadata — favicon,
 * manifest — é gerada no servidor).
 */

type Context = { params: Promise<{ tenant: string; tipo: string }> }

async function handle(request: Request, { params }: Context, method: 'POST' | 'DELETE') {
  const { tenant, tipo } = await params
  return proxyBrandRequest(request, {
    apiPath: slug => `/api/v1/t/${slug}/marca`,
    segment: tenant,
    segmentKind: 'slug',
    tipo,
    method,
    onSuccess: () => revalidatePath(`/${tenant}`, 'layout'),
  })
}

export const POST = (request: Request, context: Context) => handle(request, context, 'POST')
export const DELETE = (request: Request, context: Context) => handle(request, context, 'DELETE')
