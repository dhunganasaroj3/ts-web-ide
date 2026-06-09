/**
 * Client-side code formatting via Prettier's standalone browser build.
 *
 * Everything runs in the browser — no node, no server. We pick the parser from
 * the file extension and load only the plugins that parser needs.
 */
import { format as prettierFormat } from 'prettier/standalone'
import * as parserBabel from 'prettier/plugins/babel'
import * as parserEstree from 'prettier/plugins/estree'
import * as parserTypeScript from 'prettier/plugins/typescript'
import * as parserPostcss from 'prettier/plugins/postcss'
import * as parserHtml from 'prettier/plugins/html'
import type { Plugin } from 'prettier'

/** Map a file path to a Prettier parser + the plugins it requires. */
function parserFor(
  path: string,
): { parser: string; plugins: Plugin[] } | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return { parser: 'typescript', plugins: [parserTypeScript, parserEstree] }
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return { parser: 'babel', plugins: [parserBabel, parserEstree] }
    case 'json':
      return { parser: 'json', plugins: [parserBabel, parserEstree] }
    case 'css':
      return { parser: 'css', plugins: [parserPostcss] }
    case 'html':
    case 'htm':
      return { parser: 'html', plugins: [parserHtml] }
    default:
      return null
  }
}

/** True if this file type can be formatted. */
export function canFormat(path: string): boolean {
  return parserFor(path) !== null
}

/**
 * Format `source` for the given path. Throws on a syntax error (the caller
 * decides how to surface it); returns the source unchanged for unsupported
 * file types.
 */
export async function formatSource(
  path: string,
  source: string,
): Promise<string> {
  const cfg = parserFor(path)
  if (!cfg) return source
  return prettierFormat(source, {
    parser: cfg.parser,
    plugins: cfg.plugins,
    semi: false,
    singleQuote: true,
  })
}
