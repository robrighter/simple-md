import type { ReactElement } from 'react'
import type { ReportDescriptor } from '../../app/types'
import { InlineChart } from '../charts/InlineChart'

type ReportComponent = (props: Record<string, unknown>) => ReactElement

const reportRegistry: Record<string, ReportComponent> = {
  HeadcountReport(props) {
    const title = typeof props.title === 'string' ? props.title : 'Headcount'
    const data = Array.isArray(props.data) ? props.data : []

    return (
      <section className="report-card">
        <header className="report-card__header">
          <div>
            <h2>{title}</h2>
            <p>Structured report component rendered from a registry-backed descriptor.</p>
          </div>
        </header>
        <div className="report-card__body">
          <div className="report-stats">
            <div className="report-stat">
              <span>Periods</span>
              <strong>{data.length}</strong>
            </div>
            <div className="report-stat">
              <span>Peak</span>
              <strong>
                {Math.max(
                  0,
                  ...data.map((entry) =>
                    typeof (entry as Record<string, unknown>).value === 'number'
                      ? ((entry as Record<string, unknown>).value as number)
                      : 0,
                  ),
                )}
              </strong>
            </div>
          </div>

          <InlineChart
            spec={{
              type: 'bar',
              title,
              data: data as Array<Record<string, string | number | null>>,
              xKey: 'name',
              yKey: 'value',
            }}
          />
        </div>
      </section>
    )
  },
}

export function renderReportDescriptor(descriptor: ReportDescriptor) {
  const component = reportRegistry[descriptor.component]

  if (!component) {
    return null
  }

  return component(descriptor.props)
}
