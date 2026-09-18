'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/protected-route'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { AdminTopbar } from '@/components/admin/admin-topbar'
import { cn } from '@/lib/utils'

type SidebarContextType = {
  isCollapsed: boolean
  toggleSidebar: () => void
  setIsCollapsed: (collapsed: boolean) => void
}

export const AdminSidebarContext = createContext<SidebarContextType>({
  isCollapsed: false,
  toggleSidebar: () => {},
  setIsCollapsed: () => {},
})

export const useAdminSidebarContext = () => useContext(AdminSidebarContext)

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('annetec_admin_sidebar_collapsed')
    if (stored !== null) {
      setIsCollapsed(stored === 'true')
    }
  }, [])

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const next = !prev
      localStorage.setItem('annetec_admin_sidebar_collapsed', String(next))
      return next
    })
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <AdminSidebarContext.Provider value={{ isCollapsed, toggleSidebar, setIsCollapsed }}>
      <div className="min-h-screen bg-background">
        <AdminSidebar />
        <div
          className={cn(
            'flex min-h-screen flex-col pt-14 transition-[padding] duration-300 ease-in-out lg:pt-0',
            isCollapsed ? 'lg:pl-20' : 'lg:pl-64'
          )}
        >
          <AdminTopbar />
          <main className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
        </div>
      </div>
    </AdminSidebarContext.Provider>
  )
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </ProtectedRoute>
  )
}

