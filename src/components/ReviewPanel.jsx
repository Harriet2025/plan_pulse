import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarCheck, CalendarDays, CalendarRange, Check, ChevronDown, PartyPopper, Repeat, Sun, Target } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { horizonOf } from '../lib/constants';
import { addDays, cn, fmtSpan, localDate, parseDay, periodEnd, periodLabel, periodPhrase, periodStart, plansOn, repeatText } from '../lib/utils';
import { Bar, Ring, cardShadow } from './ui';

const RANK = { DAILY: 0, WEEKLY: 1, MONTHLY: 2, YEARLY: 3 };
const HORIZON_ICON = { WEEKLY: CalendarDays, MONTHLY: CalendarRange, YEARLY: CalendarCheck };

/** A tick box that can be changed after the fact: reviewing is about marking what you really did. */
function Tick({ done, label, onToggle }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={done} aria-label={label}
      className={cn('grid h-[1.35rem] w-[1.35rem] shrink-0 place-items-center rounded-[6px] border-[1.5px] transition-colors', done ? 'border-success bg-success' : 'border-charcoal/35 bg-soft hover:border-rust')}>
      {done && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3.5} aria-hidden="true" />}
    </button>
  );
}

/** The day plans in a period, grouped: by day for a week, by week for a month, by month for a year. */
function dayGroups(horizon, from, to) {
  const start = parseDay(from), end = parseDay(to), groups = [];
  if (horizon === 'DAILY' || horizon === 'WEEKLY') {
    for (let d = start; d <= end; d = addDays(d, 1)) groups.push({ key: localDate(d), title: d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }), days: [localDate(d)] });
  } else if (horizon === 'MONTHLY') {
    for (let d = start; d <= end;) {
      const days = [];
      const s = d;
      do { days.push(localDate(d)); d = addDays(d, 1); } while (d <= end && d.getDay() !== 1);
      const e = parseDay(days[days.length - 1]);
      groups.push({ key: days[0], title: `${s.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`, days });
    }
  } else {
    for (let m = 0; m < 12; m++) {
      const first = new Date(start.getFullYear(), m, 1), last = new Date(start.getFullYear(), m + 1, 0), days = [];
      for (let d = first; d <= last; d = addDays(d, 1)) days.push(localDate(d));
      groups.push({ key: localDate(first), title: first.toLocaleDateString(undefined, { month: 'long' }), days });
    }
  }
  return groups;
}

function Group({ title, items, defaultOpen, onToggle, showDay }) {
  const [open, setOpen] = useState(defaultOpen);
  const done = items.filter((x) => x.done).length;
  const all = items.length > 0 && done === items.length;
  return (
    <li className="rounded-2xl border border-oat bg-soft">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold', all ? 'bg-success text-white' : 'bg-oat text-charcoal')}>{all ? <Check className="h-3.5 w-3.5" strokeWidth={3.5} aria-hidden="true" /> : items.length - done}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-charcoal">{title}</span>
        <span className="text-xs font-bold tabular-nums text-muted">{done}/{items.length}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-muted"><ChevronDown className="h-4 w-4" aria-hidden="true" /></motion.span>
      </button>
      {open && (
        <ul className="grid gap-0.5 border-t border-oat px-2 pb-2 pt-1">
          {items.map((x) => (
            <li key={`${x.plan.id}@${x.key}`} className="flex items-center gap-3 rounded-xl px-1.5 py-1.5">
              <Tick done={x.done} label={`${x.done ? 'Mark not done' : 'Mark done'}: ${x.plan.title}${showDay ? `, ${x.key}` : ''}`} onToggle={() => onToggle(x)} />
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-sm font-semibold', x.done ? 'text-muted line-through' : 'text-charcoal')}>{x.plan.title}</span>
                <span className="flex items-center gap-1 text-[11px] text-muted">
                  {showDay && parseDay(x.key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                  {showDay && (x.start || x.plan.repeat !== 'NONE') && ' · '}
                  {x.start ? fmtSpan(x.start, x.minutes) : ''}
                  {x.plan.repeat !== 'NONE' && <><Repeat className="ml-1 h-3 w-3" aria-hidden="true" />{repeatText(x.plan)}</>}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Looking back at a day, week, month or year: everything that was planned in it (the period's goals with their plans,
 * and the day plans of every day in it), how much of it got done, and a tick box on each so you can mark what you
 * really completed, even after the period is over.
 */
export default function ReviewPanel({ horizon, anchor }) {
  const { goals, dayPlans, toggleTask, toggleDayPlan, now } = useApp();
  const [show, setShow] = useState('all');   // all | todo | done
  const from = localDate(periodStart(horizon, anchor)), to = localDate(periodEnd(horizon, anchor));
  const today = localDate(now);
  const name = periodPhrase(periodLabel(horizon, anchor, now));
  const over = to < today;

  // Goals whose period overlaps this one, the biggest first (a year review also covers its months and weeks)
  const periodGoals = useMemo(() => goals
    .filter((g) => {
      if (g.status === 'ARCHIVED' || !g.due_date || RANK[g.timeframe] > RANK[horizon]) return false;
      const d = parseDay(g.due_date);
      return localDate(periodStart(g.timeframe, d)) <= to && localDate(periodEnd(g.timeframe, d)) >= from;
    })
    .sort((a, b) => RANK[b.timeframe] - RANK[a.timeframe] || a.due_date.localeCompare(b.due_date)), [goals, horizon, from, to]);

  // Every day plan on every day of the period, up to today (the future cannot be reviewed yet)
  const groups = useMemo(() => dayGroups(horizon, from, to).map((g) => ({
    ...g, items: g.days.filter((k) => k <= today).flatMap((k) => plansOn(dayPlans, k)),
  })).filter((g) => g.items.length), [horizon, from, to, dayPlans, today]);

  const goalPlans = periodGoals.flatMap((g) => g.sub_plans);
  const dayItems = groups.flatMap((g) => g.items);
  const total = goalPlans.length + dayItems.length;
  const done = goalPlans.filter((t) => t.done).length + dayItems.filter((x) => x.done).length;
  const pct = total ? Math.round((100 * done) / total) : 0;
  const goalsDone = periodGoals.filter((g) => g.status === 'COMPLETED').length;
  const verdict = !total ? `Nothing was planned for ${name}.`
    : pct === 100 ? 'Everything done. Outstanding!'
    : pct >= 80 ? 'A strong result. Well done.'
    : pct >= 50 ? 'Good progress. Keep the momentum.'
    : over ? 'A slower stretch. That happens. Carry what matters into the next one.' : 'Still time to get more done.';
  const keep = (isDone) => show === 'all' || (show === 'done' ? isDone : !isDone);
  const toggleDay = (x) => toggleDayPlan(x.plan.id, x.key, !x.done);
  const chip = (on) => cn('rounded-full border px-3 py-1.5 text-xs font-bold transition-colors', on ? 'border-rust bg-rust text-white' : 'border-oat bg-soft text-charcoal hover:border-rust');

  return (
    <div className="grid gap-5">
      <section className="flex flex-wrap items-center gap-5 rounded-3xl border border-oat bg-soft p-5" style={cardShadow} aria-label="Your result">
        <div className="relative h-28 w-28 shrink-0">
          <Ring pct={pct} track="#E8DCCB" stroke={pct >= 80 ? '#3F6B4D' : '#B85C38'} />
          <span className="absolute inset-0 grid place-items-center text-center"><span><b className="block text-2xl font-extrabold tabular-nums text-charcoal">{pct}%</b><span className="text-[10px] font-bold uppercase tracking-wider text-muted">done</span></span></span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-rust-dark">Review · {horizonOf(horizon).label}</p>
          <h2 className="mt-0.5 flex items-center gap-2 text-xl font-extrabold tracking-tight text-charcoal">
            {total ? `You completed ${done} of ${total}` : 'A clear slate'}{pct === 100 && total > 0 && <PartyPopper className="h-5 w-5 text-rust" aria-hidden="true" />}
          </h2>
          <p className="mt-0.5 text-sm text-muted">{verdict}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-charcoal">
            {periodGoals.length > 0 && <span className="inline-flex items-center gap-1"><Target className="h-3.5 w-3.5 text-rust-dark" aria-hidden="true" />{goalsDone} of {periodGoals.length} goal{periodGoals.length === 1 ? '' : 's'} complete</span>}
            {dayItems.length > 0 && <span className="inline-flex items-center gap-1"><Sun className="h-3.5 w-3.5 text-rust-dark" aria-hidden="true" />{dayItems.filter((x) => x.done).length} of {dayItems.length} day plans done</span>}
          </div>
        </div>
      </section>

      {total > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show">
          <button type="button" aria-pressed={show === 'all'} className={chip(show === 'all')} onClick={() => setShow('all')}>Everything</button>
          <button type="button" aria-pressed={show === 'todo'} className={chip(show === 'todo')} onClick={() => setShow('todo')}>Not marked yet · {total - done}</button>
          <button type="button" aria-pressed={show === 'done'} className={chip(show === 'done')} onClick={() => setShow('done')}>Completed · {done}</button>
          <span className="text-xs text-muted">Tick anything you did but did not mark at the time.</span>
        </div>
      )}

      {periodGoals.length > 0 && (
        <section aria-label="Goals">
          <h3 className="mb-2 text-sm font-extrabold text-charcoal">Goals</h3>
          <ul className="grid gap-3 md:grid-cols-2">
            {periodGoals.map((g) => {
              const plans = g.sub_plans.filter((t) => keep(t.done));
              const gd = g.sub_plans.filter((t) => t.done).length, Icon = HORIZON_ICON[g.timeframe];
              if (!plans.length && show !== 'all') return null;
              return (
                <li key={g.id} className={cn('rounded-2xl border-2 bg-soft p-4', g.status === 'COMPLETED' ? 'border-success/40' : 'border-oat')}>
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted"><Icon className="h-3 w-3" aria-hidden="true" />{horizonOf(g.timeframe).label} goal · {periodLabel(g.timeframe, parseDay(g.due_date), now)}</p>
                  <h4 className="mt-0.5 break-words text-base font-extrabold leading-snug text-charcoal">{g.title}{g.status === 'COMPLETED' && <span className="ml-1.5 text-success">✓</span>}</h4>
                  <div className="mt-2 flex items-center gap-2"><Bar pct={g.sub_plans.length ? Math.round((100 * gd) / g.sub_plans.length) : 0} height="h-1.5" className="flex-1" fill={g.status === 'COMPLETED' ? 'bg-success' : 'bg-rust'} label={`${g.title} progress`} /><span className="text-xs font-bold tabular-nums text-muted">{gd}/{g.sub_plans.length}</span></div>
                  <ul className="mt-2 grid gap-1">
                    {plans.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 py-0.5">
                        <Tick done={t.done} label={`${t.done ? 'Mark not done' : 'Mark done'}: ${t.text}`} onToggle={() => toggleTask(g.id, t.id, !t.done)} />
                        <span className={cn('min-w-0 flex-1 text-sm', t.done ? 'text-muted line-through' : 'text-charcoal')}>{t.text}</span>
                      </li>
                    ))}
                    {!g.sub_plans.length && <li className="text-xs text-muted">This goal had no plans.</li>}
                  </ul>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {groups.length > 0 && (
        <section aria-label="Day plans">
          <h3 className="mb-2 text-sm font-extrabold text-charcoal">Day plans</h3>
          <ul className="grid gap-2">
            {groups.map((g) => {
              const items = g.items.filter((x) => keep(x.done));
              if (!items.length) return null;
              const open = horizon === 'DAILY' || horizon === 'WEEKLY' || g.days.includes(today) || items.some((x) => !x.done) && horizon === 'MONTHLY';
              return <Group key={`${g.key}:${show}`} title={g.title} items={items} defaultOpen={open} onToggle={toggleDay} showDay={horizon === 'MONTHLY' || horizon === 'YEARLY'} />;
            })}
          </ul>
        </section>
      )}

      {!total && (
        <p className="rounded-3xl border-2 border-dashed border-blush bg-soft/60 p-8 text-center text-sm text-muted">
          Nothing to review for {name} yet. Plans for the day and goals for the {horizon === 'DAILY' ? 'day' : horizonOf(horizon).unit} show up here.
        </p>
      )}
    </div>
  );
}
