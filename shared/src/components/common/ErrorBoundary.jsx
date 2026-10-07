import { Component, useEffect } from 'react';

/** Retries the screen every few seconds; offers home after a while. */
function AutoRetry({ tries, onRetry }) {
  useEffect(() => {
    if (tries >= 3) return undefined;
    const t = setTimeout(onRetry, 2500);
    return () => clearTimeout(t);
  }, [tries, onRetry]);
  return (
    <>
      <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-zappy-100 border-t-zappy-600" aria-hidden="true" />
      <p className="mt-4 text-sm font-semibold text-slate-600">Just a moment…</p>
      {tries >= 3 && (
        <button type="button" onClick={() => { window.location.href = '/'; }}
          className="mt-3 text-sm font-semibold text-zappy-600 hover:underline">
          Continue to home
        </button>
      )}
    </>
  );
}
import { isStaleChunkError, reloadForUpdate } from '../../app/appUpdate';

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
    // A page file missing after a deploy is not an error: load the new version (app/appUpdate).
    if (isStaleChunkError(error) && reloadForUpdate()) { this.setState({ reloading: true }); return; }

    /*
     * Heal before asking anyone to. Most crashes are momentary (data arriving
     * half-way through a render, a stale screen after a deploy), so: render
     * again once, then reload the page once, and only then show the screen.
     * Each step is reported, so the cause still gets fixed.
     */
    const healed = this.heal();
    this.report(error, info, healed);
    if (healed) return;
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
    this.setState({ errorStack: error?.stack, componentStack: info?.componentStack });
  }

  /** Try to recover without the person noticing. Returns true while healing. */
  heal() {
    const KEY = 'zappy_error_heal';
    let state = { at: 0, step: 0 };
    try { state = JSON.parse(sessionStorage.getItem(KEY) || '{}') || state; } catch { /* storage blocked */ }
    const fresh = Date.now() - (state.at || 0) > 60000;
    const step = fresh ? 0 : state.step || 0;
    if (step >= 2) return false; // re-rendered and reloaded already: show the screen
    try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), step: step + 1 })); } catch { /* ignore */ }
    if (step === 0) {
      this.setState({ reloading: true });
      setTimeout(() => this.setState({ hasError: false, error: null, reloading: false }), 250);
    } else {
      this.setState({ reloading: true });
      window.location.reload();
    }
    return true;
  }

  report(error, info, healed) {
    try {
      const url = `${import.meta.env.VITE_API_URL || ''}/api/telemetry/client-error`;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, JSON.stringify({
          message: String(error?.message || error).slice(0, 500),
          errorStack: String(error?.stack || '').slice(0, 1500),   // real JS stack (file:line of the throw)
          stack: String(info?.componentStack || '').slice(0, 1000), // React component stack
          path: window.location.pathname + window.location.search,
          app: window.location.hostname.split('.')[0],
          healed,
          at: Date.now(),
        }));
      }
    } catch { /* telemetry is best-effort */ }
  }

  // The count lives here, so a retry that fails again is not retried forever.
  reset = () => this.setState((s) => ({ hasError: false, error: null, retries: (s.retries || 0) + 1 }));

  render() {
    if (!this.state.hasError) return this.props.children;
    // Reloading onto the new version: a blank moment, not an error screen.
    if (this.state.reloading) return <div className="min-h-screen bg-slate-50" />;

    // Never an error page: a calm moment that keeps retrying by itself, with a
    // quiet way home only if the screen still cannot be shown.
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <AutoRetry tries={this.state.retries || 0} onRetry={this.reset} />
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
