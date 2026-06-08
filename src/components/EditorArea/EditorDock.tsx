/**
 * The tabbed editor area (dockview). Mirrors the openFiles state into dockview
 * panels and reports user-driven tab changes (close, activate) back up.
 */
import { useEffect, useRef } from 'react'
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
} from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import { EditorPanel } from './EditorPanel'
import { basename } from '../../services/fs/zenfs'
import type { OpenFilesApi } from '../../hooks/useOpenFiles'

const components = { editor: EditorPanel }

interface EditorDockProps {
  openFiles: OpenFilesApi
  onApiReady?: (api: DockviewApi) => void
}

export function EditorDock({ openFiles, onApiReady }: EditorDockProps) {
  const apiRef = useRef<DockviewApi | null>(null)
  // Guard so programmatic changes don't echo back as user actions.
  const syncing = useRef(false)

  const onReady = (event: DockviewReadyEvent) => {
    const api = event.api
    apiRef.current = api
    onApiReady?.(api)

    api.onDidActivePanelChange((panel) => {
      if (syncing.current) return
      if (panel) openFiles.setActive(panel.id)
    })
    api.onDidRemovePanel((panel) => {
      if (syncing.current) return
      openFiles.dropPath(panel.id)
    })
  }

  // Reconcile dockview panels with the openPaths/activePath state.
  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    syncing.current = true
    try {
      const want = new Set(openFiles.openPaths)

      // Remove panels no longer open.
      for (const panel of api.panels) {
        if (!want.has(panel.id)) api.removePanel(panel)
      }
      // Add panels newly opened.
      for (const path of openFiles.openPaths) {
        if (!api.getPanel(path)) {
          api.addPanel({
            id: path,
            component: 'editor',
            title: basename(path),
            params: { path },
          })
        }
      }
      // Activate the active panel.
      if (openFiles.activePath) {
        const panel = api.getPanel(openFiles.activePath)
        panel?.api.setActive()
      }
    } finally {
      syncing.current = false
    }
  }, [openFiles.openPaths, openFiles.activePath])

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <DockviewReact
        components={components}
        onReady={onReady}
        className="dockview-theme-dark"
      />
    </div>
  )
}
