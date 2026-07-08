import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  acceptLicense as acceptLicenseCommand,
  downloadModel as downloadModelCommand,
  getSettings,
  listenForDownloadProgress,
  modelsStatus as modelsStatusCommand,
  runtimeStatus as runtimeStatusCommand,
  startRuntime as startRuntimeCommand,
  stopRuntime as stopRuntimeCommand,
  streamChat,
  type AiSettings,
  type ChatMessage,
  type DownloadProgress,
  type ModelStatus,
  type RuntimeStatus,
} from './runtime'
import type { Variant } from './models'

export type ChatTurn = {
  id: string
  role: 'user' | 'assistant'
  content: string
  pending?: boolean
  error?: string
}

export type AiState = {
  settings: AiSettings | null
  models: ModelStatus[]
  runtime: RuntimeStatus
  download: DownloadProgress | null
  chat: ChatTurn[]
  busy: boolean
}

export type AiApi = {
  state: AiState
  acceptLicense: () => Promise<void>
  refresh: () => Promise<void>
  downloadModel: (variant: Variant) => Promise<void>
  startRuntime: (variant: Variant) => Promise<void>
  stopRuntime: () => Promise<void>
  sendMessage: (text: string, documentContext: string) => Promise<string | null>
  cancelStream: () => void
  resetChat: () => void
}

const initialRuntime: RuntimeStatus = { running: false, variant: null, port: null }

const noop = async () => {}
const noopApi: AiApi = {
  state: { settings: null, models: [], runtime: initialRuntime, download: null, chat: [], busy: false },
  acceptLicense: noop,
  refresh: noop,
  downloadModel: noop,
  startRuntime: noop,
  stopRuntime: noop,
  sendMessage: async () => null,
  cancelStream: () => {},
  resetChat: () => {},
}

export function useAi(): AiApi {
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [models, setModels] = useState<ModelStatus[]>([])
  const [runtime, setRuntime] = useState<RuntimeStatus>(initialRuntime)
  const [download, setDownload] = useState<DownloadProgress | null>(null)
  const [chat, setChat] = useState<ChatTurn[]>([])
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    const [nextSettings, nextModels, nextRuntime] = await Promise.all([
      getSettings(),
      modelsStatusCommand(),
      runtimeStatusCommand(),
    ])
    setSettings(nextSettings)
    setModels(nextModels)
    setRuntime(nextRuntime)
  }, [])

  const onMount = useEffectEvent(() => {
    void refresh()
  })

  const onProgress = useEffectEvent((progress: DownloadProgress) => {
    setDownload(progress)
    if (progress.done) {
      void modelsStatusCommand().then(setModels)
    }
  })

  useEffect(() => {
    if (__STORE_BUILD__) return

    let cancelled = false
    let unlisten: (() => void) | undefined

    Promise.resolve().then(() => {
      if (cancelled) return
      onMount()
    })

    void listenForDownloadProgress(onProgress).then((value) => {
      if (cancelled) {
        value()
        return
      }
      unlisten = value
    })

    return () => {
      cancelled = true
      unlisten?.()
      abortRef.current?.abort()
    }
  }, [])

  const acceptLicense = useCallback(async () => {
    const next = await acceptLicenseCommand()
    setSettings(next)
  }, [])

  const downloadModel = useCallback(async (variant: Variant) => {
    setBusy(true)
    try {
      await downloadModelCommand(variant)
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const startRuntime = useCallback(async (variant: Variant) => {
    setBusy(true)
    try {
      const next = await startRuntimeCommand(variant)
      setRuntime(next)
    } finally {
      setBusy(false)
    }
  }, [])

  const stopRuntime = useCallback(async () => {
    await stopRuntimeCommand()
    setRuntime(initialRuntime)
  }, [])

  const cancelStream = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setChat((prev) =>
      prev.map((turn) =>
        turn.pending ? { ...turn, pending: false, content: turn.content || '(cancelled)' } : turn,
      ),
    )
  }, [])

  const resetChat = useCallback(() => {
    cancelStream()
    setChat([])
  }, [cancelStream])

  const sendMessage = useCallback(
    async (text: string, documentContext: string) => {
      if (!runtime.running || runtime.port === null) {
        return null
      }

      const userTurn: ChatTurn = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
      }
      const assistantTurn: ChatTurn = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        pending: true,
      }

      setChat((prev) => [...prev, userTurn, assistantTurn])

      const history: ChatMessage[] = [
        {
          role: 'system',
          content:
            'You are a writing collaborator embedded in a Markdown editor. The user can ' +
            'ask questions or ask you to edit the current Markdown document. Because of that:\n' +
            "- For edit requests, return ONLY the Markdown that should be applied — no preamble like 'Here's…', " +
            'no surrounding code fences, no summary. Plain Markdown only.\n' +
            '- If the document looks like a placeholder or the user asks to rewrite the file, return the complete replacement document.\n' +
            '- If the user asks to add a new section, return the Markdown section to add.\n' +
            '- For questions, reply conversationally and concisely.\n' +
            '- Match the existing tone, voice, and formatting of the document.\n\n' +
            "The user's current document:\n\n" +
            (documentContext.trim() || '(empty document)'),
        },
        ...[...chat, userTurn]
          .filter((turn) => !turn.pending && !turn.error)
          .map((turn) => ({ role: turn.role, content: turn.content }) satisfies ChatMessage),
      ]

      const controller = new AbortController()
      abortRef.current = controller
      let finalContent = ''

      await streamChat(runtime.port, history, controller.signal, {
        onToken: (token) => {
          finalContent += token
          setChat((prev) =>
            prev.map((turn) =>
              turn.id === assistantTurn.id ? { ...turn, content: turn.content + token } : turn,
            ),
          )
        },
        onDone: () => {
          setChat((prev) =>
            prev.map((turn) =>
              turn.id === assistantTurn.id ? { ...turn, pending: false } : turn,
            ),
          )
          abortRef.current = null
        },
        onError: (error) => {
          setChat((prev) =>
            prev.map((turn) =>
              turn.id === assistantTurn.id
                ? { ...turn, pending: false, error: error.message }
                : turn,
            ),
          )
          abortRef.current = null
        },
      })

      return finalContent.trim() || null
    },
    [runtime, chat],
  )

  if (__STORE_BUILD__) return noopApi

  return {
    state: { settings, models, runtime, download, chat, busy },
    acceptLicense,
    refresh,
    downloadModel,
    startRuntime,
    stopRuntime,
    sendMessage,
    cancelStream,
    resetChat,
  }
}
