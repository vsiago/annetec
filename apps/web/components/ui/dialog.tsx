'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Drawer as DrawerPrimitive } from 'vaul'
import { XIcon } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

const DialogContext = React.createContext<{ isMobile: boolean }>({ isMobile: false })

function Dialog({
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root> & React.ComponentProps<typeof DrawerPrimitive.Root>) {
  const isMobile = useIsMobile()

  return (
    <DialogContext.Provider value={{ isMobile }}>
      {isMobile ? (
        <DrawerPrimitive.Root data-slot="dialog-drawer" {...(props as React.ComponentProps<typeof DrawerPrimitive.Root>)}>
          {children}
        </DrawerPrimitive.Root>
      ) : (
        <DialogPrimitive.Root data-slot="dialog" {...(props as React.ComponentProps<typeof DialogPrimitive.Root>)}>
          {children}
        </DialogPrimitive.Root>
      )}
    </DialogContext.Provider>
  )
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger> & React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  const { isMobile } = React.useContext(DialogContext)
  if (isMobile) {
    return <DrawerPrimitive.Trigger data-slot="dialog-trigger" {...(props as React.ComponentProps<typeof DrawerPrimitive.Trigger>)} />
  }
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...(props as React.ComponentProps<typeof DialogPrimitive.Trigger>)} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal> & React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  const { isMobile } = React.useContext(DialogContext)
  if (isMobile) {
    return <DrawerPrimitive.Portal data-slot="dialog-portal" {...(props as React.ComponentProps<typeof DrawerPrimitive.Portal>)} />
  }
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...(props as React.ComponentProps<typeof DialogPrimitive.Portal>)} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close> & React.ComponentProps<typeof DrawerPrimitive.Close>) {
  const { isMobile } = React.useContext(DialogContext)
  if (isMobile) {
    return <DrawerPrimitive.Close data-slot="dialog-close" {...(props as React.ComponentProps<typeof DrawerPrimitive.Close>)} />
  }
  return <DialogPrimitive.Close data-slot="dialog-close" {...(props as React.ComponentProps<typeof DialogPrimitive.Close>)} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay> & React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  const { isMobile } = React.useContext(DialogContext)
  if (isMobile) {
    return (
      <DrawerPrimitive.Overlay
        data-slot="dialog-overlay"
        className={cn(
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[110] bg-black/60 backdrop-blur-xs',
          className
        )}
        {...(props as React.ComponentProps<typeof DrawerPrimitive.Overlay>)}
      />
    )
  }
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[110] bg-black/50',
        className
      )}
      {...(props as React.ComponentProps<typeof DialogPrimitive.Overlay>)}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: (React.ComponentProps<typeof DialogPrimitive.Content> & React.ComponentProps<typeof DrawerPrimitive.Content>) & {
  showCloseButton?: boolean
}) {
  const { isMobile } = React.useContext(DialogContext)

  if (isMobile) {
    return (
      <DialogPortal>
        <DialogOverlay />
        <DrawerPrimitive.Content
          data-slot="dialog-content-drawer"
          className={cn(
            'bg-background fixed inset-x-0 bottom-0 z-[110] flex h-auto max-h-[88vh] flex-col rounded-t-2xl border-t p-6 shadow-2xl overflow-y-auto pb-8',
            className
          )}
          {...(props as React.ComponentProps<typeof DrawerPrimitive.Content>)}
        >
          <div className="bg-muted mx-auto -mt-2 mb-4 h-1.5 w-12 shrink-0 rounded-full" />
          {children}
          {showCloseButton && (
            <DrawerPrimitive.Close
              data-slot="dialog-close"
              className="ring-offset-background focus:ring-ring absolute top-4 right-4 rounded-full p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden"
            >
              <XIcon className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </DrawerPrimitive.Close>
          )}
        </DrawerPrimitive.Content>
      </DialogPortal>
    )
  }

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-[110] grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border p-6 shadow-xl duration-200 sm:max-w-lg',
          className
        )}
        {...(props as React.ComponentProps<typeof DialogPrimitive.Content>)}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  const { isMobile } = React.useContext(DialogContext)
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        'flex flex-col gap-2 text-center sm:text-left',
        isMobile && 'text-left pb-1',
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  const { isMobile } = React.useContext(DialogContext)
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        isMobile && 'pt-2',
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title> & React.ComponentProps<typeof DrawerPrimitive.Title>) {
  const { isMobile } = React.useContext(DialogContext)
  if (isMobile) {
    return (
      <DrawerPrimitive.Title
        data-slot="dialog-title"
        className={cn('text-lg leading-tight font-semibold text-foreground', className)}
        {...(props as React.ComponentProps<typeof DrawerPrimitive.Title>)}
      />
    )
  }
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold text-foreground', className)}
      {...(props as React.ComponentProps<typeof DialogPrimitive.Title>)}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description> & React.ComponentProps<typeof DrawerPrimitive.Description>) {
  const { isMobile } = React.useContext(DialogContext)
  if (isMobile) {
    return (
      <DrawerPrimitive.Description
        data-slot="dialog-description"
        className={cn('text-muted-foreground text-sm', className)}
        {...(props as React.ComponentProps<typeof DrawerPrimitive.Description>)}
      />
    )
  }
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...(props as React.ComponentProps<typeof DialogPrimitive.Description>)}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

