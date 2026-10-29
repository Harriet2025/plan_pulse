import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Gauge, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cn, dayLoad, fmtMinutes, fmtSpan, lightenPlan, localDate, shortDay } from '../lib/utils';

/**
 * "Lighten this day": suggests what to move off a too-full day and where it fits, preselected so it is one tap.
 * Moving a day plan changes its day and keeps its time, and the message afterwards offers Undo.
 */
export default function LightenModal() {
  const { lighten, closeLighten, dayPlans, user, rescheduleItems } = useApp();
  const [dateKey] = useState(() => lighten.date);   // captured once: the context value is cleared while this animates out
  const plan = useMemo(() => lightenPlan(dayPlans, user, dateKey), [dayPlans, user, dateKey]);
  const day = dayLoad(dayPlans, user, dateKey);
  const [picked, setPicked] = useState(() => new Set(plan.picks.map((x) => x.plan.id)));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeLighten(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeLighten]);

  const chosen = plan.picks.filter((x) => picked.has(x.plan.id));
  const movedMin = chosen.reduce((n, x) => n + x.minutes, 0);
  const stillOver = Math.max(0, day.planned - movedMin - day.capacity);
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const move = async () => {
    setBusy(true);
    const ok = await rescheduleItems(
      chosen.map((x) => ({ kind: 'plan', id: x.plan.id, op: 'move', to: localDate(x.to) })),
      chosen.map((x) => ({ kind: 'plan', id: x.plan.id, op: 'move', to: x.plan.date })),
      `Moved ${chosen.length} ${chosen.length === 1 ? 'plan' : 'plans'} to lighter days.`,
    );
    setBusy(false);
    if (ok) closeLighten();
  };

  const dayName = shortDay(new Date(`${dateKey}T00:00:00`));

  return (
    <div className="fixed inset-0 z-40">
      <motion.div className="absolute inset-0 bg-charcoal/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeLighten} />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center md:items-center md:p-6">
        <motion.div
          role="dialog" aria-modal="true" aria-labelledby="lightenTitle"
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="pointer-events-auto max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-b-0 border-oat bg-soft p-5 md:rounded-3xl md:border-b md:p-7"
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-oat md:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blush-dark text-white"><Gauge className="h-5 w-5" aria-hidden="true" /></span>
              <div>
                <h2 id="lightenTitle" className="text-lg font-extrabold leading-tight text-charcoal">Lighten {dayName}</h2>
                <p className="mt-0.5 text-sm text-muted">{fmtMinutes(day.planned)} planned for a {fmtMinutes(day.capacity)} day, about <b className="text-danger">{fmtMinutes(day.over)}</b> too much.</p>
              </div>
            </div>
            <button type="button" onClick={closeLighten} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-oat/60"><X className="h-5 w-5" aria-hidden="true" /></button>
          </div>

          {plan.picks.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-dashed border-blush bg-ivory p-5 text-sm text-muted">
              Nothing can be moved automatically. Only one-off plans with a time or a length can move (repeating plans stay put),
              and there has to be room on a day in the next two weeks. Open the day and move or shorten something yourself.
            </p>
          ) : (
            <>
              <p className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">Suggested to move</p>
              <ul className="mt-2 grid gap-2">
                {plan.picks.map((x) => {
                  const on = picked.has(x.plan.id);
                  return (
                    <li key={x.plan.id}>
                      <label className={cn('flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-colors', on ? 'border-rust bg-rust/5' : 'border-oat bg-ivory hover:border-blush')}>
                        <input type="checkbox" className="h-4 w-4 shrink-0 accent-[#B85C38]" checked={on} onChange={() => toggle(x.plan.id)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-charcoal">{x.plan.title}</span>
                          <span className="block truncate text-xs text-muted">{x.plan.start ? `${fmtSpan(x.plan.start, x.minutes)} · ` : ''}{fmtMinutes(x.minutes)}</span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-oat px-2.5 py-1 text-xs font-bold text-charcoal"><ArrowRight className="h-3 w-3" aria-hidden="true" />{shortDay(x.to)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className={cn('mt-4 rounded-xl px-3 py-2 text-sm font-semibold', stillOver > 0 ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success')} aria-live="polite">
                {chosen.length === 0 ? 'Nothing selected, so the day stays as it is.'
                  : stillOver > 0 ? `That frees ${fmtMinutes(movedMin)}, but ${dayName} is still about ${fmtMinutes(stillOver)} over. The rest repeats, or does not fit anywhere soon.`
                  : `That frees ${fmtMinutes(movedMin)}, and ${dayName} fits your ${fmtMinutes(day.capacity)}.`}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={closeLighten} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted hover:text-charcoal">Not now</button>
                <button type="button" onClick={move} disabled={busy || chosen.length === 0} className="rounded-xl bg-rust px-5 py-2.5 text-sm font-extrabold text-white hover:bg-rust-dark disabled:cursor-not-allowed disabled:opacity-60">
                  {busy ? 'Moving…' : `Move ${chosen.length} ${chosen.length === 1 ? 'plan' : 'plans'}`}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
