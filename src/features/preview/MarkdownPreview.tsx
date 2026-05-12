import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { InlineChart } from '../charts/InlineChart'
import { openPathExternally } from '../../lib/desktop'
import { resolveDocumentUrl } from '../../lib/document'

type MarkdownPreviewProps = {
  content: string
  baseUrl?: string
  className?: string
  banner?: ReactNode
  staticCharts?: boolean
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

export function MarkdownPreview({
  content,
  baseUrl,
  className,
  banner,
  staticCharts = false,
}: MarkdownPreviewProps) {
  return (
    <section className={['preview-shell', className].filter(Boolean).join(' ')}>
      {banner && <div className="preview-shell__banner">{banner}</div>}
      <div className="preview-shell__body">
        <article>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex, rehypeHighlight]}
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
