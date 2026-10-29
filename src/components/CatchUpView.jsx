import { forwardRef, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Bell, CalendarDays, CalendarRange, Check, LifeBuoy, Target, Wind } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cn, localDate, rescheduleOptions, shortDay, spreadByCapacity } from '../lib/utils';
import { Bar, cardShadow } from './ui';

// ---- Building the changes. Each helper returns one action for POST /api/reschedule.php ----
const targetId = (it) => (it.kind === 'goal' ? it.goalId : it.taskId);
// A task keeps its time of day; a goal only has a date
const targetFor = (it, date) => (it.kind === 'task' ? `${localDate(date)}T${it.remind.slice(11, 16)}` : localDate(date));
const moveAction = (it, to) => ({ kind: it.kind, id: targetId(it), op: 'move', to });
const moveBack = (it) => moveAction(it, it.kind === 'goal' ? it.due_date : it.remind);
const letGo = (it) => (it.kind === 'goal' ? { kind: 'goal', id: it.goalId, op: 'archive' } : moveAction(it, null));   // a task just loses its reminder
const letGoBack = (it) => (it.kind === 'goal' ? { kind: 'goal', id: it.goalId, op: 'restore' } : moveBack(it));
const shorten = (s, n = 36) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function Chip({ icon: Icon, children, hint, onClick, tone = 'neutral', title, disabled }) {
  const tones = {
    neutral: 'border-oat bg-ivory text-charcoal hover:border-rust hover:bg-rust/10',
    good: 'border-success/40 bg-success/10 text-success hover:bg-success/20',
    quiet: 'border-transparent text-muted hover:bg-danger/10 hover:text-danger',
  };
  return (
    <motion.button
      type="button" onClick={onClick} disabled={disabled} title={title} whileTap={{ scale: 0.95 }}
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50', tones[tone])}
    >
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      <span>{children}</span>
      {hint && <span className="font-semibold text-muted">{hint}</span>}
    </motion.button>
  );
}

const slippedLabel = (n) => (n === 1 ? 'Slipped yesterday' : `Slipped ${n} days ago`);

// forwardRef: AnimatePresence (popLayout) needs a ref to the card to animate it out
const CatchUpCard = forwardRef(function CatchUpCard({ item, options, busy, onMove, onDone, onLetGo, onOpen }, ref) {
  const [picking, setPicking] = useState(false);
  const isTask = item.kind === 'task';
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const [value, setValue] = useState(() => targetFor(item, tomorrow));
  const Icon = isTask ? Bell : Target;

  const when = isTask
    ? `Planned for ${shortDay(new Date(`${item.remind.slice(0, 10)}T00:00:00`))} at ${item.remind.slice(11, 16)}`
    : `Due ${shortDay(new Date(`${item.due_date}T00:00:00`))}${item.total ? ` · ${item.done} of ${item.total} tasks done` : ''}`;

  const moveTo = (to, label) => { setPicking(false); onMove(item, to, label); };
  const submitPick = (e) => {
    e.preventDefault();
    if (!value) return;
    moveTo(value, shortDay(new Date(`${value.slice(0, 10)}T00:00:00`)));
  };

  return (
    <motion.article
      ref={ref} layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: busy ? 0.6 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.97, transition: { duration: 0.25 } }} transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn('rounded-3xl border border-oat bg-soft p-4 md:p-5', busy && 'pointer-events-none')} style={cardShadow}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white" style={{ background: item.color }}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{isTask ? 'Task' : 'Goal'}{item.category ? ` · ${item.category}` : ''}</span>
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-bold text-warning">{slippedLabel(item.daysLate)}</span>
          </div>
          <h3 className="mt-0.5 break-words text-base font-extrabold leading-snug text-charcoal">{item.title}</h3>
          <p className="mt-0.5 text-sm text-muted">{when}{isTask && <> · from <span className="font-semibold text-charcoal/80">{item.goalTitle}</span></>}</p>
          {!isTask && item.total > 0 && <Bar pct={Math.round((100 * item.done) / item.total)} height="h-1.5" className="mt-2.5 max-w-xs" fill="bg-blush-dark" label={`${item.title} progress`} />}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-oat pt-3.5">
        {isTask && <Chip icon={Check} tone="good" onClick={() => onDone(item)} title="Mark this task as finished">I did this</Chip>}
        {options.map((o) => (
          <Chip key={o.id} onClick={() => moveTo(targetFor(item, o.date), o.id === 'tomorrow' ? 'tomorrow' : shortDay(o.date))} hint={o.id === 'tomorrow' ? undefined : shortDay(o.date)}>{o.label}</Chip>
        ))}
        <Chip icon={CalendarDays} onClick={() => setPicking((p) => !p)} title="Choose another date">Pick a date</Chip>
        {!isTask && <Chip icon={ArrowRight} onClick={() => onOpen(item)} title="Open the goal to add or change its tasks">Break it down</Chip>}
        <span className="flex-1" />
        <Chip icon={Wind} tone="quiet" onClick={() => onLetGo(item)}
          title={isTask ? 'Removes the reminder. The task stays in its goal.' : 'Archives the goal. You can bring it back from History.'}>Let go</Chip>
      </div>

      <AnimatePresence initial={false}>
        {picking && (
          <motion.form
            onSubmit={submitPick} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-2 pt-3">
              <label className="sr-only" htmlFor={`pick-${item.key}`}>New {isTask ? 'date and time' : 'due date'}</label>
              <input id={`pick-${item.key}`} className="field !w-auto min-w-0 flex-1 !py-2" type={isTask ? 'datetime-local' : 'date'} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
              <button type="submit" disabled={!value} className="rounded-xl bg-rust px-4 py-2 text-sm font-extrabold text-white hover:bg-rust-dark disabled:opacity-60">Move it</button>
              <button type="button" onClick={() => setPicking(false)} className="rounded-xl px-3 py-2 text-sm font-bold text-muted hover:text-charcoal">Cancel</button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.article>
  );
});

function AllClear({ everSorted }) {
  const { setView, user } = useApp();
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-dashed border-blush bg-soft p-10 text-center">
      <motion.div
        initial={{ scale: 0.3, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.1 }}
        className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success text-white"
      >
        <Check className="h-8 w-8" strokeWidth={3} aria-hidden="true" />
      </motion.div>
      <h2 className="mt-4 text-xl font-extrabold tracking-tight text-charcoal">{everSorted ? 'A clean slate' : "You're all caught up"}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">
        {everSorted
          ? 'Everything that slipped has a new plan. You can undo any of it from the message that appeared.'
          : 'Nothing has slipped past its date. If something does, it will show up here so you can sort it out calmly.'}
      </p>
      {user.streak_count > 0 && <p className="mt-3 text-sm font-bold text-rust-dark">Your {user.streak_count}-day streak is still going.</p>}
      <button type="button" onClick={() => setView('active')} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-rust px-5 py-2.5 text-sm font-extrabold text-white hover:bg-rust-dark">
        Back to dashboard<ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </motion.div>
  );
}

export default function CatchUpView() {
  const { slipped, user, goals, toggleTask, rescheduleItems, openGoal } = useApp();
  const restDays = user.rest_days ?? [];
  const options = rescheduleOptions(restDays);
  const [busyKey, setBusyKey] = useState(null);
  const total = useRef(0);                        // the most that was waiting at once, so progress only moves forward
  total.current = Math.max(total.current, slipped.length);
  const sorted = total.current - slipped.length;

  const withBusy = async (key, fn) => { setBusyKey(key); try { await fn(); } finally { setBusyKey(null); } };
  const onMove = (it, to, label) => withBusy(it.key, () => rescheduleItems([moveAction(it, to)], [moveBack(it)], `Moved “${shorten(it.title)}” to ${label}.`));
  const onLetGo = (it) => withBusy(it.key, () => rescheduleItems([letGo(it)], [letGoBack(it)], it.kind === 'goal' ? `Let go of “${shorten(it.title)}”. It is in History if you want it back.` : `Let go of the reminder for “${shorten(it.title)}”.`));
  const onDone = (it) => withBusy(it.key, () => toggleTask(it.goalId, it.taskId, true));

  const moveAll = (dates, label) => rescheduleItems(
    slipped.map((it, i) => moveAction(it, targetFor(it, dates[i]))), slipped.map(moveBack), `Moved ${slipped.length} things to ${label}.`,
  );
  const spread = () => {
    const dates = spreadByCapacity(slipped, goals, user);   // each work day is filled up to what you can really do
    const first = shortDay(dates[0]), last = shortDay(dates[dates.length - 1]);
    return moveAll(dates, first === last ? first : `${first} – ${last}`);
  };

  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <section className="relative overflow-hidden rounded-[28px] border border-blush/60 bg-blush/15 p-5 md:p-7" aria-live="polite">
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blush-dark text-white"><LifeBuoy className="h-6 w-6" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold tracking-tight text-charcoal md:text-2xl">
              {slipped.length ? (slipped.length === 1 ? 'One thing slipped. That’s okay.' : `${slipped.length} things slipped. That’s okay.`) : total.current ? 'All sorted.' : 'Nothing has slipped.'}
            </h2>
            <p className="mt-1 text-sm text-muted md:text-base">
              {slipped.length
                ? 'It happens to everyone. Choose what to do with each one, one tap at a time. Nothing is lost, and every change can be undone.'
                : 'You are up to date.'}
            </p>
          </div>
        </div>
        {total.current > 0 && (
          <div className="mt-5">
            <div className="mb-1.5 flex items-baseline justify-between text-xs font-bold text-muted">
              <span>{sorted} of {total.current} sorted</span>
              <span className="tabular-nums">{Math.round((100 * sorted) / total.current)}%</span>
            </div>
            <Bar pct={Math.round((100 * sorted) / total.current)} height="h-2.5" track="bg-soft" fill="bg-blush-dark" label="Items sorted" />
          </div>
        )}
      </section>

      {slipped.length >= 2 && (
        <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-oat bg-soft p-3 md:px-4" style={cardShadow} aria-label="Move everything at once">
          <span className="mr-1 text-sm font-extrabold text-charcoal">Move everything to</span>
          {options.map((o) => (
            <Chip key={o.id} onClick={() => moveAll(slipped.map(() => o.date), o.id === 'tomorrow' ? 'tomorrow' : shortDay(o.date))} hint={o.id === 'tomorrow' ? undefined : shortDay(o.date)}>{o.label}</Chip>
          ))}
          <Chip icon={CalendarRange} onClick={spread} title="Fills the coming work days up to your daily capacity, skipping rest days and counting what is already planned">Spread them out</Chip>
        </section>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <AnimatePresence mode="popLayout">
          {slipped.map((it) => (
            <CatchUpCard
              key={it.key} item={it} options={options} busy={busyKey === it.key}
              onMove={onMove} onDone={onDone} onLetGo={onLetGo} onOpen={(x) => openGoal(x.goalId)}
            />
          ))}
        </AnimatePresence>
      </div>

      {!slipped.length && <AllClear everSorted={total.current > 0} />}
    </div>
  );
}
