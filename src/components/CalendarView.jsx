import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, CalendarClock, Check, ChevronLeft, ChevronRight, Gauge, ListChecks, Target } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { horizonOf } from '../lib/constants';
import { clockToMinutes, cn, dayLoad, daysUntil, fmtClock, fmtMinutes, fmtSpan, localDate, plansOn, progressOf } from '../lib/utils';
import { Bar, cardShadow } from './ui';

const LOAD_FILL = { ok: 'bg-success', tight: 'bg-warning', over: 'bg-danger', rest: 'bg-blush-dark' };
const LOAD_TEXT = { ok: 'text-success', tight: 'text-warning', over: 'text-danger', rest: 'text-muted' };

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_CHIPS = 3;

/**
 * What each of `days` holds (keyed YYYY-MM-DD): goals on the day they end, and day plans on every day they happen
 * (repeating ones included).
 */
function buildEvents(goals, dayPlans, categories, days) {
  const byDay = new Map();
  const add = (day, ev) => { if (!byDay.has(day)) byDay.set(day, []); byDay.get(day).push(ev); };
  const now = new Date();
  const keys = new Set(days);

  for (const g of goals) {
    if (g.status === 'ARCHIVED' || !g.due_date || !keys.has(g.due_date)) continue;
    const cat = categories.find((c) => c.id === g.category_id);
    const completed = g.status === 'COMPLETED';
    add(g.due_date, {
      id: `g${g.id}`, kind: 'goal', goalId: g.id, goalActive: !completed, title: g.title, color: cat?.color ?? '#B85C38', done: completed,
      overdue: !completed && daysUntil(g.due_date) < 0, category: cat?.name, progress: progressOf(g), time: '', horizon: g.timeframe,
    });
  }
  for (const key of days) {
    for (const x of plansOn(dayPlans, key)) {
      const ends = x.start ? new Date(`${key}T00:00:00`).getTime() + (clockToMinutes(x.start) + (x.minutes ?? 0)) * 60000 : new Date(`${key}T23:59:59`).getTime();
      add(key, {
        id: `p${x.plan.id}@${key}`, kind: 'plan', title: x.plan.title, color: '#B85C38', done: x.done, overdue: !x.done && ends < now.getTime(),
        time: x.start ?? '', clock: x.start ? fmtClock(new Date(`${key}T${x.start}`)) : '', span: fmtSpan(x.start, x.minutes), repeats: x.plan.repeat !== 'NONE',
      });
    }
  }
  // Goals first, then plans in time order (any-time plans last)
  for (const list of byDay.values()) list.sort((a, b) => (a.kind === b.kind ? (a.time || '99').localeCompare(b.time || '99') : a.kind === 'goal' ? -1 : 1));
  return byDay;
}

/** The 5 or 6 Monday-first weeks that cover a month, as arrays of Date. */
function monthWeeks(year, month) {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;                    // days of the previous month shown before the 1st
  const weeks = Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7);
  // Day numbers outside 1..31 roll into the neighbouring months, which is what the grey cells need
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => new Date(year, month, 1 - offset + w * 7 + d)));
}

const chipStyle = (ev) => ({ borderLeftColor: ev.color, background: `${ev.color}${ev.kind === 'goal' ? '1f' : '12'}` });

function Chip({ ev }) {
  return (
    <span
      className={cn('flex items-center gap-1 truncate rounded-md border-l-[3px] px-1.5 py-0.5 text-[11px] font-semibold leading-tight', ev.done ? 'text-muted line-through' : ev.overdue ? 'text-danger' : 'text-charcoal')}
      style={chipStyle(ev)}
    >
      <span className="truncate">{ev.clock && <span className="font-bold">{ev.clock.replace(/:00(?=\s|$)/, '')} </span>}{ev.title}</span>
    </span>
  );
}

function DayCell({ day, inMonth, today, selected, events, load, onSelect }) {
  const key = localDate(day);
  const full = load.capacity ? Math.min(100, Math.round((100 * load.planned) / load.capacity)) : 100;   // how full the day is
  const label = `${day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${events.length ? `, ${events.length} item${events.length === 1 ? '' : 's'}` : ''}${load.planned ? `, ${fmtMinutes(load.planned)} planned${load.state === 'over' ? ', too much' : ''}` : ''}`;
  return (
    <button
      type="button" onClick={() => onSelect(key)} aria-label={label} aria-pressed={selected} aria-current={today ? 'date' : undefined}
      className={cn(
        'flex min-h-[3.5rem] flex-col gap-1 rounded-xl border p-1.5 text-left transition-colors md:min-h-[6.5rem] md:p-2',
        selected ? 'border-rust bg-rust/10' : 'border-oat/70 hover:border-blush hover:bg-oat/30',
        !inMonth && 'opacity-45',
      )}
    >
      <span className="flex items-center justify-between gap-1">
        <span className={cn('grid h-6 w-6 place-items-center rounded-full text-xs font-bold tabular-nums', today ? 'bg-rust text-white' : 'text-charcoal')}>{day.getDate()}</span>
        {load.planned > 0 && <span className={cn('hidden text-[10px] font-extrabold tabular-nums md:inline', LOAD_TEXT[load.state])}>{fmtMinutes(load.planned)}</span>}
      </span>
      {/* Wide screens: titles */}
      <span className="hidden min-w-0 flex-col gap-0.5 md:flex">
        {events.slice(0, MAX_CHIPS).map((ev) => <Chip key={ev.id} ev={ev} />)}
        {events.length > MAX_CHIPS && <span className="px-1 text-[11px] font-bold text-muted">+{events.length - MAX_CHIPS} more</span>}
      </span>
      {/* Phones: just dots */}
      <span className="flex flex-wrap gap-0.5 md:hidden" aria-hidden="true">
        {events.slice(0, 4).map((ev) => <span key={ev.id} className="h-1.5 w-1.5 rounded-full" style={{ background: ev.color }} />)}
      </span>
      {/* How full the day is: a thin bar that fills with the time planned and turns red when it is too much */}
      {load.planned > 0 && (
        <span className="mt-auto block h-1 w-full overflow-hidden rounded-full bg-oat" aria-hidden="true">
          <span className={cn('block h-full rounded-full', LOAD_FILL[load.state])} style={{ width: `${full}%` }} />
        </span>
      )}
    </button>
  );
}

function AgendaItem({ ev, onOpen, onOpenDay }) {
  const Icon = ev.kind === 'goal' ? Target : CalendarClock;
  const sub = ev.kind === 'goal'
    ? `${horizonOf(ev.horizon).label} goal ends${ev.category ? ` · ${ev.category}` : ''}${ev.done ? ' · completed' : ` · ${ev.progress}% done`}`
    : [ev.span || 'Any time', ev.repeats && 'repeats'].filter(Boolean).join(' · ');
  const body = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: ev.color }}>
        {ev.done ? <Check className="h-4 w-4" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-bold', ev.done ? 'text-muted line-through' : 'text-charcoal')}>{ev.title}</span>
        <span className={cn('block truncate text-xs', ev.overdue ? 'font-semibold text-danger' : 'text-muted')}>{ev.overdue ? `Overdue · ${sub}` : sub}</span>
      </span>
    </>
  );
  const cls = 'flex w-full items-center gap-3 rounded-2xl border border-oat bg-ivory p-2.5 text-left';
  if (ev.kind === 'plan') return <button type="button" onClick={onOpenDay} className={cn(cls, 'transition-colors hover:border-rust')}>{body}</button>;
  return ev.goalActive
    ? <button type="button" onClick={() => onOpen(ev.goalId)} className={cn(cls, 'transition-colors hover:border-rust')}>{body}</button>
    : <div className={cls}>{body}</div>;
}

export default function CalendarView() {
  const { goals, dayPlans, categories, user, openGoal, openDay, openLighten, calendarFocus, consumeCalendarFocus } = useApp();
  const todayKey = localDate();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState(todayKey);

  // Jumped here from the "heads up" on the dashboard: show that day
  useEffect(() => {
    if (!calendarFocus) return;
    const d = new Date(`${calendarFocus.key}T00:00:00`);
    setSelected(calendarFocus.key);
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    consumeCalendarFocus();
  }, [calendarFocus, consumeCalendarFocus]);

  const weeks = useMemo(() => monthWeeks(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const events = useMemo(() => buildEvents(goals, dayPlans, categories, [...new Set([...weeks.flat().map(localDate), selected])]), [goals, dayPlans, categories, weeks, selected]);
  const loads = useMemo(() => new Map(weeks.flat().map((d) => [localDate(d), dayLoad(dayPlans, user, localDate(d))])), [weeks, dayPlans, user]);
  const selectedLoad = loads.get(selected) ?? dayLoad(dayPlans, user, selected);
  const monthName = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const dayEvents = events.get(selected) ?? [];
  const selectedDate = new Date(`${selected}T00:00:00`);

  const shift = (n) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));
  const goToday = () => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(todayKey); };
  const select = (key) => {
    setSelected(key);
    const d = new Date(`${key}T00:00:00`);
    if (d.getMonth() !== cursor.getMonth() || d.getFullYear() !== cursor.getFullYear()) setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const monthCount = useMemo(() => {
    const prefix = localDate(cursor).slice(0, 7);
    return [...events].filter(([k]) => k.startsWith(prefix)).reduce((n, [, list]) => n + list.length, 0);
  }, [events, cursor]);

  const navBtn = 'grid h-9 w-9 place-items-center rounded-xl border border-oat bg-soft text-charcoal hover:border-blush';

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-w-0 rounded-[28px] border border-oat bg-soft p-4 md:p-6" style={cardShadow} aria-labelledby="calTitle">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="calTitle" className="text-xl font-extrabold tracking-tight text-charcoal">{monthName}</h2>
            <p className="text-sm text-muted">{monthCount ? `${monthCount} item${monthCount === 1 ? '' : 's'} this month` : 'Nothing planned this month'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={goToday} className="rounded-xl border border-oat bg-soft px-3.5 py-2 text-sm font-bold text-charcoal hover:border-blush">Today</button>
            <button type="button" onClick={() => shift(-1)} className={navBtn} aria-label="Previous month"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" onClick={() => shift(1)} className={navBtn} aria-label="Next month"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-7 gap-1.5 text-center md:gap-2">
          {WEEKDAYS.map((d) => <div key={d} className="pb-1 text-[11px] font-bold uppercase tracking-wider text-muted">{d}</div>)}
          {weeks.flat().map((day) => {
            const key = localDate(day);
            return (
              <DayCell key={key} day={day} inMonth={day.getMonth() === cursor.getMonth()} today={key === todayKey} selected={key === selected} events={events.get(key) ?? []} load={loads.get(key)} onSelect={select} />
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1 rounded-full bg-rust" />Goal due</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1 rounded-full bg-blush" /><b className="font-bold text-charcoal">2 PM</b> A plan with a time</span>
          <span className="inline-flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded-full bg-rust text-[9px] font-bold text-white">{new Date().getDate()}</span>Today</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-1 w-6 overflow-hidden rounded-full bg-oat"><span className="block h-full w-2/3 bg-success" /></span>Time planned (turns red when a day is too full)</span>
        </div>
      </section>

      <aside className="rounded-[28px] border border-oat bg-soft p-4 md:p-6 xl:sticky xl:top-28" style={cardShadow} aria-label="Selected day">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-rust-dark">{selected === todayKey ? 'Today' : 'Selected day'}</p>
        <h2 className="mt-0.5 text-lg font-extrabold tracking-tight text-charcoal">
          {selectedDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>

        {(selectedLoad.planned > 0 || selectedLoad.state === 'rest') && (
          <div className="mt-4 rounded-2xl border border-oat bg-ivory p-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 font-extrabold text-charcoal"><Gauge className="h-4 w-4 text-muted" aria-hidden="true" />Time planned</span>
              <span className={cn('font-extrabold tabular-nums', LOAD_TEXT[selectedLoad.state])}>
                {fmtMinutes(selectedLoad.planned)}{selectedLoad.capacity > 0 && <span className="font-semibold text-muted"> of {fmtMinutes(selectedLoad.capacity)}</span>}
              </span>
            </div>
            <Bar pct={selectedLoad.capacity ? Math.min(100, Math.round((100 * selectedLoad.planned) / selectedLoad.capacity)) : 100} height="h-2" className="mt-2" fill={LOAD_FILL[selectedLoad.state]} label="Time planned" />
            <p className="mt-2 text-xs leading-snug text-muted">
              {selectedLoad.state === 'over' ? `About ${fmtMinutes(selectedLoad.over)} too much for one day.`
                : selectedLoad.state === 'rest' ? 'This is a rest day, so anything planned here is extra.'
                : selectedLoad.state === 'tight' ? 'A full day.' : `${fmtMinutes(selectedLoad.free)} still free.`}
              {selectedLoad.unestimated > 0 && ` ${selectedLoad.unestimated} ${selectedLoad.unestimated === 1 ? 'plan has' : 'plans have'} no length.`}
            </p>
            {selectedLoad.state === 'over' && (
              <button type="button" onClick={() => openLighten(selected)} className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-extrabold text-rust-dark hover:underline">
                Lighten this day<ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {dayEvents.map((ev) => (
              <motion.div key={ev.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <AgendaItem ev={ev} onOpen={openGoal} onOpenDay={() => openDay(selected)} />
              </motion.div>
            ))}
          </AnimatePresence>
          {!dayEvents.length && (
            <p className="rounded-2xl border border-dashed border-blush bg-ivory px-4 py-6 text-center text-sm text-muted">
              Nothing planned for this day.
            </p>
          )}
        </div>

        <button type="button" onClick={() => openDay(selected)}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rust px-4 py-2.5 text-sm font-extrabold text-white hover:bg-rust-dark">
          <ListChecks className="h-4 w-4" aria-hidden="true" />Plan this day
        </button>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Week, month and year goals show on the day they end. Your day plans show on every day they happen.
        </p>
      </aside>
    </div>
  );
}
