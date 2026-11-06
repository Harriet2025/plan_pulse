import { useState } from 'react';
import { CalendarDays, Clock, Plus, Repeat, Sparkles, Timer } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { parsePlan } from '../lib/quickadd';
import { addDays, cn, fmtMinutes, fmtSpan, localDate, parseDay, repeatText, shortDay } from '../lib/utils';

/** "Today", "Tomorrow" or "Fri 7 Nov". */
export function dayName(key, today = new Date()) {
  if (key === localDate(today)) return 'Today';
  if (key === localDate(addDays(today, 1))) return 'Tomorrow';
  return shortDay(parseDay(key));
}

/** What a typed plan was understood as, as small chips. */
function Understood({ p }) {
  const chip = 'inline-flex items-center gap-1 rounded-full bg-oat px-2 py-0.5 text-[11px] font-bold text-charcoal';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-live="polite">
      <span className="mr-0.5 text-[11px] font-semibold text-muted">Adds</span>
      <span className="max-w-full truncate text-xs font-extrabold text-charcoal">{p.title}</span>
      <span className={chip}><CalendarDays className="h-3 w-3" aria-hidden="true" />{p.repeat === 'NONE' ? dayName(p.date) : `From ${dayName(p.date)}`}</span>
      {p.start && <span className={chip}><Clock className="h-3 w-3" aria-hidden="true" />{fmtSpan(p.start, p.minutes)}</span>}
      {!p.start && p.minutes && <span className={chip}><Timer className="h-3 w-3" aria-hidden="true" />{fmtMinutes(p.minutes)}</span>}
      {p.repeat !== 'NONE' && <span className={chip}><Repeat className="h-3 w-3" aria-hidden="true" />{repeatText(p)}{p.until ? ` until ${shortDay(parseDay(p.until))}` : ''}</span>}
    </div>
  );
}

/**
 * One line to add a day plan in plain words: "gym tomorrow 6-7am", "church every Sunday 9am". It shows what it
 * understood before anything is saved. `dayKey` is the day used when none is mentioned (the Planner's open day).
 */
export default function QuickAdd({ dayKey = null, className }) {
  const { addDayPlan } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const p = text.trim() ? parsePlan(text, new Date(), dayKey) : null;

  const submit = async (e) => {
    e.preventDefault();
    if (!p || p.problem || busy) return;
    setBusy(true);
    const when = p.repeat === 'NONE' ? dayName(p.date).replace(/^T/, 't') : repeatText(p).toLowerCase();
    const ok = await addDayPlan(
      { title: p.title, date: p.date, start: p.start, minutes: p.minutes, repeat: p.repeat, days: p.days, until: p.until },
      `Added "${p.title}", ${when}${p.start ? ` at ${fmtSpan(p.start, null)}` : ''}.`,
    );
    if (ok) setText('');
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className={cn('rounded-2xl border border-oat bg-ivory p-2.5', className)} aria-label="Quick add a plan">
      <div className="flex items-center gap-2">
        <Sparkles className="ml-1 h-4 w-4 shrink-0 text-rust" aria-hidden="true" />
        <label htmlFor={`quickAdd-${dayKey ?? 'today'}`} className="sr-only">Quick add a plan, in plain words</label>
        <input id={`quickAdd-${dayKey ?? 'today'}`} className="min-w-0 flex-1 bg-transparent py-1.5 text-[16px] text-charcoal outline-none placeholder:text-muted md:text-sm"
          placeholder="Quick add: gym tomorrow 6-7am" maxLength={300} autoComplete="off" enterKeyHint="done"
          value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={!p || !!p.problem || busy} aria-label="Add the plan"
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl bg-rust px-3 text-xs font-extrabold text-white hover:bg-rust-dark disabled:opacity-40">
          <Plus className="h-4 w-4" strokeWidth={3} aria-hidden="true" /><span className="hidden sm:inline">Add</span>
        </button>
      </div>
      {p && !p.problem && <Understood p={p} />}
      {p?.problem && <p className="mt-2 px-1 text-xs font-semibold text-danger" role="alert">{p.problem}</p>}
      {!p && <p className="mt-1 px-1 text-[11px] text-muted">Try "church every Sunday 9am" or "call mum Friday 30 min".</p>}
    </form>
  );
}
