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
          <StaticChart spec={chart} height={height} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {renderChart(chart)}
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}

function StaticChart({ spec, height }: { spec: ChartSpec; height: number }) {
  const width = 720

  if (spec.type === 'pie') {
    return <StaticPieChart spec={spec} width={width} height={height} />
  }

  return <StaticCartesianChart spec={spec} width={width} height={height} />
}

function StaticCartesianChart({
  spec,
  width,
  height,
}: {
  spec: ChartSpec
  width: number
  height: number
}) {
  const margin = { top: 20, right: 28, bottom: 54, left: 56 }
  const chartWidth = width - margin.left - margin.right
  const chartHeight = height - margin.top - margin.bottom
  const series = spec.series ?? []
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
      <rect x="0" y="0" width={width} height={height} rx="12" fill="#fffaf5" />
      {gridValues.map((value) => {
        const lineY = y(value)
        return (
          <g key={`grid-${value}`}>
            <line
              x1={margin.left}
              y1={lineY}
              x2={width - margin.right}
              y2={lineY}
              stroke="rgba(59, 43, 20, 0.12)"
            />
            <text x={margin.left - 10} y={lineY + 4} textAnchor="end" fontSize="12" fill="#7b6754">
              {formatTick(value)}
            </text>
          </g>
        )
      })}
      <line x1={margin.left} y1={baseline} x2={width - margin.right} y2={baseline} stroke="#7b6754" />
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
            fill="#7b6754"
          >
            {label}
          </text>
        )
      })}
      {spec.type === 'bar' &&
        renderStaticBars(spec, { margin, chartWidth, chartHeight, xStep, y, baseline })}
      {spec.type === 'line' &&
        renderStaticLines(spec, { margin, xStep, y })}
      {spec.type === 'area' &&
        renderStaticAreas(spec, { margin, xStep, y, baseline })}
      <StaticLegend spec={spec} width={width} y={height - 2} />
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
          fill={entry.color ?? '#7a1f2b'}
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
) {
  return (spec.series ?? []).flatMap((entry) => {
    const points = spec.data.map((row, index) => ({
      x: layout.margin.left + layout.xStep * index + layout.xStep / 2,
      y: layout.y(numberValue(row[entry.key])),
    }))
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
    const color = entry.color ?? '#315d74'

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
) {
  return (spec.series ?? []).flatMap((entry) => {
    const points = spec.data.map((row, index) => ({
      x: layout.margin.left + layout.xStep * index + layout.xStep / 2,
      y: layout.y(numberValue(row[entry.key])),
    }))
    const color = entry.color ?? '#4f846f'
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
}: {
  spec: ChartSpec
  width: number
  height: number
}) {
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
      <rect x="0" y="0" width={width} height={height} rx="12" fill="#fffaf5" />
      {slices.map(({ path, index }) => (
          <path
            key={`slice-${index}`}
            d={path}
            fill={spec.series?.[index]?.color ?? piePalette[index % piePalette.length]}
          />
      ))}
      {spec.data.map((row, index) => (
        <g key={`legend-${index}`} transform={`translate(470 ${54 + index * 28})`}>
          <rect
            width="14"
            height="14"
            rx="3"
            fill={spec.series?.[index]?.color ?? piePalette[index % piePalette.length]}
          />
          <text x="24" y="12" fontSize="13" fill="#5d4b3f">
            {String(row[labelKey] ?? `Slice ${index + 1}`)}
          </text>
        </g>
      ))}
    </svg>
  )
}

function StaticLegend({ spec, width, y }: { spec: ChartSpec; width: number; y: number }) {
  const items = spec.series ?? []
  const startX = Math.max(24, width / 2 - items.length * 62)

  return (
    <>
      {items.map((entry, index) => (
        <g key={`legend-${entry.key}`} transform={`translate(${startX + index * 124} ${y - 16})`}>
          <rect width="14" height="14" rx="3" fill={entry.color ?? '#7a1f2b'} />
          <text x="22" y="12" fontSize="12" fill="#5d4b3f">
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

function renderChart(spec: ChartSpec) {
  const sharedAxes = (
    <>
      <CartesianGrid stroke="rgba(59, 43, 20, 0.08)" vertical={false} />
      <XAxis dataKey={spec.xKey} stroke="#7b6754" tickLine={false} axisLine={false} />
      <YAxis stroke="#7b6754" tickLine={false} axisLine={false} />
      <Tooltip
        contentStyle={{
          borderRadius: 18,
          border: '1px solid rgba(59, 43, 20, 0.1)',
          boxShadow: '0 10px 40px rgba(72, 49, 25, 0.12)',
        }}
      />
      <Legend />
    </>
  )

  if (spec.type === 'bar') {
    return (
      <BarChart data={spec.data}>
        {sharedAxes}
        {spec.series?.map((series) => (
          <Bar
            key={series.key}
            dataKey={series.key}
            name={series.label ?? series.key}
            fill={series.color ?? '#7a1f2b'}
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
        {spec.series?.map((series) => (
          <Line
            key={series.key}
            dataKey={series.key}
            name={series.label ?? series.key}
            stroke={series.color ?? '#315d74'}
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
        {spec.series?.map((series) => (
          <Area
            key={series.key}
            dataKey={series.key}
            name={series.label ?? series.key}
            fill={series.color ?? '#4f846f'}
            stroke={series.color ?? '#4f846f'}
            fillOpacity={0.24}
            strokeWidth={3}
            isAnimationActive={false}
            stackId={spec.stacked ? 'stack' : undefined}
          />
        ))}
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
      <Tooltip
        contentStyle={{
          borderRadius: 18,
          border: '1px solid rgba(59, 43, 20, 0.1)',
          boxShadow: '0 10px 40px rgba(72, 49, 25, 0.12)',
        }}
      />
      <Legend />
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
            fill={spec.series?.[index]?.color ?? piePalette[index % piePalette.length]}
          />
        ))}
      </Pie>
    </PieChart>
  )
}

const piePalette = ['#7a1f2b', '#4a3247', '#5a7a55', '#c89866', '#b54a4a', '#3d5a6c']
