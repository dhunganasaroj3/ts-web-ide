/**
 * Share popover: shows the generated share link (and a quick "copy the active
 * file's source" action), each with clipboard copy and a transient "Copied!"
 * confirmation. Warns when the link is large enough that some chat apps may
 * truncate it.
 */
import { useEffect, useRef, useState } from 'react'
import { LARGE_URL_THRESHOLD } from '../services/share/share'

interface ShareDialogProps {
  url: string
  snippet: string | null
  onClose: () => void
}

type Copied = 'link' | 'snippet' | null

export function ShareDialog({ url, snippet, onClose }: ShareDialogProps) {
  const [copied, setCopied] = useState<Copied>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape.
  useEffect(() => {
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  async function copy(text: string, which: Exclude<Copied, null>) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* clipboard may be blocked; the field is still selectable */
    }
    setCopied(which)
    window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500)
  }

  const tooLarge = url.length > LARGE_URL_THRESHOLD

  return (
    <div className="share-dialog" ref={ref} role="dialog" aria-label="Share">
      <div className="share-dialog__title">Share workspace</div>
      <label className="share-dialog__label">Link (contains all files)</label>
      <div className="share-dialog__row">
        <input
          className="share-dialog__input"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          className="share-dialog__copy"
          onClick={() => copy(url, 'link')}
        >
          {copied === 'link' ? 'Copied!' : 'Copy link'}
        </button>
      </div>
      {tooLarge && (
        <div className="share-dialog__warn">
          Link is large ({url.length.toLocaleString()} chars) — some chat apps may
          truncate it.
        </div>
      )}
      {snippet != null && (
        <button
          className="share-dialog__snippet"
          onClick={() => copy(snippet, 'snippet')}
        >
          {copied === 'snippet' ? 'Copied!' : 'Copy active file as text'}
        </button>
      )}
    </div>
  )
}
