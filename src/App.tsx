import {
  lazy,
  Suspense,
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { EditorApi } from './features/editor/EditorPane'
import { useDialog } from './components/DialogContext'
import { ModeToggle } from './components/ModeToggle'
import { StatusBar } from './components/StatusBar'
import { TabStrip } from './components/TabStrip'
import { Toolbar } from './components/Toolbar'
import { WorkspaceSidebar } from './components/WorkspaceSidebar'
import { AICallout } from './features/ai/AICallout'
import { AIPanel } from './features/ai/AIPanel'
import { useAi } from './features/ai/useAi'
import { createWelcomeDocument } from './app/sampleDocument'
import type {
  DocumentMode,
  ImportedDocumentPayload,
  OpenDocument,
  TreeNode,
  WorkspaceRoot,
  WorkspaceSnapshot,
} from './app/types'
import {
  createFolder,
  createNote,
  deletePath,
  fetchRemoteMarkdown,
  listWorkspace,
  listenForOpenedTargets,
  openDocument,
  openMarkdownFileDialog,
  openPathExternally,
  openWorkspaceDialog,
  openedTargets,
  renamePath,
  saveDocument,
} from './lib/desktop'
import {
  countWords,
  createDraftTitle,
  dirname,
  fileNameFromPath,
  isMarkdownPath,
  isSameOrChildPath,
  normalizeOpenedTarget,
  replacePathPrefix,
} from './lib/document'

const RECENTS_KEY = 'simple-md-recents'
const EditorPane = lazy(() =>
  import('./features/editor/EditorPane').then((module) => ({ default: module.EditorPane })),
)
const HybridEditor = lazy(() =>
  import('./features/editor/HybridEditor').then((module) => ({ default: module.HybridEditor })),
)
const MarkdownPreview = lazy(() =>
  import('./features/preview/MarkdownPreview').then((module) => ({
    default: module.MarkdownPreview,
  })),
)
const TaskReport = lazy(() =>
  import('./features/reports/TaskReport').then((module) => ({ default: module.TaskReport })),
)

type RecentsState = {
  files: string[]
  workspaces: string[]
}

function loadRecents(): RecentsState {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY)

    if (!raw) {
      return { files: [], workspaces: [] }
    }

    const parsed = JSON.parse(raw) as Partial<RecentsState>

    return {
      files: Array.isArray(parsed.files) ? parsed.files.slice(0, 8) : [],
      workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces.slice(0, 8) : [],
    }
  } catch {
    return { files: [], workspaces: [] }
  }
}

function saveRecents(recents: RecentsState) {
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(recents))
}

function pushRecent(items: string[], value: string) {
  return [value, ...items.filter((item) => item !== value)].slice(0, 8)
}

function App() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRoot[]>([])
  const [documents, setDocuments] = useState<OpenDocument[]>([createWelcomeDocument()])
  const [activeDocumentId, setActiveDocumentId] = useState<string>('welcome')
  const [selectedTreePath, setSelectedTreePath] = useState<string | null>(null)
  const [lastMessage, setLastMessage] = useState('Ready to write.')
  const [isBusy, setIsBusy] = useState(false)
  const [recents, setRecents] = useState<RecentsState>(() => loadRecents())
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const ai = useAi()
  const editorRef = useRef<EditorApi | null>(null)
  const dialog = useDialog()

  const activeDocument =
    documents.find((document) => document.id === activeDocumentId) ?? documents[0] ?? null
  const deferredContent = useDeferredValue(activeDocument?.content ?? '')

  const stats = useMemo(() => {
    if (!activeDocument) {
      return {
        words: 0,
        lines: 0,
        characters: 0,
      }
    }

    return {
      words: countWords(activeDocument.content),
      lines: activeDocument.content.split('\n').length,
      characters: activeDocument.content.length,
    }
  }, [activeDocument])

  useEffect(() => {
    saveRecents(recents)
  }, [recents])

  const onSaveShortcut = useEffectEvent(() => {
    void handleSaveDocument()
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        onSaveShortcut()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => {
    const hasDirtyDocuments = documents.some((document) => document.isDirty)

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasDirtyDocuments) {
        return
      }

      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [documents])

  async function handleOpenedTargets(targets: string[]) {
    for (const rawTarget of targets) {
      const target = normalizeOpenedTarget(rawTarget)

      if (!target) {
        continue
      }

      if (target.type === 'directory') {
        await handleOpenWorkspace(target.path)
      } else if (target.type === 'file' && isMarkdownPath(target.path)) {
        await handleOpenDocument(target.path)
      }
    }
  }

  const handleOpenedTargetsEvent = useEffectEvent((targets: string[]) => {
    void handleOpenedTargets(targets)
  })

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    const seen = new Set<string>()

    const dispatch = (targets: string[]) => {
      const fresh = targets.filter((target) => {
        if (seen.has(target)) {
          return false
        }
        seen.add(target)
        return true
      })

      if (fresh.length > 0) {
        handleOpenedTargetsEvent(fresh)
      }
    }

    const bootstrap = async () => {
      const unlisten = await listenForOpenedTargets(dispatch)

      if (cancelled) {
        unlisten()
        return
      }

      unsubscribe = unlisten

      const pendingTargets = await openedTargets()

      if (pendingTargets.length > 0) {
        dispatch(pendingTargets)
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  function updateDocument(documentId: string, updater: (document: OpenDocument) => OpenDocument) {
    setDocuments((current) =>
      current.map((document) => (document.id === documentId ? updater(document) : document)),
    )
  }

  function upsertWorkspace(snapshot: WorkspaceSnapshot) {
    setWorkspaces((current) => {
      const nextWorkspace: WorkspaceRoot = {
        id: snapshot.path,
        name: snapshot.name,
        path: snapshot.path,
        tree: snapshot.tree,
      }

      const existing = current.find((workspace) => workspace.path === snapshot.path)

      if (existing) {
        return current.map((workspace) =>
          workspace.path === snapshot.path ? nextWorkspace : workspace,
        )
      }

      return [...current, nextWorkspace]
    })

    setRecents((current) => ({
      ...current,
      workspaces: pushRecent(current.workspaces, snapshot.path),
    }))
  }

  async function refreshWorkspace(workspacePath: string) {
    const snapshot = await listWorkspace(workspacePath)
    upsertWorkspace(snapshot)
  }

  async function handleOpenWorkspace(workspacePath?: string) {
    let stage = 'opening picker'
    try {
      const rawSelected = workspacePath ?? (await openWorkspaceDialog())

      if (!rawSelected) {
        return
      }

      // Last-line-of-defense coercion: extract a string path no matter what
      // shape the dialog returns. The plugin's typed return is `string | null`
      // but in practice newer builds can hand back `{ path }` or even a Proxy.
      const selectedPath = coerceToPath(rawSelected)
      if (!selectedPath) {
        throw new Error(
          `Folder picker returned an unexpected value: ${typeof rawSelected}`,
        )
      }

      stage = `listing folder ${selectedPath}`
      setIsBusy(true)
      const snapshot = await listWorkspace(selectedPath)
      stage = 'updating workspace state'
      upsertWorkspace(snapshot)
      setSelectedTreePath(snapshot.path)
      setLastMessage(`Opened folder ${snapshot.name}.`)
    } catch (error) {
      // Log the raw error so the dev console has the real stack/payload —
      // the user-facing alert only gets the message string.
      console.error(`handleOpenWorkspace failed at stage "${stage}":`, error)
      const message = getErrorMessage(error, 'Unable to open the selected folder.')
      setLastMessage(message)
      await dialog.alert({
        title: 'Could not open folder',
        message: `${message}\n\nFailed at: ${stage}`,
        variant: 'error',
      })
    } finally {
      setIsBusy(false)
    }
  }

  function coerceToPath(value: unknown): string | null {
    if (typeof value === 'string') return value || null
    if (Array.isArray(value)) {
      return value.length > 0 ? coerceToPath(value[0]) : null
    }
    if (value && typeof value === 'object') {
      const candidate = (value as { path?: unknown }).path
      if (typeof candidate === 'string') return candidate || null
    }
    return null
  }

  async function handleOpenDocument(documentPath?: string) {
    try {
      const selectedPath = documentPath ?? (await openMarkdownFileDialog())

      if (!selectedPath) {
        return
      }

      const existing = documents.find((document) => document.path === selectedPath)

      if (existing) {
        setActiveDocumentId(existing.id)
        setLastMessage(`Focused ${existing.title}.`)
        return
      }

      setIsBusy(true)
      const payload = await openDocument(selectedPath)
      const nextDocument: OpenDocument = {
        id: payload.path,
        path: payload.path,
        title: payload.name,
        content: payload.content,
        isDirty: false,
        mode: activeDocument?.mode ?? 'source',
        workspacePath: findOwningWorkspace(payload.path, workspaces),
      }

      startTransition(() => {
        setDocuments((current) => [...current, nextDocument])
        setActiveDocumentId(nextDocument.id)
      })

      setRecents((current) => ({
        ...current,
        files: pushRecent(current.files, payload.path),
      }))
      setLastMessage(`Opened ${payload.name}.`)
    } catch (error) {
      setLastMessage(getErrorMessage(error, 'Unable to open that markdown file.'))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleOpenTreeNode(node: TreeNode) {
    setSelectedTreePath(node.path)

    if (node.kind === 'file') {
      await handleOpenDocument(node.path)
    }
  }

  function handleContentChange(content: string) {
    if (!activeDocument) {
      return
    }

    updateDocument(activeDocument.id, (document) => ({
      ...document,
      content,
      isDirty: true,
    }))
  }

  function handleModeChange(mode: DocumentMode) {
    if (!activeDocument) {
      return
    }

    updateDocument(activeDocument.id, (document) => ({ ...document, mode }))
  }

  async function handleSaveDocument() {
    if (!activeDocument) {
      return
    }

    try {
      setIsBusy(true)

      if (activeDocument.path) {
        const saved = await saveDocument(activeDocument.path, activeDocument.content)
        updateDocument(activeDocument.id, (document) => ({
          ...document,
          title: saved.name,
          content: saved.content,
          isDirty: false,
        }))

        const workspacePath = findOwningWorkspace(saved.path, workspaces)

        if (workspacePath) {
          await refreshWorkspace(workspacePath)
        }

        setRecents((current) => ({
          ...current,
          files: pushRecent(current.files, saved.path),
        }))
        setLastMessage(`Saved ${saved.name}.`)
        return
      }

      const targetDirectory = resolveTargetDirectory(selectedTreePath, workspaces, activeDocument)

      if (!targetDirectory) {
        setLastMessage('Open a folder before saving a new document.')
        return
      }

      const result = await dialog.prompt({
        title: 'Save as',
        defaultValue: `${createDraftTitle(activeDocument.content)}.md`,
      })
      const requestedName = result?.trim() ?? ''

      if (!requestedName) {
        return
      }

      const created = await createNote(targetDirectory, requestedName, activeDocument.content)
      const workspacePath = findOwningWorkspace(created.path, workspaces)

      setDocuments((current) =>
        current.map((document) =>
          document.id === activeDocument.id
            ? {
                ...document,
                id: created.path,
                path: created.path,
                title: created.name,
                isDirty: false,
                workspacePath,
              }
            : document,
        ),
      )
      setActiveDocumentId(created.path)
      setSelectedTreePath(created.path)
      setRecents((current) => ({
        ...current,
        files: pushRecent(current.files, created.path),
      }))

      if (workspacePath) {
        await refreshWorkspace(workspacePath)
      }

      setLastMessage(`Saved ${created.name}.`)
    } catch (error) {
      setLastMessage(getErrorMessage(error, 'Unable to save the current document.'))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleCreateNote(targetPath = selectedTreePath) {
    const targetDirectory = resolveTargetDirectory(targetPath, workspaces, activeDocument)

    if (!targetDirectory) {
      setLastMessage('Open a folder before creating a note.')
      return
    }

    const result = await dialog.prompt({
      title: 'New note',
      defaultValue: 'fresh-note.md',
    })
    const requestedName = result?.trim() ?? ''

    if (!requestedName) {
      return
    }

    try {
      setIsBusy(true)
      const created = await createNote(targetDirectory, requestedName, '# New Note\n\nStart here.')
      const workspacePath = findOwningWorkspace(created.path, workspaces)

      if (workspacePath) {
        await refreshWorkspace(workspacePath)
      }

      const nextDocument: OpenDocument = {
        id: created.path,
        path: created.path,
        title: created.name,
        content: created.content,
        isDirty: false,
        mode: 'source',
        workspacePath,
      }

      startTransition(() => {
        setDocuments((current) => [...current, nextDocument])
        setActiveDocumentId(nextDocument.id)
      })
      setSelectedTreePath(created.path)
      setLastMessage(`Created ${created.name}.`)
    } catch (error) {
      setLastMessage(getErrorMessage(error, 'Unable to create a new note here.'))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleCreateFolder(targetPath = selectedTreePath) {
    const targetDirectory = resolveTargetDirectory(targetPath, workspaces, activeDocument)

    if (!targetDirectory) {
      setLastMessage('Open a folder before creating a subfolder.')
      return
    }

    const result = await dialog.prompt({
      title: 'New folder',
      defaultValue: 'notes',
    })
    const requestedName = result?.trim() ?? ''

    if (!requestedName) {
      return
    }

    try {
      setIsBusy(true)
      const created = await createFolder(targetDirectory, requestedName)
      const workspacePath = findOwningWorkspace(created.path, workspaces)

      if (workspacePath) {
        await refreshWorkspace(workspacePath)
      }

      setSelectedTreePath(created.path)
      setLastMessage(`Created folder ${created.name}.`)
    } catch (error) {
      setLastMessage(getErrorMessage(error, 'Unable to create a folder here.'))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleRenameSelection(targetPath = selectedTreePath) {
    if (!targetPath) {
      setLastMessage('Pick a file or folder in the sidebar first.')
      return
    }

    if (isWorkspaceRootPath(targetPath, workspaces)) {
      setLastMessage('Workspace root folders can be removed from the app, but not renamed here.')
      return
    }

    const currentName = fileNameFromPath(targetPath)
    const result = await dialog.prompt({
      title: 'Rename',
      defaultValue: currentName,
    })
    const requestedName = result?.trim() ?? ''

    if (!requestedName || requestedName === currentName) {
      return
    }

    try {
      setIsBusy(true)
      const nextPath = await renamePath(targetPath, requestedName)
      const workspacePath = findOwningWorkspace(nextPath, workspaces)

      if (workspacePath) {
        await refreshWorkspace(workspacePath)
      }

      setDocuments((current) =>
        current.map((document) => {
          if (!document.path || !isSameOrChildPath(document.path, targetPath)) {
            return document
          }

          const updatedPath = replacePathPrefix(document.path, targetPath, nextPath)

          return {
            ...document,
            id: document.id === document.path ? updatedPath : document.id,
            path: updatedPath,
            title:
              document.path === selectedTreePath ? fileNameFromPath(updatedPath) : document.title,
            workspacePath: document.workspacePath
              ? findOwningWorkspace(updatedPath, workspaces)
              : document.workspacePath,
          }
        }),
      )

      if (activeDocumentId && isSameOrChildPath(activeDocumentId, targetPath)) {
        setActiveDocumentId(replacePathPrefix(activeDocumentId, targetPath, nextPath))
      }

      setSelectedTreePath(nextPath)
      setLastMessage(`Renamed to ${requestedName}.`)
    } catch (error) {
      setLastMessage(getErrorMessage(error, 'Unable to rename that item.'))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleDeleteSelection(targetPath = selectedTreePath) {
    if (!targetPath) {
      setLastMessage('Pick a file or folder in the sidebar first.')
      return
    }

    if (isWorkspaceRootPath(targetPath, workspaces)) {
      const confirmedWorkspaceRemoval = await dialog.confirm({
        title: 'Remove from sidebar?',
        message: `${fileNameFromPath(targetPath)} will be removed from the sidebar but won't be deleted from disk.`,
        okLabel: 'Remove',
      })

      if (!confirmedWorkspaceRemoval) {
        return
      }

      setWorkspaces((current) =>
        current.filter((workspace) => workspace.path !== targetPath),
      )
      setDocuments((current) =>
        current.map((document) =>
          document.workspacePath === targetPath
            ? {
                ...document,
                workspacePath: undefined,
              }
            : document,
        ),
      )
      setSelectedTreePath(null)
      setLastMessage('Removed the folder from the app.')
      return
    }

    const confirmed = await dialog.confirm({
      title: `Delete ${fileNameFromPath(targetPath)}?`,
      message: 'This cannot be undone.',
      okLabel: 'Delete',
      destructive: true,
    })

    if (!confirmed) {
      return
    }

    try {
      setIsBusy(true)
      await deletePath(targetPath)

      const workspacePath = findOwningWorkspace(targetPath, workspaces)

      if (workspacePath) {
        await refreshWorkspace(workspacePath)
      }

      const nextDocuments = documents.filter(
        (document) =>
          !document.path || !isSameOrChildPath(document.path, targetPath),
      )
      const remainingDocuments = nextDocuments.length > 0 ? nextDocuments : [createWelcomeDocument()]

      setDocuments(remainingDocuments)

      if (!remainingDocuments.some((document) => document.id === activeDocumentId)) {
        setActiveDocumentId(remainingDocuments[0].id)
      }

      setSelectedTreePath(null)
      setLastMessage('Deleted the selected item.')
    } catch (error) {
      setLastMessage(getErrorMessage(error, 'Unable to delete that item.'))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleImportUrl() {
    const result = await dialog.prompt({
      title: 'Import from URL',
      message: 'Paste an HTTPS link to a Markdown file. GitHub blob URLs are auto-converted.',
      defaultValue: 'https://',
      placeholder: 'https://example.com/note.md',
      okLabel: 'Import',
    })
    const rawUrl = result?.trim() ?? ''

    if (!rawUrl || rawUrl === 'https://') {
      return
    }

    try {
      setIsBusy(true)
      const imported = await fetchRemoteMarkdown(rawUrl)
      const nextDocument = importedDocumentToTab(imported, activeDocument?.mode ?? 'preview')
      const existing = documents.find((document) => document.id === nextDocument.id)

      if (existing) {
        setActiveDocumentId(existing.id)
        setLastMessage(`Focused existing import for ${existing.title}.`)
        return
      }

      startTransition(() => {
        setDocuments((current) => [...current, nextDocument])
        setActiveDocumentId(nextDocument.id)
      })

      setLastMessage(`Imported ${nextDocument.title} from the web.`)
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to import that remote markdown file.')
      setLastMessage(message)
      await dialog.alert({
        title: 'Import failed',
        message: `${message}\n\n${rawUrl}`,
        variant: 'error',
      })
    } finally {
      setIsBusy(false)
    }
  }

  async function handleOpenRecentPath(path: string) {
    if (isMarkdownPath(path)) {
      await handleOpenDocument(path)
      return
    }

    await handleOpenWorkspace(path)
  }

  async function handleCloseDocument(documentId: string) {
    const target = documents.find((document) => document.id === documentId)

    if (!target) {
      return
    }

    if (target.isDirty) {
      const shouldClose = await dialog.confirm({
        title: `Close ${target.title}?`,
        message: 'This document has unsaved changes that will be lost.',
        okLabel: 'Discard',
        destructive: true,
      })

      if (!shouldClose) {
        return
      }
    }

    const remaining = documents.filter((document) => document.id !== documentId)
    const nextDocuments = remaining.length > 0 ? remaining : [createWelcomeDocument()]

    setDocuments(nextDocuments)

    if (activeDocumentId === documentId) {
      setActiveDocumentId(nextDocuments[0].id)
    }
  }

  function handleCreateScratchpad() {
    const scratchpad: OpenDocument = {
      id: `scratch-${Date.now()}`,
      title: 'Untitled Draft',
      content: '# Untitled Draft\n\nWrite something beautiful here.',
      isDirty: true,
      mode: 'source',
    }

    setDocuments((current) => [...current, scratchpad])
    setActiveDocumentId(scratchpad.id)
    setLastMessage('Opened a fresh scratchpad.')
  }

  const activeMode = activeDocument?.mode ?? 'source'

  return (
    <div className="app-shell">
      <header className="app-bar">
        <Toolbar
          busy={isBusy}
          onOpenWorkspace={() => void handleOpenWorkspace()}
          onCreateNote={() => void handleCreateNote()}
          onCreateFolder={() => void handleCreateFolder()}
          onSave={() => void handleSaveDocument()}
          onImportUrl={() => void handleImportUrl()}
        />
        <div className="app-bar__right">
          <ModeToggle mode={activeMode} onChange={handleModeChange} />
          <AICallout
            models={ai.state.models}
            runtime={ai.state.runtime}
            onOpen={() => setAiPanelOpen(true)}
          />
        </div>
      </header>

      <aside className={`app-sidebar ${sidebarOpen ? '' : 'app-sidebar--collapsed'}`}>
        {sidebarOpen ? (
          <>
            <button
              type="button"
              className="app-sidebar__header-bar"
              onClick={() => setSidebarOpen(false)}
              aria-expanded="true"
              aria-controls="folders-panel"
              title="Collapse Folders"
            >
              <span>Folders</span>
              <span aria-hidden="true" className="app-sidebar__chevron">
                ‹
              </span>
            </button>
            <div id="folders-panel" className="app-sidebar__body">
              <WorkspaceSidebar
                workspaces={workspaces}
                selectedPath={selectedTreePath}
                onActivateNode={handleOpenTreeNode}
                onSelectPath={setSelectedTreePath}
                onOpenWorkspace={handleOpenWorkspace}
                onOpenRecentPath={handleOpenRecentPath}
                recents={recents}
                onCreateNote={(path) => {
                  setSelectedTreePath(path)
                  void handleCreateNote(path)
                }}
                onCreateFolder={(path) => {
                  setSelectedTreePath(path)
                  void handleCreateFolder(path)
                }}
                onRename={(path) => {
                  setSelectedTreePath(path)
                  void handleRenameSelection(path)
                }}
                onDelete={(path) => {
                  setSelectedTreePath(path)
                  void handleDeleteSelection(path)
                }}
              />
            </div>
          </>
        ) : (
          <button
            type="button"
            className="app-sidebar__rail"
            onClick={() => setSidebarOpen(true)}
            aria-expanded="false"
            aria-controls="folders-panel"
            title="Expand Folders"
          >
            <span className="app-sidebar__rail-label">Folders</span>
          </button>
        )}
      </aside>

      <main className="app-main">
        <TabStrip
          documents={documents}
          activeDocumentId={activeDocumentId}
          onActivate={setActiveDocumentId}
          onClose={(documentId) => void handleCloseDocument(documentId)}
          onNew={handleCreateScratchpad}
        />

        <section className="workspace-frame">
          {!activeDocument && <div className="empty-state">No document open.</div>}

          {activeDocument && (
            <Suspense fallback={<div className="empty-state">Loading editor surface…</div>}>
              <>
                {activeDocument.reportDescriptor && (
                  <TaskReport descriptor={activeDocument.reportDescriptor} />
                )}

                {activeMode === 'preview' ? (
                  <MarkdownPreview
                    className="panel panel--preview"
                    content={deferredContent}
                    baseUrl={activeDocument.baseUrl}
                  />
                ) : activeMode === 'wysiwyg' ? (
                  <HybridEditor
                    key={activeDocument.id}
                    content={activeDocument.content}
                    onChange={handleContentChange}
                  />
                ) : activeMode === 'split' ? (
                  <div className="split-layout">
                    <EditorPane
                      ref={editorRef}
                      content={activeDocument.content}
                      onChange={handleContentChange}
                    />
                    <MarkdownPreview
                      className="panel panel--preview"
                      content={deferredContent}
                      baseUrl={activeDocument.baseUrl}
                    />
                  </div>
                ) : (
                  <EditorPane
                    ref={editorRef}
                    content={activeDocument.content}
                    onChange={handleContentChange}
                  />
                )}
              </>
            </Suspense>
          )}
        </section>

        <StatusBar
          message={lastMessage}
          mode={activeMode}
          path={activeDocument?.path ?? activeDocument?.sourceUrl ?? null}
          isDirty={activeDocument?.isDirty ?? false}
          words={stats.words}
          lines={stats.lines}
          characters={stats.characters}
          onOpenSourceUrl={
            activeDocument?.sourceUrl
              ? () => void openPathExternally(activeDocument.sourceUrl as string)
              : undefined
          }
        />
      </main>

      <AIPanel
        api={ai}
        open={aiPanelOpen}
        onClose={() => setAiPanelOpen(false)}
        documentContent={activeDocument?.content ?? ''}
        editorRef={editorRef}
        canEditDocument={activeMode === 'source' || activeMode === 'split'}
      />
    </div>
  )
}

function importedDocumentToTab(
  imported: ImportedDocumentPayload,
  preferredMode: DocumentMode,
): OpenDocument {
  return {
    id: imported.normalizedUrl,
    title: imported.title,
    content: imported.content,
    isDirty: false,
    mode: preferredMode === 'source' ? 'preview' : preferredMode,
    sourceUrl: imported.normalizedUrl,
    baseUrl: imported.baseUrl,
  }
}

function findOwningWorkspace(path: string, workspaces: WorkspaceRoot[]) {
  return workspaces.find((workspace) => isSameOrChildPath(path, workspace.path))?.path
}

function isWorkspaceRootPath(path: string, workspaces: WorkspaceRoot[]) {
  return workspaces.some((workspace) => workspace.path === path)
}

function resolveTargetDirectory(
  selectedTreePath: string | null,
  workspaces: WorkspaceRoot[],
  activeDocument: OpenDocument | null,
) {
  const node = findTreeNode(workspaces, selectedTreePath)

  if (node?.kind === 'directory') {
    return node.path
  }

  if (node?.kind === 'file') {
    return dirname(node.path)
  }

  if (activeDocument?.path) {
    return dirname(activeDocument.path)
  }

  return workspaces[0]?.path ?? null
}

function findTreeNode(workspaces: WorkspaceRoot[], path: string | null) {
  if (!path) {
    return null
  }

  for (const workspace of workspaces) {
    if (workspace.path === path) {
      return {
        kind: 'directory',
        name: workspace.name,
        path: workspace.path,
        children: workspace.tree,
      } satisfies TreeNode
    }

    const found = walkTree(workspace.tree, path)

    if (found) {
      return found
    }
  }

  return null
}

function walkTree(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) {
      return node
    }

    if (node.kind === 'directory' && node.children) {
      const child = walkTree(node.children, path)

      if (child) {
        return child
      }
    }
  }

  return null
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return fallback
}

export default App
