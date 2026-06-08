/**
 * File explorer (react-arborist) wired to the ZenFS-backed useFileSystem hook.
 *
 * Handlers translate arborist's id/parent semantics into ZenFS path operations.
 * Paths ARE the node ids (absolute, POSIX).
 */
import { useRef } from 'react'
import { Tree } from 'react-arborist'
import type { NodeApi, NodeRendererProps, TreeApi } from 'react-arborist'
import type { FileSystemApi } from '../../hooks/useFileSystem'
import type { TreeNode } from '../../types/fs'
import { basename, dirname, exists, joinPath } from '../../services/fs/zenfs'
import { useSize } from '../../hooks/useSize'
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

export function FileTree({
  fsApi,
  activePath,
  onOpen,
  onRenamed,
  onDeleted,
}: FileTreeProps) {
  const treeRef = useRef<TreeApi<TreeNode> | null>(null)
  const [bodyRef, bodySize] = useSize()

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
      <div className="file-tree__body" ref={bodyRef}>
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
          {Node}
        </Tree>
      </div>
    </div>
  )
}

function Node({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  const isDir = node.data.isDir
  return (
    <div
      ref={dragHandle}
      style={style}
      className={
        'file-tree__row' + (node.isSelected ? ' file-tree__row--selected' : '')
      }
      onClick={() => {
        if (isDir) node.toggle()
        else node.activate()
      }}
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
