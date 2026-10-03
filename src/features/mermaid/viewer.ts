const MIN_SCALE = 0.1
const MAX_SCALE = 8

type Size = { w: number; h: number }

function svgSize(svg: SVGSVGElement): Size {
  const vb = svg.viewBox.baseVal
  if (vb && vb.width > 0 && vb.height > 0) return { w: vb.width, h: vb.height }
  const box = svg.getBoundingClientRect()
  return { w: box.width || 800, h: box.height || 600 }
}

function button(label: string, title: string, onClick: () => void) {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'mermaid-viewer__btn'
  el.textContent = label
  el.title = title
  el.addEventListener('click', onClick)
  return el
}

// Full-window diagram viewer: wheel scrolls, ctrl/pinch-wheel zooms toward the
// cursor, drag pans, +/-/0/Esc keys. Takes the SVG markup mermaid produced.
export function openMermaidViewer(svgMarkup: string) {
  if (document.querySelector('.mermaid-viewer')) return
  const previouslyFocused = document.activeElement as HTMLElement | null
  const overlay = document.createElement('div')
  overlay.className = 'mermaid-viewer'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.tabIndex = -1

  const stage = document.createElement('div')
  stage.className = 'mermaid-viewer__stage'
  const canvas = document.createElement('div')
  canvas.className = 'mermaid-viewer__canvas'
  canvas.innerHTML = svgMarkup
  stage.appendChild(canvas)

  const svg = canvas.querySelector('svg')
  if (!svg) return
  const size = svgSize(svg)
  svg.removeAttribute('style')
  svg.setAttribute('width', String(size.w))
  svg.setAttribute('height', String(size.h))

  let scale = 1
  let x = 0
  let y = 0
  const zoomLabel = document.createElement('span')
  zoomLabel.className = 'mermaid-viewer__zoom'

  function apply() {
    canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    zoomLabel.textContent = `${Math.round(scale * 100)}%`
  }

  function zoomAt(next: number, cx: number, cy: number) {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
    const ratio = clamped / scale
    x = cx - (cx - x) * ratio
    y = cy - (cy - y) * ratio
    scale = clamped
    apply()
  }

  function zoomCentered(factor: number) {
    const r = stage.getBoundingClientRect()
    zoomAt(scale * factor, r.width / 2, r.height / 2)
  }

  function fit() {
    const r = stage.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    scale = Math.min(MAX_SCALE, Math.min(r.width / size.w, r.height / size.h) * 0.92)
    x = (r.width - size.w * scale) / 2
    y = (r.height - size.h * scale) / 2
    apply()
  }

  function actualSize() {
    const r = stage.getBoundingClientRect()
    scale = 1
    x = (r.width - size.w) / 2
    y = (r.height - size.h) / 2
    apply()
  }

  function close() {
    document.removeEventListener('keydown', onKey, true)
    overlay.remove()
    previouslyFocused?.focus?.()
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') close()
    else if (event.key === '+' || event.key === '=') zoomCentered(1.25)
    else if (event.key === '-') zoomCentered(0.8)
    else if (event.key === '0') fit()
    else return
    event.preventDefault()
    event.stopPropagation()
  }

  const toolbar = document.createElement('div')
  toolbar.className = 'mermaid-viewer__toolbar'
  toolbar.append(
    button('−', 'Zoom out (-)', () => zoomCentered(0.8)),
    zoomLabel,
    button('+', 'Zoom in (+)', () => zoomCentered(1.25)),
    button('Fit', 'Fit to window (0)', fit),
    button('100%', 'Actual size', actualSize),
    button('✕', 'Close (Esc)', close),
  )

  stage.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault()
      const r = stage.getBoundingClientRect()
      if (event.ctrlKey || event.metaKey) {
        zoomAt(scale * Math.exp(-event.deltaY * 0.01), event.clientX - r.left, event.clientY - r.top)
      } else {
        x -= event.shiftKey ? event.deltaY : event.deltaX
        y -= event.shiftKey ? 0 : event.deltaY
        apply()
      }
    },
    { passive: false },
  )

  let drag: { px: number; py: number; ox: number; oy: number } | null = null
  stage.addEventListener('pointerdown', (event) => {
    drag = { px: event.clientX, py: event.clientY, ox: x, oy: y }
    stage.setPointerCapture(event.pointerId)
    stage.classList.add('is-dragging')
  })
  stage.addEventListener('pointermove', (event) => {
    if (!drag) return
    x = drag.ox + event.clientX - drag.px
    y = drag.oy + event.clientY - drag.py
    apply()
  })
  const endDrag = () => {
    drag = null
    stage.classList.remove('is-dragging')
  }
  stage.addEventListener('pointerup', endDrag)
  stage.addEventListener('pointercancel', endDrag)
  stage.addEventListener('dblclick', fit)

  overlay.append(stage, toolbar)
  document.body.appendChild(overlay)
  document.addEventListener('keydown', onKey, true)
  apply()
  overlay.focus()
  requestAnimationFrame(fit)
}

// Markup for the Hybrid editor preview: the diagram plus a hover "expand"
// button. Crepe re-sanitizes preview markup (dropping listeners), so the viewer
// is opened by delegated listeners on the editor host (see HybridEditor).
export function createMermaidElement(svgMarkup: string) {
  const wrap = document.createElement('div')
  wrap.className = 'mermaid-diagram'
  const body = document.createElement('div')
  body.className = 'mermaid-diagram__body'
  body.innerHTML = svgMarkup
  const expand = document.createElement('button')
  expand.type = 'button'
  expand.className = 'mermaid-viewer__btn mermaid-diagram__expand'
  expand.title = 'Open full screen'
  expand.textContent = '⛶'
  wrap.append(body, expand)
  return wrap
}
