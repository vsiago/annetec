'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { User, Seller, Client, UserRole } from '@/lib/types'
import { mockCredentials, getUserById } from '@/lib/mock-data'

interface AuthContextType {
  user: User | Seller | Client | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | Seller | Client | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Check for existing session in localStorage
    const storedUserId = localStorage.getItem('annetec_user_id')
    if (storedUserId) {
      const foundUser = getUserById(storedUserId)
      if (foundUser) {
        setUser(foundUser)
      }
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true)
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const credential = mockCredentials.find(
      cred => cred.email.toLowerCase() === email.toLowerCase() && cred.password === password
    )
    
    if (!credential) {
      setIsLoading(false)
      return { success: false, error: 'Email ou senha inválidos' }
    }
    
    const foundUser = getUserById(credential.userId)
    if (!foundUser) {
      setIsLoading(false)
      return { success: false, error: 'Usuário não encontrado' }
    }
    
    setUser(foundUser)
    localStorage.setItem('annetec_user_id', foundUser.id)
    setIsLoading(false)
    
    // Redirect based on role
    const redirectPath = getRedirectPath(foundUser.role)
    router.push(redirectPath)
    
    return { success: true }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('annetec_user_id')
    router.push('/login')
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function getRedirectPath(role: UserRole): string {
  switch (role) {
    case 'admin':
      return '/admin'
    case 'seller':
      return '/vendedor'
    case 'client':
      return '/cliente'
    default:
      return '/login'
  }
}
