/**
 * Virtual filesystem backed by ZenFS over IndexedDB.
 *
 * Files persist across reloads (IndexedDB). All paths are absolute and POSIX
 * (forward slashes), rooted at "/". Text is UTF-8.
 */
import { configure, fs } from '@zenfs/core'
import { IndexedDB } from '@zenfs/dom'
import { emitFsChange } from './fsEvents'
import type { FileLanguage } from '../../types/fs'

const STORE_NAME = 'ts-web-ide'

let initPromise: Promise<void> | null = null

/** Initialise the FS once (idempotent). Safe to call repeatedly / concurrently. */
export function initFS(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await configure({
        mounts: {
          '/': { backend: IndexedDB, storeName: STORE_NAME },
        },
      })
      // Ask the browser to keep IndexedDB from being evicted under pressure.
      try {
        await navigator.storage?.persist?.()
      } catch {
        /* best-effort */
      }
      await seedIfEmpty()
    })()
  }
  return initPromise
}

// ---------------------------------------------------------------------------
// Path helpers (POSIX, no node:path dependency)
// ---------------------------------------------------------------------------

export function basename(path: string): string {
  const p = path.replace(/\/+$/, '')
  const i = p.lastIndexOf('/')
  return i < 0 ? p : p.slice(i + 1)
}

export function dirname(path: string): string {
  const p = path.replace(/\/+$/, '')
  const i = p.lastIndexOf('/')
  if (i <= 0) return '/'
  return p.slice(0, i)
}

export function joinPath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, '')}/${name}`.replace(/\/{2,}/g, '/')
}

const EXT_LANG: Record<string, FileLanguage> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  html: 'html',
  htm: 'html',
  md: 'markdown',
}

export function languageFor(path: string): FileLanguage {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext] ?? 'plaintext'
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function readFile(path: string): Promise<string> {
  return fs.promises.readFile(path, 'utf8')
}

export async function writeFile(path: string, content: string): Promise<void> {
  await fs.promises.mkdir(dirname(path), { recursive: true })
  await fs.promises.writeFile(path, content, 'utf8')
  emitFsChange()
}

export async function exists(path: string): Promise<boolean> {
  try {
    await fs.promises.stat(path)
    return true
  } catch {
    return false
  }
}

export async function createFile(path: string, content = ''): Promise<void> {
  if (await exists(path)) throw new Error(`File already exists: ${path}`)
  await writeFile(path, content)
}

export async function createDir(path: string): Promise<void> {
  await fs.promises.mkdir(path, { recursive: true })
  emitFsChange()
}

export async function remove(path: string): Promise<void> {
  const st = await fs.promises.stat(path)
  if (st.isDirectory()) {
    await fs.promises.rm(path, { recursive: true, force: true })
  } else {
    await fs.promises.unlink(path)
  }
  emitFsChange()
}

/** Move/rename a file or directory. Returns nothing; emits a change. */
export async function move(src: string, dest: string): Promise<void> {
  if (src === dest) return
  await fs.promises.mkdir(dirname(dest), { recursive: true })
  await fs.promises.rename(src, dest)
  emitFsChange()
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

const SEED_INDEX = `// Welcome to ts-web-ide — a fully in-browser TypeScript IDE.
import { greet } from './greeter'

/** @returns {string} */
const returnName = () => {
  const name = 'John'
  return name
}

console.log(greet(returnName()))
`

const SEED_GREETER = `export function greet(name: string): string {
  return \`Hello, \${name}!\`
}
`

async function seedIfEmpty(): Promise<void> {
  const entries = await fs.promises.readdir('/')
  if (entries.length > 0) return
  await fs.promises.writeFile('/index.ts', SEED_INDEX, 'utf8')
  await fs.promises.writeFile('/greeter.ts', SEED_GREETER, 'utf8')
  emitFsChange()
}
