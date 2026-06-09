/**
 * Drives the build → sandbox pipeline and collects console output.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { bundle } from '../services/run/bundle'
import {
  runInSandbox,
  type ConsoleLevel,
  type SandboxMessage,
} from '../services/run/sandbox'

export interface LogEntry {
  id: number
  level: ConsoleLevel | 'system'
  text: string
}

export interface RunOptions {
  /** Surface a DevTools hint so user-placed `debugger;` statements are useful. */
  debug?: boolean
}

export interface RunnerApi {
  logs: LogEntry[]
  running: boolean
  run: (entry: string, opts?: RunOptions) => Promise<void>
  clear: () => void
  /** Attach the iframe host element (the preview/output container). */
  setHost: (el: HTMLElement | null) => void
}

let runCounter = 0
let logCounter = 0

export function useRunner(): RunnerApi {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [running, setRunning] = useState(false)
  const hostRef = useRef<HTMLElement | null>(null)
  const currentRunId = useRef<string>('')

  const append = useCallback((level: LogEntry['level'], text: string) => {
    setLogs((prev) => [...prev, { id: ++logCounter, level, text }])
  }, [])

  // Listen for sandbox messages from the active run only.
  useEffect(() => {
    function onMessage(e: MessageEvent<SandboxMessage>) {
      const data = e.data
      if (!data || data.channel !== 'ts-web-ide-sandbox') return
      if (data.runId !== currentRunId.current) return
      if (data.kind === 'done') {
        setRunning(false)
        return
      }
      if (data.kind === 'console' && data.level) {
        append(data.level, data.text ?? '')
      } else if (data.kind === 'error') {
        append('error', data.text ?? 'Unknown error')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [append])

  const clear = useCallback(() => setLogs([]), [])

  const run = useCallback(
    async (entry: string, opts?: RunOptions) => {
      clear()
      setRunning(true)
      const runId = `run-${++runCounter}`
      currentRunId.current = runId

      if (opts?.debug) {
        append(
          'system',
          'Debug mode: open your browser DevTools (F12). `debugger;` statements ' +
            'will pause execution, and stack traces map to your source files.',
        )
      }
      append('system', `Bundling ${entry}…`)
      const result = await bundle(entry)

      if (result.code == null) {
        for (const err of result.errors) append('error', err)
        append('system', 'Build failed.')
        setRunning(false)
        return
      }
      for (const w of result.warnings) append('warn', w)

      const host = hostRef.current
      if (!host) {
        append('error', 'No sandbox host attached.')
        setRunning(false)
        return
      }
      append('system', 'Running…')
      runInSandbox(host, result.code, runId)
    },
    [append, clear],
  )

  const setHost = useCallback((el: HTMLElement | null) => {
    hostRef.current = el
  }, [])

  return { logs, running, run, clear, setHost }
}
