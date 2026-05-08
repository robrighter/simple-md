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
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [state.chat])

  useEffect(() => {
    if (!actionStatus) return
    const handle = window.setTimeout(() => setActionStatus(null), 1800)
    return () => window.clearTimeout(handle)
  }, [actionStatus])

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
    await api.sendMessage(trimmed, documentContent)
  }

  function applyInsert(turn: ChatTurn) {
    const payload = extractEditPayload(turn.content)
    if (!editorRef.current || !canEditDocument) {
      editorRef.current?.appendToDocument(payload)
      setActionStatus('Appended (current mode is not editable).')
      return
    }
    editorRef.current.insertAtCursor(payload)
    setActionStatus('Inserted at cursor.')
  }

  function applyAppend(turn: ChatTurn) {
    const payload = extractEditPayload(turn.content)
    if (!editorRef.current) return
    editorRef.current.appendToDocument(payload)
    setActionStatus('Appended.')
  }

  function requestReplace(turn: ChatTurn) {
    const payload = extractEditPayload(turn.content)
    if (!editorRef.current || !canEditDocument) {
      editorRef.current?.appendToDocument(payload)
      setActionStatus('Appended (current mode is not editable).')
      return
    }
    if (!editorRef.current.hasSelection()) {
      editorRef.current.insertAtCursor(payload)
      setActionStatus('No selection — inserted at cursor instead.')
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
    editorRef.current.replaceSelection(replacePreview.payload)
    setReplacePreview(null)
    setActionStatus('Selection replaced.')
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

        <footer className="ai-panel__composer">
          <textarea
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void handleSend()
              }
            }}
            placeholder={
              state.runtime.running
                ? 'Ask for help, a rewrite, an outline… (⌘↵ to send)'
                : 'Start a model to chat.'
            }
            disabled={!state.runtime.running}
            rows={3}
          />
          <div className="ai-panel__composer-actions">
            <span className="ai-panel__hint-inline">⌘↵ to send</span>
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
