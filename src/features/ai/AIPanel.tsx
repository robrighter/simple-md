import { useEffect, useRef, useState, type RefObject } from 'react'
import type { AiApi, ChatTurn } from './useAi'
import type { EditorApi } from '../editor/EditorPane'
import { extractEditPayload } from './extract'
import { formatBytes, MODELS, modelMeta, type Variant } from './models'
import { LicenseDialog } from './LicenseDialog'

type AIPanelProps = {
  api: AiApi
  open: boolean
  onClose: () => void
  documentContent: string
  editorRef: RefObject<EditorApi | null>
  canEditDocument: boolean
}

type ReplacePreview = {
  turnId: string
  payload: string
  selection: string
}

type AppliedEdit = {
  id: string
  before: string
  after: string
  fading: boolean
}

export function AIPanel({
  api,
  open,
  onClose,
  documentContent,
  editorRef,
  canEditDocument,
}: AIPanelProps) {
  const { state } = api
  const [composer, setComposer] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [licenseOpen, setLicenseOpen] = useState(false)
  const [replacePreview, setReplacePreview] = useState<ReplacePreview | null>(null)
  const [appliedEdit, setAppliedEdit] = useState<AppliedEdit | null>(null)
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const editIdRef = useRef(0)

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [state.chat])

  useEffect(() => {
    if (!actionStatus) return
    const handle = window.setTimeout(() => setActionStatus(null), 1800)
    return () => window.clearTimeout(handle)
  }, [actionStatus])

  useEffect(() => {
    if (!appliedEdit || appliedEdit.fading) return

    const fade = (event: Event) => {
      const target = event.target

      if (target instanceof Element && target.closest('[data-ai-undo]')) {
        return
      }

      setAppliedEdit((current) => (current ? { ...current, fading: true } : current))
    }

    document.addEventListener('pointerdown', fade, true)
    document.addEventListener('keydown', fade, true)

    return () => {
      document.removeEventListener('pointerdown', fade, true)
      document.removeEventListener('keydown', fade, true)
    }
  }, [appliedEdit])

  if (!open) return null

  const installed = state.models.filter((m) => m.installed)
  const inProgress =
    state.download && !state.download.done && !state.download.error
      ? state.download
      : null

  async function handleStart(variant: Variant) {
    if (!state.settings?.license_accepted) {
      setLicenseOpen(true)
      return
    }
    await api.startRuntime(variant)
    setPickerOpen(false)
  }

  async function handleDownload(variant: Variant) {
    if (!state.settings?.license_accepted) {
      setLicenseOpen(true)
      return
    }
    await api.downloadModel(variant)
  }

  async function handleSend() {
    const trimmed = composer.trim()
    if (!trimmed) return
    setComposer('')
    const reply = await api.sendMessage(trimmed, documentContent)

    if (!reply) {
      return
    }

    applyAssistantDecision(trimmed, reply)
  }

  function currentEditorContent() {
    return editorRef.current?.getContent() ?? documentContent
  }

  function recordAppliedEdit(before: string, after: string) {
    if (before === after) {
      return
    }

    editIdRef.current += 1
    setAppliedEdit({
      id: `edit-${editIdRef.current}`,
      before,
      after,
      fading: false,
    })
  }

  function replaceWholeDocument(payload: string) {
    if (!editorRef.current) return
    const before = currentEditorContent()
    editorRef.current.replaceDocument(payload)
    recordAppliedEdit(before, payload)
  }

  function applyAppendPayload(payload: string) {
    if (!editorRef.current) return
    const before = currentEditorContent()
    editorRef.current.appendToDocument(payload)
    recordAppliedEdit(before, editorRef.current.getContent())
  }

  function applyInsertPayload(payload: string) {
    if (!editorRef.current || !canEditDocument) {
      applyAppendPayload(payload)
      setActionStatus('Appended (current mode is not editable).')
      return
    }

    const before = currentEditorContent()
    editorRef.current.insertAtCursor(payload)
    recordAppliedEdit(before, editorRef.current.getContent())
    setActionStatus('Inserted at cursor.')
  }

  function replaceSelectionPayload(payload: string) {
    if (!editorRef.current || !canEditDocument) {
      applyAppendPayload(payload)
      setActionStatus('Appended (current mode is not editable).')
      return
    }

    if (!editorRef.current.hasSelection()) {
      replaceWholeDocument(payload)
      setActionStatus('Updated the document.')
      return
    }

    const before = currentEditorContent()
    editorRef.current.replaceSelection(payload)
    recordAppliedEdit(before, editorRef.current.getContent())
    setActionStatus('Selection replaced.')
  }

  function applyAssistantDecision(request: string, rawReply: string) {
    if (!editorRef.current || !canEditDocument) {
      return
    }

    const payload = extractEditPayload(rawReply)

    if (!payload || !looksLikeEditRequest(request)) {
      return
    }

    if (editorRef.current.hasSelection()) {
      replaceSelectionPayload(payload)
      return
    }

    if (isPlaceholderDocument(documentContent) || asksForWholeDocumentEdit(request)) {
      replaceWholeDocument(payload)
      setActionStatus('Updated the document.')
      return
    }

    if (asksToAppend(request)) {
      applyAppendPayload(payload)
      setActionStatus('Appended.')
      return
    }

    replaceWholeDocument(payload)
    setActionStatus('Updated the document.')
  }

  function applyInsert(turn: ChatTurn) {
    applyInsertPayload(extractEditPayload(turn.content))
  }

  function applyAppend(turn: ChatTurn) {
    applyAppendPayload(extractEditPayload(turn.content))
    setActionStatus('Appended.')
  }

  function requestReplace(turn: ChatTurn) {
    const payload = extractEditPayload(turn.content)

    if (!editorRef.current || !canEditDocument) {
      applyAppendPayload(payload)
      setActionStatus('Appended (current mode is not editable).')
      return
    }

    if (!editorRef.current.hasSelection()) {
      replaceWholeDocument(payload)
      setActionStatus('Updated the document.')
      return
    }

    setReplacePreview({
      turnId: turn.id,
      payload,
      selection: editorRef.current.getSelection(),
    })
  }

  function confirmReplace() {
    if (!replacePreview || !editorRef.current) return
    replaceSelectionPayload(replacePreview.payload)
    setReplacePreview(null)
  }

  function undoAppliedEdit() {
    if (!appliedEdit || !editorRef.current) return
    editorRef.current.replaceDocument(appliedEdit.before)
    setAppliedEdit(null)
    setActionStatus('Undid assistant edit.')
  }

  return (
    <>
      <aside className="ai-panel" role="complementary" aria-label="AI assistant">
        <header className="ai-panel__header">
          <div>
            <strong>AI assistant</strong>
            {state.runtime.running && state.runtime.variant && (
              <span className="ai-panel__model">{modelMeta(state.runtime.variant).label}</span>
            )}
          </div>
          <div className="ai-panel__header-actions">
            {state.runtime.running ? (
              <button
                type="button"
                className="ghost-button ghost-button--sm"
                onClick={() => void api.stopRuntime()}
              >
                Stop
              </button>
            ) : null}
            <button
              type="button"
              className="ghost-button ghost-button--sm"
              onClick={() => setPickerOpen(true)}
            >
              Models
            </button>
            <button
              type="button"
              className="ghost-button ghost-button--sm"
              onClick={onClose}
              aria-label="Close AI panel"
            >
              ×
            </button>
          </div>
        </header>

        {!state.runtime.running && (
          <div className="ai-panel__notice">
            {installed.length === 0 ? (
              <>
                <p>No model installed yet.</p>
                <button
                  type="button"
                  className="ai-button ai-button--primary"
                  onClick={() => setPickerOpen(true)}
                >
                  Install a model
                </button>
              </>
            ) : (
              <>
                <p>Start a model to begin chatting.</p>
                <div className="ai-panel__starts">
                  {installed.map((model) => (
                    <button
                      key={model.variant}
                      type="button"
                      className="ai-button"
                      disabled={state.busy}
                      onClick={() => void handleStart(model.variant)}
                    >
                      Start {modelMeta(model.variant).label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="ai-panel__chat" ref={scrollRef}>
          {state.chat.length === 0 && state.runtime.running && (
            <p className="ai-panel__hint">
              Try: "Tighten the second paragraph." Or: "Suggest a heading for this section."
            </p>
          )}
          {state.chat.map((turn) => (
            <article key={turn.id} className={`ai-turn ai-turn--${turn.role}`}>
              <header>{turn.role === 'user' ? 'You' : 'Assistant'}</header>
              <div className="ai-turn__body">
                {turn.content || (turn.pending ? '…' : '')}
                {turn.error && <span className="ai-turn__error"> {turn.error}</span>}
              </div>
              {turn.role === 'assistant' && !turn.pending && !turn.error && turn.content && (
                <div className="ai-turn__actions">
                  <button
                    type="button"
                    className="ai-action"
                    title={
                      canEditDocument
                        ? 'Insert at the editor cursor'
                        : 'Switch to Text or Split mode to insert; will append for now'
                    }
                    onClick={() => applyInsert(turn)}
                  >
                    Insert
                  </button>
                  <button
                    type="button"
                    className="ai-action"
                    title={
                      canEditDocument
                        ? 'Replace the editor selection (preview before applying)'
                        : 'Switch to Text or Split mode to replace; will append for now'
                    }
                    onClick={() => requestReplace(turn)}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    className="ai-action"
                    title="Append to the end of the document"
                    onClick={() => applyAppend(turn)}
                  >
                    Append
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>

        {actionStatus && <div className="ai-panel__status">{actionStatus}</div>}

        {appliedEdit && (
          <section className={`ai-diff-card ${appliedEdit.fading ? 'ai-diff-card--faded' : ''}`}>
            <header>
              <strong>Assistant edit</strong>
              <button
                type="button"
                className="ghost-button ghost-button--sm"
                data-ai-undo
                onClick={undoAppliedEdit}
              >
                Undo
              </button>
            </header>
            <div className="ai-line-diff" aria-label="Assistant edit diff">
              {lineDiff(appliedEdit.before, appliedEdit.after).map((line, index) => (
                <div key={`${line.kind}-${index}-${line.text}`} data-kind={line.kind}>
                  <span>{line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}</span>
                  <code>{line.text || ' '}</code>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="ai-panel__composer">
          <textarea
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleSend()
              }
            }}
            placeholder={
              state.runtime.running
                ? 'Ask for help, a rewrite, an outline…'
                : 'Start a model to chat.'
            }
            disabled={!state.runtime.running}
            rows={3}
          />
          <div className="ai-panel__composer-actions">
            <span className="ai-panel__hint-inline">Enter to send · Shift+Enter for newline</span>
            <button
              type="button"
              className="ai-button ai-button--primary"
              onClick={() => void handleSend()}
              disabled={!state.runtime.running || !composer.trim()}
            >
              Send
            </button>
          </div>
        </footer>
      </aside>

      {pickerOpen && (
        <div
          className="ai-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-picker-title"
        >
          <div className="ai-modal__panel">
            <header className="ai-modal__head">
              <h2 id="ai-picker-title">Choose a model</h2>
              <button
                type="button"
                className="ghost-button ghost-button--sm"
                onClick={() => setPickerOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="ai-models">
              {MODELS.map((meta) => {
                const status = state.models.find((m) => m.variant === meta.variant)
                const isInstalled = status?.installed
                const downloadingThis =
                  inProgress?.variant === meta.variant ? inProgress : null
                const percent =
                  downloadingThis && downloadingThis.total
                    ? Math.round((downloadingThis.received / downloadingThis.total) * 100)
                    : null
                return (
                  <div key={meta.variant} className="ai-model">
                    <div>
                      <strong>{meta.label}</strong>
                      <p>{meta.blurb}</p>
                      <small>
                        ~{formatBytes(meta.approxBytes)} download · ≥{meta.recommendedRamGB}GB RAM
                        recommended
                      </small>
                    </div>
                    <div className="ai-model__actions">
                      {downloadingThis ? (
                        <span className="ai-model__progress">
                          Downloading… {percent !== null ? `${percent}%` : ''}
                        </span>
                      ) : isInstalled ? (
                        <button
                          type="button"
                          className="ai-button ai-button--primary"
                          disabled={state.busy}
                          onClick={() => void handleStart(meta.variant)}
                        >
                          Start
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ai-button ai-button--primary"
                          disabled={state.busy}
                          onClick={() => void handleDownload(meta.variant)}
                        >
                          Download
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {state.download?.error && (
              <p className="ai-modal__error">Download failed: {state.download.error}</p>
            )}
          </div>
        </div>
      )}

      {licenseOpen && (
        <LicenseDialog
          onAccept={async () => {
            await api.acceptLicense()
            setLicenseOpen(false)
          }}
          onCancel={() => setLicenseOpen(false)}
        />
      )}

      {replacePreview && (
        <div
          className="ai-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-replace-title"
        >
          <div className="ai-modal__panel ai-modal__panel--wide">
            <header className="ai-modal__head">
              <h2 id="ai-replace-title">Replace selection?</h2>
              <button
                type="button"
                className="ghost-button ghost-button--sm"
                onClick={() => setReplacePreview(null)}
              >
                ×
              </button>
            </header>
            <p className="ai-modal__hint">
              The selection in the editor will be replaced with the assistant's text. You can
              undo with ⌘Z.
            </p>
            <div className="ai-diff">
              <div>
                <header>Current selection</header>
                <pre>{replacePreview.selection}</pre>
              </div>
              <div>
                <header>Replacement</header>
                <pre>{replacePreview.payload}</pre>
              </div>
            </div>
            <div className="ai-modal__actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setReplacePreview(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ai-button ai-button--primary"
                onClick={confirmReplace}
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function looksLikeEditRequest(request: string) {
  return /\b(add|append|change|clean up|continue|draft|edit|expand|fix|improve|insert|polish|replace|revise|rewrite|shorten|summarize|tighten|update|write)\b/i.test(
    request,
  )
}

function asksForWholeDocumentEdit(request: string) {
  return /\b(all|entire|file|whole|document|rewrite|replace|start over|from scratch)\b/i.test(
    request,
  )
}

function asksToAppend(request: string) {
  return /\b(add|append|insert|continue|new section|section about)\b/i.test(request)
}

function isPlaceholderDocument(content: string) {
  const normalized = content.trim().toLowerCase()

  return (
    normalized === '# untitled draft\n\nwrite something beautiful here.' ||
    normalized.includes('write something beautiful here') ||
    normalized.includes('start here.')
  )
}

type DiffLine = {
  kind: 'added' | 'removed' | 'unchanged'
  text: string
}

function lineDiff(before: string, after: string): DiffLine[] {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  const table = Array.from({ length: beforeLines.length + 1 }, () =>
    Array<number>(afterLines.length + 1).fill(0),
  )

  for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
    for (let j = afterLines.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        beforeLines[i] === afterLines[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  const lines: DiffLine[] = []
  let i = 0
  let j = 0

  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      lines.push({ kind: 'unchanged', text: beforeLines[i] })
      i += 1
      j += 1
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push({ kind: 'removed', text: beforeLines[i] })
      i += 1
    } else {
      lines.push({ kind: 'added', text: afterLines[j] })
      j += 1
    }
  }

  while (i < beforeLines.length) {
    lines.push({ kind: 'removed', text: beforeLines[i] })
    i += 1
  }

  while (j < afterLines.length) {
    lines.push({ kind: 'added', text: afterLines[j] })
    j += 1
  }

  if (lines.length > 120) {
    return [
      ...lines.slice(0, 80),
      { kind: 'unchanged', text: `... ${lines.length - 120} unchanged or changed lines hidden ...` },
      ...lines.slice(-40),
    ]
  }

  return lines
}
