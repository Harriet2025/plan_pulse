import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, RefreshCw, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

// ---- Install ---------------------------------------------------------------------------------------------------

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Whether AuraGoal can be installed here, and how: { installed, canPrompt, ios, install() }. */
export function useInstall() {
  const [state, setState] = useState(() => ({ installed: isStandalone(), canPrompt: !!window.__auragoalInstall }));
  useEffect(() => {
    const ready = () => setState((s) => ({ ...s, canPrompt: true }));
    const done = () => setState({ installed: true, canPrompt: false });
    window.addEventListener('auragoal:installable', ready);
    window.addEventListener('auragoal:installed', done);
    return () => { window.removeEventListener('auragoal:installable', ready); window.removeEventListener('auragoal:installed', done); };
  }, []);
  const install = async () => {
    const e = window.__auragoalInstall;
    if (!e) return false;
    e.prompt();
    const { outcome } = await e.userChoice;
    window.__auragoalInstall = null;
    setState((s) => ({ ...s, canPrompt: false, installed: outcome === 'accepted' || s.installed }));
    return outcome === 'accepted';
  };
  return { ...state, ios: isIOS() && !state.installed, install };
}

/** The Install card: a button where the browser offers it, the Add to Home Screen steps on iPhone and iPad. */
export function InstallCard({ compact = false, onDismiss }) {
  const { installed, canPrompt, ios, install } = useInstall();
  if (installed || (!canPrompt && !ios)) return null;
  return (
    <section className={`relative flex flex-wrap items-center gap-3 rounded-3xl border border-oat bg-soft ${compact ? 'p-4' : 'p-5'} ${onDismiss ? 'pr-12' : ''}`} aria-label="Install AuraGoal">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rust text-white"><Smartphone className="h-5 w-5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-charcoal">Install AuraGoal on this device</p>
        {ios ? (
          <p className="text-xs text-muted">Tap <Share className="inline h-3.5 w-3.5 align-text-bottom" aria-label="Share" /> in Safari, then <b className="text-charcoal">Add to Home Screen</b>. It opens like an app, full screen, from your home screen.</p>
        ) : (
          <p className="text-xs text-muted">Open it from your home screen or desktop like an app, full screen and quick to start.</p>
        )}
      </div>
      {canPrompt && (
        <button type="button" onClick={install} className="inline-flex items-center gap-2 rounded-xl bg-rust px-4 py-2.5 text-sm font-extrabold text-white hover:bg-rust-dark">
          <Download className="h-4 w-4" aria-hidden="true" />Install
        </button>
      )}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Not now" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-oat/60"><X className="h-4 w-4" aria-hidden="true" /></button>
      )}
    </section>
  );
}

const DISMISS_KEY = 'auragoal.installDismissed';
/** A one-time install suggestion on phones and tablets (the full card also lives in Settings). */
export function InstallNudge() {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } });
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (hidden || !touch) return null;
  return <InstallCard compact onDismiss={() => { try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ } setHidden(true); }} />;
}

// ---- Offline and updates -----------------------------------------------------------------------------------------

/**
 * A strip at the top when the connection is gone: says how old the information on screen is (it is not live), and
 * that changes cannot be saved until the connection is back. When a new version of the app is ready, it offers it.
 */
export default function AppStatus() {
  const { online, syncedAt } = useApp();
  const [update, setUpdate] = useState(null);   // a waiting service worker
  useEffect(() => {
    const onUpdate = (e) => setUpdate(e.detail);
    window.addEventListener('auragoal:update', onUpdate);
    return () => window.removeEventListener('auragoal:update', onUpdate);
  }, []);
  const applyUpdate = () => { window.__auragoalUpdating = true; update.postMessage({ type: 'SKIP_WAITING' }); };
  const time = syncedAt ? syncedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[75] flex flex-col items-center gap-2 px-3 pt-[max(.5rem,env(safe-area-inset-top))]">
      <AnimatePresence>
        {!online && (
          <motion.div key="offline" role="status" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className="pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-2xl border border-warning/40 bg-soft px-4 py-3 text-sm shadow-lg">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-charcoal">
              <b>You're offline.</b>{' '}
              {time ? `What you see was last updated at ${time} and may be out of date.` : 'Your information could not be loaded.'}{' '}
              Changes can't be saved until you're back online.
            </p>
          </motion.div>
        )}
        {update && online && (
          <motion.div key="update" role="status" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border border-oat bg-soft px-4 py-2.5 text-sm shadow-lg">
            <RefreshCw className="h-4 w-4 shrink-0 text-rust-dark" aria-hidden="true" />
            <p className="min-w-0 flex-1 font-semibold text-charcoal">A new version of AuraGoal is ready.</p>
            <button type="button" onClick={applyUpdate} className="shrink-0 rounded-full bg-rust px-3.5 py-1.5 text-xs font-extrabold text-white hover:bg-rust-dark">Update</button>
            <button type="button" onClick={() => setUpdate(null)} aria-label="Later" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-oat/60"><X className="h-4 w-4" aria-hidden="true" /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
