export function countWords(content: string) {
  return content.trim() ? content.trim().split(/\s+/).length : 0
}

export function fileNameFromPath(path: string) {
  return path.split(/[/\\]/).pop() ?? path
}

export function fileStemFromPath(path: string) {
  return fileNameFromPath(path).replace(/\.[^.]+$/, '')
}

export function dirname(path: string) {
  return path.replace(/[/\\][^/\\]+$/, '')
}

export function isSameOrChildPath(candidatePath: string, parentPath: string) {
  if (candidatePath === parentPath) {
    return true
  }

  const normalizedParent = parentPath.replace(/[/\\]+$/, '')

  return (
    candidatePath.startsWith(`${normalizedParent}/`) ||
    candidatePath.startsWith(`${normalizedParent}\\`)
  )
}

export function replacePathPrefix(
  originalPath: string,
  previousPrefix: string,
  nextPrefix: string,
) {
  if (!isSameOrChildPath(originalPath, previousPrefix)) {
    return originalPath
  }

  return `${nextPrefix}${originalPath.slice(previousPrefix.length)}`
}

export function createDraftTitle(content: string) {
  const heading = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '))

  if (heading) {
    return heading.replace(/^#\s+/, '').toLowerCase().replace(/\s+/g, '-')
  }

  return 'untitled-note'
}

export function isMarkdownPath(path: string) {
  return /\.(md|markdown|mdown|mkd)$/i.test(path)
}

export function normalizeOpenedTarget(rawTarget: string) {
  if (!rawTarget) {
    return null
  }

  if (rawTarget.startsWith('file://')) {
    const url = new URL(rawTarget)
    const path = normalizeFileUrlPath(url)

    return {
      type: guessTargetType(path),
      path,
    } as const
  }

  return {
    type: guessTargetType(rawTarget),
    path: rawTarget,
  } as const
}

export function resolveDocumentUrl(target: string | undefined, baseUrl?: string) {
  if (!target) {
    return undefined
  }

  try {
    return new URL(target, baseUrl).toString()
  } catch {
    return target
  }
}

function guessTargetType(path: string) {
  return /\.[a-z0-9]+$/i.test(path) ? 'file' : 'directory'
}

function normalizeFileUrlPath(url: URL) {
  const rawPath = decodeURIComponent(url.pathname)

  if (/^\/[A-Za-z]:\//.test(rawPath)) {
    return rawPath.slice(1)
  }

  if (url.hostname) {
    return `//${url.hostname}${rawPath}`
  }

  return rawPath
}
