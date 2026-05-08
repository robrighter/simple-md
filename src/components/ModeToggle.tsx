import type { DocumentMode } from '../app/types'

type ModeToggleProps = {
  mode: DocumentMode
  onChange: (mode: DocumentMode) => void
}

const modes: Array<{ value: DocumentMode; label: string; hint: string }> = [
  { value: 'preview', label: 'Display', hint: 'Read-only rendered view' },
  { value: 'source', label: 'Text', hint: 'Raw Markdown source' },
  { value: 'wysiwyg', label: 'Hybrid', hint: 'Edit rich text directly — Markdown stays the source' },
  { value: 'split', label: 'Split', hint: 'Source left, rendered right' },
]

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="mode-tabs" role="tablist" aria-label="Document view mode">
      {modes.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={mode === item.value}
          data-active={mode === item.value}
          title={item.hint}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
