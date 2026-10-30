import { forwardRef, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookHeart, CalendarClock, CalendarRange, Check, ChevronDown, Lock, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PRIORITY, catIcon } from '../lib/constants';
import { dueInfo, goalPeriodLabel, progressOf } from '../lib/utils';
import { Bar, TwoTapButton, cardShadow } from './ui';

const collapse = { initial: { height: 0, opacity: 0 }, animate: { height: 'auto', opacity: 1 }, exit: { height: 0, opacity: 0 }, transition: { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] } };
const SHOWN = 6;   // plans listed before "Show all"

/** One of a goal's plans: tick it when it is done, rename it, or delete it. */
function TaskItem({ goal, task }) {
  const { toggleTask, deleteTask, renameTask } = useApp();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.text);
  const save = async () => {
    const t = text.trim();
    if (!t || t === task.text) { setEditing(false); setText(task.text); return; }
    if (await renameTask(task.id, t)) setEditing(false);
  };

  if (editing) {
    return (
      <li className="flex items-center gap-2 px-1 py-1">
        <label className="sr-only" htmlFor={`rn-${task.id}`}>Rename plan</label>
        <input id={`rn-${task.id}`} className="field !py-1.5" maxLength={500} value={text} autoFocus onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { setEditing(false); setText(task.text); } }} />
        <button type="button" onClick={save} aria-label="Save the new name" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rust text-white hover:bg-rust-dark"><Check className="h-4 w-4" aria-hidden="true" /></button>
        <button type="button" onClick={() => { setEditing(false); setText(task.text); }} aria-label="Cancel" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-oat/60"><X className="h-4 w-4" aria-hidden="true" /></button>
      </li>
    );
  }
  const quiet = 'shrink-0 rounded-lg p-1.5 text-muted opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100';
  return (
    <li className="group flex items-start">
      <label className="relative flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-xl px-2 py-[.5rem] hover:bg-oat/50">
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
      {/* These show on hover or focus with a mouse, and are always there on a touch screen */}
      <button type="button" onClick={() => setEditing(true)} aria-label={`Rename the plan "${task.text}"`} className={`${quiet} mt-1 hover:bg-oat/60 hover:text-charcoal`}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
      <TwoTapButton onConfirm={() => deleteTask(task.id)} icon={Trash2} label={`Delete the plan "${task.text}"`} confirmText="Delete?"
        className={`${quiet} mt-1 px-2 text-xs font-bold hover:bg-danger/10 hover:text-danger`} armedClassName="!opacity-100 bg-danger/10 text-danger" />
    </li>
  );
}

// forwardRef: AnimatePresence (popLayout) needs a ref to the card to animate it out
const GoalCard = forwardRef(function GoalCard({ goal: g, defaultOpen }, forwardedRef) {
  const { categories, freshId, focusReq, consumeFocus, addTask, deleteGoal, setGoalPrivate, partners, openGoalEditor, openReflection, journal } = useApp();
  const hasPartners = partners.partners.length > 0;
  const [open, setOpen] = useState(defaultOpen ?? g.id === freshId);   // the extra tools: add a plan, edit, reflect, private, delete
  const [showAll, setShowAll] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
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
  const reflection = journal.find((e) => e.kind === 'GOAL' && e.goal_id === g.id);
  const plans = showAll ? g.sub_plans : g.sub_plans.slice(0, SHOWN);

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

  const submitTask = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    if (await addTask(g.id, text.trim())) setText('');
    setBusy(false);
  };
  const tool = 'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted hover:bg-oat/60 hover:text-charcoal';

  return (
    <motion.article
      ref={setRef} layout="position"
      initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.25 } }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      className={`relative overflow-hidden rounded-3xl border-2 bg-soft ${p.card}`}
      style={cardShadow}
    >
      <div className="relative p-4 pb-3" style={{ background: `${color}14` }}>
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
          <button type="button" onClick={() => openGoalEditor(g)} aria-label={`Edit the goal "${g.title}"`} title="Edit goal"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-soft hover:text-charcoal"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-oat bg-soft px-2.5 py-0.5 text-[11px] font-bold text-muted shadow-sm" title="The period this goal is for"><CalendarRange className="h-3 w-3" aria-hidden="true" />{goalPeriodLabel(g)}</span>
          <span className={`inline-flex items-center gap-1 rounded-full border border-oat bg-soft px-2.5 py-0.5 text-[11px] font-bold shadow-sm ${due.cls}`}><CalendarClock className="h-3 w-3" aria-hidden="true" />{due.text}</span>
          {g.is_private && <span className="inline-flex items-center gap-1 rounded-full border border-oat bg-soft px-2.5 py-0.5 text-[11px] font-bold text-muted shadow-sm" title="Your partners cannot see this goal"><Lock className="h-3 w-3" aria-hidden="true" />Private</span>}
        </div>
      </div>

      <div className="px-4 pt-2">
        <div className="flex items-baseline justify-between text-xs">
          <motion.span key={pct} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className="origin-left font-extrabold tabular-nums text-charcoal">{pct}% Completed</motion.span>
          <span className="font-semibold tabular-nums text-muted">{done}/{g.sub_plans.length} plans done</span>
        </div>
        <Bar pct={pct} height="h-2.5" className="mt-2" fill={p.bar} label={`Progress for ${g.title}`} />
      </div>

      {/* The plans, always in view, each with a box to tick */}
      <div className="px-2 pb-1 pt-2">
        {g.quote && <p className="px-2 pb-1 text-xs italic text-muted">&ldquo;{g.quote}&rdquo;</p>}
        {g.sub_plans.length === 0
          ? <p className="px-2 py-1 text-sm text-muted">No plans yet. Open <b>More</b> to add the steps that reach this goal.</p>
          : <ul className="grid gap-0.5" aria-label={`Plans for ${g.title}`}>{plans.map((t) => <TaskItem key={t.id} goal={g} task={t} />)}</ul>}
        {g.sub_plans.length > SHOWN && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="px-2 py-1 text-xs font-bold text-rust-dark hover:underline">
            {showAll ? 'Show fewer' : `Show all ${g.sub_plans.length} plans`}
          </button>
        )}
      </div>

      {g.status === 'COMPLETED' && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2 text-xs font-semibold text-success">
          <BookHeart className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{reflection ? 'You wrote a reflection on this goal.' : 'Done! How did it go? Capture it while it is fresh.'}</span>
          <button type="button" onClick={() => openReflection(g.id)} className="rounded-lg bg-success px-2.5 py-1 text-[11px] font-extrabold text-white hover:opacity-90">{reflection ? 'Read' : 'Reflect'}</button>
        </div>
      )}

      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={`panel-${g.id}`}
        className="flex w-full items-center justify-center gap-1 border-t border-oat/70 py-1.5 text-[11px] font-bold text-muted hover:bg-oat/40 hover:text-charcoal">
        {open ? 'Less' : 'More'}<motion.span animate={{ rotate: open ? 180 : 0 }}><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /></motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={`panel-${g.id}`} {...collapse} className="overflow-hidden">
            <div className="border-t border-oat bg-oat/40 px-2 pb-3 pt-2">
              <form className="flex gap-2 px-2" onSubmit={submitTask}>
                <label className="sr-only" htmlFor={`nt-${g.id}`}>New plan for this goal</label>
                <input id={`nt-${g.id}`} className="field !py-2" type="text" maxLength={500} placeholder="Add a plan, e.g. Save 10% of my income" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} required />
                <button type="submit" disabled={busy} aria-label="Add plan" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rust text-white shadow-md"><Plus className="h-4 w-4" aria-hidden="true" /></button>
              </form>
              <div className="mt-1 flex flex-wrap justify-end gap-1 px-2">
                <button type="button" onClick={() => openGoalEditor(g)} className={tool}><Pencil className="h-3.5 w-3.5" aria-hidden="true" />Edit goal</button>
                <button type="button" onClick={() => openReflection(g.id)} className={tool}><BookHeart className="h-3.5 w-3.5" aria-hidden="true" />{reflection ? 'Reflection' : 'Reflect'}</button>
                <button type="button" onClick={() => setGoalPrivate(g.id, !g.is_private)} aria-pressed={g.is_private}
                  title={g.is_private ? 'Share this goal with your partners again' : 'Hide this goal from your partners'} className={tool}>
                  {g.is_private ? <><Users className="h-3.5 w-3.5" aria-hidden="true" />Share with partners</> : <><Lock className="h-3.5 w-3.5" aria-hidden="true" />{hasPartners ? 'Make private' : 'Private'}</>}
                </button>
                <TwoTapButton onConfirm={() => deleteGoal(g.id)} icon={Trash2} label="Delete this goal and its plans for good" confirmText="Tap again to delete for good"
                  className="rounded-lg px-2 py-1.5 text-xs font-semibold text-muted hover:bg-danger/10 hover:text-danger">Delete goal</TwoTapButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
});

export default GoalCard;
