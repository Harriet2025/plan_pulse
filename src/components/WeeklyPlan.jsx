import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, CalendarCheck, Check, Moon, Target, Wind, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { WEEKDAY_SHORT, horizonOf } from '../lib/constants';
import { addDays, cn, dayLoad, fmtMinutes, isRestDate, isoWeekday, localDate, parseDay, periodEnd, plansOn, planningMonday, progressOf, shortDay, spreadInWeek } from '../lib/utils';
import { Bar, cardShadow } from './ui';

// ---- The weekly planning ritual: look back, pick up to 3 focus goals, give their plans a day, see the week -----------

const STEPS = ['Look back', 'Focus', 'Give it time', 'Your week'];
const MAX_FOCUS = 3;
const NUDGE_KEY = 'auragoal.weekNudge';
const LENGTHS = [15, 30, 45, 60, 90, 120, 180];
const weekOf = (monday) => [0, 1, 2, 3, 4, 5, 6].map((n) => localDate(addDays(monday, n)));
const sameWeek = (key, days) => days.includes(key);

/** The week being planned: its Monday, its days, and whether it is this week or next. */
export function usePlanningWeek() {
  const { now } = useApp();
  return useMemo(() => {
    const monday = planningMonday(now);
    return { monday, key: localDate(monday), days: weekOf(monday), next: localDate(monday) > localDate(now) };
  }, [now]);
}

// ---- Step 1: last week, and what slipped ----

function LookBack({ choices, setChoices }) {
  const { dayPlans, goals, slipped, now } = useApp();
  const week = usePlanningWeek();
  // The week before the one being planned, up to today
  const last = weekOf(addDays(week.monday, -7)).filter((k) => k <= localDate(now));
  const items = last.flatMap((k) => plansOn(dayPlans, k));
  const done = items.filter((x) => x.done).length;
  const finished = goals.filter((g) => g.status === 'COMPLETED' && g.completed_at && last.includes(localDate(new Date(g.completed_at)))).length;
  const pick = (key, choice) => setChoices((c) => ({ ...c, [key]: choice }));
  const chip = (on, tone = 'rust') => cn('rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors', on ? (tone === 'rust' ? 'border-rust bg-rust text-white' : 'border-charcoal/40 bg-ink/10 text-charcoal') : 'border-oat bg-ivory text-charcoal hover:border-rust');

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-oat/60 p-3">
          <p className="text-2xl font-extrabold tabular-nums text-charcoal">{done}<span className="text-sm text-muted">/{items.length}</span></p>
          <p className="text-xs font-semibold text-muted">day plans done {week.next ? 'this week' : 'last week'}</p>
        </div>
        <div className="rounded-2xl bg-oat/60 p-3">
          <p className="text-2xl font-extrabold tabular-nums text-charcoal">{finished}</p>
          <p className="text-xs font-semibold text-muted">goal{finished === 1 ? '' : 's'} finished</p>
        </div>
      </div>
      <p className="text-sm text-charcoal">{items.length === 0 ? 'A quiet week. That is fine: this is a fresh start.' : done === items.length ? 'You did everything you planned. Well done!' : done >= items.length / 2 ? 'More than half done. Good going.' : 'Some weeks are like that. Let us make this one lighter and clearer.'}</p>

      {slipped.length > 0 ? (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Slipped ({slipped.length})</h3>
          <p className="mt-0.5 text-xs text-muted">Bring each one into the new week, or let it go. Nothing is changed until you finish.</p>
          <ul className="mt-2 grid gap-2">
            {slipped.map((it) => {
              const choice = choices[it.key] ?? 'move';
              return (
                <li key={it.key} className="rounded-2xl border border-oat bg-ivory p-3">
                  <p className="truncate text-sm font-bold text-charcoal">{it.title}</p>
                  <p className="text-[11px] text-muted">{it.kind === 'goal' ? `A goal, due ${shortDay(parseDay(it.due_date))}` : `Planned for ${shortDay(parseDay(it.date))}`}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`What to do with ${it.title}`}>
                    <button type="button" aria-pressed={choice === 'move'} className={chip(choice === 'move')} onClick={() => pick(it.key, 'move')}>Bring into the week</button>
                    <button type="button" aria-pressed={choice === 'let'} className={chip(choice === 'let', 'dark')} onClick={() => pick(it.key, 'let')}><Wind className="mr-1 inline h-3 w-3" aria-hidden="true" />Let it go</button>
                    <button type="button" aria-pressed={choice === 'keep'} className={chip(choice === 'keep', 'dark')} onClick={() => pick(it.key, 'keep')}>Decide later</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : <p className="flex items-center gap-2 rounded-2xl bg-success/10 px-3 py-2 text-sm font-semibold text-success"><Check className="h-4 w-4" aria-hidden="true" />Nothing slipped. You are up to date.</p>}
    </div>
  );
}

// ---- Step 2: up to 3 focus goals ----

function PickFocus({ focus, setFocus }) {
  const { activeGoals, categories, openGoalModal, closeWeekPlan } = useApp();
  const week = usePlanningWeek();
  // Goals still open in the week being planned: due in it or later (or with no date)
  const open = activeGoals.filter((g) => g.status === 'ACTIVE' && (!g.due_date || g.due_date >= week.key));
  const toggle = (id) => setFocus((f) => (f.includes(id) ? f.filter((x) => x !== id) : f.length >= MAX_FOCUS ? f : [...f, id]));

  if (!open.length) {
    return (
      <div className="rounded-2xl border border-dashed border-blush/50 p-5 text-center">
        <p className="text-sm font-bold text-charcoal">No open goals yet</p>
        <p className="mt-1 text-xs text-muted">Set a goal for this week, month or year, then come back to plan your week around it.</p>
        <button type="button" onClick={() => { closeWeekPlan(); openGoalModal({ timeframe: 'WEEKLY', anchor: week.key }); }} className="mt-3 rounded-xl bg-rust px-4 py-2 text-sm font-extrabold text-white hover:bg-rust-strong">Set a goal</button>
      </div>
    );
  }
  return (
    <div>
      <p className="text-sm text-charcoal">What matters most this week? Pick up to {MAX_FOCUS}. Fewer is fine.</p>
      <ul className="mt-3 grid gap-2">
        {open.map((g) => {
          const on = focus.includes(g.id), full = !on && focus.length >= MAX_FOCUS;
          const cat = categories.find((c) => c.id === g.category_id);
          const left = g.sub_plans.filter((t) => !t.done).length;
          return (
            <li key={g.id}>
              <button type="button" aria-pressed={on} disabled={full} onClick={() => toggle(g.id)}
                className={cn('flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors disabled:opacity-45', on ? 'border-rust bg-rust/5' : 'border-oat bg-ivory hover:border-blush')}>
                <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full border-2', on ? 'border-rust bg-rust text-white' : 'border-charcoal/30')}>{on && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold text-charcoal">{g.title}</span>
                  <span className="block text-[11px] text-muted">{[horizonOf(g.timeframe).label, cat?.name, left ? `${left} plan${left === 1 ? '' : 's'} left` : 'no plans yet'].filter(Boolean).join(' · ')}</span>
                  <Bar pct={progressOf(g)} height="h-1" className="mt-1.5" label={`${g.title} progress`} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs font-semibold text-muted" aria-live="polite">{focus.length} of {MAX_FOCUS} picked</p>
    </div>
  );
}

// ---- Step 3: give the focus goals' plans a day ----

function GiveTime({ rows, setRows }) {
  const { dayPlans, goals } = useApp();
  const week = usePlanningWeek();
  const today = localDate();
  const usable = week.days.filter((k) => k >= today);
  const scheduled = (taskId) => dayPlans.find((p) => p.subPlanId === taskId && sameWeek(p.date, week.days));
  const set = (id, patch) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch, chosen: true } : x)));

  if (!rows.length) return <p className="rounded-2xl bg-oat/60 p-4 text-sm text-charcoal">Your focus goals have no plans left to schedule. You can add plans to them any time, or go straight to your week.</p>;
  const byGoal = [...new Set(rows.map((r) => r.goalId))].map((gid) => ({ goal: goals.find((g) => g.id === gid), rows: rows.filter((r) => r.goalId === gid) }));
  return (
    <div className="grid gap-4">
      <p className="text-sm text-charcoal">Tick the plans to do this week. Each gets a day where you have the most free time; change any of them.</p>
      {byGoal.map(({ goal, rows: list }) => (
        <section key={goal.id}>
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted"><Target className="h-3.5 w-3.5 text-rust" aria-hidden="true" />{goal.title}</h3>
          <ul className="mt-2 grid gap-2">
            {list.map((r) => {
              const already = scheduled(r.id);
              return (
                <li key={r.id} className={cn('rounded-2xl border p-3', r.on && !already ? 'border-rust/50 bg-rust/5' : 'border-oat bg-ivory')}>
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-rust" checked={!!already || r.on} disabled={!!already} onChange={(e) => set(r.id, { on: e.target.checked })} />
                    <span className="min-w-0 flex-1 text-sm font-semibold text-charcoal">{r.text}{already && <span className="block text-[11px] font-semibold text-success">Already on {shortDay(parseDay(already.date))}</span>}</span>
                  </label>
                  {r.on && !already && (
                    <div className="mt-2 flex flex-wrap gap-2 pl-6">
                      <label className="text-[11px] font-semibold text-muted">Day
                        <select className="field mt-0.5 !w-auto !py-1 !text-sm" value={r.date} onChange={(e) => set(r.id, { date: e.target.value })}>
                          {usable.map((k) => <option key={k} value={k}>{shortDay(parseDay(k))}</option>)}
                        </select>
                      </label>
                      <label className="text-[11px] font-semibold text-muted">About
                        <select className="field mt-0.5 !w-auto !py-1 !text-sm" value={r.minutes} onChange={(e) => set(r.id, { minutes: Number(e.target.value) })}>
                          {[...new Set([...LENGTHS, r.minutes])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{fmtMinutes(m)}</option>)}
                        </select>
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---- Step 4: the week at a glance ----

function YourWeek({ focus, rows }) {
  const { dayPlans, user, goals } = useApp();
  const week = usePlanningWeek();
  const adding = rows.filter((r) => r.on);
  return (
    <div className="grid gap-4">
      {focus.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Focus</h3>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">{focus.map((id) => <li key={id} className="rounded-full bg-rust/10 px-3 py-1 text-xs font-extrabold text-rust-dark">🎯 {goals.find((g) => g.id === id)?.title}</li>)}</ul>
        </div>
      )}
      <ul className="grid gap-1.5" aria-label="The week">
        {week.days.map((k, i) => {
          const load = dayLoad(dayPlans, user, k);
          const extra = adding.filter((r) => r.date === k);
          const planned = load.planned + extra.reduce((n, r) => n + r.minutes, 0);
          const rest = isRestDate(parseDay(k), user.rest_days ?? []);
          const pct = load.capacity ? Math.min(100, Math.round((100 * planned) / load.capacity)) : planned ? 100 : 0;
          const over = load.capacity ? planned > load.capacity : planned > 0;
          return (
            <li key={k} className={cn('rounded-xl px-3 py-2', k < localDate() ? 'opacity-50' : 'bg-ivory')}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-extrabold text-charcoal">{WEEKDAY_SHORT[i]} <span className="font-semibold text-muted">{parseDay(k).getDate()}</span>{rest && <Moon className="ml-1 inline h-3.5 w-3.5 text-blush-dark" aria-label="rest day" />}</span>
                <span className={cn('text-[11px] font-bold tabular-nums', over ? 'text-danger' : 'text-muted')}>{fmtMinutes(planned)}{load.capacity ? ` of ${fmtMinutes(load.capacity)}` : ' · rest day'}</span>
              </div>
              <Bar pct={pct} height="h-1.5" className="mt-1" fill={over ? 'bg-danger' : 'bg-success'} label={`${WEEKDAY_SHORT[i]} planned`} />
              {extra.length > 0 && <p className="mt-1 truncate text-[11px] font-semibold text-rust-dark">+ {extra.map((r) => r.text).join(', ')}</p>}
            </li>
          );
        })}
      </ul>
      {week.days.some((k) => { const l = dayLoad(dayPlans, user, k); const p = l.planned + adding.filter((r) => r.date === k).reduce((n, r) => n + r.minutes, 0); return k >= localDate() && l.capacity && p > l.capacity; })
        && <p className="text-xs font-semibold text-danger">Some days are fuller than the time you said you have. Go back and move a plan, or keep it if you are sure.</p>}
    </div>
  );
}

// ---- The ritual itself ----

export default function WeeklyPlanModal() {
  const { closeWeekPlan, goals, dayPlans, user, slipped, rescheduleItems, planWeek } = useApp();
  const week = usePlanningWeek();
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState({});   // slipped item key -> move | let | keep
  const [focus, setFocus] = useState(() => goals.filter((g) => g.focus_week === week.key && g.status === 'ACTIVE').map((g) => g.id));
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeWeekPlan(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeWeekPlan]);

  // The focus goals' open plans, ready for step 3. Kept when going back and forth; new goals add their plans.
  useEffect(() => {
    if (step !== 2) return;
    setRows((prev) => {
      const fresh = [];
      for (const id of focus) {
        const g = goals.find((x) => x.id === id);
        g?.sub_plans.filter((t) => !t.done && !dayPlans.some((p) => p.subPlanId === t.id && sameWeek(p.date, week.days)))
          .forEach((t, i) => { const had = prev.find((r) => r.id === t.id); fresh.push(had ? { ...had } : { id: t.id, goalId: g.id, text: t.text, minutes: t.estimate ?? 30, on: i < 2, chosen: false }); });
      }
      // Days for the ticked ones the user has not placed themselves, spread over the free time
      const auto = fresh.filter((r) => r.on && !r.chosen);
      const days = spreadInWeek(auto, dayPlans, user, week.monday);
      auto.forEach((r, i) => { r.date = days[i]; });
      fresh.forEach((r) => { if (!r.date) r.date = spreadInWeek([r], dayPlans, user, week.monday)[0]; });
      return fresh;
    });
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving step 1 applies what was decided about slipped things, all together (with Undo)
  const applySlipped = async () => {
    const decided = slipped.filter((it) => (choices[it.key] ?? 'move') !== 'keep');
    if (!decided.length) return true;
    const moving = decided.filter((it) => (choices[it.key] ?? 'move') === 'move' && it.kind === 'plan');
    const planDays = spreadInWeek(moving.map((it) => ({ minutes: it.minutes ?? 30 })), dayPlans, user, week.monday);
    const actions = [], undo = [];
    for (const it of decided) {
      const id = it.kind === 'goal' ? it.goalId : it.planId;
      if ((choices[it.key] ?? 'move') === 'let') {
        actions.push({ kind: it.kind, id, op: it.kind === 'goal' ? 'archive' : 'skip' });
        undo.push({ kind: it.kind, id, op: it.kind === 'goal' ? 'restore' : 'unskip' });
      } else {
        const to = it.kind === 'goal' ? localDate(periodEnd(it.timeframe ?? 'WEEKLY', week.monday)) : planDays[moving.indexOf(it)];
        actions.push({ kind: it.kind, id, op: 'move', to });
        undo.push({ kind: it.kind, id, op: 'move', to: it.kind === 'goal' ? it.due_date : it.date });
      }
    }
    const n = actions.filter((a) => a.op === 'move').length, gone = actions.length - n;
    return rescheduleItems(actions, undo, [n && `${n} brought into the week`, gone && `${gone} let go`].filter(Boolean).join(', ') + '.');
  };

  const next = async () => {
    if (step === 0) { setBusy(true); const ok = await applySlipped(); setBusy(false); if (!ok) return; }
    setStep((s) => s + 1);
  };
  const finish = async () => {
    setBusy(true);
    const plans = rows.filter((r) => r.on).map((r) => ({ title: r.text.slice(0, 255), date: r.date, minutes: r.minutes, sub_plan_id: r.id }));
    if (await planWeek(week.key, focus, plans)) {
      try { localStorage.setItem(NUDGE_KEY, week.key); } catch { /* ignore */ }
      closeWeekPlan();
    }
    setBusy(false);
  };

  const title = `Plan ${week.next ? 'next' : 'this'} week`;
  return (
    <div className="fixed inset-0 z-40">
      <motion.div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeWeekPlan} />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center md:items-center md:p-6">
        <motion.div role="dialog" aria-modal="true" aria-labelledby="weekTitle"
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="pointer-events-auto flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-3xl border border-b-0 border-oat bg-soft md:rounded-3xl md:border-b">
          <div className="p-5 pb-3 md:p-6 md:pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rust text-white"><CalendarCheck className="h-5 w-5" aria-hidden="true" /></span>
                <div>
                  <h2 id="weekTitle" className="text-lg font-extrabold leading-tight text-charcoal">{title}</h2>
                  <p className="text-xs text-muted">Week of {shortDay(week.monday)} · about 5 minutes</p>
                </div>
              </div>
              <button type="button" onClick={closeWeekPlan} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-oat/60"><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>
            <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Steps">
              {STEPS.map((s, i) => (
                <li key={s} aria-current={i === step ? 'step' : undefined}>
                  <div className={cn('h-1.5 rounded-full', i <= step ? 'bg-rust' : 'bg-oat')} />
                  <p className={cn('mt-1 truncate text-[10px] font-bold uppercase tracking-wide', i === step ? 'text-rust-dark' : 'text-muted')}>{s}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 md:px-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
                {step === 0 && <LookBack choices={choices} setChoices={setChoices} />}
                {step === 1 && <PickFocus focus={focus} setFocus={setFocus} />}
                {step === 2 && <GiveTime rows={rows} setRows={setRows} />}
                {step === 3 && <YourWeek focus={focus} rows={rows} />}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-2 border-t border-oat p-4 md:px-6" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            {step > 0 && <button type="button" onClick={() => setStep((s) => s - 1)} disabled={busy} className="inline-flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-bold text-muted hover:bg-oat/60 hover:text-charcoal"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back</button>}
            {step < 3
              ? <button type="button" onClick={next} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-rust px-5 py-2.5 text-sm font-extrabold text-white hover:bg-rust-strong disabled:opacity-60">{busy ? 'Saving…' : 'Next'}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
              : <button type="button" onClick={finish} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-rust px-5 py-2.5 text-sm font-extrabold text-white hover:bg-rust-strong disabled:opacity-60"><Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />{busy ? 'Saving…' : 'Plan my week'}</button>}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ---- On the dashboard ----

/** On the planning day (or early in an unplanned week): an invitation to plan the week. */
export function WeekNudge() {
  const { user, now, openWeekPlan } = useApp();
  const week = usePlanningWeek();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(NUDGE_KEY) === week.key; } catch { return false; } });
  const dow = isoWeekday(now);
  const due = user.week_planned !== week.key && (dow === (user.planning_day ?? 7) || (!week.next && dow <= 2));
  if (!due || hidden) return null;
  const later = () => { try { localStorage.setItem(NUDGE_KEY, week.key); } catch { /* ignore */ } setHidden(true); };
  return (
    <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-3 rounded-3xl border border-rust/30 bg-rust/5 p-4" aria-label="Plan your week">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-rust text-white"><CalendarCheck className="h-5 w-5" aria-hidden="true" /></span>
      <p className="min-w-0 flex-1 basis-[calc(100%-3.25rem)] text-sm font-semibold text-charcoal sm:basis-0">Plan {week.next ? 'next' : 'this'} week <span className="font-normal text-muted">Look back, pick your focus, and give it time. About 5 minutes.</span></p>
      <button type="button" onClick={openWeekPlan} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rust px-4 py-2 text-sm font-extrabold text-white hover:bg-rust-strong sm:flex-none">Start<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
      <button type="button" onClick={later} className="rounded-xl px-3 py-2 text-xs font-bold text-muted hover:bg-oat/60 hover:text-charcoal">Not now</button>
    </motion.section>
  );
}

/** This week's focus goals, with their progress. */
export function FocusCard() {
  const { goals, now, openWeekPlan, openGoal } = useApp();
  const key = localDate(addDays(now, 1 - isoWeekday(now)));   // focus is shown for the week we are in
  const focus = goals.filter((g) => g.focus_week === key && g.status !== 'ARCHIVED');
  if (!focus.length) return null;
  return (
    <section className="rounded-3xl border border-oat bg-soft p-5" style={cardShadow} aria-labelledby="focusWeekH">
      <div className="flex items-center justify-between gap-2">
        <h2 id="focusWeekH" className="flex items-center gap-1.5 text-sm font-extrabold text-charcoal"><Target className="h-4 w-4 text-rust" aria-hidden="true" />This week's focus</h2>
        <button type="button" onClick={openWeekPlan} className="text-xs font-bold text-rust-dark hover:underline">Change</button>
      </div>
      <ul className="mt-3 grid gap-3">
        {focus.map((g) => (
          <li key={g.id}>
            <button type="button" onClick={() => openGoal(g.id)} className="block w-full text-left">
              <span className="flex items-baseline justify-between gap-2">
                <span className={cn('truncate text-sm font-bold', g.status === 'COMPLETED' ? 'text-success' : 'text-charcoal')}>{g.status === 'COMPLETED' ? '✓ ' : ''}{g.title}</span>
                <span className="shrink-0 text-[11px] font-bold tabular-nums text-muted">{progressOf(g)}%</span>
              </span>
              <Bar pct={progressOf(g)} height="h-1.5" className="mt-1" label={`${g.title} progress`} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
