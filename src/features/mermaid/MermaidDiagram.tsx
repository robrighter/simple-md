import { useEffect, useState } from 'react'
import { renderMermaid, type MermaidResult } from './renderMermaid'
import { openMermaidViewer } from './viewer'

type MermaidDiagramProps = {
  source: string
  // Static renders (HTML export / print) are always light-themed and have no
  // interactive controls.
  staticRender?: boolean
}

export function MermaidDiagram({ source, staticRender = false }: MermaidDiagramProps) {
  const [result, setResult] = useState<MermaidResult | null>(null)

  useEffect(() => {
    let cancelled = false
    void renderMermaid(source, staticRender ? { theme: 'default' } : undefined).then((next) => {
      if (!cancelled) setResult(next)
    })
    return () => {
      cancelled = true
    }
  }, [source, staticRender])

  if (result && 'error' in result) {
    return (
      <div className="chart-error mermaid-error">
        <p>Mermaid diagram could not be rendered.</p>
        <code>{result.error}</code>
      </div>
    )
  }

  const svg = result?.svg ?? ''

  return (
    <div
      className="mermaid-diagram"
      data-mermaid-pending={svg ? undefined : ''}
      onDoubleClick={staticRender ? undefined : () => svg && openMermaidViewer(svg)}
    >
      {/* SVG is produced by mermaid with securityLevel 'strict' (sanitized). */}
      <div className="mermaid-diagram__body" dangerouslySetInnerHTML={{ __html: svg }} />
      {svg && !staticRender && (
        <button
          type="button"
          className="mermaid-viewer__btn mermaid-diagram__expand"
          title="Open full screen"
          onClick={() => openMermaidViewer(svg)}
        >
          {'⛶'}
        </button>
      )}
    </div>
  )
}
