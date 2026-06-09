/**
 * Share a workspace via a link — no backend required.
 *
 * The whole workspace (every file + the open tabs + the active file) is JSON
 * serialized, compressed with lz-string, and placed in the URL hash fragment
 * (`#share=...`). Hash fragments are never sent to a server, so shared code stays
 * private; lz-string keeps the link compact and URL-safe in one step. This is the
 * same approach the TypeScript Playground uses.
 */
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string'
import { fs } from '@zenfs/core'
import { joinPath } from '../fs/zenfs'
import { preloadModels } from '../monaco/models'
import type { FileSystemApi } from '../../hooks/useFileSystem'
import type { OpenFilesApi } from '../../hooks/useOpenFiles'

const HASH_PREFIX = '#share='

/**
 * Practical ceiling for a shareable link. Browsers handle far more, but chat
 * apps (Discord/Slack) and some tools truncate beyond a few thousand chars.
 */
export const LARGE_URL_THRESHOLD = 8000

export interface SharePayload {
  v: 1
  files: Record<string, string>
  openPaths: string[]
  activePath: string | null
}

/** Walk the FS and collect every file's content (skips node_modules). */
async function collectFiles(): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  const walk = async (dir: string): Promise<void> => {
    let names: string[]
    try {
      names = await fs.promises.readdir(dir)
    } catch {
      return
    }
    for (const name of names) {
      const path = joinPath(dir, name)
      let isDir: boolean
      try {
        isDir = (await fs.promises.stat(path)).isDirectory()
      } catch {
        continue
      }
      if (isDir) {
        if (name === 'node_modules') continue
        await walk(path)
      } else {
        try {
          files[path] = await fs.promises.readFile(path, 'utf8')
        } catch {
          /* skip unreadable file */
        }
      }
    }
  }
  await walk('/')
  return files
}

/** Snapshot the current workspace into a shareable payload. */
export async function collectWorkspace(
  openFiles: OpenFilesApi,
): Promise<SharePayload> {
  return {
    v: 1,
    files: await collectFiles(),
    openPaths: openFiles.openPaths,
    activePath: openFiles.activePath,
  }
}

export function encodeShare(payload: SharePayload): string {
  return compressToEncodedURIComponent(JSON.stringify(payload))
}

export function decodeShare(fragment: string): SharePayload | null {
  try {
    const json = decompressFromEncodedURIComponent(fragment)
    if (!json) return null
    const parsed = JSON.parse(json) as SharePayload
    if (parsed.v !== 1) return null
    if (!parsed.files || typeof parsed.files !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

/** Build the full shareable URL for a payload. */
export function buildShareUrl(payload: SharePayload): string {
  return `${location.origin}${location.pathname}${HASH_PREFIX}${encodeShare(payload)}`
}

/** Read & decode a shared payload from the current URL, if present. */
export function readShareFromLocation(): SharePayload | null {
  const hash = location.hash
  if (!hash.startsWith(HASH_PREFIX)) return null
  return decodeShare(hash.slice(HASH_PREFIX.length))
}

/** Remove the `#share=...` fragment from the address bar without reloading. */
export function clearShareHash(): void {
  history.replaceState(null, '', location.pathname + location.search)
}

/**
 * Replace the current workspace with a shared payload: wipe the FS root, write
 * every shared file, rebuild Monaco models, and reset the open tabs. Mirrors the
 * restore flow in App.tsx.
 */
export async function applyShare(
  payload: SharePayload,
  fsApi: FileSystemApi,
  openFiles: OpenFilesApi,
): Promise<void> {
  // Clear existing top-level entries.
  let roots: string[]
  try {
    roots = await fs.promises.readdir('/')
  } catch {
    roots = []
  }
  for (const name of roots) {
    try {
      await fs.promises.rm(joinPath('/', name), { recursive: true, force: true })
    } catch {
      /* best-effort */
    }
  }

  // Write all shared files.
  for (const [path, content] of Object.entries(payload.files)) {
    try {
      await fsApi.writeFile(path, content)
    } catch {
      /* skip a file that fails to write */
    }
  }

  await fsApi.refresh()
  await preloadModels()

  const valid = payload.openPaths.filter((p) => p in payload.files)
  const active =
    payload.activePath && valid.includes(payload.activePath)
      ? payload.activePath
      : (valid[0] ?? null)
  openFiles.reset(valid, active)
}
