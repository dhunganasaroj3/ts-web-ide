/**
 * Best-effort automatic type acquisition for bare (npm) imports.
 *
 * For each bare specifier the user imports, fetch the package's .d.ts bundle
 * from esm.sh and register it with the TS language service via addExtraLib so
 * IntelliSense / type-checking work against third-party packages.
 *
 * This is best-effort: failures degrade the import to `any`, never blocking
 * editing. Resolved types are cached in-memory and mirrored into the virtual FS
 * under /node_modules for offline reuse.
 */
import { typescript } from 'monaco-editor'
import { writeFile, exists, readFile } from '../fs/zenfs'

const requested = new Set<string>()

function dtsCachePath(pkg: string): string {
  return `/node_modules/${pkg}/index.d.ts`
}

/**
 * Resolve and register types for a single bare package specifier.
 * `spec` is the import target, e.g. "lodash-es" or "react".
 */
export async function acquireTypes(spec: string): Promise<void> {
  // Only top-level package names (strip subpaths for the d.ts root).
  const pkg = spec.startsWith('@')
    ? spec.split('/').slice(0, 2).join('/')
    : spec.split('/')[0]
  if (requested.has(pkg)) return
  requested.add(pkg)

  // Serve from the VFS cache if present.
  const cachePath = dtsCachePath(pkg)
  try {
    if (await exists(cachePath)) {
      register(pkg, await readFile(cachePath))
      return
    }
  } catch {
    /* fall through to network */
  }

  try {
    // esm.sh advertises the bundled .d.ts via the X-TypeScript-Types header.
    const head = await fetch(`https://esm.sh/${pkg}`, { method: 'GET' })
    const dtsUrl = head.headers.get('x-typescript-types')
    if (!dtsUrl) return
    const dtsRes = await fetch(dtsUrl)
    if (!dtsRes.ok) return
    const dts = await dtsRes.text()
    register(pkg, dts)
    void writeFile(cachePath, dts).catch(() => {})
  } catch {
    /* best-effort; leave as implicit any */
  }
}

function register(pkg: string, dts: string): void {
  const uri = `file:///node_modules/${pkg}/index.d.ts`
  // Wrap as a module declaration so `import x from 'pkg'` resolves.
  const wrapped = `declare module '${pkg}' {\n${dts}\n}\n`
  typescript.typescriptDefaults.addExtraLib(wrapped, uri)
  typescript.javascriptDefaults.addExtraLib(wrapped, uri)
}

const BARE_IMPORT_RE =
  /(?:import|export)[\s\S]*?from\s*['"]([^'".][^'"]*)['"]|import\s*['"]([^'".][^'"]*)['"]/g

/** Scan source text for bare imports and acquire types for each. */
export function acquireTypesFromSource(source: string): void {
  const specs = new Set<string>()
  let m: RegExpExecArray | null
  BARE_IMPORT_RE.lastIndex = 0
  while ((m = BARE_IMPORT_RE.exec(source))) {
    const spec = m[1] ?? m[2]
    if (spec && !spec.startsWith('.') && !spec.startsWith('/')) specs.add(spec)
  }
  for (const spec of specs) void acquireTypes(spec)
}
