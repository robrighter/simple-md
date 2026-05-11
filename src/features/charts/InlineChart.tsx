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
}

export function InlineChart({ rawSpec, spec }: InlineChartProps) {
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
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(chart)}
        </ResponsiveContainer>
      </div>
    </section>
  )
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
