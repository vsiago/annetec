'use client'

// Tenant auth (contexts/auth-context.tsx) and platform auth
// (contexts/platform-auth-context.tsx) are both scoped to their respective
// route groups (app/[tenant]/layout.tsx and app/admin/layout.tsx) rather
// than mounted globally here, since tenant auth depends on the resolved
// tenant from the URL.
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
