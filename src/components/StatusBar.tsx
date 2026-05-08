import type { DocumentMode } from '../app/types'

type StatusBarProps = {
  message: string
  mode: DocumentMode
  path: string | null
  isDirty: boolean
  words: number
  lines: number
  characters: number
  onOpenSourceUrl?: () => void
}

export function StatusBar({
  message,
  mode,
  path,
  isDirty,
  words,
  lines,
  characters,
  onOpenSourceUrl,
}: StatusBarProps) {
  return (
    <footer className="status-bar">
      <div className="status-bar__cluster">
        <span className="status-bar__message">{message}</span>
        <span data-dirty={isDirty}>{isDirty ? '● Unsaved' : '✓ Saved'}</span>
      </div>
      <div className="status-bar__cluster status-bar__cluster--meta">
        <span>{mode}</span>
        <span>
          {words} words · {lines} lines · {characters} chars
        </span>
        {path && (
          onOpenSourceUrl ? (
            <button
              type="button"
              className="status-bar__path-link"
              onClick={onOpenSourceUrl}
              title="Open source URL"
            >
              {path}
            </button>
          ) : (
            <span className="status-bar__path" title={path}>
              {path}
            </span>
          )
        )}
      </div>
    </footer>
  )
}
