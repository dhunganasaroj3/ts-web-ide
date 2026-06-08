/**
 * OXC parser integration (browser WASM).
 *
 * OXC has NO browser type checker and oxlint-wasm is unpublished, so this is
 * parse-only. We use it for fast, structural features:
 *   - getOutline(): top-level symbols for the outline panel.
 *   - getParseErrors(): instant syntax-error diagnostics (Monaco markers).
 *
 * The `@oxc-parser/wasm` package is frozen/deprecated at 0.60.0, so everything
 * is lazy-loaded and wrapped in try/catch with API feature-detection — if it
 * fails to load, these features silently disable and the rest of the IDE is
 * unaffected.
 */
import wasmURL from '@oxc-parser/wasm/web/oxc_parser_wasm_bg.wasm?url'

type OxcModule = {
  default: (input: unknown) => Promise<unknown>
  parseSync: (source: string, options?: unknown) => { program?: unknown; errors?: unknown[] }
}

let modPromise: Promise<OxcModule | null> | null = null

async function getOxc(): Promise<OxcModule | null> {
  if (!modPromise) {
    modPromise = (async () => {
      try {
        const mod = (await import('@oxc-parser/wasm/web/oxc_parser_wasm.js')) as unknown as OxcModule
        if (typeof mod.default === 'function') {
          // Newer wasm-bindgen prefers a single options object.
          await mod.default({ module_or_path: wasmURL })
        }
        if (typeof mod.parseSync !== 'function') return null
        return mod
      } catch (err) {
        console.warn('[oxc] failed to load; outline/fast-diagnostics disabled', err)
        return null
      }
    })()
  }
  return modPromise
}

export interface OutlineSymbol {
  name: string
  kind: 'function' | 'class' | 'variable' | 'interface' | 'type' | 'enum'
  line: number // 1-based
}

export interface ParseError {
  message: string
  start: number // byte offset
  end: number
}

interface EstreeNode {
  type: string
  start?: number
  end?: number
  [key: string]: unknown
}

function lineFromOffset(source: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') line++
  }
  return line
}

function declName(decl: EstreeNode): string | null {
  const id = decl.id as EstreeNode | undefined
  if (id && typeof id.name === 'string') return id.name as string
  return null
}

/** Extract top-level symbols (functions, classes, top consts, types). */
export async function getOutline(source: string, filename = 'file.ts'): Promise<OutlineSymbol[]> {
  const oxc = await getOxc()
  if (!oxc) return []
  let program: EstreeNode
  try {
    const result = oxc.parseSync(source, { sourceFilename: filename })
    program = result.program as EstreeNode
    if (!program) return []
  } catch {
    return []
  }

  const symbols: OutlineSymbol[] = []
  const body = (program.body as EstreeNode[]) ?? []

  const visit = (node: EstreeNode) => {
    // Unwrap `export` / `export default` declarations.
    if (
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportDefaultDeclaration'
    ) {
      const inner = node.declaration as EstreeNode | undefined
      if (inner) visit(inner)
      return
    }
    const at = (n: EstreeNode) => lineFromOffset(source, n.start ?? 0)
    switch (node.type) {
      case 'FunctionDeclaration': {
        const name = declName(node)
        if (name) symbols.push({ name, kind: 'function', line: at(node) })
        break
      }
      case 'ClassDeclaration': {
        const name = declName(node)
        if (name) symbols.push({ name, kind: 'class', line: at(node) })
        break
      }
      case 'TSInterfaceDeclaration': {
        const name = declName(node)
        if (name) symbols.push({ name, kind: 'interface', line: at(node) })
        break
      }
      case 'TSTypeAliasDeclaration': {
        const name = declName(node)
        if (name) symbols.push({ name, kind: 'type', line: at(node) })
        break
      }
      case 'TSEnumDeclaration': {
        const name = declName(node)
        if (name) symbols.push({ name, kind: 'enum', line: at(node) })
        break
      }
      case 'VariableDeclaration': {
        for (const d of (node.declarations as EstreeNode[]) ?? []) {
          const id = d.id as EstreeNode | undefined
          if (id && typeof id.name === 'string') {
            symbols.push({ name: id.name as string, kind: 'variable', line: at(node) })
          }
        }
        break
      }
    }
  }

  for (const node of body) visit(node)
  return symbols
}

/** Return syntax/parse errors with byte offsets. */
export async function getParseErrors(source: string, filename = 'file.ts'): Promise<ParseError[]> {
  const oxc = await getOxc()
  if (!oxc) return []
  try {
    const result = oxc.parseSync(source, { sourceFilename: filename })
    const errors = (result.errors as Array<Record<string, unknown>>) ?? []
    return errors.map((e) => ({
      message: String(e.message ?? 'Syntax error'),
      start: Number((e.labels as Array<{ start?: number }>)?.[0]?.start ?? 0),
      end: Number((e.labels as Array<{ end?: number }>)?.[0]?.end ?? 0),
    }))
  } catch {
    return []
  }
}
