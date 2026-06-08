import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  label?: string
  children: ReactNode
}
interface State {
  error: Error | null
}

/** Contains render-time errors in a subtree so one panel can't blank the app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ''}]`, error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 16,
            color: '#f48771',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 12,
            whiteSpace: 'pre-wrap',
          }}
        >
          {this.props.label ? `${this.props.label} crashed:\n` : 'Something went wrong:\n'}
          {this.state.error.message}
          <br />
          <button
            style={{ marginTop: 12 }}
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
