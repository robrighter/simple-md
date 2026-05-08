import { createContext, useContext } from 'react'

export type PromptOpts = {
  title: string
  message?: string
  defaultValue?: string
  placeholder?: string
  okLabel?: string
  cancelLabel?: string
}

export type ConfirmOpts = {
  title: string
  message?: string
  okLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

export type AlertOpts = {
  title: string
  message?: string
  okLabel?: string
  variant?: 'info' | 'error'
}

export type DialogApi = {
  prompt: (opts: PromptOpts) => Promise<string | null>
  confirm: (opts: ConfirmOpts) => Promise<boolean>
  alert: (opts: AlertOpts) => Promise<void>
}

export const DialogContext = createContext<DialogApi | null>(null)

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext)
  if (!ctx) {
    throw new Error('useDialog must be used inside <DialogProvider>')
  }
  return ctx
}
