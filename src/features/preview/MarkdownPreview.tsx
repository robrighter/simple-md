import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import type { Root, Element, Text, RootContent } from 'hast'
import { InlineChart } from '../charts/InlineChart'
import { openPathExternally } from '../../lib/desktop'
import { resolveDocumentUrl } from '../../lib/document'

type MarkdownPreviewProps = {
  content: string
  baseUrl?: string
  className?: string
  banner?: ReactNode
  staticCharts?: boolean
  findQuery?: string
  findCurrentIndex?: number
}

type MarkdownPreProps = ComponentPropsWithoutRef<'pre'> & {
  node?: {
    children?: Array<{
      type?: string
      tagName?: string
      properties?: {
        className?: string[] | string
      }
    }>
  }
}

// ── Find highlight rehype plugin ──────────────────────────────────────────────

function splitTextNode(node: Text, queryLc: string): RootContent[] {
  const text = node.value
  const lc = text.toLowerCase()
  const parts: RootContent[] = []
  let pos = 0

  while (true) {
    const idx = lc.indexOf(queryLc, pos)
    if (idx === -1) {
      if (pos < text.length) {
        parts.push({ type: 'text', value: text.slice(pos) })
      }
      break
    }
    if (idx > pos) {
      parts.push({ type: 'text', value: text.slice(pos, idx) })
    }
    parts.push({
      type: 'element',
      tagName: 'mark',
      properties: { className: ['find-match'] },
      children: [{ type: 'text', value: text.slice(idx, idx + queryLc.length) }],
    } as Element)
    pos = idx + queryLc.length
  }

  return parts
}

function visitForFind(node: Root | Element, queryLc: string) {
  if (!node.children) return
  const next: RootContent[] = []

  for (const child of node.children) {
    if (child.type === 'text') {
      const parts = splitTextNode(child, queryLc)
      next.push(...parts)
    } else if (child.type === 'element') {
      // Don't highlight inside code/pre blocks
      if (child.tagName !== 'code' && child.tagName !== 'pre') {
        visitForFind(child, queryLc)
      }
      next.push(child)
    } else {
      next.push(child)
    }
  }

  node.children = next
}

function createFindHighlightPlugin(query: string) {
  return () => (tree: Root) => {
    if (!query) return
    const queryLc = query.toLowerCase()
    visitForFind(tree, queryLc)
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MarkdownPreview({
  content,
  baseUrl,
  className,
  banner,
  staticCharts = false,
  findQuery,
  findCurrentIndex,
}: MarkdownPreviewProps) {
  const bodyRef = useRef<HTMLDivElement>(null)

  const findPlugin = useMemo(
    () => createFindHighlightPlugin(findQuery ?? ''),
    [findQuery],
  )

  const rehypePlugins = useMemo(
    () => [rehypeKatex, rehypeHighlight, findPlugin] as Parameters<typeof ReactMarkdown>[0]['rehypePlugins'],
    [findPlugin],
  )

  // Update current-match highlight and scroll into view
  useEffect(() => {
    if (!bodyRef.current || !findQuery) return
    const marks = Array.from(bodyRef.current.querySelectorAll<HTMLElement>('.find-match'))
    marks.forEach((el, i) => {
      if (i === findCurrentIndex) {
        el.classList.add('find-current')
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        el.classList.remove('find-current')
      }
    })
  }, [findCurrentIndex, findQuery])

  return (
    <section className={['preview-shell', className].filter(Boolean).join(' ')}>
      {banner && <div className="preview-shell__banner">{banner}</div>}
      <div className="preview-shell__body" ref={bodyRef}>
        <article>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={rehypePlugins}
            components={{
              code(props) {
                const { className, children, ...rest } = props
                const language = /language-(\w+)/.exec(className ?? '')?.[1]
                const rawSpec = String(children).replace(/\n$/, '')

                if (language === 'chart') {
                  return <InlineChart rawSpec={rawSpec} staticRender={staticCharts} />
                }

                return (
                  <code className={className} {...rest}>
                    {children}
                  </code>
                )
              },
              a(props) {
                const href = resolveDocumentUrl(props.href, baseUrl)

                return (
                  <a
                    {...props}
                    href={href}
                    onClick={(event) => {
                      if (!href || href.startsWith('#')) {
                        return
                      }

                      event.preventDefault()
                      void openPathExternally(href)
                    }}
                  />
                )
              },
              img(props) {
                const resolvedSrc = resolveDocumentUrl(props.src, baseUrl)

                return <img {...props} src={resolvedSrc} alt={props.alt ?? ''} />
              },
              pre(props: MarkdownPreProps) {
                const firstChild = props.node?.children?.[0]
                const className = firstChild?.properties?.className
                const normalizedClassName = Array.isArray(className)
                  ? className.join(' ')
                  : className ?? ''

                if (
                  firstChild?.type === 'element' &&
                  firstChild.tagName === 'code' &&
                  normalizedClassName.includes('language-chart')
                ) {
                  return <>{props.children}</>
                }

                const rest = { ...props }
                delete rest.node

                return <pre {...rest} />
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
      </div>
    </section>
  )
}
