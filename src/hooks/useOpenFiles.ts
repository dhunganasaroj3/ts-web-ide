/**
 * Open-files state: the single source of truth for which files are open as
 * tabs and which one is active. The dockview layer mirrors this.
 */
import { useCallback, useState } from 'react'

export interface OpenFilesApi {
  openPaths: string[]
  activePath: string | null
  open: (path: string) => void
  close: (path: string) => void
  setActive: (path: string | null) => void
  /** React to an external rename: replace oldPath with newPath in tabs. */
  renamePath: (oldPath: string, newPath: string) => void
  /** React to an external delete: drop the path from tabs. */
  dropPath: (path: string) => void
  reset: (paths: string[], active: string | null) => void
}

export function useOpenFiles(): OpenFilesApi {
  const [openPaths, setOpenPaths] = useState<string[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)

  const open = useCallback((path: string) => {
    setOpenPaths((prev) => (prev.includes(path) ? prev : [...prev, path]))
    setActivePath(path)
  }, [])

  const close = useCallback((path: string) => {
    setOpenPaths((prev) => {
      const next = prev.filter((p) => p !== path)
      setActivePath((cur) => {
        if (cur !== path) return cur
        // Activate the neighbour that took its place.
        const idx = prev.indexOf(path)
        return next[idx] ?? next[idx - 1] ?? null
      })
      return next
    })
  }, [])

  const renamePath = useCallback((oldPath: string, newPath: string) => {
    setOpenPaths((prev) => prev.map((p) => (p === oldPath ? newPath : p)))
    setActivePath((cur) => (cur === oldPath ? newPath : cur))
  }, [])

  const dropPath = useCallback((path: string) => {
    setOpenPaths((prev) => prev.filter((p) => p !== path))
    setActivePath((cur) => (cur === path ? null : cur))
  }, [])

  const reset = useCallback((paths: string[], active: string | null) => {
    setOpenPaths(paths)
    setActivePath(active)
  }, [])

  return {
    openPaths,
    activePath,
    open,
    close,
    setActive: setActivePath,
    renamePath,
    dropPath,
    reset,
  }
}
