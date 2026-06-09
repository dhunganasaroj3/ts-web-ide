/**
 * A single editor panel inside a dockview tab. Binds a Monaco editor to the
 * file's model (created/managed by the multi-model manager) and persists
 * per-file view state across tab switches.
 *
 * We use the raw monaco API (not @monaco-editor/react) here so we fully control
 * the model lifecycle: the editor instance attaches to an existing shared model
 * and never disposes it.
 */
import { useEffect, useRef } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'
import { monaco } from '../../monaco-env'
import { getOrCreateModel } from '../../services/monaco/models'
import {
  clearActiveEditor,
  setActiveEditor,
} from '../../services/monaco/activeEditor'
import { readFile, writeFile } from '../../services/fs/zenfs'
import { acquireTypesFromSource } from '../../services/monaco/typeAcquisition'
import { revalidateDiagnostics } from '../../services/monaco/compiler'

// Per-file view state (cursor/scroll/folding), preserved across mounts.
const viewStateCache = new Map<
  string,
  import('monaco-editor').editor.ICodeEditorViewState | null
>()

export interface EditorPanelParams {
  path: string
  [key: string]: unknown
}

export function EditorPanel(props: IDockviewPanelProps<EditorPanelParams>) {
  const path = props.params.path
  const hostRef = useRef<HTMLDivElement | null>(null)
  const editorRef =
    useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    let saveTimer: ReturnType<typeof setTimeout> | undefined

    const editor = monaco.editor.create(host, {
      theme: 'vs-dark',
      fontSize: 14,
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      model: null,
    })
    editorRef.current = editor

    // Track the focused editor so top-level actions (Format) can target it.
    setActiveEditor(editor)
    const focusSub = editor.onDidFocusEditorText(() => setActiveEditor(editor))

    // Load content from the FS, attach the shared model, restore view state.
    void (async () => {
      let content: string
      try {
        content = await readFile(path)
      } catch {
        content = ''
      }
      if (disposed) return
      const model = getOrCreateModel(path, content)
      // If the on-disk content drifted from the model (e.g. external write),
      // prefer the freshly-read content only when the model is brand new.
      if (model.getValue() !== content && model.getVersionId() === 1) {
        model.setValue(content)
      }
      editor.setModel(model)
      const vs = viewStateCache.get(path)
      if (vs) editor.restoreViewState(vs)
      editor.focus()

      // Clear any stale cross-file diagnostics now that this model (and any
      // siblings preloaded since) are present in the language service.
      revalidateDiagnostics()

      // Kick off best-effort type acquisition for any bare imports.
      acquireTypesFromSource(model.getValue())

      // Debounced autosave + re-scan imports for new dependencies.
      model.onDidChangeContent(() => {
        clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          void writeFile(path, model.getValue())
          acquireTypesFromSource(model.getValue())
        }, 400)
      })
    })()

    return () => {
      disposed = true
      clearTimeout(saveTimer)
      focusSub.dispose()
      clearActiveEditor(editor)
      // Persist view state, flush pending content, then dispose the EDITOR
      // (the view) — never the model.
      viewStateCache.set(path, editor.saveViewState())
      const model = editor.getModel()
      if (model) void writeFile(path, model.getValue())
      editor.dispose()
      editorRef.current = null
    }
  }, [path])

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
}
