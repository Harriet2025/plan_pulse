import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BatteryFull, BatteryLow, BatteryMedium, Clock, Compass, ListChecks, Play, SkipForward, Sun, Target, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { freeTime, recommend } from '../lib/next';
import { cn, fmtMinutes } from '../lib/utils';

const TIMES = [15, 30, 60, 120];
const ENERGY = [['low', 'Low', BatteryLow], ['medium', 'Okay', BatteryMedium], ['high', 'High', BatteryFull]];
const LENGTHS = [15, 30, 45, 60, 120];

/**
 * "What should I do now?": recommends one next task for the time and energy there is, with the reasons, and lets the
 * user start it (with a focus timer), skip it, or pick something else.
 */
export default function NextTaskModal() {
  const { closeNext, goals, dayPlans, now, setFocus, setTaskEstimate, focus } = useApp();
  const gap = useMemo(() => freeTime(dayPlans, now), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [minutes, setMinutes] = useState(gap.minutes);
  const [energy, setEnergy] = useState('medium');
  const [skipped, setSkipped] = useState(() => new Set());
  const [browsing, setBrowsing] = useState(false);
  const [picked, setPicked] = useState(null);   // a candidate chosen from the list, shown instead of the top one

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeNext(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeNext]);

  const list = useMemo(() => recommend({ goals, dayPlans, minutes, energy, skipped, now }), [goals, dayPlans, minutes, energy, skipped, now]);
  const all = useMemo(() => recommend({ goals, dayPlans, minutes, energy, now }), [goals, dayPlans, minutes, energy, now]);
  const best = (picked && all.find((c) => c.id === picked)) || list[0];

  const start = (c) => {
    const length = Math.min(c.minutes ?? minutes, minutes);
    setFocus({ id: c.id, kind: c.kind, title: c.title, context: c.context, minutes: length, endsAt: Date.now() + length * 60000, ref: c.ref });
    closeNext();
  };
  const skip = () => { setSkipped((s) => new Set(s).add(best.id)); setPicked(null); };
  const chip = (on) => cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors', on ? 'border-rust bg-rust text-white' : 'border-oat bg-ivory text-charcoal hover:border-rust');

  return (
    <div className="fixed inset-0 z-40">
      <motion.div className="absolute inset-0 bg-charcoal/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeNext} />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center md:items-center md:p-6">
        <motion.div role="dialog" aria-modal="true" aria-labelledby="nextTitle"
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="pointer-events-auto max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-b-0 border-oat bg-soft p-5 md:rounded-3xl md:border-b md:p-6"
          style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rust text-white"><Compass className="h-5 w-5" aria-hidden="true" /></span>
              <div>
                <h2 id="nextTitle" className="text-lg font-extrabold leading-tight text-charcoal">What should I do now?</h2>
                <p className="text-xs text-muted">{gap.until ? `You have about ${fmtMinutes(gap.minutes)} before ${gap.until}.` : 'Tell me how much time you have.'}</p>
              </div>
            </div>
            <button type="button" onClick={closeNext} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-oat/60"><X className="h-5 w-5" aria-hidden="true" /></button>
          </div>

          <div className="mt-4 grid gap-3">
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">Time I have</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Time I have">
                {[...new Set([gap.minutes, ...TIMES])].sort((a, b) => a - b).map((m) => (
                  <button key={m} type="button" aria-pressed={minutes === m} onClick={() => { setMinutes(m); setPicked(null); }} className={chip(minutes === m)}>
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />{fmtMinutes(m)}{m === gap.minutes && gap.until ? ' (until then)' : ''}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">My energy <span className="normal-case tracking-normal">(optional)</span></p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="My energy">
                {ENERGY.map(([v, label, Icon]) => (
                  <button key={v} type="button" aria-pressed={energy === v} onClick={() => { setEnergy(v); setPicked(null); }} className={chip(energy === v)}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</button>
                ))}
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {best ? (
              <motion.section key={best.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}
                className="mt-5 rounded-2xl border-2 border-rust/50 bg-rust/5 p-4" aria-label="Suggestion" aria-live="polite">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-rust-dark">{picked ? 'Your choice' : 'Do this next'}</p>
                <h3 className="mt-1 break-words text-xl font-extrabold leading-snug text-charcoal">{best.title}</h3>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                  {best.kind === 'day' ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Target className="h-3.5 w-3.5" aria-hidden="true" />}
                  {best.kind === 'day' ? 'Plan for today' : best.context}{best.minutes ? ` · ${fmtMinutes(best.minutes)}` : ''}
                </p>
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Why">
                  {best.reasons.map((r) => (
                    <li key={r} className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold', /Needs/.test(r) ? 'bg-warning/15 text-warning' : 'bg-soft text-charcoal')}>{r}</li>
                  ))}
                </ul>
                {best.kind === 'goal' && !best.minutes && (
                  <div className="mt-3 rounded-xl border border-oat bg-soft p-2.5">
                    <p className="text-xs font-bold text-charcoal">How long will this take? <span className="font-normal text-muted">Helps me suggest better next time.</span></p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {LENGTHS.map((m) => <button key={m} type="button" onClick={() => setTaskEstimate(best.ref.taskId, m)} className={chip(false)}>{fmtMinutes(m)}</button>)}
                    </div>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => start(best)} disabled={!!focus}
                    className="inline-flex items-center gap-2 rounded-xl bg-rust px-5 py-2.5 text-sm font-extrabold text-white shadow-md hover:bg-rust-dark disabled:opacity-50">
                    <Play className="h-4 w-4" aria-hidden="true" />Start this task
                  </button>
                  <button type="button" onClick={skip} className="inline-flex items-center gap-1.5 rounded-xl border border-oat bg-soft px-3.5 py-2.5 text-sm font-bold text-charcoal hover:border-rust"><SkipForward className="h-4 w-4" aria-hidden="true" />Skip</button>
                  <button type="button" onClick={() => setBrowsing((b) => !b)} aria-expanded={browsing} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold text-rust-dark hover:bg-oat/60"><ListChecks className="h-4 w-4" aria-hidden="true" />Choose something else</button>
                </div>
                {focus && <p className="mt-2 text-xs text-muted">You are already focusing on "{focus.title}". Finish or stop it first.</p>}
              </motion.section>
            ) : (
              <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 rounded-2xl border-2 border-dashed border-blush bg-ivory p-6 text-center text-sm text-muted">
                {all.length ? 'You have skipped everything. Tap a time or energy level to start over, or choose from the list.' : 'Nothing to do right now: no plans left for today and no unfinished goal plans. Enjoy the break, or set a new goal.'}
              </motion.p>
            )}
          </AnimatePresence>

          {(browsing || (!best && all.length > 0)) && (
            <section className="mt-4" aria-label="Other options">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">Other good options</p>
              <ul className="grid gap-1.5">
                {all.filter((c) => c.id !== best?.id).slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => { setPicked(c.id); setBrowsing(false); }} className="flex w-full items-center gap-3 rounded-xl border border-oat bg-ivory px-3 py-2 text-left hover:border-rust">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-charcoal">{c.title}</span>
                        <span className="block truncate text-[11px] text-muted">{c.kind === 'day' ? 'Plan for today' : c.context}{c.reasons[0] ? ` · ${c.reasons[0]}` : ''}</span>
                      </span>
                      <span className={cn('shrink-0 text-xs font-bold tabular-nums', c.fits === false ? 'text-warning' : 'text-muted')}>{c.minutes ? fmtMinutes(c.minutes) : '–'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </motion.div>
      </div>
    </div>
  );
}
