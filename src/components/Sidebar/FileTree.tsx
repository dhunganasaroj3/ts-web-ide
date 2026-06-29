/**
 * File explorer (react-arborist) wired to the ZenFS-backed useFileSystem hook.
 *
 * Handlers translate arborist's id/parent semantics into ZenFS path operations.
 * Paths ARE the node ids (absolute, POSIX).
 *
 * Right-clicking a row (or empty space) opens a custom context menu with the
 * standard file operations. Create/Rename/Delete are routed through the tree
 * API so they reuse the handlers below and keep arborist's internal state in
 * sync; Duplicate/Copy Path act directly on the FS / clipboard.
 */
import { useRef, useState } from 'react'
import { Tree } from 'react-arborist'
import type { NodeApi, NodeRendererProps, TreeApi } from 'react-arborist'
import type { FileSystemApi } from '../../hooks/useFileSystem'
import type { TreeNode } from '../../types/fs'
import {
  basename,
  dirname,
  exists,
  joinPath,
  readFile,
} from '../../services/fs/zenfs'
import { useSize } from '../../hooks/useSize'
import { ContextMenu, type MenuItem } from './ContextMenu'
import './ContextMenu.css'
import './FileTree.css'

interface FileTreeProps {
  fsApi: FileSystemApi
  activePath: string | null
  onOpen: (path: string) => void
  /** Called after a file/dir is renamed so models + tabs can follow. */
  onRenamed?: (oldPath: string, newPath: string) => void
  /** Called after a file/dir is deleted so models + tabs can follow. */
  onDeleted?: (path: string) => void
}

interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

export function FileTree({
  fsApi,
  activePath,
  onOpen,
  onRenamed,
  onDeleted,
}: FileTreeProps) {
  const treeRef = useRef<TreeApi<TreeNode> | null>(null)
  const [bodyRef, bodySize] = useSize()
  const [menu, setMenu] = useState<MenuState | null>(null)

  const newFile = () => treeRef.current?.createLeaf()
  const newFolder = () => treeRef.current?.createInternal()

  const handleCreate: import('react-arborist').CreateHandler<TreeNode> = async ({
    parentNode,
    type,
  }) => {
    // Determine the directory to create inside.
    const parentDir = parentNode
      ? parentNode.data.isDir
        ? parentNode.data.id
        : dirname(parentNode.data.id)
      : '/'
    const base = type === 'internal' ? 'new-folder' : 'untitled.ts'
    let name = base
    let n = 1
    while (await exists(joinPath(parentDir, name))) {
      name = type === 'internal' ? `new-folder-${n}` : `untitled-${n}.ts`
      n++
    }
    const path = joinPath(parentDir, name)
    if (type === 'internal') await fsApi.createDir(path)
    else await fsApi.createFile(path, '')
    // Returning the new id lets arborist immediately put it into rename mode.
    return { id: path }
  }

  const handleRename: import('react-arborist').RenameHandler<TreeNode> = async ({
    id,
    name,
  }) => {
    const dest = joinPath(dirname(id), name)
    if (dest === id) return
    await fsApi.rename(id, dest)
    onRenamed?.(id, dest)
  }

  const handleMove: import('react-arborist').MoveHandler<TreeNode> = async ({
    dragNodes,
    parentNode,
  }) => {
    const destDir = parentNode
      ? parentNode.data.isDir
        ? parentNode.data.id
        : dirname(parentNode.data.id)
      : '/'
    for (const node of dragNodes) {
      const dest = joinPath(destDir, basename(node.data.id))
      if (dest !== node.data.id) {
        await fsApi.rename(node.data.id, dest)
        onRenamed?.(node.data.id, dest)
      }
    }
  }

  const handleDelete: import('react-arborist').DeleteHandler<TreeNode> = async ({
    ids,
  }) => {
    for (const id of ids) {
      await fsApi.remove(id)
      onDeleted?.(id)
    }
  }

  // --- Context-menu actions ---------------------------------------------

  // Create inside the directory of `nodeId` (or root when null), opening a
  // collapsed target so the inline rename input is visible.
  async function create(nodeId: string | null, isDir: boolean, type: 'leaf' | 'internal') {
    const parentId = nodeId === null ? null : isDir ? nodeId : dirname(nodeId)
    if (parentId) treeRef.current?.open(parentId)
    await treeRef.current?.create({ parentId, type })
  }

  async function duplicate(id: string) {
    const dir = dirname(id)
    const name = basename(id)
    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    let candidate = `${stem}-copy${ext}`
    let n = 2
    while (await exists(joinPath(dir, candidate))) {
      candidate = `${stem}-copy-${n}${ext}`
      n++
    }
    const dest = joinPath(dir, candidate)
    await fsApi.createFile(dest, await readFile(id))
    onOpen(dest)
  }

  async function copyPath(id: string) {
    try {
      await navigator.clipboard.writeText(id)
    } catch {
      /* clipboard may be blocked in some contexts */
    }
  }

  function confirmDelete(id: string, isDir: boolean) {
    const what = isDir ? 'folder and all its contents' : 'file'
    if (window.confirm(`Delete ${basename(id)}? This removes the ${what}.`)) {
      void treeRef.current?.delete(id)
    }
  }

  // Delete the current selection on Delete/Backspace. We handle this ourselves
  // (rather than relying on arborist, which only binds Backspace) so both keys
  // work and deletion always goes through the confirm prompt.
  function onTreeKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return
    if (treeRef.current?.isEditing) return
    const node =
      treeRef.current?.selectedNodes[0] ?? treeRef.current?.focusedNode
    if (!node) return
    e.preventDefault()
    e.stopPropagation()
    confirmDelete(node.data.id, node.data.isDir)
  }

  function rootItems(): MenuItem[] {
    return [
      { label: 'New File', onClick: () => void create(null, true, 'leaf') },
      { label: 'New Folder', onClick: () => void create(null, true, 'internal') },
    ]
  }

  function nodeItems(id: string, isDir: boolean): MenuItem[] {
    const items: MenuItem[] = [
      { label: 'New File', onClick: () => void create(id, isDir, 'leaf') },
      { label: 'New Folder', onClick: () => void create(id, isDir, 'internal') },
      { label: 'Rename', separatorBefore: true, onClick: () => void treeRef.current?.edit(id) },
    ]
    if (!isDir) {
      items.push({ label: 'Duplicate', onClick: () => void duplicate(id) })
    }
    items.push({ label: 'Copy Path', onClick: () => void copyPath(id) })
    items.push({
      label: 'Delete',
      danger: true,
      separatorBefore: true,
      onClick: () => confirmDelete(id, isDir),
    })
    return items
  }

  function openNodeMenu(e: React.MouseEvent, node: NodeApi<TreeNode>) {
    e.preventDefault()
    e.stopPropagation()
    node.focus()
    node.select()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: nodeItems(node.data.id, node.data.isDir),
    })
  }

  return (
    <div className="file-tree">
      <div className="file-tree__toolbar">
        <span className="file-tree__title">EXPLORER</span>
        <span className="file-tree__actions">
          <button title="New File" onClick={newFile}>
            ＋
          </button>
          <button title="New Folder" onClick={newFolder}>
            ⌗
          </button>
        </span>
      </div>
      <div
        className="file-tree__body"
        ref={bodyRef}
        onKeyDown={onTreeKeyDown}
        onContextMenu={(e) => {
          // Bubbles up from empty tree space (rows stopPropagation in their
          // own handler) -> a root-level "create" menu. stopPropagation keeps
          // this event from reaching the menu's own document listener (which
          // would otherwise immediately close the just-opened menu).
          e.preventDefault()
          e.stopPropagation()
          setMenu({ x: e.clientX, y: e.clientY, items: rootItems() })
        }}
      >
        <Tree<TreeNode>
          ref={treeRef}
          data={fsApi.tree}
          idAccessor="id"
          childrenAccessor={(d) => (d.isDir ? d.children ?? [] : null)}
          openByDefault={false}
          width={bodySize.width || 240}
          height={bodySize.height || 400}
          indent={14}
          rowHeight={24}
          onCreate={handleCreate}
          onRename={handleRename}
          onMove={handleMove}
          onDelete={handleDelete}
          onActivate={(node) => {
            if (!node.data.isDir) onOpen(node.data.id)
          }}
          selection={activePath ?? undefined}
        >
          {(props) => <Node {...props} onContext={openNodeMenu} />}
        </Tree>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

interface NodeProps extends NodeRendererProps<TreeNode> {
  onContext: (e: React.MouseEvent, node: NodeApi<TreeNode>) => void
}

function Node({ node, style, dragHandle, onContext }: NodeProps) {
  const isDir = node.data.isDir
  return (
    <div
      ref={dragHandle}
      style={style}
      className={
        'file-tree__row' + (node.isSelected ? ' file-tree__row--selected' : '')
      }
      onClick={(e) => {
        // Move DOM focus to arborist's role="tree" container so key events
        // (Delete/Backspace) bubble to the tree body's keydown handler, and
        // set arborist's own selection/focus for keyboard navigation.
        ;(e.currentTarget.closest('[role="tree"]') as HTMLElement | null)?.focus()
        node.focus()
        node.select()
        if (isDir) node.toggle()
        else node.activate()
      }}
      onContextMenu={(e) => onContext(e, node)}
    >
      <span className="file-tree__icon">
        {isDir ? (node.isOpen ? '▾' : '▸') : '·'}
      </span>
      {node.isEditing ? (
        <input
          className="file-tree__input"
          autoFocus
          defaultValue={node.data.name}
          onBlur={() => node.reset()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') node.reset()
            if (e.key === 'Enter') node.submit(e.currentTarget.value)
          }}
        />
      ) : (
        <span
          className="file-tree__name"
          onDoubleClick={(e) => {
            e.stopPropagation()
            node.edit()
          }}
        >
          {node.data.name}
        </span>
      )}
    </div>
  )
}

// Re-export to keep the NodeApi type referenced (avoids unused-import lint).
export type { NodeApi }
