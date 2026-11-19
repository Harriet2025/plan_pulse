import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, ArrowLeft, ArrowRight, Check, CornerDownRight, Moon, Plus, SkipForward, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { horizonOf } from '../lib/constants';
import { addDays, cn, localDate, parseDay, periodEnd, periodKey, periodLabel, periodPhrase, periodStart, plansOn, shiftPeriod } from '../lib/utils';
import { MoodPicker, PERIOD_PROMPTS } from './JournalParts';
import { Bar } from './ui';
import { WIND_TITLE, markWindDownDone, windKey } from '../lib/winddown';

// The wind-down: a few calm minutes to close a day, a week, a month or a year.
//   Evening (DAILY): tick off today, move or let go of what is left, a mood and a line or two, then set up tomorrow.
//   Week / month / year: look back at that period's own goals, decide what happens to the unfinished ones, reflect
//   (the same reflection the Planner's review shows), and set the goals for the next one.
// What you write is saved to your journal (private). A finished evening wind-down is remembered for the day.

const markDone = markWindDownDone;

// ---- Small shared pieces ----------------------------------------------------------------------------------------

function Steps({ names, at }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Steps">
      {names.map((n, i) => (
        <li key={n} className="flex items-center gap-1.5" aria-current={i === at ? 'step' : undefined}>
          <span className={cn('h-1.5 rounded-full transition-all', i === at ? 'w-6 bg-rust' : i < at ? 'w-3 bg-rust/50' : 'w-3 bg-oat')} />
          <span className="sr-only">{n}{i < at ? ' (done)' : ''}</span>
        </li>
      ))}
    </ol>
  );
}

function Tick({ on, onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label}
      className={cn('grid h-[1.3rem] w-[1.3rem] shrink-0 place-items-center rounded-[6px] border-[1.5px] transition-colors', on ? 'border-success bg-success text-on-status' : 'border-charcoal/30 bg-soft hover:border-rust')}>
      {on && <Check className="h-3.5 w-3.5" strokeWidth={3.5} aria-hidden="true" />}
    </button>
  );
}

const Label = ({ children }) => <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.14em] text-muted">{children}</p>;
const small = 'inline-flex items-center gap-1 rounded-lg border border-oat bg-soft px-2 py-1 text-[12px] font-semibold text-charcoal hover:border-rust disabled:opacity-50';

function QuickAdd({ placeholder, onAdd, withTime }) {
  const [text, setText] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    if (await onAdd(text.trim(), time || null)) { setText(''); setTime(''); }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 rounded-xl border border-oat bg-ivory p-1.5 focus-within:border-rust">
      <Plus className="ml-1.5 h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={255} placeholder={placeholder} aria-label={placeholder}
        className="min-w-[10rem] flex-1 bg-transparent py-1.5 text-[15px] text-charcoal outline-none placeholder:text-faint" />
      {withTime && <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time (optional)" className="rounded-md border border-oat bg-soft px-1.5 py-1 text-sm text-charcoal" />}
      <button type="submit" disabled={busy || !text.trim()} className="rounded-lg bg-rust px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50">Add</button>
    </form>
  );
}

// ---- Evening ----------------------------------------------------------------------------------------------------

function useEvening() {
  const { dayPlans, goals, now, toggleDayPlan, skipDayPlan, editDayPlan, addDayPlan, saveJournal, journal } = useApp();
  const today = localDate(now), tomorrow = localDate(addDays(now, 1));
  const todayList = plansOn(dayPlans, today), tomorrowList = plansOn(dayPlans, tomorrow);
  const stepsToday = goals.flatMap((g) => g.sub_plans.filter((t) => t.done && t.doneAt && localDate(new Date(t.doneAt)) === today).map((t) => ({ ...t, goal: g.title })));
  const existing = journal.find((e) => e.kind === 'NOTE' && e.title === WIND_TITLE && e.date === today);
  const [mood, setMood] = useState(existing?.mood ?? null);
  const [win, setWin] = useState(existing?.answers?.win ?? '');
  const [blocker, setBlocker] = useState(existing?.answers?.blocker ?? '');

  const today$ = (
    <div className="grid gap-4">
      <div>
        <Label>Today's plans · {todayList.filter((x) => x.done).length} of {todayList.length} done</Label>
        {todayList.length === 0 ? <p className="text-sm text-muted">Nothing was planned for today.</p> : (
          <ul className="grid gap-1.5">
            {todayList.map((x) => (
              <li key={x.plan.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-oat px-3 py-2">
                <Tick on={x.done} onClick={() => toggleDayPlan(x.plan.id, today, !x.done)} label={`${x.done ? 'Not done' : 'Done'}: ${x.plan.title}`} />
                <span className={cn('min-w-0 flex-1 break-words text-[15px]', x.done ? 'text-muted line-through' : 'text-charcoal')}>{x.plan.title}</span>
                {!x.done && (
                  <span className="flex gap-1.5">
                    {x.plan.repeat === 'NONE' && <button type="button" className={small} onClick={() => editDayPlan(x.plan.id, { date: tomorrow })}><CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />Tomorrow</button>}
                    <button type="button" className={small} onClick={() => skipDayPlan(x.plan.id, today)}><SkipForward className="h-3.5 w-3.5" aria-hidden="true" />Let go</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {stepsToday.length > 0 && (
        <div>
          <Label>Goal steps you finished today</Label>
          <ul className="grid gap-1">{stepsToday.map((t) => <li key={t.id} className="flex items-center gap-2 text-sm text-charcoal"><Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />{t.text}<span className="truncate text-muted">· {t.goal}</span></li>)}</ul>
        </div>
      )}
    </div>
  );

  const reflect$ = (
    <div className="grid gap-4">
      <div><Label>How was today?</Label><MoodPicker value={mood} onChange={setMood} /></div>
      <label className="block"><Label>One thing that went well</Label>
        <textarea className="field min-h-[4rem]" rows={2} maxLength={2000} value={win} onChange={(e) => setWin(e.target.value)} placeholder="Big or small. It counts." /></label>
      <label className="block"><Label>What got in the way? (optional)</Label>
        <textarea className="field min-h-[4rem]" rows={2} maxLength={2000} value={blocker} onChange={(e) => setBlocker(e.target.value)} placeholder="Name it, so tomorrow can go differently." /></label>
    </div>
  );

  const tomorrow$ = (
    <div className="grid gap-4">
      <div>
        <Label>Tomorrow · {tomorrowList.length} plan{tomorrowList.length === 1 ? '' : 's'}</Label>
        {tomorrowList.length === 0 ? <p className="mb-2 text-sm text-muted">Nothing planned yet. Add the one or two things that matter most.</p> : (
          <ul className="mb-3 grid gap-1">
            {tomorrowList.map((x) => <li key={x.plan.id} className="flex items-center gap-2 text-[15px] text-charcoal"><span className="h-1.5 w-1.5 rounded-full bg-rust" aria-hidden="true" />{x.plan.title}{x.start && <span className="text-sm text-muted">· {x.start}</span>}</li>)}
          </ul>
        )}
        <QuickAdd withTime placeholder="Add a plan for tomorrow" onAdd={(title, start) => addDayPlan({ title, date: tomorrow, ...(start ? { start } : {}) }, 'Added to tomorrow.')} />
      </div>
    </div>
  );

  const doneCount = todayList.filter((x) => x.done).length;
  const summary = { line: todayList.length ? `${doneCount} of ${todayList.length} plans done today${stepsToday.length ? `, plus ${stepsToday.length} goal step${stepsToday.length === 1 ? '' : 's'}` : ''}.` : 'A day without plans is a rest too.', perfect: todayList.length > 0 && doneCount === todayList.length };
  const save = async () => {
    if (mood || win.trim() || blocker.trim()) {
      const body = [win.trim() && `Went well: ${win.trim()}`, blocker.trim() && `Got in the way: ${blocker.trim()}`].filter(Boolean).join('\n\n') || 'Wound down for the day.';
      await saveJournal({ id: existing?.id, kind: 'NOTE', title: WIND_TITLE, date: today, mood, body, answers: { win, blocker } });
    }
    markDone(windKey('DAILY', now));
  };
  return { steps: [['Today', today$], ['Reflect', reflect$], ['Tomorrow', tomorrow$]], summary, save, title: 'Wind down your day', sub: now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) };
}

// ---- Week, month, year -------------------------------------------------------------------------------------------

function usePeriod(horizon, anchor) {
  const { goals, dayPlans, now, toggleTask, updateGoal, archiveGoal, createGoal, saveJournal, journal } = useApp();
  const unit = horizonOf(horizon).unit;
  const key = periodKey(horizon, anchor);
  const next = shiftPeriod(horizon, anchor, 1);
  const name = periodPhrase(periodLabel(horizon, anchor, now));
  // Only this period's own goals (a week's wind-down never counts the month's goals, and so on)
  const mine = goals.filter((g) => g.timeframe === horizon && g.status !== 'ARCHIVED' && g.due_date && periodKey(horizon, parseDay(g.due_date)) === key);
  const nextGoals = goals.filter((g) => g.timeframe === horizon && g.status === 'ACTIVE' && g.due_date && periodKey(horizon, parseDay(g.due_date)) === periodKey(horizon, next));
  const open = mine.filter((g) => g.status !== 'COMPLETED');
  const steps = { done: mine.reduce((n, g) => n + g.sub_plans.filter((t) => t.done).length, 0), total: mine.reduce((n, g) => n + g.sub_plans.length, 0) };
  const pct = steps.total ? Math.round((100 * steps.done) / steps.total) : 0;
  // Day plans across the period up to today, and perfect days
  const days = useMemo(() => {
    let done = 0, total = 0, perfect = 0;
    const last = localDate(periodEnd(horizon, anchor)) < localDate(now) ? periodEnd(horizon, anchor) : now;
    for (let d = periodStart(horizon, anchor); localDate(d) <= localDate(last); d = addDays(d, 1)) {
      const l = plansOn(dayPlans, localDate(d));
      total += l.length; done += l.filter((x) => x.done).length;
      if (l.length && l.every((x) => x.done)) perfect += 1;
    }
    return { done, total, perfect };
  }, [dayPlans, horizon, anchor, now]);
  const existing = journal.find((e) => e.kind === 'REVIEW' && e.period === horizon && e.period_key === key);
  const [answers, setAnswers] = useState(() => ({ ...(existing?.answers ?? {}) }));
  const [mood, setMood] = useState(existing?.mood ?? null);
  const [moved, setMoved] = useState({});   // goal id → 'next' | 'archived'

  const look$ = (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[[`${pct}%`, 'of goal steps'], [`${mine.filter((g) => g.status === 'COMPLETED').length}/${mine.length}`, 'goals finished'], [days.perfect, 'perfect days']].map(([v, k]) => (
          <div key={k} className="rounded-lg border border-oat px-2 py-3"><div className="text-xl font-extrabold tabular-nums text-charcoal">{v}</div><div className="text-[12px] text-muted">{k}</div></div>
        ))}
      </div>
      {mine.length === 0 ? <p className="text-sm text-muted">You had no {horizon.toLowerCase()} goals for {name}. Day plans: {days.done} of {days.total} done.</p> : (
        <div>
          <Label>Your {horizon.toLowerCase()} goals · tick anything you did but did not mark</Label>
          <ul className="grid gap-3">
            {mine.map((g) => {
              const d = g.sub_plans.filter((t) => t.done).length;
              return (
                <li key={g.id} className="rounded-lg border border-oat p-3">
                  <div className="flex items-center gap-3">
                    <p className={cn('min-w-0 flex-1 break-words text-[15px] font-bold', g.status === 'COMPLETED' ? 'text-success' : 'text-charcoal')}>{g.title}{g.status === 'COMPLETED' && ' ✓'}</p>
                    <span className="text-xs font-semibold tabular-nums text-muted">{d}/{g.sub_plans.length}</span>
                  </div>
                  <Bar pct={g.sub_plans.length ? Math.round((100 * d) / g.sub_plans.length) : 0} height="h-1" className="mt-2" fill={g.status === 'COMPLETED' ? 'bg-success' : 'bg-rust'} label={`${g.title} progress`} />
                  <ul className="mt-2 grid gap-1">
                    {g.sub_plans.map((t) => (
                      <li key={t.id} className="flex items-center gap-2.5">
                        <Tick on={t.done} onClick={() => toggleTask(g.id, t.id, !t.done)} label={`${t.done ? 'Not done' : 'Done'}: ${t.text}`} />
                        <span className={cn('min-w-0 flex-1 text-sm', t.done ? 'text-muted line-through' : 'text-charcoal')}>{t.text}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[13px] text-muted">Day plans in {name}: {days.done} of {days.total} done.</p>
        </div>
      )}
    </div>
  );

  const nextDue = localDate(periodEnd(horizon, next));
  const carry$ = (
    <div>
      <Label>What happens to the unfinished ones?</Label>
      {open.length === 0 ? <p className="text-sm text-muted">{mine.length ? 'Every goal is finished. Well done.' : `Nothing unfinished for ${name}.`}</p> : (
        <ul className="grid gap-2">
          {open.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-oat px-3 py-2.5">
              <span className="min-w-0 flex-1 break-words text-[15px] text-charcoal">{g.title}<span className="ml-2 text-xs text-muted">{g.sub_plans.filter((t) => t.done).length}/{g.sub_plans.length} steps</span></span>
              {moved[g.id] ? <span className="text-[13px] font-semibold text-success">{moved[g.id] === 'next' ? `Moved to next ${unit}` : 'Archived'}</span> : (
                <span className="flex gap-1.5">
                  <button type="button" className={small} onClick={async () => { await updateGoal(g.id, { due_date: nextDue }); setMoved((m) => ({ ...m, [g.id]: 'next' })); }}><CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />Next {unit}</button>
                  <button type="button" className={small} onClick={async () => { await archiveGoal(g.id); setMoved((m) => ({ ...m, [g.id]: 'archived' })); }}><Archive className="h-3.5 w-3.5" aria-hidden="true" />Let it go</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {open.length > 0 && <p className="mt-2 text-[13px] text-muted">Leave one as it is and it stays under {name} as unfinished.</p>}
    </div>
  );

  const reflect$ = (
    <div className="grid gap-4">
      <div><Label>How do you feel about {name}?</Label><MoodPicker value={mood} onChange={setMood} /></div>
      {PERIOD_PROMPTS.map(([k, title, hint]) => (
        <label key={k} className="block"><Label>{title}</Label>
          <textarea className="field min-h-[3.75rem]" rows={2} maxLength={5000} placeholder={hint} value={answers[k] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [k]: e.target.value }))} /></label>
      ))}
    </div>
  );

  const nextName = periodPhrase(periodLabel(horizon, next, now));
  const next$ = (
    <div>
      <Label>Goals for {nextName}</Label>
      {nextGoals.length > 0 && <ul className="mb-3 grid gap-1">{nextGoals.map((g) => <li key={g.id} className="flex items-center gap-2 text-[15px] text-charcoal"><span className="h-1.5 w-1.5 rounded-full bg-rust" aria-hidden="true" />{g.title}</li>)}</ul>}
      {nextGoals.length === 0 && <p className="mb-2 text-sm text-muted">No goals set yet. One to three is plenty. You can add steps on each goal's page.</p>}
      <QuickAdd placeholder={`A goal for next ${unit}`} onAdd={async (title) => { try { await createGoal({ title, timeframe: horizon, due_date: nextDue, priority: 'MEDIUM', tasks: [] }); return true; } catch { return false; } }} />
    </div>
  );

  const summary = { line: mine.length ? `${pct}% of your ${horizon.toLowerCase()} goal steps done, ${days.perfect} perfect day${days.perfect === 1 ? '' : 's'}.` : `${days.done} of ${days.total} day plans done, ${days.perfect} perfect day${days.perfect === 1 ? '' : 's'}.`, perfect: mine.length > 0 && open.length === 0 };
  const save = async () => {
    if (mood || Object.values(answers).some((v) => v?.trim())) {
      await saveJournal({ id: existing?.id, kind: 'REVIEW', period: horizon, period_key: key, mood, answers });
    }
    markDone(windKey(horizon, anchor));
  };
  return {
    steps: [['Look back', look$], ['Unfinished', carry$], ['Reflect', reflect$], [`Next ${unit}`, next$]],
    summary, save, title: `Wind down ${name}`, sub: `${horizonOf(horizon).label} wind-down`,
  };
}

// ---- The sheet ---------------------------------------------------------------------------------------------------

function Flow({ horizon, anchor }) {
  const { closeWindDown, openPlanner } = useApp();
  const flow = horizon === 'DAILY' ? useEvening() : usePeriod(horizon, anchor); // eslint-disable-line react-hooks/rules-of-hooks
  const [at, setAt] = useState(0);
  const [saving, setSaving] = useState(false);
  const last = flow.steps.length;   // the "done" screen
  const names = [...flow.steps.map(([n]) => n), 'Done'];

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeWindDown(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeWindDown]);

  const finish = async () => { setSaving(true); await flow.save(); setSaving(false); setAt(last); };

  return (
    <div className="fixed inset-0 z-40">
      <motion.div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeWindDown} />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center md:items-center md:p-6">
        <motion.div role="dialog" aria-modal="true" aria-labelledby="wdTitle"
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="pointer-events-auto flex max-h-[94vh] w-full max-w-2xl flex-col rounded-t-3xl border border-b-0 border-oat bg-soft md:rounded-3xl md:border-b">
          <header className="flex items-start justify-between gap-3 border-b border-oat px-5 pb-4 pt-5 md:px-7">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-muted"><Moon className="h-3.5 w-3.5" aria-hidden="true" />{flow.sub}</p>
              <h2 id="wdTitle" className="mt-1 text-xl font-extrabold tracking-tight text-charcoal md:text-2xl">{at < last ? names[at] : 'All wrapped up'}</h2>
              <div className="mt-2.5"><Steps names={names} at={at} /></div>
            </div>
            <button type="button" onClick={closeWindDown} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-oat/60"><X className="h-5 w-5" aria-hidden="true" /></button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-7">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={at} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.16 }}>
                {at < last ? flow.steps[at][1] : (
                  <div className="py-4 text-center">
                    <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/15 text-success"><Check className="h-7 w-7" strokeWidth={3} aria-hidden="true" /></span>
                    <p className="mt-4 text-lg font-extrabold text-charcoal">{flow.summary.perfect ? 'A complete one. Well done.' : 'Done. Time to rest.'}</p>
                    <p className="mt-1 text-sm text-muted">{flow.summary.line}</p>
                    <p className="mt-1 text-sm text-muted">Your reflection is saved in your journal.</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className="flex items-center justify-between gap-2 border-t border-oat px-5 py-3.5 md:px-7" style={{ paddingBottom: 'calc(.875rem + env(safe-area-inset-bottom, 0px))' }}>
            {at > 0 && at < last ? <button type="button" onClick={() => setAt(at - 1)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-charcoal hover:bg-oat/60"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back</button> : <span />}
            {at < last - 1 && <button type="button" onClick={() => setAt(at + 1)} className="inline-flex items-center gap-1.5 rounded-xl bg-rust px-5 py-2.5 text-sm font-extrabold text-white">Next<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>}
            {at === last - 1 && <button type="button" disabled={saving} onClick={finish} className="inline-flex items-center gap-1.5 rounded-xl bg-rust px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Finish'}<Check className="h-4 w-4" aria-hidden="true" /></button>}
            {at === last && (
              <span className="flex gap-2">
                {horizon !== 'DAILY' && <button type="button" onClick={() => { closeWindDown(); openPlanner(horizon, localDate(anchor)); }} className="rounded-xl px-3 py-2 text-sm font-semibold text-charcoal hover:bg-oat/60">See the full review</button>}
                <button type="button" onClick={closeWindDown} className="rounded-xl bg-rust px-5 py-2.5 text-sm font-extrabold text-white">Close</button>
              </span>
            )}
          </footer>
        </motion.div>
      </div>
    </div>
  );
}

export default function WindDown() {
  const { windDown } = useApp();
  if (!windDown) return null;
  return <Flow key={`${windDown.horizon}:${windDown.key}`} horizon={windDown.horizon} anchor={parseDay(windDown.key)} />;
}
