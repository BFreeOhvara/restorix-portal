import { Component } from 'react'
import { Button } from './ui/Button'

// Prompt 655 — a page-level render crash (e.g. Meeting Room's missing
// useEffect import) previously blanked the entire app to a white screen,
// sidebar and all, with nothing in the UI telling the closer what happened.
// This wraps just the routed page content (Layout's <Outlet/>), so a future
// bug in one page shows a real error state instead of taking down the shell.
export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Page crashed:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-elevated p-8">
          <p className="font-display text-lg font-medium text-fg-primary">Something went wrong loading this page.</p>
          <p className="font-sans text-sm text-fg-secondary">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <Button type="button" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
