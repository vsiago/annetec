import { revalidatePath } from 'next/cache'
import { proxyBrandRequest } from '@/lib/api/brand-proxy'

/**
 * Logo e ícone de um clube, pelo console da plataforma (superadmin):
 * `POST|DELETE /api/plataforma/clubes/<id>/marca/<logo|icone>` →
 * `POST|DELETE /api/v1/platform/tenants/<id>/<logo|icone>`.
 * Não conhece o endereço do clube, então invalida o layout raiz inteiro.
 */

type Context = { params: Promise<{ id: string; tipo: string }> }

async function handle(request: Request, { params }: Context, method: 'POST' | 'DELETE') {
  const { id, tipo } = await params
  return proxyBrandRequest(request, {
    apiPath: uuid => `/api/v1/platform/tenants/${uuid}`,
    segment: id,
    segmentKind: 'uuid',
    tipo,
    method,
    onSuccess: () => revalidatePath('/', 'layout'),
  })
}

export const POST = (request: Request, context: Context) => handle(request, context, 'POST')
export const DELETE = (request: Request, context: Context) => handle(request, context, 'DELETE')
