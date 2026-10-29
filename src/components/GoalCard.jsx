import { forwardRef, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, CalendarClock, CalendarRange, ChevronDown, Lock, Plus, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PRIORITY, catIcon } from '../lib/constants';
import { dueInfo, goalPeriodLabel, progressOf } from '../lib/utils';
import { Bar, cardShadow } from './ui';

const collapse = { initial: { height: 0, opacity: 0 }, animate: { height: 'auto', opacity: 1 }, exit: { height: 0, opacity: 0 }, transition: { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] } };

/** One of a goal's plans: a step towards it that you tick off once it is done. */
function TaskItem({ goal, task }) {
  const { toggleTask } = useApp();
  return (
    <li>
      <label className="relative flex cursor-pointer items-start gap-3 rounded-xl px-2 py-[.55rem] hover:bg-oat/50">
        <input type="checkbox" className="peer sr-only" checked={task.done} onChange={(e) => toggleTask(goal.id, task.id, e.target.checked)} />
        <motion.span
          animate={task.done ? { scale: [1, 1.25, 1] } : { scale: 1 }} transition={{ duration: 0.35 }}
          className={`mt-[.05rem] grid h-[1.4rem] w-[1.4rem] flex-none place-items-center rounded-[.45rem] border-[1.5px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rust ${task.done ? 'border-rust bg-rust' : 'border-blush bg-soft'}`}
        >
          <svg viewBox="0 0 24 24" className="h-[.9rem] w-[.9rem]" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={false} animate={{ pathLength: task.done ? 1 : 0 }} transition={{ duration: 0.3, delay: 0.05 }} />
          </svg>
        </motion.span>
        <span className="ttext min-w-0 flex-1" data-done={task.done}>{task.text}</span>
      </label>
    </li>
  );
}

// forwardRef: AnimatePresence (popLayout) needs a ref to the card to animate it out
const GoalCard = forwardRef(function GoalCard({ goal: g, defaultOpen }, forwardedRef) {
  const { categories, freshId, focusReq, consumeFocus, addTask, archiveGoal, setGoalPrivate, partners } = useApp();
  const hasPartners = partners.partners.length > 0;
  const [open, setOpen] = useState(defaultOpen ?? g.id === freshId);
  const [text, setText] = useState('');
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
    setBusy(true);
    if (await addTask(g.id, text.trim())) setText('');
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
          <span className="inline-flex items-center gap-1 rounded-full border border-oat bg-soft px-2.5 py-0.5 text-[11px] font-bold text-muted shadow-sm" title="The period this goal is for"><CalendarRange className="h-3 w-3" aria-hidden="true" />{goalPeriodLabel(g)}</span>
          <span className={`inline-flex items-center gap-1 rounded-full border border-oat bg-soft px-2.5 py-0.5 text-[11px] font-bold shadow-sm ${due.cls}`}><CalendarClock className="h-3 w-3" aria-hidden="true" />{due.text}</span>
          {g.is_private && <span className="inline-flex items-center gap-1 rounded-full border border-oat bg-soft px-2.5 py-0.5 text-[11px] font-bold text-muted shadow-sm" title="Your partners cannot see this goal"><Lock className="h-3 w-3" aria-hidden="true" />Private</span>}
        </div>
      </button>

      <div className="px-4 pb-4 pt-1">
        <div className="flex items-baseline justify-between text-xs">
          <motion.span key={pct} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className="origin-left font-extrabold tabular-nums text-charcoal">{pct}% Completed</motion.span>
          <span className="font-semibold tabular-nums text-muted">{done}/{g.sub_plans.length} plans done</span>
        </div>
        <Bar pct={pct} height="h-2.5" className="mt-2" fill={p.bar} label={`Progress for ${g.title}`} />
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={`panel-${g.id}`} {...collapse} className="overflow-hidden">
            <div className="border-t border-oat bg-oat/40 px-2 pb-3 pt-2">
              {g.quote && <p className="px-2 pb-2 pt-1 text-xs italic text-muted">&ldquo;{g.quote}&rdquo;</p>}
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Plans to reach it</p>
              {g.sub_plans.length === 0 && <p className="px-2 pb-1 text-sm text-muted">No plans yet. What will you do to reach this goal?</p>}
              <ul className="grid gap-0.5">{g.sub_plans.map((t) => <TaskItem key={t.id} goal={g} task={t} />)}</ul>
              <form className="mt-2 flex gap-2 px-2" onSubmit={submitTask}>
                <label className="sr-only" htmlFor={`nt-${g.id}`}>New plan for this goal</label>
                <input id={`nt-${g.id}`} className="field !py-2" type="text" maxLength={500} placeholder="Add a plan, e.g. Save 10% of my income" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} required />
                <button type="submit" disabled={busy} aria-label="Add plan" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rust text-white shadow-md"><Plus className="h-4 w-4" aria-hidden="true" /></button>
              </form>
              <div className="mt-1 flex flex-wrap justify-end gap-1 px-2">
                <button type="button" onClick={() => setGoalPrivate(g.id, !g.is_private)} aria-pressed={g.is_private}
                  title={g.is_private ? 'Share this goal with your partners again' : 'Hide this goal from your partners'}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted hover:bg-oat/60 hover:text-charcoal">
                  {g.is_private ? <><Users className="h-3.5 w-3.5" aria-hidden="true" />Share with partners</> : <><Lock className="h-3.5 w-3.5" aria-hidden="true" />{hasPartners ? 'Make private' : 'Private'}</>}
                </button>
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
