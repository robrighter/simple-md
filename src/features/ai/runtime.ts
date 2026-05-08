import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { Variant } from './models'

export type AiSettings = {
  license_accepted: boolean
  default_variant: Variant | null
}

export type ModelStatus = {
  variant: Variant
  installed: boolean
  bytes: number | null
  path: string | null
}

export type RuntimeStatus = {
  running: boolean
  variant: Variant | null
  port: number | null
}

export type DownloadProgress = {
  variant: Variant
  received: number
  total: number | null
  done: boolean
  error: string | null
}

export async function getSettings(): Promise<AiSettings> {
  if (!isTauri()) {
    return { license_accepted: false, default_variant: null }
  }
  return invoke<AiSettings>('ai_get_settings')
}

export async function acceptLicense(): Promise<AiSettings> {
  return invoke<AiSettings>('ai_accept_license')
}

export async function modelsStatus(): Promise<ModelStatus[]> {
  if (!isTauri()) {
    return []
  }
  return invoke<ModelStatus[]>('ai_models_status')
}

export async function downloadModel(variant: Variant): Promise<string> {
  return invoke<string>('ai_download_model', { variant })
}

export async function deleteModel(variant: Variant): Promise<void> {
  return invoke<void>('ai_delete_model', { variant })
}

export async function startRuntime(variant: Variant): Promise<RuntimeStatus> {
  return invoke<RuntimeStatus>('ai_start_runtime', { variant })
}

export async function stopRuntime(): Promise<void> {
  return invoke<void>('ai_stop_runtime')
}

export async function runtimeStatus(): Promise<RuntimeStatus> {
  if (!isTauri()) {
    return { running: false, variant: null, port: null }
  }
  return invoke<RuntimeStatus>('ai_runtime_status')
}

export async function listenForDownloadProgress(
  handler: (progress: DownloadProgress) => void,
): Promise<() => void> {
  if (!isTauri()) {
    return () => undefined
  }
  const unlisten = await listen<DownloadProgress>('ai:download', (event) => {
    handler(event.payload)
  })
  return () => {
    void unlisten()
  }
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ChatStreamHandlers = {
  onToken: (token: string) => void
  onDone: () => void
  onError: (error: Error) => void
}

export async function streamChat(
  port: number,
  messages: ChatMessage[],
  signal: AbortSignal,
  handlers: ChatStreamHandlers,
): Promise<void> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma',
        messages,
        stream: true,
        temperature: 0.7,
      }),
      signal,
    })

    if (!response.ok || !response.body) {
      throw new Error(`Runtime returned ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let newlineIndex: number
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const rawLine = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (!rawLine.startsWith('data:')) continue
        const payload = rawLine.slice(5).trim()
        if (payload === '[DONE]') {
          handlers.onDone()
          return
        }
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>
          }
          const token = parsed.choices?.[0]?.delta?.content
          if (typeof token === 'string') {
            handlers.onToken(token)
          }
        } catch {
          // skip malformed line
        }
      }
    }

    handlers.onDone()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }
    handlers.onError(error instanceof Error ? error : new Error(String(error)))
  }
}
