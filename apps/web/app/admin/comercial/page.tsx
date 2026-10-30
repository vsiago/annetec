import { redirect } from 'next/navigation'

/** `/admin/comercial` abre a primeira tela do grupo (Vendedores). */
export default function ComercialIndexPage() {
  redirect('/admin/comercial/vendedores')
}
