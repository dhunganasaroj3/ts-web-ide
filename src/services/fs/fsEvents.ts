/**
 * Minimal pub/sub for filesystem mutations.
 *
 * ZenFS does not emit change events, so every mutating operation in our FS
 * service calls `emitFsChange()`. React layers subscribe and re-read the tree.
 */
type Listener = () => void

const listeners = new Set<Listener>()

export function subscribeFs(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitFsChange(): void {
  for (const listener of listeners) listener()
}
