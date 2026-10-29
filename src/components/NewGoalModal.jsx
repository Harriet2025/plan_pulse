import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { splitTaskLine } from '../lib/utils';

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

export default function NewGoalModal() {
  const { goalModal, closeGoalModal, createGoal, categories, activeCat } = useApp();
  // Captured once: during the exit animation the context's goalModal is already null
  const [draft] = useState(() => goalModal?.draft ?? null);
  const startCat = draft?.cat ? categories.find((c) => c.name === draft.cat)?.id : activeCat !== 'all' ? Number(activeCat) : categories[0].id;

  const [title, setTitle] = useState(draft?.title ?? '');
  const [category, setCategory] = useState(startCat ?? categories[0].id);
  const [due, setDue] = useState(draft?.due ?? '');   // the calendar opens this with a day already chosen
  const [priority, setPriority] = useState(draft?.priority ?? 'MEDIUM');
  const [timeframe, setTimeframe] = useState(draft?.timeframe ?? 'DAILY');
  const [quote, setQuote] = useState('');
  const [tasks, setTasks] = useState(draft?.tasks?.join('\n') ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeGoalModal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeGoalModal]);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      // A line like "Write the intro ~45m" becomes a task with a 45 minute estimate
      const lines = tasks.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const s = splitTaskLine(l); return s.estimate ? s : s.text; });
      await createGoal({ title, category_id: category, priority, timeframe, due_date: due || null, quote, tasks: lines });
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
            <div>
              <label htmlFor="gTitle" className={label}>Title</label>
              <input id="gTitle" className="field" type="text" maxLength={255} required autoFocus placeholder="e.g. Finish chapter 4 revision" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label htmlFor="gCategory" className={label}>Category</label>
                <select id="gCategory" className="field" value={category} onChange={(e) => setCategory(Number(e.target.value))}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="min-w-0">
                <label htmlFor="gDue" className={label}>Due date</label>
                <input id="gDue" className="field" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </div>
            </div>
            <Seg name="Priority" cols="grid-cols-3" value={priority} onChange={setPriority} options={[['HIGH', 'High'], ['MEDIUM', 'Medium'], ['LOW', 'Low']]} />
            <Seg name="Timeframe" cols="grid-cols-5 !gap-1.5" value={timeframe} onChange={setTimeframe} options={[['DAILY', 'Daily'], ['WEEKLY', 'Weekly'], ['MONTHLY', 'Month'], ['SEMESTER', 'Sem.'], ['YEARLY', 'Year']]} />
            <div>
              <label htmlFor="gQuote" className={label}>Your motivating quote <span className="normal-case tracking-normal text-muted">(optional)</span></label>
              <input id="gQuote" className="field" type="text" maxLength={500} placeholder="Words to push you on" value={quote} onChange={(e) => setQuote(e.target.value)} />
            </div>
            <div>
              <label htmlFor="gTasks" className={label}>Sub-tasks <span className="normal-case tracking-normal text-muted">(one per line, optional)</span></label>
              <textarea id="gTasks" className="field" rows={3} placeholder={'Outline the chapter ~45m\nPractice questions ~1h\nReview notes'} value={tasks} onChange={(e) => setTasks(e.target.value)} />
              <p className="mt-1.5 text-xs text-muted">Add <b className="text-charcoal">~30m</b> or <b className="text-charcoal">~1h</b> at the end of a line to say how long it takes. AuraGoal uses it to warn you when a day is too full.</p>
            </div>
          </div>

          {error && <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
          <button type="submit" disabled={saving} className="mt-5 w-full rounded-xl bg-rust py-3 text-sm font-extrabold text-white active:scale-[.99] disabled:opacity-60">
            {saving ? 'Saving…' : 'Create goal'}
          </button>
        </motion.form>
      </div>
    </div>
  );
}
