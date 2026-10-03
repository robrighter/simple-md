import type mermaidType from 'mermaid'

type Mermaid = typeof mermaidType
type MermaidTheme = 'default' | 'dark'

let mermaidPromise: Promise<Mermaid> | null = null
let renderCounter = 0
let initializedTheme: MermaidTheme | null = null
let queue: Promise<unknown> = Promise.resolve()
const cache = new Map<string, MermaidResult>()
const CACHE_LIMIT = 50

// Mermaid is large; load it lazily the first time a diagram is rendered.
function loadMermaid() {
  mermaidPromise ??= import('mermaid').then(
    (mod) => mod.default,
    (error) => {
      mermaidPromise = null // allow a retry after a failed load
      throw error
    },
  )
  return mermaidPromise
}

function currentTheme(): MermaidTheme {
  return document.documentElement.style.getPropertyValue('color-scheme').includes('dark')
    ? 'dark'
    : 'default'
}

export type MermaidResult = { svg: string } | { error: string }

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

// mermaid.render is not safe to run concurrently (shared temp DOM + global
// config), so renders are queued. The queue also keeps results in call order.
export function renderMermaid(
  source: string,
  options: { theme?: MermaidTheme } = {},
): Promise<MermaidResult> {
  const task = queue.then(() => renderNow(source, options.theme))
  queue = task.catch(() => undefined)
  return task
}

async function renderNow(source: string, forcedTheme?: MermaidTheme): Promise<MermaidResult> {
  const theme = forcedTheme ?? currentTheme()
  const key = `${theme}\n${source}`
  const cached = cache.get(key)
  if (cached) return cached

  const id = `mermaid-${++renderCounter}`
  try {
    const mermaid = await loadMermaid()
    if (initializedTheme !== theme) {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme })
      initializedTheme = theme
    }
    // parse() creates no DOM on failure, unlike render(), which can leave an
    // error SVG behind in <body> — important while the user is mid-typing.
    await mermaid.parse(source)
    const { svg } = await mermaid.render(id, source)
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
    const result = { svg }
    cache.set(key, result)
    return result
  } catch (error) {
    document.getElementById(id)?.remove()
    document.getElementById(`d${id}`)?.remove()
    return { error: errorMessage(error) }
  }
}

export function mermaidErrorHtml(message: string) {
  const el = document.createElement('div')
  el.className = 'mermaid-error'
  el.textContent = message
  return el
}
