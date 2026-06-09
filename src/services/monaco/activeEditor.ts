/**
 * Tracks the most recently focused Monaco editor instance so top-level UI
 * (e.g. the Format button) can act on "the editor the user is looking at"
 * without prop-drilling editor refs through the dockview layer.
 */
type Editor = import('monaco-editor').editor.IStandaloneCodeEditor

let active: Editor | null = null

export function setActiveEditor(editor: Editor | null): void {
  active = editor
}

/** Clear the active editor only if it currently points at `editor`. */
export function clearActiveEditor(editor: Editor): void {
  if (active === editor) active = null
}

export function getActiveEditor(): Editor | null {
  return active
}
