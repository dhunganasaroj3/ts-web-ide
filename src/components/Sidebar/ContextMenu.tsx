/**
 * Custom dark-theme context menu (no native browser menu).
 *
 * Rendered through a portal to document.body so it isn't clipped by the
 * file-tree body's `overflow: hidden`. Clamps itself to the viewport and
 * closes on outside click / Escape / window blur / scroll / resize.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  separatorBefore?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  })

  // Clamp to the viewport after the menu has measured itself.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = x + width > window.innerWidth ? Math.max(0, x - width) : x
    const top = y + height > window.innerHeight ? Math.max(0, y - height) : y
    setPos({ left, top })
  }, [x, y])

  // Close on outside interaction / Escape / window changes. Listeners are
  // attached on the next tick so the very `contextmenu`/`mousedown` event that
  // opened the menu doesn't immediately close it.
  useLayoutEffect(() => {
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointer)
      document.addEventListener('contextmenu', onPointer)
    }, 0)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('contextmenu', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  const style: CSSProperties = { left: pos.left, top: pos.top }

  return createPortal(
    <div className="ctx-menu" ref={ref} role="menu" style={style}>
      {items.map((item, i) => (
        <span key={i}>
          {item.separatorBefore && <div className="ctx-menu__sep" />}
          <button
            type="button"
            role="menuitem"
            className={
              'ctx-menu__item' +
              (item.danger ? ' ctx-menu__item--danger' : '')
            }
            onClick={() => {
              item.onClick()
              onClose()
            }}
          >
            {item.label}
          </button>
        </span>
      ))}
    </div>,
    document.body,
  )
}
