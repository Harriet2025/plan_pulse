import { Component } from 'react';
import { RotateCcw } from 'lucide-react';

// If part of the app fails to draw, show a short message with a way out instead of a blank screen. After an update,
// a section's file from the old version may be gone: then the page reloads itself once to fetch the new version.

const RELOADED = 'auragoal.reloadedFor';
const isStaleChunk = (e) => /dynamically imported module|Importing a module script failed|Loading chunk|Failed to fetch/i.test(e?.message ?? '');

export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error) {
    console.error('[AuraGoal] a part of the page failed:', error);
    if (isStaleChunk(error)) {
      let already = null;
      try { already = sessionStorage.getItem(RELOADED); sessionStorage.setItem(RELOADED, String(Date.now())); } catch { /* ignore */ }
      if (!already || Date.now() - Number(already) > 60000) window.location.reload();
    }
  }

  componentDidUpdate(prev) {
    // Moving to another section clears the message
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }); // eslint-disable-line react/no-did-update-set-state
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <div role="alert" className="mx-auto mt-6 max-w-md rounded-2xl border border-oat bg-soft p-6 text-center">
        <p className="text-base font-extrabold text-charcoal">This page did not load properly</p>
        <p className="mt-1 text-sm text-muted">Your goals and plans are safe. Reloading usually fixes it.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 rounded-xl bg-rust px-4 py-2 text-sm font-extrabold text-white">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />Reload
          </button>
          <button type="button" onClick={() => this.setState({ error: null })} className="rounded-xl px-3 py-2 text-sm font-semibold text-charcoal hover:bg-oat/60">Try again</button>
        </div>
      </div>
    );
  }
}
