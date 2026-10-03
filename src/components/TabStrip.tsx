import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { OpenDocument } from '../app/types'
import { isMarkdownPath } from '../lib/document'

type TabStripProps = {
  documents: OpenDocument[]
  activeDocumentId: string
  onActivate: (documentId: string) => void
  onClose: (documentId: string) => void
  onCloseOthers: (documentId: string) => void
  onCloseAll: () => void
  onCloseUnpinned: () => void
  onClosePinned: () => void
  onTogglePin: (documentId: string) => void
  onRename: (documentId: string, nextName: string) => void | Promise<void>
  onOpenDroppedFiles: (paths: string[]) => void | Promise<void>
  onNew: () => void
}

export function TabStrip({
  documents,
  activeDocumentId,
  onActivate,
  onClose,
  onCloseOthers,
  onCloseAll,
  onCloseUnpinned,
  onClosePinned,
  onTogglePin,
  onRename,
  onOpenDroppedFiles,
  onNew,
}: TabStripProps) {
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [dropActive, setDropActive] = useState(false)
  const [draggedMarkdownPaths, setDraggedMarkdownPaths] = useState<string[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number; documentId: string } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const onOpenDroppedFilesRef = useRef(onOpenDroppedFiles)

  function getPathsFromHtmlDrop(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => Boolean(path))
      .filter(isMarkdownPath)
  }

  useEffect(() => {
    if (!editingDocumentId) return

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [editingDocumentId])

  useEffect(() => {
    if (!menu) return

    const dismiss = () => setMenu(null)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }

    window.addEventListener('mousedown', dismiss)
    window.addEventListener('blur', dismiss)
    window.addEventListener('resize', dismiss)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', dismiss)
      window.removeEventListener('blur', dismiss)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menu])

  useEffect(() => {
    onOpenDroppedFilesRef.current = onOpenDroppedFiles
  }, [onOpenDroppedFiles])

  useEffect(() => {
    if (!isTauri()) return

    let cancelled = false
    let unlisten: (() => void) | undefined

    const listen = async () => {
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        const payload = event.payload

        if (payload.type === 'enter') {
          const markdownPaths = payload.paths.filter(isMarkdownPath)

          setDraggedMarkdownPaths(markdownPaths)
          setDropActive(markdownPaths.length > 0)
          return
        }

        if (payload.type === 'over') {
          return
        }

        if (payload.type === 'drop') {
          const droppedMarkdownPaths = payload.paths.filter(isMarkdownPath)

          setDropActive(false)
          setDraggedMarkdownPaths([])

          if (droppedMarkdownPaths.length > 0) {
            void onOpenDroppedFilesRef.current(droppedMarkdownPaths)
          }

          return
        }

        setDropActive(false)
        setDraggedMarkdownPaths([])
      })

      if (cancelled) {
        unlisten()
      }
    }

    void listen()

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  function beginRename(document: OpenDocument) {
    setEditingDocumentId(document.id)
    setDraftName(document.title)
  }

  async function commitRename(document: OpenDocument) {
    const nextName = draftName.trim()
    setEditingDocumentId(null)

    if (!nextName || nextName === document.title) {
      return
    }

    await onRename(document.id, nextName)
  }

  const showDropTarget = dropActive && draggedMarkdownPaths.length > 0
  const menuDocument = menu ? documents.find((document) => document.id === menu.documentId) : undefined
  const hasPinned = documents.some((document) => document.isPinned)
  const hasUnpinned = documents.some((document) => !document.isPinned)
  const hasOtherClosable = documents.some(
    (document) => document.id !== menu?.documentId && !document.isPinned,
  )

  return (
    <nav
      className="tab-strip"
      data-drop-active={showDropTarget}
      aria-label="Open documents"
      onDragEnter={(event) => {
        const paths = getPathsFromHtmlDrop(event)

        if (paths.length > 0) {
          setDraggedMarkdownPaths(paths)
          setDropActive(true)
        }
      }}
      onDragOver={(event) => {
        if (draggedMarkdownPaths.length > 0) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setDropActive(true)
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDropActive(false)
        }
      }}
      onDrop={(event) => {
        const paths = getPathsFromHtmlDrop(event)

        setDropActive(false)
        setDraggedMarkdownPaths([])

        if (paths.length > 0) {
          event.preventDefault()
          void onOpenDroppedFiles(paths)
        }
      }}
    >
      {documents.map((document) => {
        const isActive = document.id === activeDocumentId
        const isEditing = document.id === editingDocumentId

        return (
          <div
            key={document.id}
            className="tab-strip__item"
            data-active={isActive}
            data-editing={isEditing}
            data-pinned={document.isPinned ? 'true' : undefined}
            onContextMenu={(event) => {
              event.preventDefault()
              setMenu({ x: event.clientX, y: event.clientY, documentId: document.id })
            }}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                className="tab-strip__rename-input"
                value={draftName}
                aria-label={`Rename ${document.title}`}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={() => void commitRename(document)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void commitRename(document)
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setEditingDocumentId(null)
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="tab-strip__activate"
                onClick={() => {
                  if (isActive) {
                    beginRename(document)
                    return
                  }

                  onActivate(document.id)
                }}
                title={document.path ?? document.sourceUrl ?? document.title}
              >
                {document.isDirty && (
                  <span className="tab-strip__dirty" aria-label="unsaved">●</span>
                )}
                <span>{document.title}</span>
              </button>
            )}
            {document.isPinned && !isEditing && (
              <button
                type="button"
                className="tab-strip__pin"
                aria-label={`Unpin ${document.title}`}
                title="Unpin tab"
                onClick={() => onTogglePin(document.id)}
              >
                {'\u{1F4CC}'}
              </button>
            )}
            {documents.length > 1 && !document.isPinned && !isEditing && (
              <button
                type="button"
                className="tab-strip__close"
                aria-label={`Close ${document.title}`}
                onClick={() => onClose(document.id)}
              >
                ×
              </button>
            )}
          </div>
        )
      })}
      <button
        type="button"
        className="tab-strip__new"
        onClick={onNew}
        aria-label="New scratch document"
        title="New scratch document"
      >
        +
      </button>
      {menu && menuDocument && (
        <div
          role="menu"
          className="context-menu"
          style={{ top: menu.y, left: menu.x }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {[
            {
              label: menuDocument.isPinned ? 'Unpin tab' : 'Pin tab',
              run: () => onTogglePin(menu.documentId),
            },
            { label: 'Close tab', run: () => onClose(menu.documentId) },
            {
              label: 'Close others',
              run: () => onCloseOthers(menu.documentId),
              disabled: !hasOtherClosable,
            },
            { label: 'Close all', run: onCloseAll },
            { label: 'Close all not pinned', run: onCloseUnpinned, disabled: !hasUnpinned },
            { label: 'Close pinned', run: onClosePinned, disabled: !hasPinned },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setMenu(null)
                item.run()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {showDropTarget && (
        <div className="tab-strip__drop-target" aria-hidden="true">
          Drop to open
        </div>
      )}
    </nav>
  )
}
