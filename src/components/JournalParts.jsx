import { useState } from 'react';
import { BookHeart, NotebookPen, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { horizonOf } from '../lib/constants';
import { cn, localDate, parseDay, periodLabel } from '../lib/utils';
import { TwoTapButton } from './ui';

export const MOODS = [
  { v: 1, emoji: '😞', label: 'Hard' },
  { v: 2, emoji: '😕', label: 'Low' },
  { v: 3, emoji: '😐', label: 'Okay' },
  { v: 4, emoji: '🙂', label: 'Good' },
  { v: 5, emoji: '😄', label: 'Great' },
];
export const moodOf = (v) => MOODS.find((m) => m.v === v);

/** The guided questions, by kind of reflection. Keys match PROMPT_KEYS in backend/api/journal.php. */
export const GOAL_PROMPTS = [
  ['went', 'How did it go?', 'In a few words, how did this goal go overall?'],
  ['ups', 'The ups', 'What went well? What are you proud of?'],
  ['downs', 'The downs', 'What was hard, or did not go to plan?'],
  ['how', 'How you achieved it', 'What helped most: a habit, a person, a change you made?'],
  ['lessons', 'Lessons learnt', 'What will you do the same, or differently, next time?'],
];
export const PERIOD_PROMPTS = [
  ['wins', 'Wins', 'What went well? Big or small.'],
  ['challenges', 'Challenges', 'What was hard, and how did you handle it?'],
  ['lessons', 'Lessons', 'What did you learn about yourself or how you work?'],
  ['next', 'Next focus', 'What matters most in the next one?'],
];

export function MoodPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Mood">
      {MOODS.map((m) => (
        <button key={m.v} type="button" role="radio" aria-checked={value === m.v} onClick={() => onChange(value === m.v ? null : m.v)}
          className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold transition-colors', value === m.v ? 'border-rust bg-rust/10 text-rust-dark' : 'border-oat bg-soft text-muted hover:border-blush')}>
          <span className="text-base leading-none" aria-hidden="true">{m.emoji}</span>{m.label}
        </button>
      ))}
    </div>
  );
}

/** Guided questions plus a mood, for a goal or a period. `entry` fills it in when there is one already. */
export function GuidedForm({ prompts, entry, onSave, onCancel, saveLabel = 'Save reflection', cancelLabel = 'Cancel', extra }) {
  const [answers, setAnswers] = useState(() => ({ ...(entry?.answers ?? {}) }));
  const [mood, setMood] = useState(entry?.mood ?? null);
  const [body, setBody] = useState(entry?.body ?? '');
  const [busy, setBusy] = useState(false);
  const filled = Object.values(answers).some((v) => v?.trim()) || body.trim();
  const save = async (e) => {
    e.preventDefault();
    if (!filled) return;
    setBusy(true);
    await onSave({ answers, mood, body });
    setBusy(false);
  };
  return (
    <form onSubmit={save} className="grid gap-3">
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">How do you feel about it?</p>
        <MoodPicker value={mood} onChange={setMood} />
      </div>
      {prompts.map(([k, title, hint]) => (
        <label key={k} className="block">
          <span className="text-sm font-extrabold text-charcoal">{title}</span>
          <textarea className="field mt-1 min-h-[4.5rem]" rows={2} maxLength={5000} placeholder={hint} value={answers[k] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [k]: e.target.value }))} />
        </label>
      ))}
      <label className="block">
        <span className="text-sm font-extrabold text-charcoal">Anything else</span> <span className="text-xs text-muted">(optional)</span>
        <textarea className="field mt-1 min-h-[4rem]" rows={2} maxLength={20000} placeholder="Notes, thoughts, a quote that kept you going…" value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      {extra}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy || !filled} className="rounded-xl bg-rust px-5 py-2.5 text-sm font-extrabold text-white hover:bg-rust-dark disabled:opacity-50">{busy ? 'Saving…' : saveLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} className="rounded-xl px-3 py-2.5 text-sm font-bold text-muted hover:bg-oat/60 hover:text-charcoal">{cancelLabel}</button>}
        <span className="text-xs text-muted">Private: your partners never see your journal.</span>
      </div>
    </form>
  );
}

/** A free note for a day: optional title, mood and the writing itself. */
export function NoteEditor({ entry, defaultDate, onDone }) {
  const { saveJournal } = useApp();
  const [title, setTitle] = useState(entry?.title ?? '');
  const [body, setBody] = useState(entry?.body ?? '');
  const [mood, setMood] = useState(entry?.mood ?? null);
  const [date, setDate] = useState(entry?.date ?? defaultDate ?? localDate());
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (!body.trim() && !title.trim()) return;
    setBusy(true);
    if (await saveJournal({ id: entry?.id, kind: 'NOTE', title, body, mood, date })) { if (!entry) { setTitle(''); setBody(''); setMood(null); } onDone?.(); }
    setBusy(false);
  };
  return (
    <form onSubmit={save} className="grid gap-2.5" aria-label={entry ? 'Edit note' : 'New note'}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input className="field !py-2" maxLength={150} placeholder="Title (optional)" aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="date" className="field !w-auto !py-2" aria-label="Day" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>
      <textarea className="field min-h-[7rem]" rows={4} maxLength={20000} aria-label="Your note" placeholder="What happened today? How are you feeling about your goals?" value={body} onChange={(e) => setBody(e.target.value)} />
      <MoodPicker value={mood} onChange={setMood} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy || (!body.trim() && !title.trim())} className="rounded-xl bg-rust px-5 py-2.5 text-sm font-extrabold text-white hover:bg-rust-dark disabled:opacity-50">{busy ? 'Saving…' : entry ? 'Save changes' : 'Save note'}</button>
        {onDone && entry && <button type="button" onClick={onDone} className="rounded-xl px-3 py-2.5 text-sm font-bold text-muted hover:bg-oat/60 hover:text-charcoal">Cancel</button>}
      </div>
    </form>
  );
}

/** The reflection on a week, month or year: shown when there is one, the form otherwise (or while editing). */
export function PeriodReflection({ horizon, periodStartKey, label }) {
  const { journal, saveJournal, deleteJournal } = useApp();
  const entry = journal.find((e) => e.kind === 'REVIEW' && e.period === horizon && e.period_key === periodStartKey);
  const [editing, setEditing] = useState(false);
  const unit = horizonOf(horizon).unit;

  if (entry && !editing) {
    const m = moodOf(entry.mood);
    return (
      <div className="rounded-2xl border border-oat bg-soft p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-extrabold text-charcoal"><Sparkles className="h-4 w-4 text-rust-dark" aria-hidden="true" />Your reflection on {label}{m && <span title={m.label}>{m.emoji}</span>}</p>
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={() => setEditing(true)} aria-label="Edit the reflection" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-oat/60 hover:text-charcoal"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
            <TwoTapButton onConfirm={() => deleteJournal(entry.id)} icon={Trash2} label="Delete the reflection" confirmText="Delete?" className="rounded-lg px-2 text-xs font-bold text-muted hover:bg-danger/10 hover:text-danger" />
          </div>
        </div>
        <Answers prompts={PERIOD_PROMPTS} entry={entry} />
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-rust/30 bg-soft p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-extrabold text-charcoal"><NotebookPen className="h-4 w-4 text-rust-dark" aria-hidden="true" />Reflect on {label}</p>
      <GuidedForm prompts={PERIOD_PROMPTS} entry={entry} saveLabel={entry ? 'Save changes' : `Save my ${unit} reflection`} onCancel={entry ? () => setEditing(false) : undefined}
        onSave={async ({ answers, mood, body }) => {
          if (await saveJournal({ id: entry?.id, kind: 'REVIEW', period: horizon, period_key: periodStartKey, title: label, answers, mood, body })) setEditing(false);
        }} />
    </div>
  );
}

/** The answered prompts of a reflection, then its free text. */
export function Answers({ prompts, entry }) {
  return (
    <dl className="mt-2 grid gap-2">
      {prompts.filter(([k]) => entry.answers?.[k]).map(([k, title]) => (
        <div key={k}>
          <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">{title}</dt>
          <dd className="whitespace-pre-wrap break-words text-sm text-charcoal">{entry.answers[k]}</dd>
        </div>
      ))}
      {entry.body && <div><dt className="text-[11px] font-bold uppercase tracking-wider text-muted">Notes</dt><dd className="whitespace-pre-wrap break-words text-sm text-charcoal">{entry.body}</dd></div>}
    </dl>
  );
}

/** One entry in the journal's timeline: a note, a period reflection or a goal reflection. */
export function EntryCard({ entry }) {
  const { goals, deleteJournal, openReflection } = useApp();
  const [editing, setEditing] = useState(false);
  const m = moodOf(entry.mood);
  const goal = entry.kind === 'GOAL' ? goals.find((g) => g.id === entry.goal_id) : null;
  const when = parseDay(entry.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  if (editing && entry.kind === 'NOTE') return <article className="rounded-2xl border border-rust/40 bg-soft p-4"><NoteEditor entry={entry} onDone={() => setEditing(false)} /></article>;

  const tag = entry.kind === 'GOAL' ? { icon: BookHeart, text: 'Goal reflection', cls: 'bg-success/10 text-success' }
    : entry.kind === 'REVIEW' ? { icon: Sparkles, text: `${horizonOf(entry.period).label} reflection · ${periodLabel(entry.period, parseDay(entry.period_key))}`, cls: 'bg-rust/10 text-rust-dark' }
    : { icon: NotebookPen, text: 'Note', cls: 'bg-oat text-charcoal' };
  return (
    <article className="rounded-2xl border border-oat bg-soft p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold', tag.cls)}><tag.icon className="h-3 w-3" aria-hidden="true" />{tag.text}</span>
        <span className="text-xs font-semibold text-muted">{when}</span>
        {m && <span className="text-base leading-none" title={m.label} aria-label={`Mood: ${m.label}`}>{m.emoji}</span>}
        <span className="ml-auto flex gap-1">
          <button type="button" onClick={() => (entry.kind === 'GOAL' ? openReflection(entry.goal_id) : setEditing(true))} aria-label="Edit"
            className={cn('grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-oat/60 hover:text-charcoal', entry.kind === 'REVIEW' && 'hidden')}><Pencil className="h-4 w-4" aria-hidden="true" /></button>
          <TwoTapButton onConfirm={() => deleteJournal(entry.id)} icon={Trash2} label="Delete this entry" confirmText="Delete?" className="rounded-lg px-2 text-xs font-bold text-muted hover:bg-danger/10 hover:text-danger" />
        </span>
      </div>
      {(entry.title || goal) && <h3 className="mt-2 break-words text-base font-extrabold text-charcoal">{entry.kind === 'GOAL' ? goal?.title ?? entry.title : entry.title}</h3>}
      {entry.kind === 'NOTE'
        ? entry.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-charcoal">{entry.body}</p>
        : <Answers prompts={entry.kind === 'GOAL' ? GOAL_PROMPTS : PERIOD_PROMPTS} entry={entry} />}
    </article>
  );
}
