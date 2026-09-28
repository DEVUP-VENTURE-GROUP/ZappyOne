import { Component } from 'react';

/**
 * App-wide error boundary. Without one, a single render error white-screens the
 * entire app — the #1 "amateur vs. polished" tell. This catches it and shows a
 * friendly recovery screen instead, with a reset that re-mounts the subtree and
 * a hard reload as a fallback.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Surface in the console; best-effort beacon to telemetry if available.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
    this.setState({ errorStack: error?.stack, componentStack: info?.componentStack });
    try {
      const url = `${import.meta.env.VITE_API_URL || ''}/api/telemetry/client-error`;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, JSON.stringify({
          message: String(error?.message || error).slice(0, 500),
          errorStack: String(error?.stack || '').slice(0, 1500),   // real JS stack (file:line of the throw)
          stack: String(info?.componentStack || '').slice(0, 1000), // React component stack
          path: window.location.pathname + window.location.search,
          at: Date.now(),
        }));
      }
    } catch { /* telemetry is best-effort */ }
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center mb-5">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h1 className="text-xl font-extrabold text-slate-900">Something went wrong</h1>
        <p className="text-sm text-slate-500 mt-1.5 max-w-xs">
          A part of the app hit an unexpected error. Your data is safe — let’s get you back on track.
        </p>
        <div className="flex items-center gap-2.5 mt-6">
          <button onClick={this.reset}
            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold active:scale-95 transition-transform">
            Try again
          </button>
          <button onClick={() => { window.location.href = '/'; }}
            className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-bold active:scale-95 transition-transform">
            Go home
          </button>
        </div>

        {/* Dev-only: show the actual error + where it threw so it's fixable at a glance. */}
        {import.meta.env.DEV && (
          <pre className="mt-6 max-w-full sm:max-w-xl w-full overflow-auto text-left text-[11px] leading-relaxed text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-3">
            {String(this.state.error?.message || this.state.error)}
            {this.state.errorStack ? `\n\n${this.state.errorStack}` : ''}
          </pre>
        )}
      </div>
    );
  }
}
