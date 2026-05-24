import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DialogContext,
  type AlertOpts,
  type ConfirmOpts,
  type FileLocationPromptOpts,
  type FileLocationPromptResult,
  type PromptOpts,
} from './DialogContext'
import { chooseFolderDialog } from '../lib/desktop'

type PendingPrompt = {
  kind: 'prompt'
  opts: PromptOpts
  resolve: (value: string | null) => void
}

type PendingFileLocationPrompt = {
  kind: 'file-location-prompt'
  opts: FileLocationPromptOpts
  resolve: (value: FileLocationPromptResult | null) => void
}

type PendingConfirm = {
  kind: 'confirm'
  opts: ConfirmOpts
  resolve: (value: boolean) => void
}

type PendingAlert = {
  kind: 'alert'
  opts: AlertOpts
  resolve: () => void
}

type Pending = PendingPrompt | PendingFileLocationPrompt | PendingConfirm | PendingAlert | null

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending>(null)
  const [draft, setDraft] = useState('')
  const [folderDraft, setFolderDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const prompt = useCallback((opts: PromptOpts) => {
    return new Promise<string | null>((resolve) => {
      setPending({ kind: 'prompt', opts, resolve })
      setDraft(opts.defaultValue ?? '')
      setFolderDraft('')
    })
  }, [])

  const fileLocationPrompt = useCallback((opts: FileLocationPromptOpts) => {
    return new Promise<FileLocationPromptResult | null>((resolve) => {
      setPending({ kind: 'file-location-prompt', opts, resolve })
      setDraft(opts.defaultName ?? '')
      setFolderDraft(opts.defaultFolder)
    })
  }, [])

  const confirm = useCallback((opts: ConfirmOpts) => {
    return new Promise<boolean>((resolve) => {
      setPending({ kind: 'confirm', opts, resolve })
    })
  }, [])

  const alert = useCallback((opts: AlertOpts) => {
    return new Promise<void>((resolve) => {
      setPending({ kind: 'alert', opts, resolve })
    })
  }, [])

  const cancel = useCallback(() => {
    setPending((current) => {
      if (!current) return null
      if (current.kind === 'prompt' || current.kind === 'file-location-prompt') {
        current.resolve(null)
      } else if (current.kind === 'confirm') {
        current.resolve(false)
      } else {
        current.resolve()
      }
      return null
    })
  }, [])

  const ok = useCallback(() => {
    setPending((current) => {
      if (!current) return null
      if (current.kind === 'prompt') {
        current.resolve(draft)
      } else if (current.kind === 'file-location-prompt') {
        if (!draft.trim() || !folderDraft.trim()) {
          return current
        }

        current.resolve({ name: draft, folder: folderDraft })
      } else if (current.kind === 'confirm') {
        current.resolve(true)
      } else {
        current.resolve()
      }
      return null
    })
  }, [draft, folderDraft])

  const chooseFolder = useCallback(async () => {
    if (pending?.kind !== 'file-location-prompt') {
      return
    }

    try {
      const selected = await chooseFolderDialog('Choose Folder')

      if (selected) {
        setFolderDraft(selected)
      }
    } catch {
      // In browser preview the native picker is unavailable; keep the visible
      // path editable so the user can still set the destination.
    }
  }, [pending])

  useEffect(() => {
    if (pending?.kind === 'prompt' || pending?.kind === 'file-location-prompt') {
      const id = window.requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
      return () => window.cancelAnimationFrame(id)
    }
  }, [pending])

  useEffect(() => {
    if (!pending) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pending, cancel])

  return (
    <DialogContext.Provider value={{ prompt, fileLocationPrompt, confirm, alert }}>
      {children}
      {pending && (
        <div
          className="ai-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              cancel()
            }
          }}
        >
          <div className="ai-modal__panel dialog-panel">
            <h2 id="dialog-title">{pending.opts.title}</h2>
            {pending.opts.message && <p className="dialog-message">{pending.opts.message}</p>}
            {pending.kind === 'prompt' && (
              <input
                ref={inputRef}
                className="dialog-input"
                value={draft}
                placeholder={pending.opts.placeholder}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    ok()
                  }
                }}
              />
            )}
            {pending.kind === 'file-location-prompt' && (
              <div className="dialog-fields">
                <label className="dialog-field">
                  <span>File name</span>
                  <input
                    ref={inputRef}
                    className="dialog-input"
                    value={draft}
                    placeholder={pending.opts.namePlaceholder}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        ok()
                      }
                    }}
                  />
                </label>
                <label className="dialog-field">
                  <span>Folder{!folderDraft.trim() && <span className="dialog-field__required"> — required</span>}</span>
                  <div className="dialog-folder-row">
                    <input
                      className={`dialog-input${!folderDraft.trim() ? ' dialog-input--empty' : ''}`}
                      value={folderDraft}
                      placeholder="Choose a folder…"
                      onChange={(event) => setFolderDraft(event.target.value)}
                    />
                    <button
                      type="button"
                      className={folderDraft.trim() ? 'ghost-button' : 'ai-button ai-button--primary'}
                      onClick={() => void chooseFolder()}
                    >
                      Choose…
                    </button>
                  </div>
                </label>
              </div>
            )}
            <div className="ai-modal__actions">
              {pending.kind !== 'alert' && (
                <button type="button" className="ghost-button" onClick={cancel}>
                  {pending.kind === 'confirm' || pending.kind === 'prompt'
                    ? pending.opts.cancelLabel ?? 'Cancel'
                    : 'Cancel'}
                </button>
              )}
              <button
                type="button"
                className={
                  pending.kind === 'confirm' && pending.opts.destructive
                    ? 'ai-button ai-button--danger'
                    : 'ai-button ai-button--primary'
                }
                onClick={ok}
                disabled={
                  pending.kind === 'file-location-prompt' &&
                  (!draft.trim() || !folderDraft.trim())
                }
              >
                {pending.opts.okLabel ??
                  (pending.kind === 'confirm' && pending.opts.destructive
                    ? 'Delete'
                    : pending.kind === 'alert'
                      ? 'OK'
                      : 'OK')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}
