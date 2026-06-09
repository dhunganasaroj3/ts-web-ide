/**
 * Wires Prettier into Monaco's document-formatting pipeline. Once registered,
 * Monaco's built-in `editor.action.formatDocument` action and the default
 * `Shift+Alt+F` shortcut format the active file with Prettier.
 */
import { monaco } from '../../monaco-env'
import { formatSource } from '../format/format'

let registered = false

const LANGUAGES = ['typescript', 'javascript', 'json', 'css', 'html']

export function registerFormatProvider(): void {
  if (registered) return
  registered = true

  const provider: import('monaco-editor').languages.DocumentFormattingEditProvider =
    {
      async provideDocumentFormattingEdits(model) {
        const original = model.getValue()
        let formatted: string
        try {
          formatted = await formatSource(model.uri.path, original)
        } catch {
          // Syntax error or unsupported — leave the document untouched.
          return []
        }
        if (formatted === original) return []
        return [
          {
            range: model.getFullModelRange(),
            text: formatted,
          },
        ]
      },
    }

  for (const lang of LANGUAGES) {
    monaco.languages.registerDocumentFormattingEditProvider(lang, provider)
  }
}
