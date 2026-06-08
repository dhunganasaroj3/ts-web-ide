/**
 * esbuild plugin: resolve & load the user's files from the ZenFS virtual FS.
 *
 * Relative (`./`, `../`) and absolute (`/`) specifiers are resolved against the
 * virtual filesystem, trying a set of extensions and index files. Bare
 * specifiers are left for the esm.sh plugin to handle.
 */
import type { Plugin } from 'esbuild-wasm'
import { fs } from '@zenfs/core'
import { dirname, joinPath } from '../fs/zenfs'

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']
const INDEX_FILES = [
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
  '/index.json',
]

const NS = 'zenfs'

async function statIsFile(path: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(path)).isFile()
  } catch {
    return false
  }
}

async function resolveInVfs(spec: string): Promise<string | null> {
  // Try the path with each candidate extension.
  for (const ext of EXTENSIONS) {
    const candidate = spec + ext
    if (await statIsFile(candidate)) return candidate
  }
  // Try as a directory with an index file.
  for (const idx of INDEX_FILES) {
    const candidate = (spec.replace(/\/+$/, '') + idx).replace(/\/{2,}/g, '/')
    if (await statIsFile(candidate)) return candidate
  }
  return null
}

function loaderFor(path: string): 'ts' | 'tsx' | 'js' | 'jsx' | 'json' {
  if (path.endsWith('.tsx')) return 'tsx'
  if (path.endsWith('.ts')) return 'ts'
  if (path.endsWith('.jsx')) return 'jsx'
  if (path.endsWith('.json')) return 'json'
  return 'js'
}

export function zenfsPlugin(): Plugin {
  return {
    name: 'zenfs',
    setup(build) {
      // Entry point and absolute paths.
      build.onResolve({ filter: /^\// }, async (args) => {
        const resolved = await resolveInVfs(args.path)
        if (resolved) return { path: resolved, namespace: NS }
        return undefined
      })

      // Relative imports from a file already in the vfs.
      build.onResolve({ filter: /^\.\.?\// }, async (args) => {
        const baseDir =
          args.namespace === NS ? dirname(args.importer) : '/'
        const abs = normalise(joinPath(baseDir, args.path))
        const resolved = await resolveInVfs(abs)
        if (resolved) return { path: resolved, namespace: NS }
        return {
          errors: [{ text: `Cannot resolve '${args.path}' from '${args.importer}'` }],
        }
      })

      build.onLoad({ filter: /.*/, namespace: NS }, async (args) => {
        const contents = await fs.promises.readFile(args.path, 'utf8')
        return { contents, loader: loaderFor(args.path) }
      })
    },
  }
}

/** Collapse `a/b/../c` and `a/./b` segments in a POSIX path. */
function normalise(path: string): string {
  const parts = path.split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return '/' + out.join('/')
}
