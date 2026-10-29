import { forwardRef, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, Bell, BellRing, CalendarClock, ChevronDown, Clock, Gauge, Plus, Repeat } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PRIORITY, TIMEFRAME, catIcon } from '../lib/constants';
import { cn, dayLoad, dueInfo, fmtMinutes, fmtShort, loadState, parseEstimate, progressOf, shortDay, splitTaskLine, toInputValue } from '../lib/utils';
import { Bar, cardShadow } from './ui';

const collapse = { initial: { height: 0, opacity: 0 }, animate: { height: 'auto', opacity: 1 }, exit: { height: 0, opacity: 0 }, transition: { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] } };

const PRESETS = [15, 30, 45, 60, 90, 120, 180];

/** The "how long will this take?" picker: quick choices, or type your own like 50m or 1h30. */
function EstimateEditor({ task, onPick }) {
  const [custom, setCustom] = useState('');
  const parsed = parseEstimate(custom);
  const bad = custom.trim() !== '' && parsed === null;
  return (
    <motion.div {...collapse} className="overflow-hidden">
      <div className="mb-2 ml-9 mr-2 rounded-xl border border-oat bg-soft p-3">
        <p className="text-xs font-bold text-muted">How long will this take?</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRESETS.map((m) => (
            <button key={m} type="button" aria-pressed={task.estimate === m} onClick={() => onPick(m)}
              className={cn('rounded-full border px-3 py-1 text-xs font-bold transition-colors', task.estimate === m ? 'border-rust bg-rust text-white' : 'border-oat bg-ivory text-charcoal hover:border-rust')}>
              {fmtMinutes(m)}
            </button>
          ))}
        </div>
        <form className="mt-2.5 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (parsed) onPick(parsed); }}>
          <label className="sr-only" htmlFor={`est-${task.id}`}>Your own time</label>
          <input id={`est-${task.id}`} className="field !w-32 !py-1.5" placeholder="50m, 2h, 1h30" value={custom} onChange={(e) => setCustom(e.target.value)} aria-invalid={bad} />
          <button type="submit" disabled={!parsed} className="rounded-lg bg-oat px-3 py-1.5 text-xs font-bold text-charcoal hover:bg-blush/40 disabled:opacity-50">Set</button>
          {task.estimate && <button type="button" onClick={() => onPick(null)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-muted hover:text-danger">Remove</button>}
        </form>
        {bad && <p className="mt-1.5 text-xs text-danger" role="alert">Try 50m, 1h or 1h30 (5 minutes to 12 hours).</p>}
      </div>
    </motion.div>
  );
}

const LOAD_TONE = { ok: 'text-success', tight: 'text-warning', over: 'text-danger', rest: 'text-muted' };

/** When picking a reminder time: how full that day already is. */
function DayPreview({ goal, task, when }) {
  const { goals, user } = useApp();
  if (!when) return null;
  const key = when.slice(0, 10);
  const load = dayLoad(goals, user, key);
  const counted = !task.done && (task.remind ? task.remind.slice(0, 10) : goal.due_date) === key;   // this task is already part of that day
  const planned = load.planned + (counted ? 0 : task.estimate ?? 0);
  const state = loadState(planned, load.capacity);
  const day = shortDay(new Date(`${key}T00:00:00`));
  const text = state === 'rest' ? `${day} is a rest day.`
    : planned === 0 ? `${day}: nothing else planned.`
    : state === 'over' ? `${day} would be about ${fmtMinutes(planned - load.capacity)} over: ${fmtMinutes(planned)} planned of ${fmtMinutes(load.capacity)}.`
    : `${day}: ${fmtMinutes(planned)} planned of ${fmtMinutes(load.capacity)}.`;
  return <p className={cn('mb-2 ml-9 mr-2 flex items-center gap-1.5 text-xs font-semibold', LOAD_TONE[state])}><Gauge className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{text}</p>;
}

function TaskItem({ goal, task }) {
  const { toggleTask, setReminder, setEstimate } = useApp();
  const [panel, setPanel] = useState(null);   // null, 'remind' or 'estimate'
  const [when, setWhen] = useState(task.remind ?? '');
  const editing = panel === 'remind';

  const openEditor = () => {
    if (!editing && !when) { const d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0); setWhen(toInputValue(d)); }
    setPanel(editing ? null : 'remind');
  };
  const save = async (value) => { await setReminder(goal.id, task.id, value); setPanel(null); if (!value) setWhen(''); };
  const pickEstimate = async (minutes) => { await setEstimate(task.id, minutes); setPanel(null); };
  const label = task.remind ? 'Change reminder' : 'Set a reminder';
  const estLabel = task.estimate ? `Takes about ${fmtMinutes(task.estimate)}. Change it` : 'Add a time estimate';

  return (
    <li>
      <div className="flex items-start">
        <label className="relative flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-xl px-2 py-[.55rem] hover:bg-oat/50">
          <input type="checkbox" className="peer sr-only" checked={task.done} onChange={(e) => toggleTask(goal.id, task.id, e.target.checked)} />
          <motion.span
            animate={task.done ? { scale: [1, 1.25, 1] } : { scale: 1 }} transition={{ duration: 0.35 }}
            className={`mt-[.05rem] grid h-[1.4rem] w-[1.4rem] flex-none place-items-center rounded-[.45rem] border-[1.5px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rust ${task.done ? 'border-rust bg-rust' : 'border-blush bg-soft'}`}
          >
            <svg viewBox="0 0 24 24" className="h-[.9rem] w-[.9rem]" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={false} animate={{ pathLength: task.done ? 1 : 0 }} transition={{ duration: 0.3, delay: 0.05 }} />
            </svg>
          </motion.span>
          <span className="min-w-0 flex-1">
            <span className="ttext" data-done={task.done}>{task.text}</span>
            {task.remind && (
              <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-warning">
                <BellRing className="h-3 w-3" aria-hidden="true" />Reminder: {fmtShort(new Date(task.remind))}
              </span>
            )}
          </span>
        </label>
        <button type="button" onClick={() => setPanel(panel === 'estimate' ? null : 'estimate')} aria-label={estLabel} title={estLabel} aria-expanded={panel === 'estimate'}
          className={cn('mt-1 flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg hover:bg-oat/60', task.estimate ? 'px-1.5 text-[11px] font-bold text-charcoal' : 'w-8 text-muted')}>
          <Clock className="h-4 w-4" aria-hidden="true" />{task.estimate && fmtMinutes(task.estimate)}
        </button>
        <button type="button" onClick={openEditor} aria-label={label} title={label}
          className={`mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-oat/60 ${task.remind ? 'text-warning' : 'text-muted'}`}>
          <Bell className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {panel === 'estimate' && <EstimateEditor key="est" task={task} onPick={pickEstimate} />}
        {editing && (
          <motion.form key="rem" {...collapse} className="overflow-hidden" onSubmit={(e) => { e.preventDefault(); save(when || null); }}>
            <div className="mb-2 ml-9 mr-2 flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`rm-${task.id}`}>Remind me at</label>
              <input id={`rm-${task.id}`} type="datetime-local" className="field !w-auto min-w-0 flex-1 !py-1.5" value={when} onChange={(e) => setWhen(e.target.value)} autoFocus />
              <button type="submit" className="rounded-lg bg-oat px-3 py-1.5 text-xs font-bold text-charcoal hover:bg-blush/40">Save</button>
              {task.remind && <button type="button" onClick={() => save(null)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-muted hover:text-danger">Clear</button>}
            </div>
            <DayPreview goal={goal} task={task} when={when} />
          </motion.form>
        )}
      </AnimatePresence>
    </li>
  );
}

// forwardRef: AnimatePresence (popLayout) needs a ref to the card to animate it out
const GoalCard = forwardRef(function GoalCard({ goal: g }, forwardedRef) {
  const { categories, freshId, focusReq, consumeFocus, addTask, archiveGoal } = useApp();
  const [open, setOpen] = useState(g.id === freshId);
  const [text, setText] = useState('');
  const [newEst, setNewEst] = useState('');      // minutes picked in the add-task box, or ''
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const ref = useRef(null);
  const setRef = (node) => {   // keep our own ref (for scrolling) and hand the node to AnimatePresence too
    ref.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  const p = PRIORITY[g.priority];
  const cat = categories.find((c) => c.id === g.category_id);
  const color = cat ? cat.color : '#B85C38';
  const CatIcon = catIcon(cat?.name);
  const pct = progressOf(g);
  const done = g.sub_plans.filter((t) => t.done).length;
  const due = dueInfo(g.due_date);
  const minutesLeft = g.sub_plans.filter((t) => !t.done).reduce((n, t) => n + (t.estimate ?? 0), 0);   // time still to give, from the estimates

  // Jump here from a notification: open the card, scroll to it and flash an outline
  useEffect(() => {
    if (focusReq?.id !== g.id) return;
    setOpen(true);
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      ref.current?.animate([{ outline: '3px solid #B85C38' }, { outline: '3px solid transparent' }], { duration: 1600 });
    });
    consumeFocus();
  }, [focusReq, g.id, consumeFocus]);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const submitTask = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const { text: clean, estimate } = splitTaskLine(text);   // "Write the intro ~45m" carries its own estimate
    setBusy(true);
    if (await addTask(g.id, clean, estimate ?? (newEst ? Number(newEst) : null))) { setText(''); setNewEst(''); }
    setBusy(false);
  };

  return (
    <motion.article
      ref={setRef} layout="position"
      initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.25 } }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      className={`relative overflow-hidden rounded-3xl border-2 bg-soft ${p.card}`}
      style={cardShadow}
    >
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`panel-${g.id}`}
        className="relative block w-full p-4 pb-3 text-left" style={{ background: `${color}14` }}>
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white" style={{ background: color }}>
            <CatIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-bold uppercase tracking-wider text-muted">{cat ? cat.name : 'No category'}</span>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${p.badge}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" style={{ boxShadow: '0 0 6px currentColor' }} />{p.label}
              </span>
            </div>
            <h3 className="mt-1 break-words text-lg font-extrabold leading-snug text-charcoal">{g.title}</h3>
          </div>
          <motion.span animate={{ rotate: open ? 180 : 0 }} className="mt-1 shrink-0 text-muted"><ChevronDown className="h-5 w-5" aria-hidden="true" /></motion.span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-oat bg-soft px-2.5 py-0.5 text-[11px] font-bold text-muted shadow-sm"><Repeat className="h-3 w-3" aria-hidden="true" />{TIMEFRAME[g.timeframe]}</span>
          <span className={`inline-flex items-center gap-1 rounded-full border border-oat bg-soft px-2.5 py-0.5 text-[11px] font-bold shadow-sm ${due.cls}`}><CalendarClock className="h-3 w-3" aria-hidden="true" />{due.text}</span>
        </div>
      </button>

      <div className="px-4 pb-4 pt-1">
        <div className="flex items-baseline justify-between text-xs">
          <motion.span key={pct} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className="origin-left font-extrabold tabular-nums text-charcoal">{pct}% Completed</motion.span>
          <span className="font-semibold tabular-nums text-muted">{done}/{g.sub_plans.length} tasks{minutesLeft > 0 && ` · about ${fmtMinutes(minutesLeft)} left`}</span>
        </div>
        <Bar pct={pct} height="h-2.5" className="mt-2" fill={p.bar} label={`Progress for ${g.title}`} />
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={`panel-${g.id}`} {...collapse} className="overflow-hidden">
            <div className="border-t border-oat bg-oat/40 px-2 pb-3 pt-2">
              {g.quote && <p className="px-2 pb-2 pt-1 text-xs italic text-muted">&ldquo;{g.quote}&rdquo;</p>}
              <ul className="grid gap-0.5">{g.sub_plans.map((t) => <TaskItem key={t.id} goal={g} task={t} />)}</ul>
              <form className="mt-2 flex gap-2 px-2" onSubmit={submitTask}>
                <label className="sr-only" htmlFor={`nt-${g.id}`}>New task</label>
                <input id={`nt-${g.id}`} className="field !py-2" type="text" maxLength={500} placeholder="Add a task (add ~30m for its time)" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} required />
                <label className="sr-only" htmlFor={`ne-${g.id}`}>Time estimate</label>
                <select id={`ne-${g.id}`} className="field !w-[4.6rem] shrink-0 !px-2 !py-2" value={newEst} onChange={(e) => setNewEst(e.target.value)} disabled={busy} title="How long will it take?">
                  <option value="">Time</option>
                  {PRESETS.map((m) => <option key={m} value={m}>{fmtMinutes(m)}</option>)}
                </select>
                <button type="submit" disabled={busy} aria-label="Add task" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rust text-white shadow-md"><Plus className="h-4 w-4" aria-hidden="true" /></button>
              </form>
              <div className="mt-1 flex justify-end px-2">
                <button type="button" onClick={() => (armed ? archiveGoal(g.id) : setArmed(true))} // two taps, so it cannot happen by accident
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold hover:bg-oat/60 ${armed ? 'text-danger' : 'text-muted hover:text-charcoal'}`}>
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" /><span>{armed ? 'Tap again to archive' : 'Archive goal'}</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
});

export default GoalCard;
