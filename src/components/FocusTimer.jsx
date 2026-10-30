import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Plus, Square, Timer } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { playSound } from '../lib/sound';
import { Bar } from './ui';

const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * The task started from "What should I do now?", counting down in a corner while you work. It stays while you move
 * around the app, rings when the time is up, and ticks the task off when you say you finished.
 */
export default function FocusTimer() {
  const { focus: live, setFocus, toggleTask, toggleDayPlan, toast } = useApp();
  // Keep the last task: while the timer animates away, the context's focus is already null
  const last = useRef(live);
  if (live) last.current = live;
  const focus = last.current;
  const [now, setNow] = useState(Date.now());
  const rang = useRef(false);
  useEffect(() => {
    rang.current = false;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [focus?.id, focus?.endsAt]);

  const left = focus.endsAt - now;
  const up = left <= 0;
  useEffect(() => { if (up && !rang.current) { rang.current = true; playSound('bell'); } }, [up]);

  const finish = async () => {
    if (focus.kind === 'goal') await toggleTask(focus.ref.goalId, focus.ref.taskId, true);
    else await toggleDayPlan(focus.ref.planId, focus.ref.key, true);
    setFocus(null);
    toast(`Nice work: "${focus.title}" is done.`);
  };
  const total = focus.minutes * 60000;
  const pct = Math.min(100, Math.round((100 * (total - Math.max(0, left))) / total));

  return (
    <motion.aside initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-24 right-3 z-[70] w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-rust/40 bg-soft p-3.5 shadow-xl md:bottom-5 md:right-5"
      style={{ boxShadow: '0 18px 40px -18px rgba(53,45,41,.45)' }} aria-label="Focus timer" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white ${up ? 'bg-success' : 'bg-rust'}`}><Timer className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{up ? 'Time is up' : 'Focusing on'}</p>
          <p className="truncate text-sm font-extrabold text-charcoal" title={focus.title}>{focus.title}</p>
          <p className="truncate text-[11px] text-muted">{focus.kind === 'day' ? 'Plan for today' : focus.context}</p>
        </div>
        <span className={`shrink-0 text-xl font-extrabold tabular-nums ${up ? 'text-success' : 'text-charcoal'}`}>{up ? '0:00' : mmss(left)}</span>
      </div>
      <Bar pct={pct} height="h-1.5" className="mt-2.5" fill={up ? 'bg-success' : 'bg-rust'} label="Time used" />
      {up && <p className="mt-2 text-xs font-semibold text-charcoal">Did you finish it?</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={finish} className="inline-flex items-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-xs font-extrabold text-white hover:opacity-90"><Check className="h-3.5 w-3.5" aria-hidden="true" />{up ? 'Yes, done' : 'I finished'}</button>
        <button type="button" onClick={() => setFocus({ ...focus, endsAt: Math.max(focus.endsAt, Date.now()) + 5 * 60000, minutes: focus.minutes + 5 })}
          className="inline-flex items-center gap-1 rounded-lg border border-oat px-2.5 py-1.5 text-xs font-bold text-charcoal hover:border-rust"><Plus className="h-3.5 w-3.5" aria-hidden="true" />5 min</button>
        <button type="button" onClick={() => setFocus(null)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-muted hover:bg-oat/60 hover:text-charcoal"><Square className="h-3 w-3" aria-hidden="true" />{up ? 'Not yet' : 'Stop'}</button>
      </div>
    </motion.aside>
  );
}
