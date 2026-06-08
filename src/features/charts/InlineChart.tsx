import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ChartSpec } from '../../app/types'
import { safeParseChartSpec } from '../../lib/chartSpec'

type InlineChartProps = {
  rawSpec?: string
  spec?: ChartSpec
  staticRender?: boolean
}

type ThemeColors = {
  ink: string
  inkSoft: string
  inkMuted: string
  border: string
  panelStrong: string
  accent: string
  sea: string
  mint: string
  gold: string
  rose: string
  bg: string
  bgStrong: string
}

function getVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function readThemeColors(): ThemeColors {
  return {
    ink: getVar('--ink'),
    inkSoft: getVar('--ink-soft'),
    inkMuted: getVar('--ink-muted'),
    border: getVar('--border'),
    panelStrong: getVar('--panel-strong'),
    accent: getVar('--accent'),
    sea: getVar('--sea'),
    mint: getVar('--mint'),
    gold: getVar('--gold'),
    rose: getVar('--rose'),
    bg: getVar('--bg'),
    bgStrong: getVar('--bg-strong'),
  }
}

export function InlineChart({ rawSpec, spec, staticRender = false }: InlineChartProps) {
  const parsed = spec ? { ok: true as const, spec } : safeParseChartSpec(rawSpec ?? '')

  if (!parsed.ok) {
    return (
      <section className="chart-error">
        <strong>Chart block error</strong>
        <p>{parsed.error}</p>
        {rawSpec && <code>{rawSpec}</code>}
      </section>
    )
  }

  const { spec: chart } = parsed
  const height = chart.height ?? 300
  const colors = readThemeColors()

  return (
    <section className="chart-card">
      {(chart.title || chart.description) && (
        <header className="chart-card__header">
          {chart.title && <h3>{chart.title}</h3>}
          {chart.description && <p>{chart.description}</p>}
        </header>
      )}
      <div className="chart-card__body" style={{ height }}>
        {staticRender ? (
          <StaticChart spec={chart} height={height} colors={colors} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {renderChart(chart, colors)}
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}

function buildPalette(colors: ThemeColors): string[] {
  return [colors.accent, colors.sea, colors.mint, colors.gold, colors.rose, colors.inkSoft]
}

function StaticChart({ spec, height, colors }: { spec: ChartSpec; height: number; colors: ThemeColors }) {
  const width = 720

  if (spec.type === 'pie') {
    return <StaticPieChart spec={spec} width={width} height={height} colors={colors} />
  }

  return <StaticCartesianChart spec={spec} width={width} height={height} colors={colors} />
}

function StaticCartesianChart({
  spec,
  width,
  height,
  colors,
}: {
  spec: ChartSpec
  width: number
  height: number
  colors: ThemeColors
}) {
  const margin = { top: 20, right: 28, bottom: 54, left: 56 }
  const chartWidth = width - margin.left - margin.right
  const chartHeight = height - margin.top - margin.bottom
  const series = spec.series ?? []
  const palette = buildPalette(colors)
  const numericValues = spec.data.flatMap((row) =>
    series.map((entry) => numberValue(row[entry.key])),
  )
  const maxValue = Math.max(1, ...numericValues)
  const minValue = Math.min(0, ...numericValues)
  const range = Math.max(1, maxValue - minValue)
  const y = (value: number) =>
    margin.top + chartHeight - ((value - minValue) / range) * chartHeight
  const xStep = chartWidth / Math.max(1, spec.data.length)
  const baseline = y(0)
  const gridValues = Array.from({ length: 5 }, (_, index) => minValue + (range * index) / 4)

  return (
    <svg
      className="chart-static-svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={spec.title ?? 'Chart'}
    >
      <rect x="0" y="0" width={width} height={height} rx="12" fill={colors.panelStrong} />
      {gridValues.map((value) => {
        const lineY = y(value)
        return (
          <g key={`grid-${value}`}>
            <line
              x1={margin.left}
              y1={lineY}
              x2={width - margin.right}
              y2={lineY}
              stroke={colors.border}
            />
            <text x={margin.left - 10} y={lineY + 4} textAnchor="end" fontSize="12" fill={colors.inkMuted}>
              {formatTick(value)}
            </text>
          </g>
        )
      })}
      <line x1={margin.left} y1={baseline} x2={width - margin.right} y2={baseline} stroke={colors.border} />
      {spec.data.map((row, index) => {
        const centerX = margin.left + xStep * index + xStep / 2
        const label = String(row[spec.xKey ?? 'name'] ?? index + 1)
        return (
          <text
            key={`label-${label}-${index}`}
            x={centerX}
            y={height - 18}
            textAnchor="middle"
            fontSize="12"
            fill={colors.inkMuted}
          >
            {label}
          </text>
        )
      })}
      {spec.type === 'bar' &&
        renderStaticBars(spec, { margin, chartWidth, chartHeight, xStep, y, baseline }, palette)}
      {spec.type === 'line' &&
        renderStaticLines(spec, { margin, xStep, y }, palette)}
      {spec.type === 'area' &&
        renderStaticAreas(spec, { margin, xStep, y, baseline }, palette)}
      <StaticLegend spec={spec} width={width} y={height - 2} palette={palette} colors={colors} />
    </svg>
  )
}

function renderStaticBars(
  spec: ChartSpec,
  layout: {
    margin: { top: number; right: number; bottom: number; left: number }
    chartWidth: number
    chartHeight: number
    xStep: number
    y: (value: number) => number
    baseline: number
  },
  palette: string[],
) {
  const series = spec.series ?? []
  const barGroupWidth = layout.xStep * 0.66
  const barWidth = spec.stacked
    ? barGroupWidth
    : barGroupWidth / Math.max(1, series.length)

  return spec.data.flatMap((row, rowIndex) => {
    let stackedTotal = 0
    return series.map((entry, seriesIndex) => {
      const value = numberValue(row[entry.key])
      const startValue = spec.stacked ? stackedTotal : 0
      const endValue = startValue + value
      if (spec.stacked) stackedTotal = endValue
      const x =
        layout.margin.left +
        layout.xStep * rowIndex +
        (layout.xStep - barGroupWidth) / 2 +
        (spec.stacked ? 0 : seriesIndex * barWidth)
      const top = layout.y(Math.max(startValue, endValue))
      const bottom = layout.y(Math.min(startValue, endValue))

      return (
        <rect
          key={`bar-${rowIndex}-${entry.key}`}
          x={x}
          y={top}
          width={Math.max(1, barWidth - 4)}
          height={Math.max(1, bottom - top)}
          rx="5"
          fill={entry.color ?? palette[seriesIndex % palette.length]}
        />
      )
    })
  })
}

function renderStaticLines(
  spec: ChartSpec,
  layout: {
    margin: { top: number; right: number; bottom: number; left: number }
    xStep: number
    y: (value: number) => number
  },
  palette: string[],
) {
  return (spec.series ?? []).flatMap((entry, seriesIndex) => {
    const color = entry.color ?? palette[seriesIndex % palette.length]
    const points = spec.data.map((row, index) => ({
      x: layout.margin.left + layout.xStep * index + layout.xStep / 2,
      y: layout.y(numberValue(row[entry.key])),
    }))
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')

    return [
      <path
        key={`line-${entry.key}`}
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />,
      ...points.map((point, index) => (
        <circle key={`dot-${entry.key}-${index}`} cx={point.x} cy={point.y} r="4" fill={color} />
      )),
    ]
  })
}

function renderStaticAreas(
  spec: ChartSpec,
  layout: {
    margin: { top: number; right: number; bottom: number; left: number }
    xStep: number
    y: (value: number) => number
    baseline: number
  },
  palette: string[],
) {
  return (spec.series ?? []).flatMap((entry, seriesIndex) => {
    const color = entry.color ?? palette[seriesIndex % palette.length]
    const points = spec.data.map((row, index) => ({
      x: layout.margin.left + layout.xStep * index + layout.xStep / 2,
      y: layout.y(numberValue(row[entry.key])),
    }))
    const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
    const areaPath = `${linePath} L ${points.at(-1)?.x ?? 0} ${layout.baseline} L ${points[0]?.x ?? 0} ${layout.baseline} Z`

    return [
      <path key={`area-fill-${entry.key}`} d={areaPath} fill={color} fillOpacity="0.22" />,
      <path
        key={`area-line-${entry.key}`}
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />,
    ]
  })
}

function StaticPieChart({
  spec,
  width,
  height,
  colors,
}: {
  spec: ChartSpec
  width: number
  height: number
  colors: ThemeColors
}) {
  const palette = buildPalette(colors)
  const labelKey =
    spec.xKey ??
    Object.keys(spec.data[0] ?? {}).find((key) => typeof spec.data[0]?.[key] === 'string') ??
    'name'
  const pieKey = spec.yKey ?? spec.series?.[0]?.key ?? 'value'
  const values = spec.data.map((row) => Math.max(0, numberValue(row[pieKey])))
  const total = values.reduce((sum, value) => sum + value, 0) || 1
  const centerX = 250
  const centerY = height / 2
  const radius = Math.min(120, height / 2 - 28)
  const innerRadius = spec.donut ? radius * 0.54 : 0
  const slices = values.reduce<Array<{ path: string; index: number }>>((accumulator, value, index) => {
    const consumedAngle = values
      .slice(0, index)
      .reduce((sum, previousValue) => sum + (previousValue / total) * Math.PI * 2, 0)
    const startAngle = -Math.PI / 2 + consumedAngle
    const endAngle = startAngle + (value / total) * Math.PI * 2

    accumulator.push({
      index,
      path: describeDonutSlice(centerX, centerY, radius, innerRadius, startAngle, endAngle),
    })

    return accumulator
  }, [])

  return (
    <svg
      className="chart-static-svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={spec.title ?? 'Pie chart'}
    >
      <rect x="0" y="0" width={width} height={height} rx="12" fill={colors.panelStrong} />
      {slices.map(({ path, index }) => (
        <path
          key={`slice-${index}`}
          d={path}
          fill={spec.series?.[index]?.color ?? palette[index % palette.length]}
        />
      ))}
      {spec.data.map((row, index) => (
        <g key={`legend-${index}`} transform={`translate(470 ${54 + index * 28})`}>
          <rect
            width="14"
            height="14"
            rx="3"
            fill={spec.series?.[index]?.color ?? palette[index % palette.length]}
          />
          <text x="24" y="12" fontSize="13" fill={colors.inkSoft}>
            {String(row[labelKey] ?? `Slice ${index + 1}`)}
          </text>
        </g>
      ))}
    </svg>
  )
}

function StaticLegend({
  spec,
  width,
  y,
  palette,
  colors,
}: {
  spec: ChartSpec
  width: number
  y: number
  palette: string[]
  colors: ThemeColors
}) {
  const items = spec.series ?? []
  const startX = Math.max(24, width / 2 - items.length * 62)

  return (
    <>
      {items.map((entry, index) => (
        <g key={`legend-${entry.key}`} transform={`translate(${startX + index * 124} ${y - 16})`}>
          <rect width="14" height="14" rx="3" fill={entry.color ?? palette[index % palette.length]} />
          <text x="22" y="12" fontSize="12" fill={colors.inkSoft}>
            {entry.label ?? entry.key}
          </text>
        </g>
      ))}
    </>
  )
}

function describeDonutSlice(
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0
  const outerStart = polarPoint(centerX, centerY, outerRadius, startAngle)
  const outerEnd = polarPoint(centerX, centerY, outerRadius, endAngle)

  if (innerRadius <= 0) {
    return [
      `M ${centerX} ${centerY}`,
      `L ${outerStart.x} ${outerStart.y}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
      'Z',
    ].join(' ')
  }

  const innerEnd = polarPoint(centerX, centerY, innerRadius, endAngle)
  const innerStart = polarPoint(centerX, centerY, innerRadius, startAngle)

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

function polarPoint(centerX: number, centerY: number, radius: number, angle: number) {
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  }
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function formatTick(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function renderChart(spec: ChartSpec, colors: ThemeColors) {
  const palette = buildPalette(colors)

  const tooltipStyle = {
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    background: colors.panelStrong,
    color: colors.ink,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)',
    fontSize: 13,
  }

  const sharedAxes = (
    <>
      <CartesianGrid stroke={colors.border} vertical={false} />
      <XAxis dataKey={spec.xKey} stroke={colors.inkMuted} tick={{ fill: colors.inkMuted }} tickLine={false} axisLine={false} />
      <YAxis stroke={colors.inkMuted} tick={{ fill: colors.inkMuted }} tickLine={false} axisLine={false} />
      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(128,128,128,0.06)' }} />
      <Legend wrapperStyle={{ color: colors.inkSoft, fontSize: 13 }} />
    </>
  )

  if (spec.type === 'bar') {
    return (
      <BarChart data={spec.data}>
        {sharedAxes}
        {spec.series?.map((series, index) => (
          <Bar
            key={series.key}
            dataKey={series.key}
            name={series.label ?? series.key}
            fill={series.color ?? palette[index % palette.length]}
            isAnimationActive={false}
            stackId={spec.stacked ? 'stack' : undefined}
            radius={[8, 8, 0, 0]}
          />
        ))}
      </BarChart>
    )
  }

  if (spec.type === 'line') {
    return (
      <LineChart data={spec.data}>
        {sharedAxes}
        {spec.series?.map((series, index) => (
          <Line
            key={series.key}
            dataKey={series.key}
            name={series.label ?? series.key}
            stroke={series.color ?? palette[index % palette.length]}
            strokeWidth={3}
            dot={{ r: 2.5 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    )
  }

  if (spec.type === 'area') {
    return (
      <AreaChart data={spec.data}>
        {sharedAxes}
        {spec.series?.map((series, index) => {
          const color = series.color ?? palette[index % palette.length]
          return (
            <Area
              key={series.key}
              dataKey={series.key}
              name={series.label ?? series.key}
              fill={color}
              stroke={color}
              fillOpacity={0.22}
              strokeWidth={3}
              isAnimationActive={false}
              stackId={spec.stacked ? 'stack' : undefined}
            />
          )
        })}
      </AreaChart>
    )
  }

  const labelKey =
    spec.xKey ??
    Object.keys(spec.data[0] ?? {}).find((key) => typeof spec.data[0]?.[key] === 'string') ??
    'name'
  const pieKey = spec.yKey ?? spec.series?.[0]?.key ?? 'value'

  return (
    <PieChart>
      <Tooltip contentStyle={tooltipStyle} />
      <Legend wrapperStyle={{ color: colors.inkSoft, fontSize: 13 }} />
      <Pie
        data={spec.data}
        dataKey={pieKey}
        nameKey={labelKey}
        innerRadius={spec.donut ? 64 : 0}
        outerRadius={110}
        paddingAngle={3}
        isAnimationActive={false}
      >
        {spec.data.map((entry, index) => (
          <Cell
            key={`${entry[labelKey] ?? index}`}
            fill={spec.series?.[index]?.color ?? palette[index % palette.length]}
          />
        ))}
      </Pie>
    </PieChart>
  )
}
