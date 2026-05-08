export type Variant = 'gemma4-e2b' | 'gemma4-e4b'

export type ModelMeta = {
  variant: Variant
  label: string
  blurb: string
  approxBytes: number
  recommendedRamGB: number
}

// Sizes mirror the GGUFs we actually pull from `ggml-org/gemma-4-E*-it-GGUF`.
// E2B only ships Q8_0/BF16 upstream, so we use Q8_0 (~5GB).
// E4B ships Q4_K_M (~2.5GB).
export const MODELS: ModelMeta[] = [
  {
    variant: 'gemma4-e2b',
    label: 'Gemma 4 E2B (Q8_0)',
    blurb: 'Smaller edge model. Quick replies, near-full quality at 8-bit.',
    approxBytes: 5_000_000_000,
    recommendedRamGB: 8,
  },
  {
    variant: 'gemma4-e4b',
    label: 'Gemma 4 E4B (Q4_K_M)',
    blurb: 'Larger edge model. Better at reasoning and longer rewrites.',
    approxBytes: 2_500_000_000,
    recommendedRamGB: 8,
  },
]

export function modelMeta(variant: Variant): ModelMeta {
  const found = MODELS.find((model) => model.variant === variant)
  if (!found) {
    throw new Error(`Unknown variant: ${variant}`)
  }
  return found
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}
