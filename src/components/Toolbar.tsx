import { useEffect, useRef, useState, type ReactNode } from 'react'

type ToolbarProps = {
  busy: boolean
  onOpenFile: () => void
  onCreateNote: () => void
  onCreateFolder: () => void
  onOpenFolder: () => void
  onSave: () => void
  onSaveAs: () => void
  onExportHtml: () => void
  onExportPdf: () => void
  onExportText: () => void
  onImportUrl: () => void
}

type EditCommand = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'

const editItems: Array<{ command: EditCommand; label: string; shortcut: string }> = [
  { command: 'undo', label: 'Undo', shortcut: '⌘Z' },
  { command: 'redo', label: 'Redo', shortcut: '⇧⌘Z' },
  { command: 'cut', label: 'Cut', shortcut: '⌘X' },
  { command: 'copy', label: 'Copy', shortcut: '⌘C' },
  { command: 'paste', label: 'Paste', shortcut: '⌘V' },
  { command: 'selectAll', label: 'Select All', shortcut: '⌘A' },
]

export function Toolbar({
  busy,
  onOpenFile,
  onCreateNote,
  onCreateFolder,
  onOpenFolder,
  onSave,
  onSaveAs,
  onExportHtml,
  onExportPdf,
  onExportText,
  onImportUrl,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <Menu label="New ▾">
        {(close) => (
          <>
            <MenuItem
              onSelect={() => {
                close()
                onCreateNote()
              }}
            >
              New file
            </MenuItem>
            <MenuItem
              onSelect={() => {
                close()
                onCreateFolder()
              }}
            >
              New folder
            </MenuItem>
          </>
        )}
      </Menu>

      <Menu label="Open ▾">
        {(close) => (
          <>
            <MenuItem
              onSelect={() => {
                close()
                onOpenFile()
              }}
            >
              Open file…
            </MenuItem>
            <MenuItem
              onSelect={() => {
                close()
                onOpenFolder()
              }}
            >
              Open folder…
            </MenuItem>
          </>
        )}
      </Menu>

      <Menu label="Edit ▾">
        {(close) => (
          <>
            {editItems.map((item) => (
              <MenuItem
                key={item.command}
                shortcut={item.shortcut}
                preserveFocus
                onSelect={() => {
                  close()
                  document.execCommand(item.command)
                }}
              >
                {item.label}
              </MenuItem>
            ))}
          </>
        )}
      </Menu>

      <Menu label="Save ▾" disabled={busy}>
        {(close) => (
          <>
            <MenuItem
              shortcut="⌘S"
              onSelect={() => {
                close()
                onSave()
              }}
            >
              Save
            </MenuItem>
            <MenuItem
              shortcut="⇧⌘S"
              onSelect={() => {
                close()
                onSaveAs()
              }}
            >
              Save as…
            </MenuItem>
          </>
        )}
      </Menu>
      <Menu label="Export ▾" disabled={busy}>
        {(close) => (
          <>
            <MenuItem
              onSelect={() => {
                close()
                onExportHtml()
              }}
            >
              Export as HTML…
            </MenuItem>
            <MenuItem
              onSelect={() => {
                close()
                onExportPdf()
              }}
            >
              Export as PDF…
            </MenuItem>
            <MenuItem
              onSelect={() => {
                close()
                onExportText()
              }}
            >
              Export as Text…
            </MenuItem>
          </>
        )}
      </Menu>
      <button type="button" onClick={onImportUrl} disabled={busy} title="Import Markdown from a URL">
        Import…
      </button>
    </div>
  )
}

type MenuProps = {
  label: string
  disabled?: boolean
  children: (close: () => void) => ReactNode
}

function Menu({ label, disabled = false, children }: MenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    const onDocClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="toolbar__menu" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open && (
        <div role="menu" className="toolbar__popover">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

type MenuItemProps = {
  children: ReactNode
  onSelect: () => void
  shortcut?: string
  // Edit-menu items must keep focus on the underlying editor so that
  // execCommand('cut'|'copy'|'paste'|...) operates on the editor's selection
  // rather than the menu button. preventDefault on mousedown blocks the focus
  // shift; the click handler then runs the command.
  preserveFocus?: boolean
}

function MenuItem({ children, onSelect, shortcut, preserveFocus }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onMouseDown={(event) => {
        if (preserveFocus) event.preventDefault()
      }}
      onClick={onSelect}
    >
      <span>{children}</span>
      {shortcut && <span className="toolbar__shortcut">{shortcut}</span>}
    </button>
  )
}
