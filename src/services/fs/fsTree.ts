/**
 * Build a react-arborist tree from the ZenFS filesystem.
 */
import { fs } from '@zenfs/core'
import { joinPath } from './zenfs'
import type { TreeNode } from '../../types/fs'

async function readDirNode(dir: string): Promise<TreeNode[]> {
  const names = await fs.promises.readdir(dir)
  const nodes: TreeNode[] = []
  for (const name of names) {
    const path = joinPath(dir, name)
    const st = await fs.promises.stat(path)
    if (st.isDirectory()) {
      nodes.push({
        id: path,
        name,
        isDir: true,
        children: await readDirNode(path),
      })
    } else {
      nodes.push({ id: path, name, isDir: false })
    }
  }
  // Directories first, then alphabetical.
  nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return nodes
}

export async function readTree(): Promise<TreeNode[]> {
  return readDirNode('/')
}
