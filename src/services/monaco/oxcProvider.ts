/**
 * OXC-backed Monaco integration: fast syntax-error markers.
 *
 * The TS worker remains the source of truth for SEMANTIC diagnostics. OXC only
 * contributes parse (syntax) errors under a separate marker owner ('oxc') so
 * they appear instantly on debounce, ahead of the worker round-trip, without
 * double-reporting semantic issues.
 */
import { monaco } from '../../monaco-env'
import { getParseErrors } from '../oxc/oxc'

const OWNER = 'oxc'
const debounceTimers = new WeakMap<
  import('monaco-editor').editor.ITextModel,
  ReturnType<typeof setTimeout>
>()

function isTsLike(languageId: string): boolean {
  return (
    languageId === 'typescript' || languageId === 'javascript'
  )
}

async function refreshMarkers(
  model: import('monaco-editor').editor.ITextModel,
): Promise<void> {
  if (model.isDisposed() || !isTsLike(model.getLanguageId())) return
  const source = model.getValue()
  const errors = await getParseErrors(source, model.uri.path)
  if (model.isDisposed()) return
  const markers = errors.map((e) => {
    const start = model.getPositionAt(e.start)
    const end = model.getPositionAt(e.end > e.start ? e.end : e.start + 1)
    return {
      severity: monaco.MarkerSeverity.Error,
      message: e.message,
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
      source: 'oxc',
    }
  })
  monaco.editor.setModelMarkers(model, OWNER, markers)
}

function schedule(model: import('monaco-editor').editor.ITextModel): void {
  clearTimeout(debounceTimers.get(model))
  debounceTimers.set(
    model,
    setTimeout(() => void refreshMarkers(model), 300),
  )
}

let installed = false

/** Install OXC syntax-marker tracking for all current and future models. */
export function installOxcDiagnostics(): void {
  if (installed) return
  installed = true

  const attach = (model: import('monaco-editor').editor.ITextModel) => {
    if (!isTsLike(model.getLanguageId())) return
    void refreshMarkers(model)
    model.onDidChangeContent(() => schedule(model))
  }

  for (const model of monaco.editor.getModels()) attach(model)
  monaco.editor.onDidCreateModel(attach)
}
