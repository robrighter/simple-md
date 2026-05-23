import type { OpenDocument } from './types'

export function createWelcomeDocument(): OpenDocument {
  return {
    id: 'welcome',
    title: 'Welcome.md',
    mode: 'preview',
    isDirty: false,
    content: `# Welcome to Simple MD

Simple MD is a local-first editor for real Markdown files. This welcome note is also a tutorial: switch to **Text** or **Split** mode to see the Markdown source behind every example, then return to **Display** to see the rendered result.

## 1. Pick a View

Use the view switcher in the toolbar:

- **Display** shows the polished rendered document.
- **Text** gives you the raw Markdown source.
- **Hybrid** keeps Markdown editable while rendering many elements in place.
- **Split** puts source on the left and rendered preview on the right.

Try selecting **Split** now. It is the fastest way to learn how the examples in this file work.

## 2. Work with Real Files and Folders

Simple MD does not hide your writing in a database. Files stay on disk.

1. Use **Open > Open folder...** to open a folder of Markdown files.
2. Use the **Folders** sidebar to browse files.
3. Use **New > New file** or **New > New folder** to create items inside the selected folder.
4. Right-click a file or folder in the sidebar to rename or delete it.
5. Press **Save** or use your normal save shortcut when you are done editing.

If a file changes on disk while it is open here, Simple MD will show a banner so you can reload the disk version or overwrite it with your editor contents.

## 3. Everyday Markdown

Markdown is plain text that can still look rich when rendered.

### Headings and Emphasis

Use headings to structure a document. Use **bold** for strong emphasis, _italic_ for nuance, and \`inline code\` for commands, file names, or short values.

### Lists

- Bulleted lists are good for notes.
- Numbered lists are good for procedures.
- Task lists are good for lightweight planning:

- [x] Open this welcome file
- [ ] Switch to Split mode
- [ ] Create your first file

### Blockquotes

> A Markdown file should remain useful even outside the app that created it.

## 4. Tables

Tables are useful for compact comparisons.

| View | Best for | Editable |
| --- | --- | --- |
| Display | Reading and review | No |
| Text | Precise Markdown editing | Yes |
| Hybrid | Writing with visual structure | Yes |
| Split | Learning and comparing source with output | Yes |

## 5. Code Blocks

Use fenced code blocks for snippets. Add a language name after the opening fence for syntax highlighting.

\`\`\`ts
type Note = {
  title: string
  path: string
  isDirty: boolean
}
\`\`\`

## 6. Links and Images

Links work like regular Markdown:

[Open the Markdown Guide](https://www.markdownguide.org/)

Images use the same source syntax:

\`\`\`md
![Alt text](https://example.com/image.png)
\`\`\`

When you import Markdown from a URL, Simple MD keeps relative links and images pointed back at the original source where possible.

## 7. Math

Write inline math with single dollar signs, like $E = mc^2$ or $a^2 + b^2 = c^2$.

Use double dollar signs for display math:

$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
$$

Another example:

$$
\\frac{d}{dx}\\left(x^3 + 2x\\right) = 3x^2 + 2
$$

## 8. Charts

Charts are Markdown code fences with the language set to \`chart\`. The contents are JSON. Switch to **Text** or **Split** to inspect the source for each chart below.

### Area Chart

\`\`\`chart
{
  "type": "area",
  "title": "Writing Momentum",
  "description": "Words drafted and revised through the week.",
  "data": [
    { "day": "Mon", "words": 420, "revisions": 90 },
    { "day": "Tue", "words": 610, "revisions": 120 },
    { "day": "Wed", "words": 720, "revisions": 160 },
    { "day": "Thu", "words": 540, "revisions": 210 },
    { "day": "Fri", "words": 880, "revisions": 190 }
  ],
  "xKey": "day",
  "height": 300
}
\`\`\`

### Bar Chart

\`\`\`chart
{
  "type": "bar",
  "title": "Documentation Backlog",
  "description": "Open work by category.",
  "data": [
    { "category": "Guides", "open": 8, "done": 5 },
    { "category": "API", "open": 5, "done": 9 },
    { "category": "Tutorials", "open": 6, "done": 4 },
    { "category": "Reference", "open": 3, "done": 7 }
  ],
  "xKey": "category",
  "series": [
    { "key": "open", "label": "Open", "color": "#b54a4a" },
    { "key": "done", "label": "Done", "color": "#5a7a55" }
  ],
  "height": 280
}
\`\`\`

### Line Chart

\`\`\`chart
{
  "type": "line",
  "title": "Draft Quality",
  "description": "Review score over successive drafts.",
  "data": [
    { "draft": "v1", "score": 54 },
    { "draft": "v2", "score": 68 },
    { "draft": "v3", "score": 76 },
    { "draft": "v4", "score": 87 }
  ],
  "xKey": "draft",
  "series": [
    { "key": "score", "label": "Score", "color": "#315d74" }
  ],
  "height": 260
}
\`\`\`

### Donut Chart

\`\`\`chart
{
  "type": "pie",
  "title": "Focus Mix",
  "description": "How the writing session was spent.",
  "data": [
    { "activity": "Drafting", "minutes": 45 },
    { "activity": "Research", "minutes": 25 },
    { "activity": "Editing", "minutes": 30 },
    { "activity": "Review", "minutes": 15 }
  ],
  "xKey": "activity",
  "yKey": "minutes",
  "donut": true,
  "height": 300
}
\`\`\`

### Chart Recipe

Most chart blocks use these fields:

| Field | Purpose |
| --- | --- |
| \`type\` | \`bar\`, \`line\`, \`area\`, or \`pie\` |
| \`title\` | Heading shown above the chart |
| \`description\` | Optional helper text |
| \`data\` | Array of objects containing labels and numbers |
| \`xKey\` | Field used for labels on the x-axis or pie names |
| \`series\` | Optional list of numeric fields, labels, and colors |
| \`height\` | Chart height in pixels |

If you leave out \`series\`, Simple MD will try to infer numeric series from your data.

## 9. Import from the Web

Use **Import...** to fetch a Markdown file from an HTTPS URL. GitHub \`blob\` URLs are converted to raw Markdown automatically. Imported documents open as temporary tabs until you save them into a local folder.

## 10. Local AI Help

The **Get a little help from AI?** button opens an optional local assistant. It can help draft, revise, summarize, or transform selected text. The runtime is designed to run locally on your machine rather than sending document text to a hosted service.

## 11. A Good First Experiment

1. Switch to **Split** mode.
2. Copy one chart block.
3. Change a few numbers in the JSON.
4. Switch back to **Display** and see the chart update.
5. Save the file into a folder when you want to keep it.

That is the core idea: plain Markdown as the source of truth, with just enough structure to make the document feel alive.
`,
  }
}
