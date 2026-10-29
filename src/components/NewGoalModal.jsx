import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarCheck, CalendarDays, CalendarRange, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { HORIZONS } from '../lib/constants';
import { cn, localDate, parseDay, periodEnd, periodKey, periodLabel, periodPhrase as phrase, periodRange, periodStart, shiftPeriod } from '../lib/utils';

const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted';
const Seg = ({ name, value, onChange, options, cols }) => (
  <fieldset>
    <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{name}</legend>
    <div className={`seg grid gap-2 ${cols}`}>
      {options.map(([v, text]) => (
        <label key={v} className="relative"><input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} /><span>{text}</span></label>
      ))}
    </div>
  </fieldset>
);

const HORIZON_ICON = { WEEKLY: CalendarDays, MONTHLY: CalendarRange, YEARLY: CalendarCheck };
const PLACEHOLDER = {
  WEEKLY: 'e.g. Finish chapter 4 revision',
  MONTHLY: 'e.g. Buy a tripod stand',
  YEARLY: 'e.g. Get a first class by the end of the year',
};
const PLAN_HINT = {
  WEEKLY: 'Outline the chapter\nPractise past questions\nReview my notes',
  MONTHLY: 'Save 10% of my income\nCompare prices online\nAsk about a small loan',
  YEARLY: 'Go to class regularly\nSubmit all assignments\nStudy hard before every exam',
};

/** Picking the period: this one, the next one, or another (by choosing a day or month inside it). */
function PeriodPicker({ horizon, anchor, setAnchor }) {
  const today = new Date();
  const thisKey = periodKey(horizon, today), nextKey = periodKey(horizon, shiftPeriod(horizon, today, 1));
  const current = periodKey(horizon, parseDay(anchor));
  const other = current !== thisKey && current !== nextKey;
  const [picking, setPicking] = useState(other);
  const chip = (on) => cn('rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors', on ? 'border-rust bg-rust text-white' : 'border-oat bg-ivory text-charcoal hover:border-rust');
  const h = HORIZONS.find((x) => x.id === horizon);
  const inputType = horizon === 'MONTHLY' ? 'month' : 'date';
  const onPick = (v) => { if (v) setAnchor(horizon === 'MONTHLY' ? `${v}-01` : v); };

  return (
    <div>
      <p className={label}>Which {h.unit}?</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" aria-pressed={current === thisKey && !picking} className={chip(current === thisKey && !picking)} onClick={() => { setPicking(false); setAnchor(localDate(today)); }}>{h.this}</button>
        <button type="button" aria-pressed={current === nextKey && !picking} className={chip(current === nextKey && !picking)} onClick={() => { setPicking(false); setAnchor(localDate(shiftPeriod(horizon, today, 1))); }}>{h.next}</button>
        {horizon === 'YEARLY' ? (
          <select aria-label="Another year" className={cn(chip(other), '!pr-2')} value={other ? current.slice(0, 4) : ''} onChange={(e) => e.target.value && setAnchor(`${e.target.value}-01-01`)}>
            <option value="">Another year</option>
            {[2, 3, 4, 5].map((n) => { const y = today.getFullYear() + n; return <option key={y} value={y}>{y}</option>; })}
          </select>
        ) : (
          <button type="button" aria-pressed={picking} className={chip(picking || other)} onClick={() => setPicking(true)}>Another {h.unit}…</button>
        )}
        {picking && horizon !== 'YEARLY' && (
          <input type={inputType} aria-label={horizon === 'WEEKLY' ? 'Pick a day in that week' : 'Pick a month'} className="field !w-auto !py-1.5"
            value={horizon === 'MONTHLY' ? anchor.slice(0, 7) : anchor} min={inputType === 'month' ? localDate(today).slice(0, 7) : localDate(today)} onChange={(e) => onPick(e.target.value)} autoFocus />
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted">{periodLabel(horizon, parseDay(anchor))}: {periodRange(horizon, parseDay(anchor))}</p>
    </div>
  );
}

export default function NewGoalModal() {
  const { goalModal, closeGoalModal, createGoal, categories, activeCat } = useApp();
  // Captured once: during the exit animation the context's goalModal is already null
  const [draft] = useState(() => goalModal?.draft ?? null);
  const startCat = draft?.cat ? categories.find((c) => c.name === draft.cat)?.id : activeCat !== 'all' ? Number(activeCat) : categories[0].id;

  const [horizon, setHorizon] = useState(HORIZONS.some((h) => h.id === draft?.timeframe) ? draft.timeframe : 'WEEKLY');
  const [anchor, setAnchor] = useState(draft?.anchor ?? localDate());   // any day inside the chosen period
  const [due, setDue] = useState('');   // '' = the end of the period
  const [title, setTitle] = useState(draft?.title ?? '');
  const [category, setCategory] = useState(startCat ?? categories[0].id);
  const [priority, setPriority] = useState(draft?.priority ?? 'MEDIUM');
  const [quote, setQuote] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [tasks, setTasks] = useState(draft?.tasks?.join('\n') ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeGoalModal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeGoalModal]);

  const anchorDate = parseDay(anchor);
  const first = localDate(periodStart(horizon, anchorDate));
  const last = localDate(periodEnd(horizon, anchorDate));
  // A finish-by date outside the period (after switching horizon or period) falls back to the period's end
  const dueDate = due && due >= first && due <= last ? due : last;
  const periodName = periodLabel(horizon, anchorDate);
  const plans = useMemo(() => tasks.split('\n').map((l) => l.trim()).filter(Boolean), [tasks]);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      await createGoal({ title, category_id: category, priority, timeframe: horizon, due_date: dueDate, quote, tasks: plans, is_private: isPrivate });
    } catch (ex) {
      setError(ex.message); setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40">
      <motion.div className="absolute inset-0 bg-charcoal/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeGoalModal} />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center md:items-center md:p-6">
        <motion.form
          onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="modalTitle"
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="pointer-events-auto max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-b-0 border-oat bg-soft p-5 backdrop-blur-md md:rounded-3xl md:border-b md:p-7"
          style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-oat" />
          <div className="flex items-center justify-between">
            <h2 id="modalTitle" className="text-lg font-extrabold text-charcoal">New goal</h2>
            <button type="button" onClick={closeGoalModal} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-oat/60"><X className="h-5 w-5" aria-hidden="true" /></button>
          </div>

          <div className="mt-4 grid gap-4">
            <fieldset>
              <legend className={label}>A goal for</legend>
              <div className="grid grid-cols-3 gap-2">
                {HORIZONS.map((h) => {
                  const Icon = HORIZON_ICON[h.id], on = horizon === h.id;
                  return (
                    <label key={h.id} className="relative cursor-pointer">
                      <input type="radio" name="horizon" value={h.id} checked={on} onChange={() => { setHorizon(h.id); setDue(''); }} className="peer sr-only" />
                      <span className={cn('flex flex-col items-center gap-1 rounded-2xl border-2 px-1 py-2.5 text-xs font-extrabold transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rust',
                        on ? 'border-rust bg-rust/10 text-rust-dark' : 'border-oat bg-ivory text-charcoal hover:border-blush')}>
                        <Icon className="h-5 w-5" aria-hidden="true" />A {h.label.toLowerCase()}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <PeriodPicker key={horizon} horizon={horizon} anchor={anchor} setAnchor={(a) => { setAnchor(a); setDue(''); }} />

            <div>
              <label htmlFor="gTitle" className={label}>Your goal for {phrase(periodName)}</label>
              <input id="gTitle" className="field" type="text" maxLength={255} required autoFocus placeholder={PLACEHOLDER[horizon]} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div>
              <label htmlFor="gTasks" className={label}>Plans to reach it <span className="normal-case tracking-normal text-muted">(one per line)</span></label>
              <textarea id="gTasks" className="field" rows={4} placeholder={PLAN_HINT[horizon]} value={tasks} onChange={(e) => setTasks(e.target.value)} />
              <p className="mt-1.5 text-xs text-muted">
                {plans.length ? `${plans.length} plan${plans.length === 1 ? '' : 's'}. ` : ''}Tick each one off as you do it; the goal is complete when every plan is done.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label htmlFor="gCategory" className={label}>Area of life</label>
                <select id="gCategory" className="field" value={category} onChange={(e) => setCategory(Number(e.target.value))}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="min-w-0">
                <label htmlFor="gDue" className={label}>Finish by</label>
                <input id="gDue" className="field" type="date" value={dueDate} min={first} max={last} onChange={(e) => setDue(e.target.value)} />
              </div>
            </div>
            <Seg name="Priority" cols="grid-cols-3" value={priority} onChange={setPriority} options={[['HIGH', 'High'], ['MEDIUM', 'Medium'], ['LOW', 'Low']]} />
            <div>
              <label htmlFor="gQuote" className={label}>Your motivating quote <span className="normal-case tracking-normal text-muted">(optional)</span></label>
              <input id="gQuote" className="field" type="text" maxLength={500} placeholder="Words to push you on" value={quote} onChange={(e) => setQuote(e.target.value)} />
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-charcoal">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#B85C38]" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
              <span><b>Keep private</b> <span className="text-muted">Your accountability partners will not see this goal.</span></span>
            </label>
          </div>

          {error && <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
          <button type="submit" disabled={saving} className="mt-5 w-full rounded-xl bg-rust py-3 text-sm font-extrabold text-white active:scale-[.99] disabled:opacity-60">
            {saving ? 'Saving…' : `Set goal for ${phrase(periodName)}`}
          </button>
        </motion.form>
      </div>
    </div>
  );
}
