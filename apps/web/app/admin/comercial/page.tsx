import { redirect } from 'next/navigation'

/** `/admin/comercial` abre a primeira tela do grupo (Funil). */
export default function ComercialIndexPage() {
  redirect('/admin/comercial/funil')
}
