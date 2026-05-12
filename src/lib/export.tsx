type ExportHtmlOptions = {
  title: string
  content: string
  baseUrl?: string
}

export async function createExportHtml({ title, content, baseUrl }: ExportHtmlOptions) {
  const [{ renderToStaticMarkup }, { MarkdownPreview }] = await Promise.all([
    import('react-dom/server'),
    import('../features/preview/MarkdownPreview'),
  ])
  const previewMarkup = renderToStaticMarkup(
    <MarkdownPreview
      content={content}
      baseUrl={baseUrl}
      className="export-preview"
      staticCharts
    />,
  )

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
