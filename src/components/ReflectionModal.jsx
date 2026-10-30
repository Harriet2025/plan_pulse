import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BookHeart, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { horizonOf } from '../lib/constants';
import { parseDay, periodLabel } from '../lib/utils';
import { GOAL_PROMPTS, GuidedForm } from './JournalParts';

/** Writing down how a goal went: the ups and downs, how it was achieved, and the lessons learnt. */
export default function ReflectionModal() {
  const { reflectGoal, closeReflection, goals, journal, saveJournal } = useApp();
  // Captured once: the context value is cleared while this animates out
  const [goalId] = useState(reflectGoal);
  const goal = goals.find((g) => g.id === goalId);
  const entry = journal.find((e) => e.kind === 'GOAL' && e.goal_id === goalId);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeReflection(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeReflection]);

  if (!goal) return null;
  const done = goal.sub_plans.filter((t) => t.done).length;
  return (
    <div className="fixed inset-0 z-40">
      <motion.div className="absolute inset-0 bg-charcoal/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeReflection} />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center md:items-center md:p-6">
        <motion.div role="dialog" aria-modal="true" aria-labelledby="reflectTitle"
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="pointer-events-auto max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-b-0 border-oat bg-soft p-5 md:rounded-3xl md:border-b md:p-7"
          style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-success text-white"><BookHeart className="h-5 w-5" aria-hidden="true" /></span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Reflection · {horizonOf(goal.timeframe).label} goal{goal.due_date ? ` · ${periodLabel(goal.timeframe, parseDay(goal.due_date))}` : ''}</p>
                <h2 id="reflectTitle" className="text-lg font-extrabold leading-snug text-charcoal">{goal.title}</h2>
                <p className="text-xs text-muted">{done} of {goal.sub_plans.length} plans done{goal.status === 'COMPLETED' ? ' · completed 🎉' : ''}</p>
              </div>
            </div>
            <button type="button" onClick={closeReflection} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-oat/60"><X className="h-5 w-5" aria-hidden="true" /></button>
          </div>
          {goal.status === 'COMPLETED' && !entry && (
            <p className="mt-3 rounded-xl bg-success/10 px-3 py-2 text-sm font-semibold text-success">You did it! Take a minute to write down how it went, while it is fresh. It goes into your private journal.</p>
          )}
          <div className="mt-4">
            <GuidedForm prompts={GOAL_PROMPTS} entry={entry} saveLabel={entry ? 'Save changes' : 'Save reflection'} onCancel={closeReflection} cancelLabel={entry ? 'Cancel' : 'Maybe later'}
              onSave={async ({ answers, mood, body }) => {
                if (await saveJournal({ id: entry?.id, kind: 'GOAL', goal_id: goal.id, title: goal.title, answers, mood, body })) closeReflection();
              }} />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
