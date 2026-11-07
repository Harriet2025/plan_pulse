import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Archive, Check, Minus, Pencil, Plus, RotateCcw, Trash2, Trophy, X } from 'lucide-react';
import * as api from '../api';
import { useApp } from '../context/AppContext';
import { HORIZONS } from '../lib/constants';
import { addDays, cn, localDate, parseDay, periodEnd, periodKey, periodLabel, shiftPeriod } from '../lib/utils';
import { Bar, InfoTip, cardShadow } from './ui';

// What two partners do together: this week's challenge, then the goals they share.
// Weeks run Monday to Sunday (UTC), the same as the scoreboard.

const first = (name) => name.trim().split(/\s+/)[0];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** "Mon 2 – Sun 8 Nov" for the week starting on that Monday. */
export function weekSpan(monday) {
  const s = parseDay(monday), e = addDays(s, 6);
  const day = (d, month) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', ...(month ? { month: 'short' } : {}) });
  return `${day(s, s.getMonth() !== e.getMonth())} – ${day(e, true)}`;
}
const EMOJIS = ['🎯', '❤️', '💑', '📚', '💰', '✈️', '🏃', '🙏', '🏠', '🌱', '🍳', '🎓'];
const IDEAS = [
  { emoji: '❤️', title: 'A date night every week', timeframe: 'MONTHLY', plans: [['Pick the place', 'TOGETHER'], ['Plan a surprise', 'EACH']] },
  { emoji: '✈️', title: 'Save for our trip', timeframe: 'MONTHLY', plans: [['Put money aside every week', 'EACH'], ['Choose where to go', 'TOGETHER']] },
  { emoji: '📚', title: 'Finish the course together', timeframe: 'MONTHLY', plans: [['Watch this week’s lessons', 'EACH'], ['Quiz each other', 'TOGETHER']] },
  { emoji: '🏃', title: 'Walk 50 km this month', timeframe: 'MONTHLY', plans: [['Walk 3 times a week', 'EACH'], ['A long weekend walk', 'TOGETHER']] },
];
const WHO = (name) => [['TOGETHER', 'Together'], ['EACH', 'Each of us'], ['ME', 'Me'], ['THEM', name]];
const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted';

// ---------------------------------------------------------------------------------------------------------------
// This week's challenge
// ---------------------------------------------------------------------------------------------------------------

// The kinds of weekly challenge. `hint` sits behind an ⓘ: what exactly counts.
const KINDS = [
  { id: 'EACH_GOALS', title: 'Each of us completes', unit: 'goals', start: 1, max: 20,
    hint: 'A goal counts when every one of its steps is ticked this week: your own goals, and shared goals you finish together.' },
  { id: 'EACH_PLANS', title: 'Each of us ticks off', unit: 'plans', start: 10, max: 100,
    hint: 'A total for the whole week, not per day. Anything you tick counts: today’s plans in the Planner, steps of your goals, and shared plans. Both of you have to reach it.' },
  { id: 'TOTAL_PLANS', title: 'Together we tick off', unit: 'plans', start: 20, max: 200,
    hint: 'Your ticks and theirs add up to one number for the week: today’s plans, goal steps and shared plans.' },
  { id: 'CHAT_DAYS', title: 'We both chat on', unit: 'days', start: 5, max: 7,
    hint: 'A day counts when both of you send something that day.' },
  { id: 'HABIT', title: 'Each of us does a habit on', unit: 'days', start: 5, max: 7,
    hint: 'You name the habit. Each of you taps “I did it today” on the days you do it.' },
];

/** "2 today’s plans · 1 goal step": where a plans total came from. */
const partsText = (p) => {
  if (!p) return '';
  const bits = [[p.day, 'today’s plan', 'today’s plans'], [p.steps, 'goal step', 'goal steps'], [p.shared, 'shared plan', 'shared plans']]
    .filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  return bits.length ? bits.join(' · ') : 'nothing yet';
};

function Stepper({ value, onChange, max, unit }) {
  const btn = 'grid h-9 w-9 place-items-center rounded-xl border border-oat bg-soft text-charcoal hover:border-rust disabled:opacity-40';
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} aria-label="Fewer"><Minus className="h-4 w-4" aria-hidden="true" /></button>
      <input type="number" inputMode="numeric" min={1} max={max} value={value} aria-label={`How many ${unit}`}
        onChange={(e) => onChange(Math.min(max, Math.max(1, Number(e.target.value) || 1)))} className="field !w-16 !py-1.5 text-center font-extrabold tabular-nums" />
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="More"><Plus className="h-4 w-4" aria-hidden="true" /></button>
      <span className="text-sm font-semibold text-charcoal">{unit}</span>
    </div>
  );
}

function ChallengePicker({ entry, current, onDone, onCancel }) {
  const { toast } = useApp();
  const [kind, setKind] = useState(current?.kind ?? 'EACH_GOALS');
  const [targets, setTargets] = useState(() => Object.fromEntries(KINDS.map((k) => [k.id, current?.kind === k.id ? current.target : k.start])));
  const [title, setTitle] = useState(current?.title ?? '');
  const [busy, setBusy] = useState(false);
  const k = KINDS.find((x) => x.id === kind);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { onDone(await api.setChallenge(entry.id, kind, targets[kind], kind === 'HABIT' ? title : null)); toast(current ? 'Challenge changed.' : `Challenge set. ${first(entry.partner.display_name)} can see it now.`); }
    catch (ex) { toast(ex.message); setBusy(false); }
  };
  const callOff = async () => {
    setBusy(true);
    try { onDone(await api.clearChallenge(entry.id)); toast('Challenge called off.'); } catch (ex) { toast(ex.message); setBusy(false); }
  };

  return (
    <form onSubmit={save} className="grid gap-3">
      <fieldset className="grid gap-1.5">
        <legend className={label}>Pick a challenge for this week</legend>
        {KINDS.map((x) => (
          <label key={x.id} className={cn('flex cursor-pointer items-center gap-2.5 rounded-2xl border-2 px-3 py-2 transition-colors', kind === x.id ? 'border-rust bg-rust/5' : 'border-oat bg-ivory hover:border-blush')}>
            <input type="radio" name="challengeKind" className="h-4 w-4 shrink-0 accent-rust" checked={kind === x.id} onChange={() => setKind(x.id)} />
            <b className="flex-1 text-sm text-charcoal">{x.title} … {x.unit}</b>
            <InfoTip text={x.hint} align="right" label={`What counts for “${x.title} … ${x.unit}”`} />
          </label>
        ))}
      </fieldset>
      {kind === 'HABIT' && (
        <div>
          <label htmlFor="habitTitle" className={label}>The habit</label>
          <input id="habitTitle" className="field" maxLength={120} required placeholder="e.g. Pray together, No sugar, Read 20 pages" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      )}
      <div>
        <p className={label}>{k.title} (this week)</p>
        <Stepper value={targets[kind]} max={k.max} unit={k.unit} onChange={(n) => setTargets((t) => ({ ...t, [kind]: n }))} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy} className="rounded-xl bg-rust px-5 py-2.5 text-sm font-extrabold text-white hover:bg-rust-strong disabled:opacity-60">{busy ? 'Saving…' : current ? 'Change challenge' : 'Start the challenge'}</button>
        <button type="button" onClick={onCancel} disabled={busy} className="rounded-xl px-3 py-2.5 text-sm font-bold text-muted hover:bg-oat/60 hover:text-charcoal">Cancel</button>
        {current && <button type="button" onClick={callOff} disabled={busy} className="ml-auto rounded-xl px-3 py-2.5 text-xs font-bold text-muted hover:bg-danger/10 hover:text-danger">Call it off</button>}
      </div>
    </form>
  );
}

/** Monday to Sunday as dots: filled on the days in `days`. */
function WeekDots({ weekStart, days, today, who }) {
  const start = parseDay(weekStart);
  return (
    <div className="flex items-center gap-1" aria-label={`${who}: ${days.length} of 7 days`}>
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => {
        const key = localDate(addDays(start, i)), on = days.includes(key);
        return (
          <span key={i} className={cn('grid h-7 w-7 place-items-center rounded-full text-[10px] font-extrabold', on ? 'bg-success text-on-status' : 'bg-oat text-muted', key === today && !on && 'ring-2 ring-rust/50')}>
            {on ? <Check className="h-3.5 w-3.5" strokeWidth={3.5} aria-hidden="true" /> : d}
          </span>
        );
      })}
    </div>
  );
}

function Challenge({ entry, data, setData }) {
  const { toast } = useApp();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = data.challenge;
  const name = first(entry.partner.display_name);
  const daysLeft = Math.round((addDays(parseDay(data.week_start), 6) - parseDay(data.today)) / 86400000);
  const ends = daysLeft <= 0 ? 'Ends tonight' : daysLeft === 1 ? 'Ends tomorrow' : `${daysLeft} days left`;
  const checkedToday = c?.me_days?.includes(data.today);

  const checkin = async () => {
    setBusy(true);
    try { setData(await api.challengeCheckin(entry.id, !checkedToday)); if (!checkedToday) toast(`Nice. ${name} will see it.`); } catch (ex) { toast(ex.message); }
    setBusy(false);
  };

  const row = (who, n, mine) => (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs">
      <span className="truncate font-bold text-charcoal">{who}</span>
      <Bar pct={Math.min(100, Math.round((100 * n) / c.target))} height="h-2.5" fill={n >= c.target ? 'bg-success' : mine ? 'bg-rust' : 'bg-blush-dark'} label={`${who}: ${n} of ${c.target}`} />
      <span className="text-right font-extrabold tabular-nums text-charcoal">{n}/{c.target}</span>
    </div>
  );

  return (
    <section className={cn('rounded-3xl border-2 p-4', c?.won ? 'border-success/50 bg-success/5' : 'border-rust/30 bg-ivory')} aria-label="This week's challenge">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">This week’s challenge · {weekSpan(data.week_start)}{c ? ` · ${ends}` : ''}</p>
          {c && !picking && (
            <h3 className="mt-0.5 flex items-center gap-1 text-base font-extrabold leading-snug text-charcoal">
              {cap(c.text)} this week
              <InfoTip text={`${KINDS.find((k) => k.id === c.kind)?.hint ?? ''} Starts again from 0 next Monday.`} label="What counts" />
            </h3>
          )}
        </div>
        {c && !picking && <button type="button" onClick={() => setPicking(true)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-rust-dark hover:bg-oat/60">Change</button>}
      </div>

      {picking ? (
        <div className="mt-3"><ChallengePicker entry={entry} current={c} onDone={(r) => { setData(r); setPicking(false); }} onCancel={() => setPicking(false)} /></div>
      ) : !c ? (
        <div className="mt-2">
          <p className="text-sm text-charcoal">One thing to beat together this week.</p>
          <button type="button" onClick={() => setPicking(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-rust px-4 py-2.5 text-sm font-extrabold text-white hover:bg-rust-strong">
            <Trophy className="h-4 w-4" aria-hidden="true" />Set a challenge
          </button>
        </div>
      ) : (
        <div className="mt-3 grid gap-2.5">
          {c.won && (
            <motion.p initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-2 rounded-2xl bg-success/15 px-3 py-2 text-sm font-extrabold text-success">
              <Trophy className="h-5 w-5" aria-hidden="true" />You did it together! Challenge won 🎉
            </motion.p>
          )}
          {(c.kind === 'EACH_GOALS' || c.kind === 'EACH_PLANS') && <>{row('You', c.me, true)}{row(name, c.them, false)}</>}
          {c.kind === 'TOTAL_PLANS' && (
            <div className="flex items-center gap-2"><Bar pct={Math.min(100, Math.round((100 * (c.me + c.them)) / c.target))} height="h-3" className="flex-1" fill={c.won ? 'bg-success' : 'bg-rust'} label={`Together: ${c.me + c.them} of ${c.target}`} /><span className="text-xs font-extrabold tabular-nums text-charcoal">{c.me + c.them}/{c.target}</span></div>
          )}
          {(c.kind === 'EACH_PLANS' || c.kind === 'TOTAL_PLANS') && (
            // Exactly what was counted, so a number never comes out of nowhere
            <div className="rounded-xl bg-panel px-3 py-2 text-xs text-charcoal">
              <p><b>You:</b> {partsText(c.me_parts)}</p>
              <p><b>{name}:</b> {partsText(c.them_parts)}</p>
            </div>
          )}
          {c.kind === 'CHAT_DAYS' && (
            <div className="flex flex-wrap items-center gap-3">
              <WeekDots weekStart={data.week_start} days={c.days} today={data.today} who="Both of you" />
              <span className="text-xs font-extrabold tabular-nums text-charcoal">{c.me}/{c.target} days</span>
            </div>
          )}
          {c.kind === 'HABIT' && (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="w-14 text-xs font-bold text-charcoal">You</span><WeekDots weekStart={data.week_start} days={c.me_days} today={data.today} who="You" /><span className="text-xs font-extrabold tabular-nums">{c.me}/{c.target}</span></div>
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="w-14 truncate text-xs font-bold text-charcoal">{name}</span><WeekDots weekStart={data.week_start} days={c.them_days} today={data.today} who={name} /><span className="text-xs font-extrabold tabular-nums">{c.them}/{c.target}</span></div>
              <button type="button" onClick={checkin} disabled={busy}
                className={cn('inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-extrabold disabled:opacity-60', checkedToday ? 'bg-success/15 text-success' : 'bg-rust text-white hover:bg-rust-strong')}>
                <Check className="h-4 w-4" aria-hidden="true" />{checkedToday ? 'Done today · tap to undo' : 'I did it today'}
              </button>
            </div>
          )}
        </div>
      )}

      {(data.wins > 0 || data.history.length > 0) && !picking && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-oat pt-2.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1 font-bold text-charcoal"><Trophy className="h-3.5 w-3.5 text-warning" aria-hidden="true" />{data.wins} won</span>
          {data.win_streak > 1 && <span className="font-bold text-rust-dark">🔥 {data.win_streak} weeks in a row</span>}
          <span className="flex items-center gap-1" aria-label="Recent weeks">
            {data.history.slice(0, 6).reverse().map((h) => (
              <span key={h.week_start} title={`${cap(h.text)}: ${h.won ? 'won' : 'missed'}`} className={cn('grid h-5 w-5 place-items-center rounded-full text-[10px] font-extrabold', h.won ? 'bg-success text-on-status' : 'bg-oat text-muted')}>{h.won ? '✓' : '–'}</span>
            ))}
          </span>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Shared goals
// ---------------------------------------------------------------------------------------------------------------

/** One tick box. Read-only (for the partner's part) when onClick is missing. */
function Tick({ on, onClick, label: text, busy, small }) {
  const box = cn('grid shrink-0 place-items-center border-[1.5px] transition-colors', small ? 'h-5 w-5 rounded-[6px]' : 'h-6 w-6 rounded-[7px]',
    on ? 'border-success bg-success' : 'border-charcoal/30 bg-soft', onClick && !on && 'hover:border-rust');
  const mark = on && <Check className={small ? 'h-3 w-3 text-on-status' : 'h-3.5 w-3.5 text-on-status'} strokeWidth={4} aria-hidden="true" />;
  if (!onClick) return <span className={box} role="img" aria-label={`${text}: ${on ? 'done' : 'not yet'}`}>{mark}</span>;
  return <motion.button type="button" whileTap={{ scale: 0.85 }} onClick={onClick} disabled={busy} aria-pressed={on} aria-label={text} className={cn(box, 'disabled:opacity-60')}>{mark}</motion.button>;
}

function TeamGoalCard({ goal, name, onData, onEdit }) {
  const { markTeamPlan, toast } = useApp();
  const [busy, setBusy] = useState(null);       // the plan being ticked
  const [armed, setArmed] = useState(false);    // delete asks twice
  const done = goal.plans.filter((p) => p.done).length, total = goal.plans.length;
  const pct = total ? Math.round((100 * done) / total) : 0;
  const finished = goal.status === 'COMPLETED', archived = goal.status === 'ARCHIVED';

  const tick = async (plan, want) => {
    setBusy(plan.id);
    const r = await markTeamPlan(plan.id, want);
    if (r) onData(r);
    setBusy(null);
  };
  const act = async (action) => {
    try { onData(await api.setTeamGoal(goal.id, action)); toast(action === 'delete' ? 'Shared goal deleted.' : action === 'archive' ? 'Archived. You can restore it any time.' : 'Restored.'); }
    catch (ex) { toast(ex.message); }
  };

  const whoChip = (p) => ({ TOGETHER: 'Together', EACH: 'Each of us', ME: 'You', THEM: name }[p.who]);
  return (
    <motion.article layout="position" className={cn('rounded-3xl border bg-soft p-4', finished ? 'border-success/50' : 'border-oat', archived && 'opacity-70')} style={cardShadow}>
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-rust/10 text-2xl" aria-hidden="true">{goal.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{periodLabel(goal.timeframe, parseDay(goal.due_date))} · ends {parseDay(goal.due_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>
          <h4 className={cn('break-words text-base font-extrabold leading-snug', finished ? 'text-success' : 'text-charcoal')}>{goal.title}</h4>
          {goal.why && <p className="mt-0.5 text-xs italic text-muted">“{goal.why}”</p>}
        </div>
      </div>
      {finished && <p className="mt-3 rounded-2xl bg-success/10 px-3 py-2 text-sm font-extrabold text-success">Done together 🎉</p>}
      <div className="mt-3 flex items-center gap-2"><Bar pct={pct} height="h-2.5" className="flex-1" fill={finished ? 'bg-success' : 'bg-rust'} label={`${goal.title}: ${pct}%`} /><span className="text-xs font-bold tabular-nums text-muted">{done}/{total}</span></div>

      {total > 0 && (
        <ul className="mt-3 grid gap-1.5">
          {goal.plans.map((p) => {
            const mineToTick = p.who !== 'THEM' && !archived;
            return (
              <li key={p.id} className="flex items-center gap-2.5 rounded-2xl bg-ivory px-3 py-2">
                {p.who === 'EACH' ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <Tick small on={p.me_done} busy={busy === p.id} label={`Your part: ${p.text}`} onClick={archived ? undefined : () => tick(p, !p.me_done)} />
                    <Tick small on={p.them_done} label={`${name}'s part`} />
                  </span>
                ) : (
                  <Tick on={p.done} busy={busy === p.id} label={p.text} onClick={mineToTick ? () => tick(p, !p.done) : undefined} />
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn('block break-words text-sm font-semibold', p.done ? 'text-muted line-through' : 'text-charcoal')}>{p.text}</span>
                  <span className="text-[11px] text-muted">
                    {whoChip(p)}
                    {p.who === 'EACH' && !p.done && (p.me_done ? ` · waiting for ${name}` : p.them_done ? ` · ${name} has done theirs` : '')}
                    {p.who === 'TOGETHER' && p.done && ` · ticked by ${p.me_done ? 'you' : name}`}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-oat pt-2.5">
        {!archived && <button type="button" onClick={() => onEdit(goal)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-charcoal hover:bg-oat/60"><Pencil className="h-3.5 w-3.5" aria-hidden="true" />Edit</button>}
        <button type="button" onClick={() => act(archived ? 'restore' : 'archive')} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-muted hover:bg-oat/60 hover:text-charcoal">
          {archived ? <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> : <Archive className="h-3.5 w-3.5" aria-hidden="true" />}{archived ? 'Restore' : 'Archive'}
        </button>
        <button type="button" onClick={() => { if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 3000); return; } act('delete'); }}
          className={cn('ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold', armed ? 'bg-danger/10 text-danger' : 'text-muted hover:bg-danger/10 hover:text-danger')}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{armed ? 'Tap again to delete for both' : 'Delete'}
        </button>
      </div>
    </motion.article>
  );
}

let rowKey = 0;
const newRow = (text = '', who = 'TOGETHER', id = null) => ({ key: ++rowKey, id, text, who });

/** Start or change a shared goal: emoji, name, the week, month or year it is for, why, and the plans with who does each. */
function TeamGoalForm({ entry, goal, idea, onSaved, onClose }) {
  const { toast } = useApp();
  const name = first(entry.partner.display_name);
  const [emoji, setEmoji] = useState(goal?.emoji ?? idea?.emoji ?? '🎯');
  const [title, setTitle] = useState(goal?.title ?? idea?.title ?? '');
  const [why, setWhy] = useState(goal?.why ?? '');
  const [horizon, setHorizon] = useState(goal?.timeframe ?? idea?.timeframe ?? 'MONTHLY');
  const [anchor, setAnchor] = useState(goal?.due_date ?? localDate());
  const [rows, setRows] = useState(() => (goal ? goal.plans.map((p) => newRow(p.text, p.who, p.id))
    : idea ? idea.plans.map(([t, w]) => newRow(t, w)) : [newRow(), newRow('', 'EACH')]));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const today = new Date();
  const thisKey = periodKey(horizon, today), nextKey = periodKey(horizon, shiftPeriod(horizon, today, 1));
  const current = periodKey(horizon, parseDay(anchor));
  const due = localDate(periodEnd(horizon, parseDay(anchor)));
  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const chip = (on) => cn('rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors', on ? 'border-rust bg-rust text-white' : 'border-oat bg-ivory text-charcoal hover:border-rust');

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      const plans = rows.filter((r) => r.text.trim()).map((r) => ({ id: r.id, text: r.text.trim(), who: r.who }));
      const r = await api.saveTeamGoal(entry.id, goal?.id ?? null, { title, emoji, why, timeframe: horizon, due_date: due }, plans);
      toast(goal ? 'Shared goal saved.' : `Shared goal started. ${name} can see it now.`);
      onSaved(r);
    } catch (ex) { setError(ex.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-40">
      <motion.div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center md:items-center md:p-6">
        <motion.form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="teamGoalTitle"
          initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="pointer-events-auto max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-b-0 border-oat bg-soft p-5 md:rounded-3xl md:border-b md:p-7"
          style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-oat" />
          <div className="flex items-center justify-between">
            <h2 id="teamGoalTitle" className="text-lg font-extrabold text-charcoal">{goal ? 'Edit shared goal' : `A goal with ${name}`}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-oat/60"><X className="h-5 w-5" aria-hidden="true" /></button>
          </div>

          <div className="mt-4 grid gap-4">
            <fieldset>
              <legend className={label}>Pick an emoji</legend>
              <div className="flex flex-wrap gap-1.5">
                {EMOJIS.map((x) => (
                  <button key={x} type="button" onClick={() => setEmoji(x)} aria-pressed={emoji === x} aria-label={`Emoji ${x}`}
                    className={cn('grid h-10 w-10 place-items-center rounded-xl border-2 text-xl', emoji === x ? 'border-rust bg-rust/10' : 'border-oat bg-ivory hover:border-blush')}>{x}</button>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="tgTitle" className={label}>What do you want to achieve together?</label>
              <input id="tgTitle" className="field" maxLength={255} required autoFocus={!goal} placeholder="e.g. Save for our December trip" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <fieldset>
              <legend className={label}>By the end of</legend>
              <div className="seg grid grid-cols-3 gap-2">
                {HORIZONS.map((h) => (
                  <label key={h.id} className="relative"><input type="radio" name="tgHorizon" checked={horizon === h.id} onChange={() => setHorizon(h.id)} /><span>A {h.label.toLowerCase()}</span></label>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" className={chip(current === thisKey)} onClick={() => setAnchor(localDate(today))}>{HORIZONS.find((h) => h.id === horizon).this}</button>
                <button type="button" className={chip(current === nextKey)} onClick={() => setAnchor(localDate(shiftPeriod(horizon, today, 1)))}>{HORIZONS.find((h) => h.id === horizon).next}</button>
              </div>
              <p className="mt-1.5 text-xs text-muted">Ends {parseDay(due).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </fieldset>
            <div>
              <label htmlFor="tgWhy" className={label}>Why it matters to you both <span className="normal-case tracking-normal">(optional)</span></label>
              <input id="tgWhy" className="field" maxLength={500} placeholder="e.g. More time for each other" value={why} onChange={(e) => setWhy(e.target.value)} />
            </div>

            <fieldset>
              <legend className={cn(label, 'flex items-center gap-1')}>
                The plans, and who does each
                <InfoTip text={`Together: one tick from either of you. Each of us: you both tick your own part. Me or ${name}: only that person ticks it. You both see this goal and either of you can change it.`} />
              </legend>
              <div className="grid gap-2">
                {rows.map((r, i) => (
                  <div key={r.key} className="rounded-2xl border border-oat bg-ivory p-2">
                    <div className="flex gap-2">
                      <label className="sr-only" htmlFor={`tgPlan${r.key}`}>Plan {i + 1}</label>
                      <input id={`tgPlan${r.key}`} className="field !py-2" maxLength={500} placeholder={i === 0 ? 'e.g. Choose where to go' : 'Another plan'} value={r.text} onChange={(e) => setRow(r.key, { text: e.target.value })} />
                      <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove plan ${i + 1}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-danger/10 hover:text-danger"><X className="h-4 w-4" aria-hidden="true" /></button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1" role="radiogroup" aria-label={`Who does plan ${i + 1}`}>
                      {WHO(name).map(([v, t]) => (
                        <button key={v} type="button" role="radio" aria-checked={r.who === v} onClick={() => setRow(r.key, { who: v })}
                          className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold', r.who === v ? 'bg-rust text-white' : 'bg-oat/70 text-charcoal hover:bg-oat')}>{t}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {rows.length < 50 && (
                <button type="button" onClick={() => setRows((rs) => [...rs, newRow()])} className="mt-2 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-rust-dark hover:bg-oat/60"><Plus className="h-4 w-4" aria-hidden="true" />Add a plan</button>
              )}
            </fieldset>
          </div>

          {error && <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
          <button type="submit" disabled={saving} className="mt-5 w-full rounded-xl bg-rust py-3 text-sm font-extrabold text-white active:scale-[.99] disabled:opacity-60">
            {saving ? 'Saving…' : goal ? 'Save changes' : 'Start this goal together'}
          </button>
        </motion.form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export default function Together({ entry }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);           // { goal } to edit, { idea } or {} to start one
  const [showArchived, setShowArchived] = useState(false);
  const name = first(entry.partner.display_name);

  useEffect(() => {
    let alive = true;
    setData(null);
    const load = () => api.getTogether(entry.id).then((v) => alive && setData(v)).catch(() => {});
    load();
    const t = setInterval(load, 20000);   // their ticks show up while you look
    return () => { alive = false; clearInterval(t); };
  }, [entry.id]);

  if (!data) return <p className="py-10 text-center text-sm text-muted">Loading…</p>;
  const live = data.goals.filter((g) => g.status !== 'ARCHIVED');
  const archived = data.goals.filter((g) => g.status === 'ARCHIVED');

  return (
    <div className="grid gap-4">
      <Challenge entry={entry} data={data} setData={setData} />

      <section aria-label="Shared goals">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-charcoal">Goals you share with {name}</h3>
          {live.length > 0 && (
            <button type="button" onClick={() => setForm({})} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-rust px-3 py-2 text-xs font-extrabold text-white hover:bg-rust-strong"><Plus className="h-3.5 w-3.5" aria-hidden="true" />New</button>
          )}
        </div>

        {live.length === 0 ? (
          <div className="mt-2 rounded-3xl border border-dashed border-blush/50 bg-ivory p-5 text-center">
            <p className="text-3xl" aria-hidden="true">🤝</p>
            <p className="mt-1 text-sm font-extrabold text-charcoal">Plan something together</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted">A goal you both own, for a week, a month or a year. Split the plans: some you do together, some each of you does.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {IDEAS.map((idea) => (
                <button key={idea.title} type="button" onClick={() => setForm({ idea })} className="rounded-full border border-oat bg-soft px-3 py-1.5 text-xs font-semibold text-charcoal hover:border-rust">{idea.emoji} {idea.title}</button>
              ))}
            </div>
            <button type="button" onClick={() => setForm({})} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-rust px-4 py-2.5 text-sm font-extrabold text-white hover:bg-rust-strong"><Plus className="h-4 w-4" aria-hidden="true" />Start a shared goal</button>
          </div>
        ) : (
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {live.map((g) => <TeamGoalCard key={g.id} goal={g} name={name} onData={setData} onEdit={(goal) => setForm({ goal })} />)}
          </div>
        )}

        {archived.length > 0 && (
          <div className="mt-3">
            <button type="button" onClick={() => setShowArchived((s) => !s)} aria-expanded={showArchived} className="rounded-lg px-2 py-1 text-xs font-bold text-muted hover:bg-oat/60 hover:text-charcoal">
              {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
            </button>
            {showArchived && <div className="mt-2 grid gap-3 md:grid-cols-2">{archived.map((g) => <TeamGoalCard key={g.id} goal={g} name={name} onData={setData} onEdit={() => {}} />)}</div>}
          </div>
        )}
      </section>

      {form && <TeamGoalForm entry={entry} goal={form.goal} idea={form.idea} onClose={() => setForm(null)} onSaved={(r) => { setData(r); setForm(null); }} />}
    </div>
  );
}
