// When asked for an edit, small models often wrap the rewritten Markdown in a
// fenced code block (```markdown ... ```), or prepend a lead-in like
// "Here's the rewrite:". This pulls the substantive payload out.
//
// We intentionally only strip a *single* outer fence — if the assistant produces
// nested fences (e.g. a Markdown rewrite that itself contains code blocks), the
// inner ones survive untouched. If no fence is present we return the trimmed text.
export function extractEditPayload(raw: string): string {
  let text = raw.trim()
  if (!text) return text

  // Strip a single conversational lead-in line ending with a colon, if it's
  // followed by a blank line. Keeps the model's actual content.
  text = text.replace(/^(?:here(?:'s| is)|sure|okay|absolutely)[^\n]{0,80}:\s*\n+/i, '')

  // Strip a single outermost fence.
  const fenceMatch = text.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```\s*$/)
  if (fenceMatch) {
    return fenceMatch[1]
  }

  return text
}
