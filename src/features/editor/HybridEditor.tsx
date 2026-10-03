import { useEffect, useRef } from 'react'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { languages as defaultLanguages } from '@codemirror/language-data'
import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language'
import { renderMermaid, mermaidErrorHtml } from '../mermaid/renderMermaid'
import { createMermaidElement, openMermaidViewer } from '../mermaid/viewer'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

// CodeMirror has no Mermaid grammar; register it as a plain-text language so it
// shows up in the code-block language picker and ```mermaid blocks keep their tag.
const mermaidLanguage = LanguageDescription.of({
  name: 'Mermaid',
  alias: ['mermaid', 'mmd'],
  extensions: ['mmd', 'mermaid'],
  load: async () =>
    new LanguageSupport(
      StreamLanguage.define({
        token(stream) {
          stream.skipToEnd()
          return null
        },
      }),
    ),
})

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
      featureConfigs: {
        [CrepeFeature.CodeMirror]: {
          languages: [...defaultLanguages, mermaidLanguage],
          // Render ```mermaid blocks as live diagrams next to the editable source.
          renderPreview: (language, source, applyPreview) => {
            if (language.toLowerCase() !== 'mermaid' || source.trim().length === 0) {
              return null
            }
            void renderMermaid(source).then((result) => {
              applyPreview('error' in result ? mermaidErrorHtml(result.error) : createMermaidElement(result.svg))
            })
            return undefined
          },
        },
      },
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

  // Crepe sanitizes preview markup through DOMPurify and re-parses it, which
  // drops listeners attached to the element we hand it — so open the full-screen
  // viewer via delegated listeners on the host instead.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    function openFrom(target: EventTarget | null, requireButton: boolean) {
      const el = target instanceof Element ? target : null
      const diagram = el?.closest('.mermaid-diagram')
      if (!diagram || (requireButton && !el?.closest('.mermaid-diagram__expand'))) return
      const svg = diagram.querySelector('.mermaid-diagram__body')?.innerHTML
      if (svg) openMermaidViewer(svg)
    }

    const onClick = (event: MouseEvent) => openFrom(event.target, true)
    const onDoubleClick = (event: MouseEvent) => openFrom(event.target, false)
    host.addEventListener('click', onClick)
    host.addEventListener('dblclick', onDoubleClick)
    return () => {
      host.removeEventListener('click', onClick)
      host.removeEventListener('dblclick', onDoubleClick)
    }
  }, [])

  return <div className="hybrid-shell" ref={hostRef} />
}
