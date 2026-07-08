import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import {
  Decoration,
  EditorView,
  GutterMarker,
  ViewPlugin,
  gutter,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { GitLineChange, GitLineChangeKind } from '../../app/types'

export type EditorApi = {
  getContent: () => string
  getSelection: () => string
  hasSelection: () => boolean
  replaceDocument: (text: string) => void
  replaceSelection: (text: string) => void
  insertAtCursor: (text: string) => void
  appendToDocument: (text: string) => void
  focus: () => void
  cmFindSet: (query: string, current: number) => void
  cmFindClear: () => void
}

type EditorPaneProps = {
  content: string
  onChange: (value: string) => void
  gitLineChanges?: GitLineChange[]
  onOpenGitDiff?: () => void
}

// ── Find highlight infrastructure ────────────────────────────────────────────

type FindState = { query: string; current: number }

const setFindEffect = StateEffect.define<FindState>()

const findStateField = StateField.define<FindState>({
  create: () => ({ query: '', current: 0 }),
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setFindEffect)) return e.value
    }
    return value
  },
})

const matchMark = Decoration.mark({ class: 'cm-find-match' })
const currentMark = Decoration.mark({ class: 'cm-find-match cm-find-current' })

function buildFindDecorations(view: EditorView): DecorationSet {
  const { query, current } = view.state.field(findStateField)
  if (!query) return Decoration.none

  const doc = view.state.doc.toString()
  const docLc = doc.toLowerCase()
  const queryLc = query.toLowerCase()
  const builder = new RangeSetBuilder<Decoration>()
  let pos = 0
  let matchIdx = 0

  while (true) {
    const start = docLc.indexOf(queryLc, pos)
    if (start === -1) break
    const end = start + queryLc.length
    builder.add(start, end, matchIdx === current ? currentMark : matchMark)
    pos = start + 1
    matchIdx++
  }

  return builder.finish()
}

const findHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildFindDecorations(view)
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.transactions.some((tr) => tr.effects.some((e) => e.is(setFindEffect)))
      ) {
        this.decorations = buildFindDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

// ── Syntax highlight style (maps lezer token tags → CSS vars) ────────────────

const markdownHighlight = HighlightStyle.define([
  // Headings — preserve weight/size cues, use theme ink
  { tag: t.heading1, color: 'var(--ink)', fontWeight: 'bold', fontSize: '1.15em' },
  { tag: t.heading2, color: 'var(--ink)', fontWeight: 'bold' },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], color: 'var(--ink)', fontWeight: 'bold' },
  // Emphasis / strong — style only, no color divergence
  { tag: t.emphasis, color: 'var(--ink)', fontStyle: 'italic' },
  { tag: t.strong, color: 'var(--ink)', fontWeight: 'bold' },
  // Everything else: use --ink so dark themes are white, light themes are dark
  { tag: t.link, color: 'var(--ink)' },
  { tag: t.url, color: 'var(--ink)' },
  { tag: t.monospace, color: 'var(--ink)', fontFamily: 'var(--font-mono)' },
  { tag: t.tagName, color: 'var(--ink)' },
  { tag: t.processingInstruction, color: 'var(--ink)' },
  { tag: t.punctuation, color: 'var(--ink)' },
  { tag: t.meta, color: 'var(--ink)' },
  { tag: t.quote, color: 'var(--ink)', fontStyle: 'italic' },
  { tag: t.list, color: 'var(--ink)' },
  { tag: t.contentSeparator, color: 'var(--ink)' },
  { tag: t.keyword, color: 'var(--ink)' },
  { tag: t.string, color: 'var(--ink)' },
  { tag: t.number, color: 'var(--ink)' },
  { tag: t.comment, color: 'var(--ink-muted)', fontStyle: 'italic' },
  { tag: t.name, color: 'var(--ink)' },
  { tag: t.propertyName, color: 'var(--ink)' },
  { tag: t.variableName, color: 'var(--ink)' },
  { tag: t.typeName, color: 'var(--ink)' },
  { tag: t.operator, color: 'var(--ink)' },
  { tag: t.bracket, color: 'var(--ink)' },
])

// ── Editor theme ─────────────────────────────────────────────────────────────

const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: 'var(--ink)',
    height: '100%',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--ink-muted)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 5%, transparent)',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent) !important',
  },
  '.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent) !important',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--accent)',
  },
  '.cm-find-match': {
    backgroundColor: 'rgba(255, 190, 0, 0.38)',
    borderRadius: '2px',
  },
  '.cm-find-current': {
    backgroundColor: 'rgba(255, 130, 0, 0.58)',
    borderRadius: '2px',
  },
  '.cm-git-gutter': {
    width: '8px',
    borderRight: '0',
  },
  '.cm-git-marker': {
    display: 'block',
    width: '4px',
    height: '1.35em',
    margin: '0 auto',
    borderRadius: '999px',
  },
  '.cm-git-marker--added': {
    backgroundColor: '#4f8f55',
  },
  '.cm-git-marker--modified': {
    backgroundColor: '#c89866',
  },
  '.cm-git-marker--deleted': {
    backgroundColor: '#b54a4a',
  },
})

// ── Component ─────────────────────────────────────────────────────────────────

class GitChangeMarker extends GutterMarker {
  private kind: GitLineChangeKind

  constructor(kind: GitLineChangeKind) {
    super()
    this.kind = kind
  }

  eq(other: GutterMarker) {
    return other instanceof GitChangeMarker && other.kind === this.kind
  }

  toDOM() {
    const marker = document.createElement('span')
    marker.className = `cm-git-marker cm-git-marker--${this.kind}`
    marker.title =
      this.kind === 'added'
        ? 'Added since HEAD'
        : this.kind === 'modified'
          ? 'Changed since HEAD'
          : 'Deleted lines nearby'
    return marker
  }
}

function gitChangesGutter(changes: GitLineChange[]) {
  const changesByLine = new Map(changes.map((change) => [change.line, change.kind]))

  return gutter({
    class: 'cm-git-gutter',
    lineMarker(view, line) {
      const lineNumber = view.state.doc.lineAt(line.from).number
      const kind = changesByLine.get(lineNumber)

      return kind ? new GitChangeMarker(kind) : null
    },
    initialSpacer: () => new GitChangeMarker('modified'),
  })
}

export const EditorPane = forwardRef<EditorApi, EditorPaneProps>(function EditorPane(
  { content, onChange, gitLineChanges = [], onOpenGitDiff },
  ref,
) {
  const cmRef = useRef<ReactCodeMirrorRef | null>(null)
  const gitExtensions = useMemo(
    () => (gitLineChanges.length > 0 ? [gitChangesGutter(gitLineChanges)] : []),
    [gitLineChanges],
  )

  useImperativeHandle(ref, () => ({
    getContent() {
      return cmRef.current?.view?.state.doc.toString() ?? content
    },
    getSelection() {
      const view = cmRef.current?.view
      if (!view) return ''
      const { from, to } = view.state.selection.main
      return view.state.sliceDoc(from, to)
    },
    hasSelection() {
      const view = cmRef.current?.view
      if (!view) return false
      const { from, to } = view.state.selection.main
      return from !== to
    },
    replaceDocument(text: string) {
      const view = cmRef.current?.view
      if (!view) return
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: Math.min(text.length, 0) },
        scrollIntoView: true,
      })
      view.focus()
    },
    replaceSelection(text: string) {
      const view = cmRef.current?.view
      if (!view) return
      const { from, to } = view.state.selection.main
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from, head: from + text.length },
        scrollIntoView: true,
      })
      view.focus()
    },
    insertAtCursor(text: string) {
      const view = cmRef.current?.view
      if (!view) return
      const { from, to } = view.state.selection.main
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
        scrollIntoView: true,
      })
      view.focus()
    },
    appendToDocument(text: string) {
      const view = cmRef.current?.view
      if (!view) return
      const docLength = view.state.doc.length
      const lastChar = docLength > 0 ? view.state.sliceDoc(docLength - 1, docLength) : ''
      const prefix = lastChar === '\n' || docLength === 0 ? '' : '\n\n'
      const insert = `${prefix}${text}`
      view.dispatch({
        changes: { from: docLength, insert },
        selection: { anchor: docLength + insert.length },
        scrollIntoView: true,
      })
      view.focus()
    },
    focus() {
      cmRef.current?.view?.focus()
    },
    cmFindSet(query: string, current: number) {
      const view = cmRef.current?.view
      if (!view) return
      view.dispatch({ effects: setFindEffect.of({ query, current }) })

      // Scroll the target match into view and select it
      if (query) {
        const docLc = view.state.doc.toString().toLowerCase()
        const queryLc = query.toLowerCase()
        let pos = 0
        let idx = 0
        while (true) {
          const start = docLc.indexOf(queryLc, pos)
          if (start === -1) break
          if (idx === current) {
            view.dispatch({
              selection: { anchor: start, head: start + queryLc.length },
              scrollIntoView: true,
            })
            break
          }
          pos = start + 1
          idx++
        }
      }
    },
    cmFindClear() {
      const view = cmRef.current?.view
      if (!view) return
      view.dispatch({ effects: setFindEffect.of({ query: '', current: 0 }) })
    },
  }))

  return (
    <section
      className={`editor-shell ${
        gitLineChanges.length > 0 && onOpenGitDiff ? 'editor-shell--git-clickable' : ''
      }`}
      onClickCapture={(event) => {
        if (gitLineChanges.length === 0 || !onOpenGitDiff) {
          return
        }

        const target = event.target
        const gutterBand = event.clientX - event.currentTarget.getBoundingClientRect().left

        if (
          (target instanceof Element && target.closest('.cm-gutters')) ||
          gutterBand <= 96
        ) {
          event.preventDefault()
          onOpenGitDiff()
        }
      }}
    >
      <CodeMirror
        ref={cmRef}
        value={content}
        height="100%"
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
        }}
        extensions={[
          markdown(),
          EditorView.lineWrapping,
          editorTheme,
          syntaxHighlighting(markdownHighlight, { fallback: true }),
          findStateField,
          findHighlightPlugin,
          ...gitExtensions,
        ]}
        onChange={onChange}
      />
    </section>
  )
})
