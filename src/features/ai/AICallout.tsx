import type { ModelStatus, RuntimeStatus } from './runtime'
import { modelMeta } from './models'

type AICalloutProps = {
  models: ModelStatus[]
  runtime: RuntimeStatus
  onOpen: () => void
}

export function AICallout({ models, runtime, onOpen }: AICalloutProps) {
  const installed = models.find((m) => m.installed)

  if (runtime.running && runtime.variant) {
    const meta = modelMeta(runtime.variant)
    return (
      <button type="button" className="ai-callout ai-callout--running" onClick={onOpen}>
        <span className="ai-callout__indicator" aria-hidden="true" />
        <span className="ai-callout__body">
          <strong>{meta.label}</strong>
          <span>Running · click to chat</span>
        </span>
      </button>
    )
  }

  if (installed) {
    const meta = modelMeta(installed.variant)
    return (
      <button type="button" className="ai-callout ai-callout--idle" onClick={onOpen}>
        <span className="ai-callout__sparkle" aria-hidden="true">
          ✦
        </span>
        <span className="ai-callout__body">
          <strong>{meta.label}</strong>
          <span>Installed · click to start</span>
        </span>
      </button>
    )
  }

  return (
    <button type="button" className="ai-callout" onClick={onOpen}>
      <span className="ai-callout__sparkle" aria-hidden="true">
        ✦
      </span>
      <span className="ai-callout__body">
        <strong>Get a little help from AI?</strong>
        <span>Run Gemma locally — no cloud, no account.</span>
      </span>
    </button>
  )
}
