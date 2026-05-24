import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

type ExportHtmlOptions = {
  title: string
  content: string
  baseUrl?: string
}

export async function createExportHtml({ title, content, baseUrl }: ExportHtmlOptions) {
  const { MarkdownPreview } = await import('../features/preview/MarkdownPreview')

  const container = document.createElement('div')
  container.style.cssText = 'position:absolute;top:-10000px;left:-10000px;width:860px'
  document.body.appendChild(container)

  const root = createRoot(container)
  flushSync(() => {
    root.render(<MarkdownPreview content={content} baseUrl={baseUrl} staticCharts />)
  })

  const previewMarkup = container.innerHTML
  root.unmount()
  document.body.removeChild(container)

  return buildExportHtml(title, previewMarkup)
}

export function printDocument(html: string): void {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none'
  document.body.appendChild(iframe)

  iframe.addEventListener(
    'load',
    () => {
      iframe.contentWindow?.print()
      setTimeout(() => iframe.remove(), 2_000)
    },
    { once: true },
  )

  iframe.srcdoc = html
}

function buildExportHtml(title: string, previewMarkup: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #fff;
        color: #172033;
        font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(860px, calc(100vw - 48px));
        margin: 48px auto 72px;
      }
      article { overflow-wrap: anywhere; }
      h1, h2, h3, h4, h5, h6 {
        color: #101828;
        line-height: 1.2;
        margin: 1.5em 0 0.6em;
      }
      h1:first-child { margin-top: 0; }
      a { color: #0f766e; }
      img { display: block; max-width: 100%; height: auto; }
      .chart-static-svg {
        display: block;
        width: 100%;
        height: auto;
      }
      blockquote {
        margin: 1.25rem 0;
        padding: 0.1rem 1rem;
        border-left: 4px solid #0f766e;
        background: #f3f7f6;
      }
      pre, code {
        border-radius: 6px;
        background: #f3f4f6;
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      }
      code { padding: 0.15rem 0.35rem; }
      pre {
        overflow-x: auto;
        padding: 1rem;
      }
      pre code { padding: 0; background: transparent; }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 1.25rem 0;
      }
      th, td {
        border: 1px solid #d0d5dd;
        padding: 0.65rem 0.75rem;
        text-align: left;
        vertical-align: top;
      }
      th { background: #f8fafc; }
      .preview-shell__banner { display: none; }
      @page {
        margin: 0.65in;
      }
      @media print {
        main {
          width: auto;
          margin: 0;
        }
        body {
          color: #111827;
        }
        a {
          color: inherit;
          text-decoration: underline;
        }
      }
    </style>
  </head>
  <body>
    <main>${previewMarkup}</main>
  </body>
</html>`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
