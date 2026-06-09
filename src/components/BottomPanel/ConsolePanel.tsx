/**
 * Console output panel (log view only).
 *
 * The sandbox iframe host lives in App.tsx so it stays mounted regardless of
 * where the console is placed (bottom / right drawer / dockview tab). This panel
 * is therefore free to be mounted in any of those locations.
 */
import { useEffect, useRef } from 'react'
import type { RunnerApi } from '../../hooks/useRunner'
import './ConsolePanel.css'

interface ConsolePanelProps {
  runner: RunnerApi
}

export function ConsolePanel({ runner }: ConsolePanelProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null)

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
    </div>
  )
}
