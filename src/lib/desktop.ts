import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { openPath, openUrl } from '@tauri-apps/plugin-opener'
import type {
  DocumentPayload,
  ImportedDocumentPayload,
  TreeNode,
  WorkspaceSnapshot,
} from '../app/types'

export async function openWorkspaceDialog() {
  return chooseFolderDialog('Open Folder')
}

export async function chooseFolderDialog(title = 'Choose Folder') {
  if (!isTauri()) {
    throw new Error('Folders can only be opened in the desktop app.')
  }

  const selected = await open({
    directory: true,
    multiple: false,
    title,
  })
  return normalizeDialogPath(selected)
}

export async function openMarkdownFileDialog() {
  if (!isTauri()) {
    throw new Error('Open-file dialogs are available in the desktop app.')
  }

  const selected = await open({
    multiple: false,
    title: 'Open Markdown File',
    filters: [
      {
        name: 'Markdown',
        extensions: ['md', 'markdown', 'mdown', 'mkd'],
      },
    ],
  })

  return normalizeDialogPath(selected)
}

export async function listWorkspace(path: string) {
  return invoke<WorkspaceSnapshot>('list_workspace', { path })
}

export async function openDocument(path: string) {
  return invoke<DocumentPayload>('open_document', { path })
}

export async function saveDocument(path: string, content: string, expectedVersion?: string) {
  return invoke<DocumentPayload>('save_document', { path, content, expectedVersion })
}

export async function createNote(parentDir: string, name: string, initialContent?: string) {
  return invoke<DocumentPayload>('create_note', {
    parentDir: String(parentDir ?? ''),
    name: String(name ?? ''),
    initialContent: typeof initialContent === 'string' ? initialContent : undefined,
  })
}

export async function createFolder(parentDir: string, name: string) {
  // Defensive coercion: if either arg is a non-string (e.g. a React event or
  // a Proxy that leaked in via state), `invoke` will fail at JSON serialization
  // with a cyclic-structure error and bury the real cause. Force strings here
  // so the failure mode is visible.
  const parent = String(parentDir ?? '')
  const leaf = String(name ?? '')
  return invoke<TreeNode>('create_folder', { parentDir: parent, name: leaf })
}

export async function renamePath(path: string, newName: string) {
  return invoke<string>('rename_path', { path, newName })
}

export async function deletePath(path: string) {
  return invoke<void>('delete_path', { path })
}

export async function fetchRemoteMarkdown(url: string) {
  return invoke<ImportedDocumentPayload>('fetch_remote_markdown', { url })
}

export async function openedTargets() {
  if (!isTauri()) {
    return [] as string[]
  }

  return invoke<string[]>('opened_targets')
}

async function clearOpenedTargets() {
  if (!isTauri()) {
    return
  }

  await invoke<void>('clear_opened_targets')
}

export async function listenForOpenedTargets(handler: (targets: string[]) => void) {
  if (!isTauri()) {
    return () => undefined
  }

  const unlisten = await listen<string[]>('opened', (event) => {
    handler(event.payload)
    void clearOpenedTargets()
  })

  return () => {
    void unlisten()
  }
}

export async function openPathExternally(path: string) {
  if (!isTauri()) {
    window.open(path, '_blank', 'noopener,noreferrer')
    return
  }

  if (isWebUrl(path)) {
    await openUrl(path)
    return
  }

  await openPath(path)
}

function normalizeDialogPath(result: unknown): string | null {
  if (result == null) {
    return null
  }
  if (typeof result === 'string') {
    return result
  }
  if (Array.isArray(result)) {
    return result.length > 0 ? normalizeDialogPath(result[0]) : null
  }
  if (typeof result === 'object') {
    // Newer @tauri-apps/plugin-dialog versions can return a DialogFile-shaped
    // object: { path: string, name?: string }. Pull the path out.
    const candidate = (result as { path?: unknown }).path
    if (typeof candidate === 'string') {
      return candidate
    }
  }
  return null
}

function isWebUrl(value: string) {
  return /^(https?:|mailto:|tel:)/i.test(value)
}
