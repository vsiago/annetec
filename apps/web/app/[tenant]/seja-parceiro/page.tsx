import type { Metadata } from 'next'
import { TenantLandingPage } from '@/components/seja-parceiro/tenant-pages'

export const metadata: Metadata = { title: 'Seja um parceiro comercial' }

export default function TenantSejaParceiroPage() {
  return <TenantLandingPage />
}
