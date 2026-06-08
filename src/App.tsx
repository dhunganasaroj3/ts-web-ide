import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { useEffect, useRef } from 'react'
import type { DockviewApi } from 'dockview-react'
import { configureTypeScript } from './services/monaco/compiler'
import { installOxcDiagnostics } from './services/monaco/oxcProvider'
import { useFileSystem } from './hooks/useFileSystem'
import { useOpenFiles } from './hooks/useOpenFiles'
import { useRunner } from './hooks/useRunner'
import { FileTree } from './components/Sidebar/FileTree'
import { OutlinePanel } from './components/Sidebar/OutlinePanel'
import { EditorDock } from './components/EditorArea/EditorDock'
import { ConsolePanel } from './components/BottomPanel/ConsolePanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import { disposeModel, renameModel } from './services/monaco/models'
import { exists } from './services/fs/zenfs'
import { loadWorkspace, saveWorkspace } from './services/persist/workspace'
import './App.css'

function App() {
  const fsApi = useFileSystem()
  const openFiles = useOpenFiles()
  const runner = useRunner()
  const dockApiRef = useRef<DockviewApi | null>(null)
  const restored = useRef(false)

  useEffect(() => {
    configureTypeScript()
    installOxcDiagnostics()
  }, [])

  // Restore the workspace (open tabs + active) once the FS is ready.
  useEffect(() => {
    if (!fsApi.ready || restored.current) return
    restored.current = true
    void (async () => {
      const meta = loadWorkspace()
      if (!meta) return
      // Drop any tabs whose files no longer exist.
      const valid: string[] = []
      for (const p of meta.openPaths) if (await exists(p)) valid.push(p)
      const active =
        meta.activePath && valid.includes(meta.activePath)
          ? meta.activePath
          : (valid[0] ?? null)
      openFiles.reset(valid, active)
    })()
  }, [fsApi.ready, openFiles])

  // Persist workspace metadata whenever open tabs / active file change.
  useEffect(() => {
    if (!restored.current) return
    saveWorkspace({
      openPaths: openFiles.openPaths,
      activePath: openFiles.activePath,
      dockviewLayout: dockApiRef.current?.toJSON(),
    })
  }, [openFiles.openPaths, openFiles.activePath])

  async function handleRun() {
    const candidates = [openFiles.activePath, '/index.ts', '/index.tsx'].filter(
      Boolean,
    ) as string[]
    let entry = candidates[0]
    for (const c of candidates) {
      if (await exists(c)) {
        entry = c
        break
      }
    }
    await runner.run(entry)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">ts-web-ide</span>
        <span className="phase">multi-file · type-checked · runnable</span>
        <span className="topbar__spacer" />
        <button
          className="run-button"
          onClick={handleRun}
          disabled={runner.running}
        >
          {runner.running ? 'running…' : '▶ Run'}
        </button>
      </header>
      <div className="body">
        <Allotment proportionalLayout={false} defaultSizes={[240, 800]}>
          <Allotment.Pane minSize={160} preferredSize={240}>
            <Allotment vertical defaultSizes={[600, 200]}>
              <Allotment.Pane>
                <FileTree
                  fsApi={fsApi}
                  activePath={openFiles.activePath}
                  onOpen={openFiles.open}
                  onRenamed={(oldPath, newPath) => {
                    renameModel(oldPath, newPath)
                    openFiles.renamePath(oldPath, newPath)
                  }}
                  onDeleted={(path) => {
                    disposeModel(path)
                    openFiles.dropPath(path)
                  }}
                />
              </Allotment.Pane>
              <Allotment.Pane minSize={60} preferredSize={200} snap>
                <OutlinePanel activePath={openFiles.activePath} />
              </Allotment.Pane>
            </Allotment>
          </Allotment.Pane>
          <Allotment.Pane>
            <Allotment vertical proportionalLayout={false} defaultSizes={[600, 200]}>
              <Allotment.Pane>
                <ErrorBoundary label="editor">
                  <EditorDock
                    openFiles={openFiles}
                    onApiReady={(api) => (dockApiRef.current = api)}
                  />
                </ErrorBoundary>
              </Allotment.Pane>
              <Allotment.Pane minSize={80} preferredSize={200} snap>
                <ConsolePanel runner={runner} />
              </Allotment.Pane>
            </Allotment>
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  )
}

export default App
