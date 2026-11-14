import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  error: Error | null
}

/**
 * Last line of defence for render-time crashes.
 * A broken page should never take down the whole Mini App shell.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Wire this to Sentry / your error reporting service in production.
    console.error('[VarNet] Uncaught render error:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state

    if (!error) return this.props.children

    return (
      <div className="flex min-h-dvh items-center justify-center bg-tg-secondary-bg p-6">
        <div className="w-full max-w-sm rounded-2xl border border-tg-separator bg-tg-bg p-6 text-center shadow-sm">
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-tg-destructive/10 text-tg-destructive">
            <TriangleAlert className="size-6" aria-hidden />
          </span>
          <h1 className="text-lg font-semibold text-tg-text">خطایی رخ داد</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-tg-hint">
            نمایش این صفحه با خطا مواجه شد. معمولاً بارگذاری دوباره مشکل را برطرف می‌کند.
          </p>
          <pre className="bidi-ltr mt-3 max-h-24 overflow-auto rounded-lg bg-tg-secondary-bg p-2 text-left text-[11px] text-tg-hint">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-tg-button text-[15px] font-medium text-tg-button-text transition-opacity hover:opacity-90"
          >
            <RotateCcw className="size-4" aria-hidden />
            بارگذاری دوباره
          </button>
        </div>
      </div>
    )
  }
}
