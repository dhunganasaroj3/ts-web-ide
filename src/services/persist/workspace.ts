/**
 * Workspace metadata persistence (localStorage).
 *
 * Files themselves live in ZenFS/IndexedDB; this stores the lightweight session
 * shell: which tabs are open, which is active, and the dockview layout JSON.
 */
const KEY = 'ts-web-ide:workspace'

export type ConsolePlacement = 'bottom' | 'right' | 'tab'

export interface WorkspaceMeta {
  openPaths: string[]
  activePath: string | null
  dockviewLayout?: unknown
  consolePlacement?: ConsolePlacement
}

export function loadWorkspace(): WorkspaceMeta | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WorkspaceMeta
    if (!Array.isArray(parsed.openPaths)) return null
    return parsed
  } catch {
    return null
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

export function saveWorkspace(meta: WorkspaceMeta): void {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(meta))
    } catch {
      /* ignore quota / serialization errors */
    }
  }, 250)
}
