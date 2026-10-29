import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarCheck, CalendarDays, CalendarRange, CalendarSearch, ChevronLeft, ChevronRight, Clock, Pencil, Plus, Repeat, Sun, Trash2, Undo2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PERIODS, PRIORITY, REPEAT, WEEKDAY_SHORT, horizonOf } from '../lib/constants';
import {
  addDays, clockToMinutes, cn, dayLoad, fmtClock, fmtMinutes, fmtSpan, inPeriod, isoWeekday, localDate, minutesToClock, parseDay,
  periodEnd, periodKey, periodLabel, periodPhrase, periodRange, periodStart, plansOn, progressOf, repeatText, shiftPeriod, splitTaskLine, taskTotals,
} from '../lib/utils';
import GoalCard from './GoalCard';
import { Bar, cardShadow } from './ui';

const PERIOD_ICON = { DAILY: Sun, WEEKLY: CalendarDays, MONTHLY: CalendarRange, YEARLY: CalendarCheck };
const RANK = { WEEKLY: 1, MONTHLY: 2, YEARLY: 3 };
const LOAD_FILL = { ok: 'bg-success', tight: 'bg-warning', over: 'bg-danger', rest: 'bg-muted' };
const HOUR = 56;   // pixels per hour on the day timeline
const clockLabel = (mins) => fmtClock(new Date(2000, 0, 1, Math.floor(mins / 60), mins % 60));
const nowMinutes = (d) => d.getHours() * 60 + d.getMinutes();

// ---------------------------------------------------------------------------------------------------------------
// Adding and editing a day plan
// ---------------------------------------------------------------------------------------------------------------

/**
 * The form for one day plan. `plan` is the plan being edited (its changes apply to every day it happens), or null to
 * add one on `dayKey`, at `startAt` (minutes after midnight) when an hour on the timeline was tapped.
 */
function DayPlanEditor({ dayKey, plan, startAt = null, onClose }) {
  const { addDayPlan, editDayPlan, skipDayPlan, deleteDayPlan } = useApp();
  const editing = !!plan;
  const [title, setTitle] = useState(plan?.title ?? '');
  const [date, setDate] = useState(plan?.date ?? dayKey);
  const [timed, setTimed] = useState(plan ? !!plan.start : startAt !== null);
  const [from, setFrom] = useState(plan?.start ?? minutesToClock(startAt ?? Math.min(22 * 60, (new Date().getHours() + 1) * 60)));
  const [to, setTo] = useState(plan?.start && plan.minutes ? minutesToClock(clockToMinutes(plan.start) + plan.minutes) : minutesToClock(Math.min(clockToMinutes(from) + 60, 23 * 60 + 59)));
  const [length, setLength] = useState(!plan?.start && plan?.minutes ? String(plan.minutes) : '');   // for an any-time plan
  const [repeat, setRepeat] = useState(plan?.repeat ?? 'NONE');
  const [days, setDays] = useState(plan?.days?.length ? plan.days : [isoWeekday(parseDay(dayKey))]);
  const [until, setUntil] = useState(plan?.until ?? '');
  const [isPrivate, setIsPrivate] = useState(plan?.private ?? false);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);

  // Typing "Create content 2pm-4pm" fills in the time for you
  const typed = !editing ? splitTaskLine(title) : null;
  const onTitle = (v) => {
    setTitle(v);
    const s = !editing && splitTaskLine(v);
    if (s?.start) {
      setTimed(true); setFrom(s.start);
      setTo(minutesToClock(Math.min(clockToMinutes(s.start) + (s.estimate ?? 60), 23 * 60 + 59)));
    }
  };

  const minutes = timed && from && to ? clockToMinutes(to) - clockToMinutes(from) : null;
  const problem = !(typed?.start ? typed.text : title).trim() ? 'Give the plan a name.'
    : timed && minutes <= 0 ? 'The end has to be after the start.'
    : timed && minutes < 5 ? 'A plan needs at least 5 minutes.'
    : repeat === 'WEEKLY' && !days.length ? 'Pick at least one day of the week.'
    : repeat !== 'NONE' && until && until < date ? 'It cannot end before it starts.' : '';

  const save = async (e) => {
    e.preventDefault();
    if (problem) return;
    setBusy(true);
    const fields = {
      title: (typed?.start ? typed.text : title).trim(), date,
      start: timed ? from : null, minutes: timed ? minutes : length ? Number(length) : null,
      repeat, days: repeat === 'WEEKLY' ? days : [], until: repeat !== 'NONE' && until ? until : null, private: isPrivate,
    };
    if (await (editing ? editDayPlan(plan.id, fields) : addDayPlan(fields))) onClose();
    setBusy(false);
  };
  const toggleDay = (n) => setDays((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort()));
  const chip = (on) => cn('rounded-full border px-3 py-1.5 text-xs font-bold transition-colors', on ? 'border-rust bg-rust text-white' : 'border-oat bg-ivory text-charcoal hover:border-rust');

  return (
    <motion.form onSubmit={save} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
      className="mb-4 rounded-2xl border border-rust/40 bg-soft p-4" aria-label={editing ? 'Edit plan' : 'New plan'}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-extrabold text-charcoal">{editing ? 'Edit plan' : 'New plan for your day'}</p>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-oat/60"><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>

      <label className="mt-2 block text-[11px] font-semibold text-muted">What
        <input className="field mt-1 !py-2" maxLength={255} placeholder="e.g. Create content 2pm-4pm" value={title} onChange={(e) => onTitle(e.target.value)} autoFocus required />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="When">
        <button type="button" aria-pressed={!timed} className={chip(!timed)} onClick={() => setTimed(false)}>Any time</button>
        <button type="button" aria-pressed={timed} className={chip(timed)} onClick={() => setTimed(true)}><Clock className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />At a time</button>
      </div>
      {timed ? (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-xs">
          <label className="text-[11px] font-semibold text-muted">From
            <input type="time" className="field mt-1 !py-1.5" value={from} required
              onChange={(e) => { const v = e.target.value; if (v && minutes > 0) setTo(minutesToClock(Math.min(clockToMinutes(v) + minutes, 23 * 60 + 59))); setFrom(v); }} />
          </label>
          <label className="text-[11px] font-semibold text-muted">To
            <input type="time" className="field mt-1 !py-1.5" value={to} onChange={(e) => setTo(e.target.value)} required />
          </label>
        </div>
      ) : (
        <label className="mt-2 block text-[11px] font-semibold text-muted sm:max-w-xs">How long (optional)
          <select className="field mt-1 !py-1.5" value={length} onChange={(e) => setLength(e.target.value)}>
            <option value="">Not sure</option>
            {[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{fmtMinutes(m)}</option>)}
          </select>
        </label>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
        <label className="text-[11px] font-semibold text-muted">{repeat === 'NONE' ? 'Day' : 'Starting'}
          <input type="date" className="field mt-1 block !w-auto !py-1.5" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} required />
        </label>
        <label className="text-[11px] font-semibold text-muted">Repeat
          <select className="field mt-1 !py-1.5" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
            {Object.entries(REPEAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      {repeat === 'WEEKLY' && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
          {WEEKDAY_SHORT.map((d, i) => <button key={d} type="button" aria-pressed={days.includes(i + 1)} className={chip(days.includes(i + 1))} onClick={() => toggleDay(i + 1)}>{d}</button>)}
        </div>
      )}
      {repeat !== 'NONE' && (
        <label className="mt-2 block text-[11px] font-semibold text-muted">Until (optional)
          <input type="date" className="field mt-1 block !w-auto !py-1.5" value={until} min={date} onChange={(e) => setUntil(e.target.value)} />
        </label>
      )}

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-charcoal">
        <input type="checkbox" className="h-4 w-4 accent-[#B85C38]" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />Keep private <span className="font-normal text-muted">(partners will not see it)</span>
      </label>
      {problem && title && <p className="mt-2 text-xs font-semibold text-danger" role="alert">{problem}</p>}
      {!problem && timed && <p className="mt-2 text-xs font-semibold text-charcoal">{fmtSpan(from, minutes)} · {fmtMinutes(minutes)}. You get a reminder when it starts.</p>}
      {editing && plan.repeat !== 'NONE' && <p className="mt-2 text-xs text-muted">Changes apply to every day this plan repeats.</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy || !!problem} className="rounded-lg bg-rust px-4 py-2 text-xs font-extrabold text-white hover:bg-rust-dark disabled:opacity-50">{editing ? 'Save' : 'Add to my day'}</button>
        {editing && plan.repeat !== 'NONE' && (
          <button type="button" onClick={async () => { if (await skipDayPlan(plan.id, dayKey)) onClose(); }} className="rounded-lg px-2.5 py-2 text-xs font-semibold text-muted hover:bg-oat/60 hover:text-charcoal">Remove from this day only</button>
        )}
        {editing && (
          <button type="button" onClick={async () => { if (!armed) { setArmed(true); return; } if (await deleteDayPlan(plan.id)) onClose(); }}
            className={cn('ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold hover:bg-danger/10', armed ? 'text-danger' : 'text-muted hover:text-danger')}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{armed ? (plan.repeat !== 'NONE' ? 'Tap again: delete every day' : 'Tap again to delete') : 'Delete'}
          </button>
        )}
      </div>
    </motion.form>
  );
}

/** A tick box for one day of a plan. */
function Tick({ done, label, onToggle, small }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={done} aria-label={label}
      className={cn('grid shrink-0 place-items-center rounded-[6px] border-[1.5px] transition-colors', small ? 'h-4 w-4' : 'h-[1.35rem] w-[1.35rem]', done ? 'border-rust bg-rust' : 'border-charcoal/35 bg-soft hover:border-rust')}>
      {done && <svg viewBox="0 0 24 24" className={small ? 'h-3 w-3' : 'h-3.5 w-3.5'} fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The Day tab
// ---------------------------------------------------------------------------------------------------------------

/** Side-by-side lanes for blocks that overlap, like a calendar app: each gets { lane, lanes }. */
function layoutBlocks(blocks) {
  const sorted = [...blocks].sort((a, b) => a.from - b.from || b.to - a.to);
  const out = [];
  let cluster = [], clusterEnd = -1, laneEnds = [];
  const flush = () => { const n = laneEnds.length; cluster.forEach((b) => out.push({ ...b, lanes: n })); cluster = []; laneEnds = []; };
  for (const b of sorted) {
    if (b.from >= clusterEnd) { flush(); clusterEnd = -1; }
    let lane = laneEnds.findIndex((end) => end <= b.from);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(b.to); } else laneEnds[lane] = b.to;
    cluster.push({ ...b, lane });
    clusterEnd = Math.max(clusterEnd, b.to);
  }
  flush();
  return out;
}

/** The day hour by hour: every plan with a time. Tap an empty hour to add one there, tap a block to edit it. */
function DayTimeline({ dayKey, items, onAddAt, onEdit }) {
  const { toggleDayPlan, now } = useApp();
  const scroller = useRef(null);
  const blocks = useMemo(() => layoutBlocks(items.filter((x) => x.start).map((x) => {
    const from = clockToMinutes(x.start);
    return { ...x, from, to: Math.min(24 * 60, from + (x.minutes ?? 30)) };
  })), [items]);

  const isToday = dayKey === localDate(now);
  const nowMin = nowMinutes(now);
  const first = Math.min(7, ...blocks.map((b) => Math.floor(b.from / 60)));
  const last = Math.max(21, ...blocks.map((b) => Math.ceil(b.to / 60)));
  const hours = Array.from({ length: last - first }, (_, i) => first + i);

  // Open near now (or the first block), not at the top of the day
  useEffect(() => {
    if (!scroller.current) return;
    const target = isToday ? nowMin : blocks[0]?.from ?? 9 * 60;
    scroller.current.scrollTop = Math.max(0, (target / 60 - first - 1) * HOUR);
  }, [dayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={scroller} className="relative max-h-[560px] overflow-y-auto rounded-2xl border border-oat bg-ivory" aria-label="Your day, hour by hour">
      <div className="relative" style={{ height: hours.length * HOUR }}>
        {hours.map((h, i) => (
          <button key={h} type="button" onClick={() => onAddAt(h * 60)} aria-label={`Add a plan at ${clockLabel(h * 60)}`}
            className="group absolute inset-x-0 flex border-t border-oat/80 text-left first:border-t-0 hover:bg-oat/30" style={{ top: i * HOUR, height: HOUR }}>
            <span className="w-16 shrink-0 -translate-y-2 pl-2 text-[11px] font-semibold tabular-nums text-muted">{i === 0 ? '' : clockLabel(h * 60)}</span>
            <span className="mt-3 hidden items-center gap-1 text-[11px] font-bold text-rust-dark group-hover:flex group-focus-visible:flex"><Plus className="h-3 w-3" aria-hidden="true" />Add a plan</span>
          </button>
        ))}

        {isToday && nowMin >= first * 60 && nowMin < last * 60 && (
          <div className="pointer-events-none absolute left-14 right-0 z-20 flex items-center" style={{ top: (nowMin / 60 - first) * HOUR }} aria-hidden="true">
            <span className="h-2.5 w-2.5 -translate-x-1 rounded-full bg-danger" /><span className="h-0.5 flex-1 bg-danger/70" />
          </div>
        )}

        {blocks.map((b) => {
          const top = (b.from / 60 - first) * HOUR, height = Math.max(28, ((b.to - b.from) / 60) * HOUR - 3);
          const width = `calc((100% - 4.5rem) / ${b.lanes})`;
          return (
            // No `layout` here: layout-animated nodes that unmount while their page is up keep App's page transition from finishing
            <motion.div key={b.plan.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              className={cn('absolute z-10 flex overflow-hidden rounded-xl border-l-4 border-rust text-left shadow-sm', b.done ? 'bg-rust/10' : 'bg-rust/20')}
              style={{ top: top + 1, height, left: `calc(4rem + ${b.lane} * ${width})`, width: `calc(${width} - 4px)` }}>
              <span className="pl-2 pt-1.5"><Tick small done={b.done} label={b.done ? `Mark "${b.plan.title}" not done` : `Mark "${b.plan.title}" done`} onToggle={() => toggleDayPlan(b.plan.id, dayKey, !b.done)} /></span>
              <button type="button" onClick={() => onEdit(b.plan)} className="flex min-w-0 flex-1 flex-col justify-start px-2 py-1 text-left" aria-label={`Edit ${b.plan.title}`}>
                <span className={cn('block truncate text-[13px] font-extrabold leading-tight text-charcoal', b.done && 'text-muted line-through')}>{b.plan.title}</span>
                {height > 34 && (
                  <span className="flex items-center gap-1 truncate text-[11px] font-semibold text-charcoal/70">
                    {fmtSpan(b.start, b.minutes)}{b.plan.repeat !== 'NONE' && <><Repeat className="h-3 w-3 shrink-0" aria-hidden="true" />{repeatText(b.plan)}</>}
                  </span>
                )}
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/** Plans for the day with no particular time. */
function AnyTime({ dayKey, items, onEdit }) {
  const { toggleDayPlan } = useApp();
  const list = items.filter((x) => !x.start);
  return (
    <section>
      <h3 className="text-sm font-extrabold text-charcoal">Any time today <span className="font-semibold text-muted">· {list.length}</span></h3>
      {list.length === 0 ? (
        <p className="mt-1 text-xs text-muted">Plans without a set time show here.</p>
      ) : (
        <ul className="mt-2 grid gap-1">
          {list.map((x) => (
            <li key={x.plan.id} className="flex items-center gap-3 rounded-xl border border-oat bg-ivory px-3 py-2.5">
              <Tick done={x.done} label={x.done ? `Mark "${x.plan.title}" not done` : `Mark "${x.plan.title}" done`} onToggle={() => toggleDayPlan(x.plan.id, dayKey, !x.done)} />
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-sm font-semibold', x.done ? 'text-muted line-through' : 'text-charcoal')}>{x.plan.title}</span>
                {(x.minutes || x.plan.repeat !== 'NONE') && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-muted">
                    {x.minutes ? fmtMinutes(x.minutes) : ''}{x.minutes && x.plan.repeat !== 'NONE' ? ' · ' : ''}
                    {x.plan.repeat !== 'NONE' && <><Repeat className="h-3 w-3" aria-hidden="true" />{repeatText(x.plan)}</>}
                  </span>
                )}
              </span>
              <button type="button" onClick={() => onEdit(x.plan)} aria-label={`Edit ${x.plan.title}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-oat/60 hover:text-charcoal"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DayView({ dayKey }) {
  const { dayPlans, user, openLighten } = useApp();
  const [editor, setEditor] = useState(null);   // null, { startAt } to add, or { plan } to edit
  const items = plansOn(dayPlans, dayKey);
  const load = dayLoad(dayPlans, user, dayKey);
  const done = items.filter((x) => x.done).length;
  const pct = load.capacity ? Math.min(100, Math.round((100 * load.planned) / load.capacity)) : load.planned ? 100 : 0;
  useEffect(() => setEditor(null), [dayKey]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section className="min-w-0 rounded-3xl border border-oat bg-soft p-4 md:p-5" style={cardShadow}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold text-charcoal">Your day</h2>
            <p className="text-xs text-muted">Tap an empty hour to plan something then, or tap a plan to change it.</p>
          </div>
          <button type="button" onClick={() => setEditor({ startAt: null })} className="inline-flex items-center gap-1.5 rounded-xl bg-rust px-3.5 py-2 text-sm font-extrabold text-white shadow-md hover:bg-rust-dark">
            <Plus className="h-4 w-4" strokeWidth={3} aria-hidden="true" />Add a plan
          </button>
        </div>
        <AnimatePresence>
          {editor && <DayPlanEditor key={editor.plan?.id ?? `new-${editor.startAt}`} dayKey={dayKey} plan={editor.plan ?? null} startAt={editor.startAt ?? null} onClose={() => setEditor(null)} />}
        </AnimatePresence>
        <DayTimeline dayKey={dayKey} items={items} onAddAt={(m) => setEditor({ startAt: m })} onEdit={(plan) => setEditor({ plan })} />
      </section>

      <div className="grid min-w-0 content-start gap-5">
        <section className="rounded-3xl border border-oat bg-soft p-4 md:p-5" style={cardShadow}>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-extrabold text-charcoal">How full is this day?</h3>
            <span className="text-xs font-bold tabular-nums text-muted">{done}/{items.length} done</span>
          </div>
          <p className="mt-2 text-2xl font-extrabold tabular-nums text-charcoal">{fmtMinutes(load.planned)} <span className="text-sm font-semibold text-muted">{load.capacity ? `planned of ${fmtMinutes(load.capacity)}` : 'planned · rest day'}</span></p>
          <Bar pct={pct} height="h-2.5" className="mt-2" fill={LOAD_FILL[load.state]} label="Time planned" />
          <p className="mt-2 text-xs text-muted">
            {load.state === 'over' ? `About ${fmtMinutes(load.over)} more than fits.` : load.state === 'tight' ? 'A full day. Leave some slack.' : load.capacity ? `${fmtMinutes(load.free)} still free.` : 'A rest day, so anything here is extra.'}
            {load.unestimated > 0 && ` ${load.unestimated} still to do ${load.unestimated === 1 ? 'has' : 'have'} no length.`}
          </p>
          {load.state === 'over' && (
            <button type="button" onClick={() => openLighten(dayKey)} className="mt-2 text-sm font-extrabold text-rust-dark hover:underline">Lighten this day</button>
          )}
        </section>
        <section className="rounded-3xl border border-oat bg-soft p-4 md:p-5" style={cardShadow}>
          <AnyTime dayKey={dayKey} items={items} onEdit={(plan) => setEditor({ plan })} />
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Week, month and year
// ---------------------------------------------------------------------------------------------------------------

/** The week at a glance: each day's plans and how full it is. Tapping a day opens it. */
function WeekStrip({ anchor, onPickDay }) {
  const { dayPlans, user, now } = useApp();
  const start = periodStart('WEEKLY', anchor);
  const today = localDate(now);
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(start, i), key = localDate(d);
        const items = plansOn(dayPlans, key);
        const load = dayLoad(dayPlans, user, key);
        const pct = load.capacity ? Math.min(100, Math.round((100 * load.planned) / load.capacity)) : load.planned ? 100 : 0;
        return (
          <button key={key} type="button" onClick={() => onPickDay(key)}
            className={cn('flex min-w-0 flex-col items-center gap-1 rounded-2xl border px-1 py-2.5 transition-colors hover:border-rust', key === today ? 'border-rust bg-rust/10' : 'border-oat bg-ivory')}
            aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}: ${items.length} plans`}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
            <span className={cn('text-lg font-extrabold tabular-nums', key === today ? 'text-rust-dark' : 'text-charcoal')}>{d.getDate()}</span>
            <span className="h-1.5 w-full max-w-[2.5rem] overflow-hidden rounded-full bg-oat"><span className={cn('block h-full rounded-full', LOAD_FILL[load.state])} style={{ width: `${pct}%` }} /></span>
            <span className="text-[10px] font-semibold tabular-nums text-muted">{items.length ? `${items.filter((x) => x.done).length}/${items.length}` : load.capacity === 0 ? 'Rest' : '—'}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Smaller goals inside this period (a month's weeks, a year's months and weeks): the pieces that build the bigger goal. */
function InsideThisPeriod({ horizon, anchor, onOpen }) {
  const { goals } = useApp();
  const from = localDate(periodStart(horizon, anchor)), to = localDate(periodEnd(horizon, anchor));
  // A smaller goal belongs here when its period overlaps this one, so a week that runs into the next month counts in both
  const inner = goals
    .filter((g) => {
      if (g.status === 'ARCHIVED' || !(RANK[g.timeframe] < RANK[horizon]) || !g.due_date) return false;
      const d = parseDay(g.due_date);
      return localDate(periodStart(g.timeframe, d)) <= to && localDate(periodEnd(g.timeframe, d)) >= from;
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || RANK[b.timeframe] - RANK[a.timeframe]);
  if (!inner.length) return null;
  return (
    <section className="mt-6">
      <h3 className="text-sm font-extrabold text-charcoal">Inside this {horizonOf(horizon).unit}</h3>
      <p className="text-xs text-muted">Your smaller goals in this {horizonOf(horizon).unit}.</p>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {inner.map((g) => {
          const pct = progressOf(g), Icon = PERIOD_ICON[g.timeframe];
          return (
            <li key={g.id}>
              <button type="button" onClick={() => onOpen(g.timeframe, g.due_date)} className="flex w-full items-center gap-3 rounded-2xl border border-oat bg-soft p-3 text-left hover:border-rust">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-oat text-rust-dark"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-sm font-bold', g.status === 'COMPLETED' ? 'text-muted line-through' : 'text-charcoal')}>{g.title}</span>
                  <span className="block text-[11px] font-semibold text-muted">{periodLabel(g.timeframe, parseDay(g.due_date))} · {pct}%</span>
                </span>
                <span className="w-12 shrink-0"><Bar pct={pct} height="h-1.5" fill={PRIORITY[g.priority].bar} label={`${g.title} progress`} /></span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function GoalsView({ horizon, anchor, now }) {
  const { goals, openGoalModal, setPlannerAt, freshId } = useApp();
  const h = horizonOf(horizon);
  const isCurrent = periodKey(horizon, anchor) === periodKey(horizon, now);
  const isPast = localDate(periodEnd(horizon, anchor)) < localDate(now);
  const periodGoals = goals
    .filter((g) => g.status !== 'ARCHIVED' && inPeriod(g, horizon, anchor))
    .sort((a, b) => (a.status === 'COMPLETED') - (b.status === 'COMPLETED') || ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[a.priority] - { HIGH: 0, MEDIUM: 1, LOW: 2 }[b.priority]));
  const newGoal = () => openGoalModal({ timeframe: horizon, anchor: isPast ? localDate(now) : localDate(anchor) });

  return (
    <section className="min-w-0">
      {horizon === 'WEEKLY' && (
        <div className="mb-5 rounded-3xl border border-oat bg-soft p-4" style={cardShadow}>
          <h2 className="mb-3 text-base font-extrabold text-charcoal">Your days this week</h2>
          <WeekStrip anchor={anchor} onPickDay={(k) => setPlannerAt({ horizon: 'DAILY', key: k })} />
        </div>
      )}
      <h2 className="mb-3 text-base font-extrabold text-charcoal">Goals for {periodPhrase(periodLabel(horizon, anchor, now))}</h2>
      {periodGoals.length === 0 ? (
        <button type="button" onClick={newGoal} className="flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-blush bg-soft/60 px-6 py-10 text-center hover:border-rust">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-oat text-rust-dark"><Plus className="h-6 w-6" aria-hidden="true" /></span>
          <span className="text-base font-extrabold text-charcoal">{isPast ? `No goals were set for this ${h.unit}.` : `What do you want to achieve ${isCurrent ? `this ${h.unit}` : `in ${periodPhrase(periodLabel(horizon, anchor, now))}`}?`}</span>
          <span className="max-w-sm text-sm text-muted">Set a goal, then list the plans that will get you there. You can have as many goals as you like.</span>
        </button>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {periodGoals.map((g) => <GoalCard key={g.id} goal={g} defaultOpen={g.id === freshId || periodGoals.length <= 2} />)}
          </AnimatePresence>
        </div>
      )}
      {horizon !== 'WEEKLY' && <InsideThisPeriod horizon={horizon} anchor={anchor} onOpen={(hz, due) => setPlannerAt({ horizon: hz, key: due })} />}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export default function PlannerView() {
  const { goals, dayPlans, now, plannerAt, setPlannerAt, openGoalModal, openCalendarDay } = useApp();
  const horizon = plannerAt?.horizon ?? 'DAILY';
  const anchor = parseDay(plannerAt?.key ?? localDate(now));
  const go = (hz, d) => setPlannerAt({ horizon: hz, key: localDate(d) });
  const h = horizonOf(horizon);
  const key = localDate(anchor);
  const isCurrent = periodKey(horizon, anchor) === periodKey(horizon, now);
  const isPast = localDate(periodEnd(horizon, anchor)) < localDate(now);

  const summary = (() => {
    if (horizon === 'DAILY') {
      const items = plansOn(dayPlans, key);
      return items.length ? `${items.length} plan${items.length === 1 ? '' : 's'} · ${items.filter((x) => x.done).length} done` : 'Nothing planned for this day yet.';
    }
    const gs = goals.filter((g) => g.status !== 'ARCHIVED' && inPeriod(g, horizon, anchor));
    const t = taskTotals(gs);
    return gs.length ? `${gs.length} goal${gs.length === 1 ? '' : 's'} · ${t.done} of ${t.total} plans done` : `No goals for this ${h.unit} yet.`;
  })();
  const totals = horizon === 'DAILY' ? null : taskTotals(goals.filter((g) => g.status !== 'ARCHIVED' && inPeriod(g, horizon, anchor)));

  return (
    <div className="mx-auto grid max-w-6xl gap-5">
      <section className="rounded-3xl border border-oat bg-soft p-4 md:p-5" style={cardShadow}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid grid-cols-4 gap-1 rounded-2xl bg-oat/60 p-1" role="tablist" aria-label="Plan for a">
            {PERIODS.map((x) => {
              const on = x.id === horizon, Icon = PERIOD_ICON[x.id];
              return (
                <button key={x.id} type="button" role="tab" aria-selected={on} onClick={() => go(x.id, anchor)}
                  className={cn('flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-extrabold transition-colors duration-200 sm:px-3', on ? 'bg-rust text-white shadow-md' : 'text-charcoal hover:bg-soft/70 hover:text-rust-dark')}>
                  <Icon className="hidden h-4 w-4 shrink-0 min-[400px]:block" aria-hidden="true" /><span>{x.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => go(horizon, shiftPeriod(horizon, anchor, -1))} aria-label={`Previous ${h.unit}`} className="grid h-10 w-10 place-items-center rounded-xl border border-oat bg-ivory text-charcoal hover:border-rust"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
            <div className="min-w-[9.5rem] text-center" aria-live="polite">
              <p className="text-base font-extrabold text-charcoal">{periodLabel(horizon, anchor, now)}</p>
              <p className="text-[11px] font-semibold text-muted">{periodRange(horizon, anchor)}</p>
            </div>
            <button type="button" onClick={() => go(horizon, shiftPeriod(horizon, anchor, 1))} aria-label={`Next ${h.unit}`} className="grid h-10 w-10 place-items-center rounded-xl border border-oat bg-ivory text-charcoal hover:border-rust"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
            <button type="button" onClick={() => openCalendarDay(key)} aria-label="Open the calendar" title="Calendar" className="grid h-10 w-10 place-items-center rounded-xl border border-oat bg-ivory text-charcoal hover:border-rust md:hidden"><CalendarSearch className="h-5 w-5" aria-hidden="true" /></button>
            {!isCurrent && (
              <button type="button" onClick={() => go(horizon, now)} className="ml-1 inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-bold text-rust-dark hover:bg-oat/60"><Undo2 className="h-3.5 w-3.5" aria-hidden="true" />{h.this}</button>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-charcoal">{summary}</p>
            {totals?.total > 0 && <Bar pct={totals.pct} height="h-2" className="mt-2 max-w-md" label={`Plans done for ${periodLabel(horizon, anchor, now)}`} />}
          </div>
          {horizon !== 'DAILY' && (
            <button type="button" onClick={() => openGoalModal({ timeframe: horizon, anchor: isPast ? localDate(now) : key })} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rust px-4 py-2.5 text-sm font-extrabold text-white shadow-md hover:bg-rust-dark">
              <Plus className="h-4 w-4" strokeWidth={3} aria-hidden="true" />Goal for {isCurrent ? `this ${h.unit}` : periodPhrase(periodLabel(horizon, anchor, now))}
            </button>
          )}
        </div>
      </section>

      {/* Keyed, so a new tab or period fades in. No exit animation on purpose: a nested exit keeps App's own page
          transition from finishing, and the next page never appears. */}
      <motion.div key={`${horizon}:${periodKey(horizon, anchor)}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {horizon === 'DAILY' ? <DayView dayKey={key} /> : <GoalsView horizon={horizon} anchor={anchor} now={now} />}
      </motion.div>
    </div>
  );
}
