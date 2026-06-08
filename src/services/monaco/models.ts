/**
 * Multi-model manager.
 *
 * One Monaco model per file, keyed by its absolute path and given a
 * `file:///<path>` URI so the TypeScript worker resolves cross-file imports and
 * provides cross-file go-to-definition / find-references.
 *
 * Rules (see plan):
 *   - NEVER dispose a model on tab close. Tab close only detaches the view.
 *     Disposing loses undo history and breaks types for files importing it.
 *   - Dispose ONLY on file delete or rename-away.
 *   - Per-file view state (cursor/scroll/folding) is saved/restored on tab
 *     switch via the editor, not the model.
 */
import { monaco } from '../../monaco-env'
import { languageFor } from '../fs/zenfs'

function uriFor(path: string): import('monaco-editor').Uri {
  // path is absolute & POSIX, e.g. "/src/index.ts" -> file:///src/index.ts
  return monaco.Uri.parse('file://' + path)
}

/** Get the model for a path, creating it (with `content`) if absent. */
export function getOrCreateModel(
  path: string,
  content: string,
): import('monaco-editor').editor.ITextModel {
  const uri = uriFor(path)
  const existing = monaco.editor.getModel(uri)
  if (existing) return existing
  return monaco.editor.createModel(content, languageFor(path), uri)
}

export function getModel(
  path: string,
): import('monaco-editor').editor.ITextModel | null {
  return monaco.editor.getModel(uriFor(path))
}

/** Dispose a model — call ONLY when the underlying file is deleted. */
export function disposeModel(path: string): void {
  monaco.editor.getModel(uriFor(path))?.dispose()
}

/**
 * Handle a file rename: create a new model at the new path with the old
 * content, dispose the old one. Returns the new model.
 */
export function renameModel(
  oldPath: string,
  newPath: string,
): import('monaco-editor').editor.ITextModel | null {
  const old = getModel(oldPath)
  if (!old) return null
  const content = old.getValue()
  old.dispose()
  return getOrCreateModel(newPath, content)
}
