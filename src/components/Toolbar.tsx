import { useEffect, useRef, useState, type ReactNode } from 'react'

type ToolbarProps = {
  busy: boolean
  onOpenWorkspace: () => void
  onCreateNote: () => void
  onCreateFolder: () => void
  onAddFolder: () => void
  onSave: () => void
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
  onOpenWorkspace,
  onCreateNote,
  onCreateFolder,
  onAddFolder,
  onSave,
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
              New note
            </MenuItem>
            <MenuItem
              onSelect={() => {
                close()
                onCreateFolder()
              }}
            >
              New folder
            </MenuItem>
            <MenuItem
              onSelect={() => {
                close()
                onAddFolder()
              }}
            >
              Add folder…
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

      <button type="button" onClick={onOpenWorkspace} disabled={busy} title="Open a folder workspace">
        Open
      </button>
      <button type="button" onClick={onSave} disabled={busy} title="Save (⌘S)">
        Save
      </button>
      <button type="button" onClick={onImportUrl} disabled={busy} title="Import Markdown from a URL">
        Import…
      </button>
    </div>
  )
}

type MenuProps = {
  label: string
  children: (close: () => void) => ReactNode
}

function Menu({ label, children }: MenuProps) {
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
