import { forwardRef, useImperativeHandle, useRef } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView, ViewPlugin, Decoration, type ViewUpdate, type DecorationSet } from '@codemirror/view'
import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state'

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

// ── Editor theme ─────────────────────────────────────────────────────────────

const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: '#2f2417',
    height: '100%',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    borderRight: '1px solid rgba(59, 43, 20, 0.08)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(122, 31, 43, 0.08)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(122, 31, 43, 0.05)',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'rgba(74, 50, 71, 0.18) !important',
  },
  '.cm-cursor': {
    borderLeftColor: '#7a1f2b',
  },
  '.cm-find-match': {
    backgroundColor: 'rgba(255, 190, 0, 0.35)',
    borderRadius: '2px',
  },
  '.cm-find-current': {
    backgroundColor: 'rgba(255, 130, 0, 0.55)',
    borderRadius: '2px',
  },
})

// ── Component ─────────────────────────────────────────────────────────────────

export const EditorPane = forwardRef<EditorApi, EditorPaneProps>(function EditorPane(
  { content, onChange },
  ref,
) {
  const cmRef = useRef<ReactCodeMirrorRef | null>(null)

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
    <section className="editor-shell">
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
        extensions={[markdown(), EditorView.lineWrapping, editorTheme, findStateField, findHighlightPlugin]}
        onChange={onChange}
      />
    </section>
  )
})
