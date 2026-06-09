/**
 * The tabbed editor area (dockview). Mirrors the openFiles state into dockview
 * panels and reports user-driven tab changes (close, activate) back up.
 *
 * The console can optionally live here as a reserved, non-file panel
 * (`CONSOLE_PANEL_ID`) when its placement is "tab".
 */
import { useEffect, useRef, useState } from 'react'
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import { EditorPanel } from './EditorPanel'
import { ConsolePanel } from '../BottomPanel/ConsolePanel'
import { basename } from '../../services/fs/zenfs'
import type { OpenFilesApi } from '../../hooks/useOpenFiles'
import type { RunnerApi } from '../../hooks/useRunner'

/** Reserved dockview panel id for the console-as-tab placement. */
export const CONSOLE_PANEL_ID = '__console__'

// The console tab reads the runner from the dockview panel params.
function ConsoleTab(props: IDockviewPanelProps<{ runner: RunnerApi }>) {
  return <ConsolePanel runner={props.params.runner} />
}

const components = { editor: EditorPanel, console: ConsoleTab }

interface EditorDockProps {
  openFiles: OpenFilesApi
  runner: RunnerApi
  /** When true, show the console as a reserved tab in the dock. */
  consoleAsTab: boolean
  onApiReady?: (api: DockviewApi) => void
  /** Called when the user closes the console tab via its tab control. */
  onConsoleTabClosed?: () => void
}

export function EditorDock({
  openFiles,
  runner,
  consoleAsTab,
  onApiReady,
  onConsoleTabClosed,
}: EditorDockProps) {
  const apiRef = useRef<DockviewApi | null>(null)
  // Guard so programmatic changes don't echo back as user actions.
  const syncing = useRef(false)
  // Bumped each time a (possibly new) dockview becomes ready. Changing console
  // placement remounts this component and recreates DockviewReact from scratch,
  // so the reconcile effects must re-run against the fresh, empty api to
  // repopulate panels — otherwise the editor area renders blank.
  const [ready, setReady] = useState(0)
  // Keep the latest callback without re-running the ready effect.
  const onConsoleTabClosedRef = useRef(onConsoleTabClosed)
  useEffect(() => {
    onConsoleTabClosedRef.current = onConsoleTabClosed
  }, [onConsoleTabClosed])

  const onReady = (event: DockviewReadyEvent) => {
    const api = event.api
    apiRef.current = api
    onApiReady?.(api)
    setReady((n) => n + 1)

    api.onDidActivePanelChange((panel) => {
      if (syncing.current) return
      if (panel && panel.id !== CONSOLE_PANEL_ID) openFiles.setActive(panel.id)
    })
    api.onDidRemovePanel((panel) => {
      if (syncing.current) return
      if (panel.id === CONSOLE_PANEL_ID) {
        onConsoleTabClosedRef.current?.()
        return
      }
      openFiles.dropPath(panel.id)
    })
  }

  // Reconcile dockview panels with the openPaths/activePath state.
  // The reserved console panel is excluded from file reconciliation.
  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    syncing.current = true
    try {
      const want = new Set(openFiles.openPaths)

      // Remove file panels no longer open (never touch the console panel).
      for (const panel of api.panels) {
        if (panel.id === CONSOLE_PANEL_ID) continue
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
  }, [openFiles.openPaths, openFiles.activePath, ready])

  // Add/remove the reserved console panel as placement toggles.
  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    const existing = api.getPanel(CONSOLE_PANEL_ID)
    syncing.current = true
    try {
      if (consoleAsTab && !existing) {
        api.addPanel({
          id: CONSOLE_PANEL_ID,
          component: 'console',
          title: 'Console',
          params: { runner },
        })
      } else if (!consoleAsTab && existing) {
        api.removePanel(existing)
      }
    } finally {
      syncing.current = false
    }
  }, [consoleAsTab, runner, ready])

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
