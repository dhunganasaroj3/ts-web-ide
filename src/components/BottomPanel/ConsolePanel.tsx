/**
 * Console output panel + the (offscreen) sandbox iframe host.
 */
import { useEffect, useRef } from 'react'
import type { RunnerApi } from '../../hooks/useRunner'
import './ConsolePanel.css'

interface ConsolePanelProps {
  runner: RunnerApi
}

export function ConsolePanel({ runner }: ConsolePanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    runner.setHost(hostRef.current)
  }, [runner])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [runner.logs])

  return (
    <div className="console-panel">
      <div className="console-panel__header">
        <span className="console-panel__title">CONSOLE</span>
        <button className="console-panel__clear" onClick={runner.clear}>
          Clear
        </button>
      </div>
      <div className="console-panel__logs">
        {runner.logs.length === 0 && (
          <div className="console-panel__empty">
            Output will appear here when you Run.
          </div>
        )}
        {runner.logs.map((entry) => (
          <div
            key={entry.id}
            className={`console-line console-line--${entry.level}`}
          >
            {entry.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {/* The sandbox iframe lives here, kept invisible (no UI preview yet). */}
      <div ref={hostRef} className="console-panel__sandbox" aria-hidden />
    </div>
  )
}
