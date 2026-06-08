import { useCallback, useState } from 'react'

export interface Size {
  width: number
  height: number
}

/**
 * Track an element's content-box size via ResizeObserver, using a callback ref
 * so it works with conditionally-rendered nodes and avoids reading a ref during
 * render.
 */
export function useSize(): [(el: HTMLElement | null) => void, Size] {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) setSize({ width: box.width, height: box.height })
    })
    ro.observe(el)
    // Disconnect when the element detaches.
    const cleanup = () => ro.disconnect()
    ;(el as unknown as { __sizeCleanup?: () => void }).__sizeCleanup = cleanup
  }, [])

  return [ref, size]
}
