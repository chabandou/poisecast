export type OrtPrefetchStrategy = 'adaptive' | 'eager' | 'off'

type NetworkConnection = {
  effectiveType?: string
  saveData?: boolean
}

type NavigatorWithConnection = Navigator & {
  connection?: NetworkConnection
  mozConnection?: NetworkConnection
  webkitConnection?: NetworkConnection
}

const SLOW_CONNECTION_TYPES = new Set(['slow-2g', '2g', '3g'])

function normalizeStrategy(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function isConstrainedConnection(connection: NetworkConnection | null): boolean {
  if (!connection) return false
  if (connection.saveData) return true

  const effectiveType = connection.effectiveType?.toLowerCase()
  if (!effectiveType) return false
  return SLOW_CONNECTION_TYPES.has(effectiveType)
}

export function resolveOrtPrefetchStrategy(
  rawValue: string | undefined,
): OrtPrefetchStrategy {
  const normalized = normalizeStrategy(rawValue)
  if (normalized === 'off') return 'off'
  if (normalized === 'eager') return 'eager'
  return 'adaptive'
}

export function readNavigatorConnection(): NetworkConnection | null {
  if (typeof navigator === 'undefined') return null
  const nav = navigator as NavigatorWithConnection
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null
}

export function shouldPrefetchOrtCore(
  strategy: OrtPrefetchStrategy,
  connection: NetworkConnection | null,
): boolean {
  if (strategy === 'off') return false
  if (strategy === 'eager') return true
  return !isConstrainedConnection(connection)
}
