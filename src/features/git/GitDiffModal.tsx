import type { GitFileSnapshot } from '../../app/types'
import type { DiffRow, GitChangeSummary } from './gitDiff'

type GitDiffModalProps = {
  path: string
  snapshot: GitFileSnapshot
  rows: DiffRow[]
  summary: GitChangeSummary
  onClose: () => void
}

type VisibleDiffRow = DiffRow | { kind: 'separator'; id: string }

const CONTEXT_RADIUS = 4

export function GitDiffModal({
  path,
  snapshot,
  rows,
  summary,
  onClose,
}: GitDiffModalProps) {
  const visibleRows = compactRows(rows)
  const status = snapshot.status?.trim() || 'Working tree differs from the last committed version.'

  return (
    <div className="ai-modal git-modal" role="dialog" aria-modal="true" aria-labelledby="git-diff-title">
      <div className="ai-modal__panel git-modal__panel">
        <header className="ai-modal__head">
          <div>
            <h2 id="git-diff-title">Git diff</h2>
            <p>{snapshot.relativePath || path}</p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="git-diff-summary" aria-label="Git change summary">
          <span>{snapshot.tracked ? snapshot.headLabel || 'HEAD' : 'Untracked'}</span>
          <span>{summary.added} added</span>
          <span>{summary.modified} changed</span>
          <span>{summary.deleted} deleted</span>
        </div>

        <p className="ai-modal__hint">{status}</p>

        <div className="git-diff" role="table" aria-label="Line-by-line Git diff">
          <div className="git-diff__head" role="row">
            <span role="columnheader">Old</span>
            <span role="columnheader">New</span>
            <span role="columnheader">Markdown</span>
          </div>
          <div className="git-diff__body">
            {visibleRows.length === 0 ? (
              <div className="git-diff__empty">No line changes against {snapshot.headLabel || 'HEAD'}.</div>
            ) : (
              visibleRows.map((row, index) => {
                if (row.kind === 'separator') {
                  return (
                    <div className="git-diff__separator" role="row" key={row.id}>
                      <span aria-hidden="true">...</span>
                    </div>
                  )
                }

                return (
                  <div className="git-diff__row" data-kind={row.kind} role="row" key={`${row.kind}-${index}`}>
                    <span role="cell">{'oldLine' in row ? row.oldLine : ''}</span>
                    <span role="cell">{'newLine' in row ? row.newLine : ''}</span>
                    <code role="cell">{row.content || ' '}</code>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function compactRows(rows: DiffRow[]): VisibleDiffRow[] {
  const changed = rows
    .map((row, index) => (row.kind === 'context' ? -1 : index))
    .filter((index) => index >= 0)

  if (changed.length === 0) {
    return []
  }

  const include = new Set<number>()

  for (const index of changed) {
    const start = Math.max(0, index - CONTEXT_RADIUS)
    const end = Math.min(rows.length - 1, index + CONTEXT_RADIUS)

    for (let current = start; current <= end; current += 1) {
      include.add(current)
    }
  }

  const visible: VisibleDiffRow[] = []
  let skipped = false

  for (let index = 0; index < rows.length; index += 1) {
    if (!include.has(index)) {
      skipped = true
      continue
    }

    if (skipped) {
      visible.push({ kind: 'separator', id: `gap-${index}` })
      skipped = false
    }

    visible.push(rows[index])
  }

  return visible
}
