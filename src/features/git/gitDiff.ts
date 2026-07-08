import type { GitLineChange, GitLineChangeKind } from '../../app/types'

export type DiffRow =
  | {
      kind: 'context'
      oldLine: number
      newLine: number
      content: string
    }
  | {
      kind: 'removed'
      oldLine: number
      content: string
    }
  | {
      kind: 'added'
      newLine: number
      content: string
    }

export type GitChangeSummary = {
  added: number
  modified: number
  deleted: number
  total: number
}

const MAX_LCS_CELLS = 1_500_000

export function buildLineDiff(baseContent: string, currentContent: string): DiffRow[] {
  const baseLines = splitLines(baseContent)
  const currentLines = splitLines(currentContent)
  const cells = (baseLines.length + 1) * (currentLines.length + 1)

  if (cells > MAX_LCS_CELLS) {
    return buildPositionalDiff(baseLines, currentLines)
  }

  return buildLcsDiff(baseLines, currentLines)
}

export function gitLineChangesFromDiff(rows: DiffRow[], currentContent: string): GitLineChange[] {
  const currentLineCount = Math.max(1, splitLines(currentContent).length)
  const byLine = new Map<number, GitLineChangeKind>()
  let pendingRemoved = 0
  let lastNewLine = 0

  for (const row of rows) {
    if (row.kind === 'context') {
      if (pendingRemoved > 0) {
        markLine(byLine, clampLine(row.newLine, currentLineCount), 'deleted')
        pendingRemoved = 0
      }
      lastNewLine = row.newLine
      continue
    }

    if (row.kind === 'removed') {
      pendingRemoved += 1
      continue
    }

    const kind = pendingRemoved > 0 ? 'modified' : 'added'
    markLine(byLine, clampLine(row.newLine, currentLineCount), kind)
    lastNewLine = row.newLine

    if (pendingRemoved > 0) {
      pendingRemoved -= 1
    }
  }

  if (pendingRemoved > 0) {
    markLine(byLine, clampLine(lastNewLine || currentLineCount, currentLineCount), 'deleted')
  }

  return [...byLine.entries()]
    .map(([line, kind]) => ({ line, kind }))
    .sort((left, right) => left.line - right.line)
}

export function summarizeLineChanges(changes: GitLineChange[]): GitChangeSummary {
  const summary: GitChangeSummary = {
    added: 0,
    modified: 0,
    deleted: 0,
    total: changes.length,
  }

  for (const change of changes) {
    summary[change.kind] += 1
  }

  return summary
}

export function formatGitChangeSummary(summary: GitChangeSummary) {
  if (summary.total === 0) {
    return 'Git: clean'
  }

  const parts = [
    summary.added > 0 ? `${summary.added} added` : '',
    summary.modified > 0 ? `${summary.modified} changed` : '',
    summary.deleted > 0 ? `${summary.deleted} deleted` : '',
  ].filter(Boolean)

  return `Git: ${parts.join(', ')}`
}

function buildLcsDiff(baseLines: string[], currentLines: string[]): DiffRow[] {
  const oldLength = baseLines.length
  const newLength = currentLines.length
  const width = newLength + 1
  const directions = new Uint8Array((oldLength + 1) * width)
  let previous = new Uint32Array(width)
  let current = new Uint32Array(width)

  for (let oldIndex = 1; oldIndex <= oldLength; oldIndex += 1) {
    for (let newIndex = 1; newIndex <= newLength; newIndex += 1) {
      const directionIndex = oldIndex * width + newIndex

      if (baseLines[oldIndex - 1] === currentLines[newIndex - 1]) {
        current[newIndex] = previous[newIndex - 1] + 1
        directions[directionIndex] = 0
      } else if (previous[newIndex] >= current[newIndex - 1]) {
        current[newIndex] = previous[newIndex]
        directions[directionIndex] = 1
      } else {
        current[newIndex] = current[newIndex - 1]
        directions[directionIndex] = 2
      }
    }

    const swap = previous
    previous = current
    current = swap
    current.fill(0)
  }

  const rows: DiffRow[] = []
  let oldIndex = oldLength
  let newIndex = newLength

  while (oldIndex > 0 || newIndex > 0) {
    if (
      oldIndex > 0 &&
      newIndex > 0 &&
      baseLines[oldIndex - 1] === currentLines[newIndex - 1]
    ) {
      rows.push({
        kind: 'context',
        oldLine: oldIndex,
        newLine: newIndex,
        content: currentLines[newIndex - 1],
      })
      oldIndex -= 1
      newIndex -= 1
      continue
    }

    const direction = oldIndex > 0 && newIndex > 0 ? directions[oldIndex * width + newIndex] : 0

    if (newIndex > 0 && (oldIndex === 0 || direction === 2)) {
      rows.push({
        kind: 'added',
        newLine: newIndex,
        content: currentLines[newIndex - 1],
      })
      newIndex -= 1
    } else if (oldIndex > 0) {
      rows.push({
        kind: 'removed',
        oldLine: oldIndex,
        content: baseLines[oldIndex - 1],
      })
      oldIndex -= 1
    }
  }

  return rows.reverse()
}

function buildPositionalDiff(baseLines: string[], currentLines: string[]): DiffRow[] {
  const rows: DiffRow[] = []
  const maxLength = Math.max(baseLines.length, currentLines.length)

  for (let index = 0; index < maxLength; index += 1) {
    const oldLine = baseLines[index]
    const newLine = currentLines[index]

    if (oldLine === newLine && typeof oldLine === 'string') {
      rows.push({
        kind: 'context',
        oldLine: index + 1,
        newLine: index + 1,
        content: oldLine,
      })
    } else {
      if (typeof oldLine === 'string') {
        rows.push({
          kind: 'removed',
          oldLine: index + 1,
          content: oldLine,
        })
      }
      if (typeof newLine === 'string') {
        rows.push({
          kind: 'added',
          newLine: index + 1,
          content: newLine,
        })
      }
    }
  }

  return rows
}

function splitLines(content: string) {
  const normalized = content.replace(/\r\n?/g, '\n')

  if (normalized.length === 0) {
    return []
  }

  return normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n') : normalized.split('\n')
}

function markLine(
  byLine: Map<number, GitLineChangeKind>,
  line: number,
  kind: GitLineChangeKind,
) {
  const current = byLine.get(line)

  if (current === 'modified' || current === kind) {
    return
  }

  if (kind === 'modified' || current === undefined || current === 'deleted') {
    byLine.set(line, kind)
  }
}

function clampLine(line: number, lineCount: number) {
  return Math.max(1, Math.min(line, lineCount))
}
