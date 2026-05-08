import { useEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

type HybridEditorProps = {
  content: string
  onChange: (value: string) => void
}

// Wrapper around Milkdown's Crepe preset (ProseMirror under the hood with
// commonmark + gfm + slash commands + block handle). Crepe handles the lossless
// Markdown round-trip for us; we just observe the listener stream.
//
// `content` is captured on mount only — the parent keys this component on the
// active document id, so switching docs remounts and re-seeds the editor.
export function HybridEditor({ content, onChange }: HybridEditorProps) {
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

  return <div className="hybrid-shell" ref={hostRef} />
}
