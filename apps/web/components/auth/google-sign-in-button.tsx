'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Botão oficial "Continuar com o Google" (Google Identity Services, fluxo ID
 * token em popup). Não há redirect OAuth: o Google devolve um `credential`
 * (JWT assinado) aqui no navegador e quem valida é a API, em
 * `POST /api/v1/auth/login/google`. Ver docs/login-google.md.
 *
 * Sem `NEXT_PUBLIC_GOOGLE_CLIENT_ID` não renderiza nada.
 */

const GSI_SRC = 'https://accounts.google.com/gsi/client'
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''

/** Largura aceita pelo `renderButton` do Google (em px). */
const MIN_WIDTH = 200
const MAX_WIDTH = 400

interface GsiCredentialResponse {
  credential?: string
}

interface GsiButtonOptions {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  logo_alignment?: 'left' | 'center'
  width?: number
  locale?: string
}

interface GsiId {
  initialize(options: {
    client_id: string
    callback: (response: GsiCredentialResponse) => void
    ux_mode?: 'popup' | 'redirect'
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
    context?: 'signin' | 'signup' | 'use'
  }): void
  renderButton(parent: HTMLElement, options: GsiButtonOptions): void
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GsiId } }
  }
}

/** Uma única carga do script por página, compartilhada entre montagens. */
let gsiLoading: Promise<GsiId> | null = null

function loadGsi(): Promise<GsiId> {
  const ready = window.google?.accounts?.id
  if (ready) return Promise.resolve(ready)
  if (gsiLoading) return gsiLoading

  gsiLoading = new Promise<GsiId>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GSI_SRC
    script.async = true
    script.defer = true
    script.onload = () => {
      const id = window.google?.accounts?.id
      if (id) resolve(id)
      else reject(new Error('Google Identity Services carregou sem `google.accounts.id`'))
    }
    script.onerror = () => reject(new Error('Falha ao carregar o Google Identity Services'))
    document.head.appendChild(script)
  }).catch(error => {
    // Permite tentar de novo numa próxima montagem (ex.: rede voltou).
    gsiLoading = null
    document.querySelector(`script[src="${GSI_SRC}"]`)?.remove()
    throw error
  })
  return gsiLoading
}

interface GoogleSignInButtonProps {
  /** Recebe o `credential` (ID token JWT) devolvido pelo Google. */
  onCredential: (credential: string) => void
  /** Bloqueia cliques enquanto outro login está em andamento. */
  disabled?: boolean
}

export function GoogleSignInButton({ onCredential, disabled = false }: GoogleSignInButtonProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // O callback do Google é registrado uma vez no `initialize`; a ref garante
  // que ele sempre chame a versão mais recente de `onCredential`.
  const onCredentialRef = useRef(onCredential)
  const [loadError, setLoadError] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    onCredentialRef.current = onCredential
  }, [onCredential])

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    const wrapper = wrapperRef.current
    const container = containerRef.current
    if (!wrapper || !container) return
    let cancelled = false
    let gsi: GsiId | null = null
    let lastWidth = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    // O `renderButton` fixa a largura em px: re-renderiza quando o container muda.
    const render = () => {
      if (cancelled || !gsi) return
      const width = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, wrapper.clientWidth || MAX_WIDTH)))
      if (width === lastWidth) return
      lastWidth = width
      container.replaceChildren()
      gsi.renderButton(container, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'center',
        width,
        locale: 'pt-BR',
      })
      setReady(true)
    }

    const observer = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(render, 100)
    })
    observer.observe(wrapper)

    loadGsi()
      .then(id => {
        if (cancelled) return
        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: response => {
            if (response.credential) onCredentialRef.current(response.credential)
          },
          ux_mode: 'popup',
          auto_select: false,
          context: 'signin',
        })
        gsi = id
        render()
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })

    return () => {
      cancelled = true
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [])

  if (!GOOGLE_CLIENT_ID) return null

  if (loadError) {
    return (
      <p className="text-center text-xs text-muted-foreground">
        Não foi possível carregar o login com Google. Verifique sua conexão ou recarregue a página.
      </p>
    )
  }

  return (
    <div
      ref={wrapperRef}
      role="group"
      aria-label="Continuar com o Google"
      aria-busy={disabled}
      className={`relative flex h-11 w-full items-center justify-center overflow-hidden transition-opacity ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      {!ready ? (
        <div className="absolute inset-0 animate-pulse rounded-md border bg-muted/60 motion-reduce:animate-none" aria-hidden />
      ) : null}
      <div ref={containerRef} className="flex max-w-full justify-center" />
    </div>
  )
}

/** Se o web tem client id configurado (o botão só existe com ele). */
export const googleClientIdConfigured = GOOGLE_CLIENT_ID !== ''
