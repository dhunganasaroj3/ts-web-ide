/**
 * React binding over the ZenFS service.
 *
 * Holds the file tree in state, re-reads it on any FS mutation (via fsEvents),
 * and exposes CRUD actions used by the file-tree UI.
 */
import { useCallback, useEffect, useState } from 'react'
import { subscribeFs } from '../services/fs/fsEvents'
import { readTree } from '../services/fs/fsTree'
import {
  createDir,
  createFile,
  initFS,
  move,
  remove,
  writeFile,
} from '../services/fs/zenfs'
import type { TreeNode } from '../types/fs'

export interface FileSystemApi {
  tree: TreeNode[]
  ready: boolean
  refresh: () => Promise<void>
  createFile: (path: string, content?: string) => Promise<void>
  createDir: (path: string) => Promise<void>
  writeFile: (path: string, content: string) => Promise<void>
  rename: (src: string, dest: string) => Promise<void>
  remove: (path: string) => Promise<void>
}

export function useFileSystem(): FileSystemApi {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    setTree(await readTree())
  }, [])

  useEffect(() => {
    let active = true
    initFS().then(async () => {
      if (!active) return
      await refresh()
      setReady(true)
    })
    const unsubscribe = subscribeFs(() => {
      void refresh()
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [refresh])

  return {
    tree,
    ready,
    refresh,
    createFile,
    createDir,
    writeFile,
    rename: move,
    remove,
  }
}
