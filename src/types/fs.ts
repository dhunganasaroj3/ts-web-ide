/** A node in the file tree, shaped for react-arborist (`id` = absolute path). */
export interface TreeNode {
  id: string // absolute path, e.g. "/src/index.ts"
  name: string // basename, e.g. "index.ts"
  isDir: boolean
  /** Present (possibly empty) for directories; undefined for files. */
  children?: TreeNode[]
}

export type FileLanguage =
  | 'typescript'
  | 'javascript'
  | 'json'
  | 'css'
  | 'html'
  | 'markdown'
  | 'plaintext'
