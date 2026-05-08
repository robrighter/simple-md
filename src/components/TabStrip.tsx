import type { OpenDocument } from '../app/types'

type TabStripProps = {
  documents: OpenDocument[]
  activeDocumentId: string
  onActivate: (documentId: string) => void
  onClose: (documentId: string) => void
  onNew: () => void
}

export function TabStrip({
  documents,
  activeDocumentId,
  onActivate,
  onClose,
  onNew,
}: TabStripProps) {
  return (
    <nav className="tab-strip" aria-label="Open documents">
      {documents.map((document) => (
        <div
          key={document.id}
          className="tab-strip__item"
          data-active={document.id === activeDocumentId}
        >
          <button
            type="button"
            className="tab-strip__activate"
            onClick={() => onActivate(document.id)}
            title={document.path ?? document.sourceUrl ?? document.title}
          >
            {document.isDirty && <span className="tab-strip__dirty" aria-label="unsaved">●</span>}
            <span>{document.title}</span>
          </button>
          {documents.length > 1 && (
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
      ))}
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
