/**
 * OXC-powered document outline for the active file.
 */
import { useEffect, useState } from 'react'
import { monaco } from '../../monaco-env'
import { getOutline, type OutlineSymbol } from '../../services/oxc/oxc'
import './OutlinePanel.css'

interface OutlinePanelProps {
  activePath: string | null
}

const KIND_GLYPH: Record<OutlineSymbol['kind'], string> = {
  function: 'ƒ',
  class: 'C',
  variable: 'v',
  interface: 'I',
  type: 'T',
  enum: 'E',
}

export function OutlinePanel({ activePath }: OutlinePanelProps) {
  const [symbols, setSymbols] = useState<OutlineSymbol[]>([])

  useEffect(() => {
    let cancelled = false
    const model = activePath
      ? monaco.editor.getModel(monaco.Uri.parse('file://' + activePath))
      : null

    const compute = async () => {
      const result = model
        ? await getOutline(model.getValue(), model.uri.path)
        : []
      if (!cancelled) setSymbols(result)
    }
    void compute()

    const sub = model?.onDidChangeContent(() => void compute())
    return () => {
      cancelled = true
      sub?.dispose()
    }
  }, [activePath])

  function jumpTo(line: number) {
    const editors = monaco.editor.getEditors()
    for (const ed of editors) {
      if (ed.getModel()?.uri.path === activePath) {
        ed.revealLineInCenter(line)
        ed.setPosition({ lineNumber: line, column: 1 })
        ed.focus()
        return
      }
    }
  }

  return (
    <div className="outline-panel">
      <div className="outline-panel__header">OUTLINE</div>
      <div className="outline-panel__body">
        {symbols.length === 0 ? (
          <div className="outline-panel__empty">No symbols</div>
        ) : (
          symbols.map((s, i) => (
            <div
              key={`${s.name}-${i}`}
              className="outline-row"
              onClick={() => jumpTo(s.line)}
            >
              <span className={`outline-row__glyph outline-row__glyph--${s.kind}`}>
                {KIND_GLYPH[s.kind]}
              </span>
              <span className="outline-row__name">{s.name}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
