import { useEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

type HybridEditorProps = {
  content: string
  onChange: (value: string) => void
  findQuery?: string
  findCurrentIndex?: number
}

// Wrapper around Milkdown's Crepe preset (ProseMirror under the hood with
// commonmark + gfm + slash commands + block handle). Crepe handles the lossless
// Markdown round-trip for us; we just observe the listener stream.
//
// `content` is captured on mount only — the parent keys this component on the
// active document id, so switching docs remounts and re-seeds the editor.
export function HybridEditor({ content, onChange, findQuery, findCurrentIndex }: HybridEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (!hostRef.current) return

    const crepe = new Crepe({
      root: hostRef.current,
      defaultValue: content,
    })

    let listenerAttached = false
    let cancelled = false

    void crepe
      .create()
      .then(() => {
        if (cancelled) return
        // Attach listener AFTER create() resolves so the editor view is wired
        // up. Attaching during construction triggers a context-not-found error
        // because the listener fires on the initial document setup before the
        // editorView slot is injected.
        crepe.on((listener) => {
          listener.markdownUpdated((_, markdown) => {
            onChangeRef.current(markdown)
          })
        })
        listenerAttached = true
      })
      .catch((error) => {
        console.error('HybridEditor failed to initialize:', error)
      })

    return () => {
      cancelled = true
      void crepe.destroy()
      // The listener is owned by the editor instance; destroy() tears it down.
      void listenerAttached
    }
    // We intentionally only mount once per document id; see the parent's `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host || !('highlights' in CSS)) return

    CSS.highlights.delete('hybrid-find-match')
    CSS.highlights.delete('hybrid-find-current')

    if (!findQuery) return

    const ranges: Range[] = []
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
    const query = findQuery.toLowerCase()
    let node: Node | null

    while ((node = walker.nextNode())) {
      const text = (node.textContent ?? '').toLowerCase()
      let pos = 0
      while (true) {
        const idx = text.indexOf(query, pos)
        if (idx === -1) break
        const range = new Range()
        range.setStart(node, idx)
        range.setEnd(node, idx + query.length)
        ranges.push(range)
        pos = idx + 1
      }
    }

    if (ranges.length === 0) return

    CSS.highlights.set('hybrid-find-match', new Highlight(...ranges))

    const current = findCurrentIndex !== undefined ? ranges[findCurrentIndex % ranges.length] : null
    if (current) {
      CSS.highlights.set('hybrid-find-current', new Highlight(current))
      const el = current.startContainer.parentElement
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }

    return () => {
      CSS.highlights.delete('hybrid-find-match')
      CSS.highlights.delete('hybrid-find-current')
    }
  }, [findQuery, findCurrentIndex])

  return <div className="hybrid-shell" ref={hostRef} />
}
