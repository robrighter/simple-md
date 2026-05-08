import type { OpenDocument } from './types'

export function createWelcomeDocument(): OpenDocument {
  return {
    id: 'welcome',
    title: 'Welcome.md',
    mode: 'preview',
    isDirty: false,
    content: `# Simple MD

An editor for real Markdown files, designed to feel polished instead of punishing.

## What is already live

- Robust Markdown authoring
- Read-only preview mode
- Hybrid edit + render mode
- Inline math like $E = mc^2$
- Block math
- Inline charts with JSON specs
- Local-first folder workspaces through the Tauri backend

## Math sample

$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
$$

## Inline chart sample

\`\`\`chart
{
  "type": "area",
  "title": "Writing Momentum",
  "description": "Words drafted through the week.",
  "data": [
    { "day": "Mon", "words": 420, "revisions": 90 },
    { "day": "Tue", "words": 610, "revisions": 120 },
    { "day": "Wed", "words": 720, "revisions": 160 },
    { "day": "Thu", "words": 540, "revisions": 210 },
    { "day": "Fri", "words": 880, "revisions": 190 }
  ],
  "xKey": "day",
  "height": 320
}
\`\`\`

## Why this shape works

Simple MD keeps Markdown as the source of truth, but it still makes the document feel rich. You can write in raw text, read in a beautiful render mode, or stay in the middle with a hybrid composition view.

> Open a workspace folder from the left rail to start working with real files on disk.
`,
  }
}
