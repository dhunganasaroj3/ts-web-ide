/**
 * Monaco environment + worker wiring for Vite.
 *
 * This module MUST be imported once, before any Monaco editor is mounted
 * (we import it at the top of main.tsx). It does two things:
 *
 *   1. Sets `self.MonacoEnvironment.getWorker` so Monaco loads its language
 *      workers from our own bundle (via Vite `?worker` imports) instead of a
 *      CDN. The TypeScript worker is what provides type-checking, IntelliSense
 *      and JSDoc inference.
 *   2. Points `@monaco-editor/react`'s loader at our bundled `monaco` instance
 *      so there is exactly ONE monaco on the page — otherwise the wrapper pulls
 *      a second copy from a CDN and our worker config + models don't apply.
 */
import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    switch (label) {
      case 'json':
        return new JsonWorker()
      case 'css':
      case 'scss':
      case 'less':
        return new CssWorker()
      case 'html':
      case 'handlebars':
      case 'razor':
        return new HtmlWorker()
      case 'typescript':
      case 'javascript':
        return new TsWorker()
      default:
        return new EditorWorker()
    }
  },
}

// Use our bundled monaco, not the CDN copy.
loader.config({ monaco })

// Expose the live monaco instance in dev so e2e checks can query the language
// service without re-importing (which would create an unregistered copy).
if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __monaco?: typeof monaco }).__monaco = monaco
}

export { monaco }
