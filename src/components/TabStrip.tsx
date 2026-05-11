import { useEffect, useRef, useState } from 'react'
import type { OpenDocument } from '../app/types'

type TabStripProps = {
  documents: OpenDocument[]
  activeDocumentId: string
  onActivate: (documentId: string) => void
  onClose: (documentId: string) => void
  onRename: (documentId: string, nextName: string) => void | Promise<void>
  onNew: () => void
}

export function TabStrip({
  documents,
  activeDocumentId,
  onActivate,
  onClose,
  onRename,
  onNew,
}: TabStripProps) {
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!editingDocumentId) return

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [editingDocumentId])

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

  return (
    <nav className="tab-strip" aria-label="Open documents">
      {documents.map((document) => {
        const isActive = document.id === activeDocumentId
        const isEditing = document.id === editingDocumentId

        return (
          <div
            key={document.id}
            className="tab-strip__item"
            data-active={isActive}
            data-editing={isEditing}
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
            {documents.length > 1 && !isEditing && (
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
    </nav>
  )
}
