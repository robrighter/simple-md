import type { ChartSeries, ChartSpec } from '../app/types'

const palette = ['#af5c34', '#315d74', '#4f846f', '#d1a44b', '#d56b57', '#7256a0']

export function safeParseChartSpec(rawSpec: string) {
  try {
    const parsed = JSON.parse(rawSpec) as Partial<ChartSpec>

    if (!parsed || typeof parsed !== 'object') {
      return { ok: false as const, error: 'Chart block must be a JSON object.' }
    }

    if (!parsed.type || !['bar', 'line', 'area', 'pie'].includes(parsed.type)) {
      return { ok: false as const, error: 'Supported chart types are bar, line, area, and pie.' }
    }

    if (!Array.isArray(parsed.data)) {
      return { ok: false as const, error: 'Chart spec must include a data array.' }
    }

    const series = parsed.series?.length
      ? parsed.series
      : inferSeries(parsed.data, parsed.xKey, parsed.yKey)

    if (series.length === 0) {
      return { ok: false as const, error: 'No numeric series were found in the chart data.' }
    }

    const normalized: ChartSpec = {
      type: parsed.type,
      title: parsed.title ?? undefined,
      description: parsed.description ?? undefined,
      data: parsed.data,
      xKey: parsed.xKey ?? inferXKey(parsed.data),
      yKey: parsed.yKey ?? (series[0]?.key ?? undefined),
      series,
      height: parsed.height && parsed.height > 180 ? parsed.height : 300,
      stacked: Boolean(parsed.stacked),
      donut: Boolean(parsed.donut),
    }

    return { ok: true as const, spec: normalized }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Invalid chart JSON.',
    }
  }
}

function inferXKey(data: ChartSpec['data']) {
  const firstRow = data[0]

  if (!firstRow) {
    return undefined
  }

  return Object.entries(firstRow).find(([, value]) => typeof value === 'string')?.[0] ?? 'name'
}

function inferSeries(data: ChartSpec['data'], xKey?: string, yKey?: string): ChartSeries[] {
  const keys = new Set<string>()

  for (const row of data) {
    for (const [key, value] of Object.entries(row)) {
      if (key === xKey) {
        continue
      }

      if (typeof value === 'number') {
        keys.add(key)
      }
    }
  }

  if (yKey && keys.has(yKey)) {
    return [{ key: yKey, label: humanize(yKey), color: palette[0] }]
  }

  return Array.from(keys).map((key, index) => ({
    key,
    label: humanize(key),
    color: palette[index % palette.length],
  }))
}

function humanize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}
