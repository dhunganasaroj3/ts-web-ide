import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { useEffect, useRef, useState } from 'react'
import { configureTypeScript } from './services/monaco/compiler'
import { registerFormatProvider } from './services/monaco/formatProvider'
import { installOxcDiagnostics } from './services/monaco/oxcProvider'
import { getActiveEditor } from './services/monaco/activeEditor'
import { useFileSystem } from './hooks/useFileSystem'
import { useOpenFiles } from './hooks/useOpenFiles'
import { useRunner } from './hooks/useRunner'
import { FileTree } from './components/Sidebar/FileTree'
import { OutlinePanel } from './components/Sidebar/OutlinePanel'
import { EditorDock } from './components/EditorArea/EditorDock'
import { ConsolePanel } from './components/BottomPanel/ConsolePanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import {
  disposeModel,
  getModel,
  preloadModels,
  renameModel,
} from './services/monaco/models'
import { exists } from './services/fs/zenfs'
import {
  loadWorkspace,
  saveWorkspace,
  type ConsolePlacement,
} from './services/persist/workspace'
import {
  applyShare,
  buildShareUrl,
  clearShareHash,
  collectWorkspace,
  readShareFromLocation,
} from './services/share/share'
import { ShareDialog } from './components/ShareDialog'
import './App.css'

const PLACEMENT_CYCLE: Record<ConsolePlacement, ConsolePlacement> = {
  bottom: 'right',
  right: 'tab',
  tab: 'bottom',
}

const PLACEMENT_LABEL: Record<ConsolePlacement, string> = {
  bottom: '▭ Console: Bottom',
  right: '◧ Console: Right',
  tab: '⊞ Console: Tab',
}

function App() {
  const fsApi = useFileSystem()
  const openFiles = useOpenFiles()
  const runner = useRunner()
  const sandboxHostRef = useRef<HTMLDivElement | null>(null)
  const restored = useRef(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [placement, setPlacement] = useState<ConsolePlacement>('bottom')

  useEffect(() => {
    configureTypeScript()
    registerFormatProvider()
    installOxcDiagnostics()
  }, [])

  // Attach the runner's iframe host once. It lives here (not in ConsolePanel)
  // so relocating the console never detaches the sandbox.
  useEffect(() => {
    runner.setHost(sandboxHostRef.current)
  }, [runner])

  // Restore the workspace (open tabs + active + console placement) once the FS
  // is ready. A `#share=...` link, if present, takes precedence (after confirm).
  useEffect(() => {
    if (!fsApi.ready || restored.current) return
    restored.current = true
    void (async () => {
      const shared = readShareFromLocation()
      if (shared) {
        clearShareHash()
        const ok = window.confirm(
          'Open shared workspace? This replaces your current files.',
        )
        if (ok) {
          await applyShare(shared, fsApi, openFiles)
          return
        }
        // Declined — fall through to the normal restore below.
      }

      // Preload models for the whole project so cross-file imports resolve
      // from the start (avoids stale "Cannot find module" markers).
      await preloadModels()
      const meta = loadWorkspace()
      if (!meta) return
      if (meta.consolePlacement) setPlacement(meta.consolePlacement)
      // Drop any tabs whose files no longer exist.
      const valid: string[] = []
      for (const p of meta.openPaths) if (await exists(p)) valid.push(p)
      const active =
        meta.activePath && valid.includes(meta.activePath)
          ? meta.activePath
          : (valid[0] ?? null)
      openFiles.reset(valid, active)
    })()
  }, [fsApi.ready, fsApi, openFiles])

  // Persist workspace metadata whenever open tabs / active / placement change.
  useEffect(() => {
    if (!restored.current) return
    saveWorkspace({
      openPaths: openFiles.openPaths,
      activePath: openFiles.activePath,
      consolePlacement: placement,
    })
  }, [openFiles.openPaths, openFiles.activePath, placement])

  async function resolveEntry(): Promise<string> {
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
    return entry
  }

  async function handleRun() {
    await runner.run(await resolveEntry())
  }

  async function handleDebug() {
    await runner.run(await resolveEntry(), { debug: true })
  }

  function handleFormat() {
    getActiveEditor()?.getAction('editor.action.formatDocument')?.run()
  }

  async function handleShare() {
    if (shareUrl) {
      setShareUrl(null)
      return
    }
    const payload = await collectWorkspace(openFiles)
    setShareUrl(buildShareUrl(payload))
  }

  const activeSnippet = openFiles.activePath
    ? (getModel(openFiles.activePath)?.getValue() ?? null)
    : null

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">ts-web-ide</span>
        <span className="phase">multi-file · type-checked · runnable</span>
        <span className="topbar__spacer" />
        <button
          className="topbar-button"
          onClick={() => setPlacement((p) => PLACEMENT_CYCLE[p])}
          title="Cycle console placement: bottom → right → tab"
        >
          {PLACEMENT_LABEL[placement]}
        </button>
        <button className="topbar-button" onClick={handleFormat}>
          ⚙ Format
        </button>
        <div className="share-anchor">
          <button className="topbar-button" onClick={handleShare}>
            🔗 Share
          </button>
          {shareUrl && (
            <ShareDialog
              url={shareUrl}
              snippet={activeSnippet}
              onClose={() => setShareUrl(null)}
            />
          )}
        </div>
        <button
          className="topbar-button"
          onClick={handleDebug}
          disabled={runner.running}
        >
          🐞 Debug
        </button>
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
            <EditorConsoleArea
              placement={placement}
              openFiles={openFiles}
              runner={runner}
              onConsoleTabClosed={() => setPlacement('bottom')}
            />
          </Allotment.Pane>
        </Allotment>
      </div>
      {/* Always-mounted, offscreen sandbox host for the runner. */}
      <div ref={sandboxHostRef} className="sandbox-host" aria-hidden />
    </div>
  )
}

interface EditorConsoleAreaProps {
  placement: ConsolePlacement
  openFiles: ReturnType<typeof useOpenFiles>
  runner: ReturnType<typeof useRunner>
  onConsoleTabClosed: () => void
}

/** Lays out the editor dock + console according to the chosen placement. */
function EditorConsoleArea({
  placement,
  openFiles,
  runner,
  onConsoleTabClosed,
}: EditorConsoleAreaProps) {
  const dock = (
    <ErrorBoundary label="editor">
      <EditorDock
        openFiles={openFiles}
        runner={runner}
        consoleAsTab={placement === 'tab'}
        onConsoleTabClosed={onConsoleTabClosed}
      />
    </ErrorBoundary>
  )

  if (placement === 'tab') {
    return <div style={{ width: '100%', height: '100%' }}>{dock}</div>
  }

  if (placement === 'right') {
    return (
      <Allotment proportionalLayout={false} defaultSizes={[700, 300]}>
        <Allotment.Pane>{dock}</Allotment.Pane>
        <Allotment.Pane minSize={160} preferredSize={320} snap>
          <ConsolePanel runner={runner} />
        </Allotment.Pane>
      </Allotment>
    )
  }

  // bottom (default)
  return (
    <Allotment vertical proportionalLayout={false} defaultSizes={[600, 200]}>
      <Allotment.Pane>{dock}</Allotment.Pane>
      <Allotment.Pane minSize={80} preferredSize={200} snap>
        <ConsolePanel runner={runner} />
      </Allotment.Pane>
    </Allotment>
  )
}

export default App
