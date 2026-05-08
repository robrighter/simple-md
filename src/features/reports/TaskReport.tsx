import type { ReportDescriptor } from '../../app/types'
import { renderReportDescriptor } from './reportRegistry'

type TaskReportProps = {
  descriptor: ReportDescriptor
}

export function TaskReport({ descriptor }: TaskReportProps) {
  const rendered = renderReportDescriptor(descriptor)

  if (!rendered) {
    return null
  }

  return rendered
}
