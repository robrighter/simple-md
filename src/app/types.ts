export type DocumentMode = 'preview' | 'source' | 'wysiwyg' | 'split'

export type TreeNode =
  | {
      kind: 'directory'
      name: string
      path: string
      children: TreeNode[]
    }
  | {
      kind: 'file'
      name: string
      path: string
      extension?: string
    }

export type WorkspaceSnapshot = {
  path: string
  name: string
  tree: TreeNode[]
}

export type WorkspaceRoot = {
  id: string
  name: string
  path: string
  tree: TreeNode[]
}

export type ReportDescriptor = {
  component: string
  props: Record<string, unknown>
}

export type OpenDocument = {
  id: string
  title: string
  content: string
  mode: DocumentMode
  isDirty: boolean
  path?: string
  savedVersion?: string
  externalChange?: {
    version: string
    content: string
  }
  sourceUrl?: string
  baseUrl?: string
  workspacePath?: string
  reportDescriptor?: ReportDescriptor
}

export type DocumentPayload = {
  path: string
  name: string
  content: string
  version?: string
}

export type ImportedDocumentPayload = {
  url: string
  normalizedUrl: string
  baseUrl: string
  contentType?: string | null
  title: string
  content: string
}

export type ChartPoint = Record<string, string | number | null>

export type ChartType = 'bar' | 'line' | 'area' | 'pie'

export type ChartSeries = {
  key: string
  label?: string
  color?: string
}

export type ChartSpec = {
  type: ChartType
  title?: string
  description?: string
  data: ChartPoint[]
  xKey?: string
  yKey?: string
  series?: ChartSeries[]
  height?: number
  stacked?: boolean
  donut?: boolean
}
