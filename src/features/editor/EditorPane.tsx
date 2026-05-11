import { forwardRef, useImperativeHandle, useRef } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'

export type EditorApi = {
  getContent: () => string
  getSelection: () => string
  hasSelection: () => boolean
  replaceDocument: (text: string) => void
  replaceSelection: (text: string) => void
  insertAtCursor: (text: string) => void
  appendToDocument: (text: string) => void
  focus: () => void
}

type EditorPaneProps = {
  content: string
  onChange: (value: string) => void
}

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
})

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
        extensions={[markdown(), EditorView.lineWrapping, editorTheme]}
        onChange={onChange}
      />
    </section>
  )
})
