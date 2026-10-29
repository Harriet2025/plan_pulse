import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BarChart3, BellRing, CalendarClock, Check, Flame, Gauge, LifeBuoy, ListChecks, Moon, Plus, Quote, Snowflake, Target, TrendingUp, Trophy } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { HORIZONS, QUOTES, TEMPLATES, catIcon } from '../lib/constants';
import { cn, dayLoad, daysUntil, fmtMinutes, fmtSpan, greeting, isRestDate, isoWeekday, localDate, nextHeavyDay, shortDay, taskTotals } from '../lib/utils';
import { Bar, LinenTexture, Ring, cardShadow, glassShadow } from './ui';
import GoalCard from './GoalCard';
import NotifList from './NotifList';

function Hero({ totals, open }) {
  const { user, activeGoals, setView, openGoalModal } = useApp();
  const first = user.display_name.trim().split(/\s+/)[0];
  const dated = activeGoals.filter((g) => g.due_date).sort((a, b) => daysUntil(a.due_date) - daysUntil(b.due_date));
  const n = activeGoals.length;
  const sub = !n ? 'Set a goal for this week, month or year, and list the plans that will get you there.'
    : open ? `${open} plan${open === 1 ? '' : 's'} left across ${n} goal${n === 1 ? '' : 's'}.${dated.length ? ` Next deadline: ${dated[0].title}.` : ''}`
    : 'Everything is done. Add a new goal to keep your streak going.';

  return (
    // Terracotta hero. All text on it is pure white, which is the only white that keeps 4.5:1 on rust.
    <section className="relative overflow-hidden rounded-[28px] bg-rust p-6 text-white md:p-8" style={{ boxShadow: '0 18px 36px -20px rgba(154,73,41,.55)' }}>
      <LinenTexture />
      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0 max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h2 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-white md:text-4xl">{greeting()}, {first}</h2>
          <p className="mt-2 text-sm leading-relaxed text-white md:text-base">{sub}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => openGoalModal()} className="inline-flex items-center gap-2 rounded-xl bg-soft px-5 py-2.5 text-sm font-extrabold text-rust-dark hover:bg-white"><Plus className="h-4 w-4" strokeWidth={3} aria-hidden="true" />New goal</button>
            <button type="button" onClick={() => setView('history')} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-rust-dark px-5 py-2.5 text-sm font-bold text-white hover:bg-charcoal"><BarChart3 className="h-4 w-4" aria-hidden="true" />View progress</button>
          </div>
        </div>
        <div className="relative h-36 w-36 shrink-0 md:h-44 md:w-44" role="img" aria-label="Overall progress on your goals' plans">
          <Ring pct={totals.pct} track="rgba(255,255,255,.25)" stroke="#fff" />
          <div className="absolute inset-0 grid place-items-center text-center">
            <div><div className="text-3xl font-extrabold tabular-nums text-white md:text-4xl">{totals.pct}%</div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white">Overall</div></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatCards({ totals, open }) {
  const { activeGoals } = useApp();
  const dated = activeGoals.filter((g) => g.due_date).map((g) => ({ g, n: daysUntil(g.due_date) })).sort((a, b) => a.n - b.n);
  const cats = new Set(activeGoals.map((g) => g.category_id).filter(Boolean)).size;
  const cards = [
    { icon: Target, tag: 'Goals', value: activeGoals.length, title: 'Active goals', tile: 'bg-rust',
      foot: activeGoals.length ? `Across ${cats} categor${cats === 1 ? 'y' : 'ies'}` : 'Create your first goal' },
    { icon: ListChecks, tag: 'Tasks', value: open, title: 'Tasks to do', tile: 'bg-success',
      foot: totals.total ? `${totals.done} done of ${totals.total}` : 'No plans yet' },
    { icon: TrendingUp, tag: 'Progress', value: `${totals.pct}%`, title: 'Tasks completed', tile: 'bg-blush-dark', bar: totals.pct },
    { icon: CalendarClock, tag: 'Deadlines', value: dated.filter((x) => x.n <= 7).length, title: 'Due this week', tile: 'bg-warning',
      foot: dated.length ? `Next: ${dated[0].g.title}` : 'No deadlines set' },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Your overview">
      {cards.map(({ icon: Icon, tag, value, title, tile, foot, bar }, i) => (
        <motion.div key={tag} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
          className="rounded-3xl border border-oat bg-soft p-4 md:p-5" style={cardShadow}>
          <div className="flex items-center justify-between">
            <span className={`grid h-10 w-10 place-items-center rounded-xl text-white ${tile}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{tag}</span>
          </div>
          <div className="mt-4 text-3xl font-extrabold tabular-nums text-charcoal">{value}</div>
          <p className="text-sm font-bold text-charcoal/80">{title}</p>
          {bar !== undefined ? <Bar pct={bar} height="h-1.5" className="mt-2" fill="bg-blush-dark" label="Tasks completed" />
            : <p className="mt-1 truncate text-xs text-muted">{foot}</p>}
        </motion.div>
      ))}
    </div>
  );
}

// A gentle nudge toward the Catch up page. Only shows when something has slipped.
function CatchUpBanner() {
  const { slipped, setView } = useApp();
  if (!slipped.length) return null;
  const n = slipped.length;
  const quoted = slipped.slice(0, 2).map((s) => `“${s.title.length > 28 ? `${s.title.slice(0, 27)}…` : s.title}”`);
  const names = n > 2 ? `${quoted.join(', ')} and ${n - 2} more` : quoted.join(' and ');
  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} aria-label="Things that slipped"
      className="flex flex-wrap items-center gap-4 rounded-3xl border border-blush/60 bg-blush/15 p-4 md:p-5"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blush-dark text-white"><LifeBuoy className="h-5 w-5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1 basis-60">
        <p className="font-extrabold text-charcoal">{n === 1 ? 'One thing slipped past its date' : `${n} things slipped past their date`}</p>
        <p className="mt-0.5 text-sm text-muted">{names}. That happens. Sort {n === 1 ? 'it' : 'them'} out in a minute: finish, move or let go.</p>
      </div>
      <button type="button" onClick={() => setView('catchup')} className="inline-flex items-center gap-2 rounded-xl bg-rust px-5 py-2.5 text-sm font-extrabold text-white hover:bg-rust-dark">
        Catch up<ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </motion.section>
  );
}

const LOAD_UI = {
  ok:   { label: 'Comfortable', bar: 'bg-success', pill: 'bg-success/10 text-success' },
  tight: { label: 'Full day', bar: 'bg-warning', pill: 'bg-warning/10 text-warning' },
  over: { label: 'Overloaded', bar: 'bg-danger', pill: 'bg-danger/10 text-danger' },
  rest: { label: 'Rest day', bar: 'bg-blush-dark', pill: 'bg-blush/30 text-charcoal' },
};

// Today's own plans to tick off, how full the day is against the time the user really has, and a fix when it is too much
function LoadCard() {
  const { dayPlans, user, openLighten, openCalendarDay, openDay, toggleDayPlan } = useApp();
  const today = localDate();
  const load = dayLoad(dayPlans, user, today);
  const heavy = nextHeavyDay(dayPlans, user, 7);
  const ui = LOAD_UI[load.state];
  const pct = load.capacity ? Math.min(100, Math.round((100 * load.planned) / load.capacity)) : load.planned ? 100 : 0;
  const message = load.tasks.length === 0 ? 'Nothing left to do today. Add a plan for your day in the Planner.'
    : load.state === 'rest' ? `You have ${fmtMinutes(load.planned)} planned on a rest day. Move it if you would rather rest.`
    : load.state === 'over' ? `That is about ${fmtMinutes(load.over)} more than fits. Moving something to a lighter day would help.`
    : load.state === 'tight' ? 'A full day. Leave some slack for the unexpected.'
    : load.planned === 0 ? 'Give your plans a time or a length to see how full today is.'
    : `That fits your ${fmtMinutes(load.capacity)} day with ${fmtMinutes(load.free)} to spare.`;

  return (
    <section className="rounded-3xl border border-oat bg-soft p-5" style={cardShadow} aria-labelledby="loadH">
      <div className="flex items-center justify-between gap-2">
        <h2 id="loadH" className="text-sm font-extrabold text-charcoal">Today</h2>
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold', ui.pill)}><Gauge className="h-3.5 w-3.5" aria-hidden="true" />{ui.label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <motion.span key={load.planned} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className="text-3xl font-extrabold tabular-nums text-charcoal">{fmtMinutes(load.planned)}</motion.span>
        <span className="text-sm font-semibold text-muted">to go{load.capacity > 0 && ` of ${fmtMinutes(load.capacity)}`}</span>
      </div>
      <Bar pct={pct} height="h-2.5" className="mt-2.5" fill={ui.bar} label="Time planned today" />
      {load.tasks.length > 0 && (
        <ul className="mt-3 grid gap-1" aria-label="Today's plans">
          {load.tasks.slice(0, 5).map((x) => (
            <li key={x.plan.id}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-oat/50">
                <input type="checkbox" className="h-4 w-4 accent-[#B85C38]" checked={false} onChange={() => toggleDayPlan(x.plan.id, today, true)} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-charcoal">{x.plan.title}</span>
                {x.start && <span className="shrink-0 text-[11px] font-bold tabular-nums text-muted">{fmtSpan(x.start, x.minutes)}</span>}
              </label>
            </li>
          ))}
          {load.tasks.length > 5 && <li className="px-1.5 text-xs font-semibold text-muted">+{load.tasks.length - 5} more</li>}
        </ul>
      )}
      <p className="mt-3 text-sm leading-snug text-muted" aria-live="polite">{message}</p>
      <button type="button" onClick={() => openDay(today)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-rust-dark hover:underline">
        Plan today hour by hour<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {load.state === 'over' && (
        <button type="button" onClick={() => openLighten(today)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rust px-4 py-2.5 text-sm font-extrabold text-white hover:bg-rust-dark">
          Lighten today<ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {heavy && (
        <button type="button" onClick={() => openCalendarDay(heavy.key)} className="mt-3 flex w-full items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-left text-xs font-semibold text-charcoal hover:bg-warning/15">
          <CalendarClock className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span className="min-w-0 flex-1">Heads up: {shortDay(new Date(`${heavy.key}T00:00:00`))} looks heavy, {fmtMinutes(heavy.planned)} of {fmtMinutes(heavy.capacity)}.</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
        </button>
      )}
    </section>
  );
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function WeekStrip() {
  const { user, setView } = useApp();
  const restDays = user.rest_days ?? [];
  const streak = user.streak_count;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayKey = localDate(today);
  const monday = new Date(today); monday.setDate(today.getDate() - (isoWeekday(today) - 1));

  // We only know how long the streak is and when it was last extended, so work out which days it covers.
  // Rest days inside it are skipped (they do not count), and days a freeze is covering are marked.
  const covered = new Set(), frozen = new Set();
  if (streak > 0 && user.last_active) {
    const d = new Date(`${user.last_active}T00:00:00`);
    for (let left = streak, guard = 0; left > 0 && guard < 400; guard++, d.setDate(d.getDate() - 1)) {
      if (isRestDate(d, restDays) && localDate(d) !== user.last_active) continue;
      covered.add(localDate(d)); left--;
    }
    if (user.streak_protected) {
      const f = new Date(`${user.last_active}T00:00:00`);
      f.setDate(f.getDate() + 1);
      while (f < today) {                       // every missed work day since the last task a freeze is standing in for
        if (!isRestDate(f, restDays)) frozen.add(localDate(f));
        f.setDate(f.getDate() + 1);
      }
    }
  }

  const resting = user.rest_today && !user.streak_active_today;
  const [tone, message] = user.streak_active_today ? ['ok', `Done for today. Your ${streak}-day streak is safe.`]
    : resting ? ['rest', streak > 0 ? 'Today is a rest day. Your streak is safe, and finishing a plan still counts.' : 'Today is a rest day. Take it easy, or finish a plan to start a streak.']
    : user.streak_protected ? ['freeze', `A streak freeze is covering you. Finish a plan today to keep your ${streak}-day streak.`]
    : streak > 0 ? ['todo', `Finish one plan today to keep your ${streak}-day streak going.`]
    : user.best_streak > 0 ? ['fresh', `Start a new streak today. Your best is ${user.best_streak} days.`]
    : ['fresh', 'Finish a plan to start your streak.'];
  const toneClass = { ok: 'bg-success/10 text-success', rest: 'bg-blush/25 text-charcoal', freeze: 'bg-blush/25 text-charcoal', todo: 'bg-rust/10 text-rust-dark', fresh: 'bg-oat/60 text-charcoal' }[tone];
  const ToneIcon = { ok: Check, rest: Moon, freeze: Snowflake, todo: Flame, fresh: Flame }[tone];

  return (
    <section className="rounded-3xl border border-oat bg-soft p-5" style={cardShadow} aria-labelledby="weekH">
      <div className="flex items-center justify-between gap-2">
        <h2 id="weekH" className="text-sm font-extrabold text-charcoal">This week</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rust/10 px-2.5 py-1 text-xs font-bold text-rust-dark"><Flame className="h-3.5 w-3.5" aria-hidden="true" />{streak} day streak</span>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5 text-center">
        {DAY_LETTERS.map((letter, i) => {
          const day = new Date(monday); day.setDate(monday.getDate() + i);
          const key = localDate(day);
          const state = covered.has(key) ? 'done' : frozen.has(key) ? 'frozen' : isRestDate(day, restDays) ? 'rest' : 'none';
          const label = { done: 'streak day', frozen: 'covered by a freeze', rest: 'rest day', none: '' }[state];
          return (
            <div key={key} className="grid justify-items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase text-muted">{letter}</span>
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 18 }}
                title={`${shortDay(day)}${label ? ` · ${label}` : ''}`}
                className={cn(
                  'grid h-8 w-8 place-items-center rounded-full text-xs font-bold',
                  state === 'done' && 'bg-rust text-white', state === 'frozen' && 'bg-blush text-charcoal', state === 'rest' && 'bg-blush/30 text-blush-dark', state === 'none' && 'bg-oat text-muted',
                  key === todayKey && 'ring-2 ring-rust ring-offset-2 ring-offset-soft',
                )}
              >
                {state === 'done' && <Check className="h-4 w-4" strokeWidth={3.2} aria-hidden="true" />}
                {state === 'frozen' && <Snowflake className="h-4 w-4" aria-hidden="true" />}
                {state === 'rest' && <Moon className="h-4 w-4" aria-hidden="true" />}
                <span className="sr-only">{label}</span>
              </motion.span>
            </div>
          );
        })}
      </div>

      <p className={cn('mt-4 flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-semibold leading-snug', toneClass)} aria-live="polite">
        <ToneIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{message}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1" title="Each freeze covers one missed day"><Snowflake className="h-3.5 w-3.5" aria-hidden="true" />{user.streak_freezes} freeze{user.streak_freezes === 1 ? '' : 's'}</span>
          <span className="inline-flex items-center gap-1" title="Your longest streak"><Trophy className="h-3.5 w-3.5" aria-hidden="true" />Best {user.best_streak}</span>
        </span>
        <button type="button" onClick={() => setView('settings')} className="font-bold text-rust-dark hover:underline">Rest days</button>
      </div>
    </section>
  );
}

function FocusAreas() {
  const { categories, activeGoals } = useApp();
  const rows = categories.map((c) => {
    const gs = activeGoals.filter((g) => g.category_id === c.id);
    return { c, goals: gs.length, ...taskTotals(gs) };
  }).filter((x) => x.goals).sort((a, b) => b.total - a.total).slice(0, 4);
  return (
    <section className="hidden rounded-3xl border border-oat bg-soft p-5 xl:block" style={cardShadow} aria-labelledby="focusH">
      <div className="flex items-center justify-between"><h2 id="focusH" className="text-sm font-extrabold text-charcoal">Focus areas</h2><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">By category</span></div>
      <div className="mt-4 grid gap-4">
        {rows.length ? rows.map(({ c, pct }) => (
          <div key={c.id}>
            <div className="flex items-center justify-between text-sm">
              <span className="flex min-w-0 items-center gap-2 font-bold text-charcoal"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} /><span className="truncate">{c.name}</span></span>
              <span className="text-xs font-bold tabular-nums text-muted">{pct}%</span>
            </div>
            <Bar pct={pct} className="mt-1.5" fillStyle={{ background: c.color }} label={`${c.name} progress`} />
          </div>
        )) : <p className="text-sm text-muted">Your categories will appear here as you add goals.</p>}
      </div>
    </section>
  );
}

// Types out one quote at a time, then fades to the next
function QuoteCard() {
  const { openGoalModal } = useApp();
  const reduce = useReducedMotion();
  const [qi, setQi] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const [shown, setShown] = useState(0);
  const [fading, setFading] = useState(false);
  const [text, author] = QUOTES[qi];
  const typing = shown < text.length;

  useEffect(() => {
    let t;
    const next = () => { setFading(true); t = setTimeout(() => { setFading(false); setQi((q) => (q + 1) % QUOTES.length); }, 600); };
    if (reduce) { setShown(text.length); t = setTimeout(next, 9000); return () => clearTimeout(t); }
    let i = 0;
    setShown(0);
    const tick = () => { setShown(++i); t = setTimeout(i < text.length ? tick : next, i < text.length ? 28 : 6500); };
    t = setTimeout(tick, 28);
    return () => clearTimeout(t);
  }, [qi, text, reduce]);

  return (
    <section className="relative overflow-hidden rounded-3xl bg-charcoal p-5 text-white" aria-live="polite" style={cardShadow}>
      <LinenTexture className="opacity-70" />
      <div className="relative flex items-start gap-3">
        <Quote className="mt-0.5 h-5 w-5 shrink-0 text-blush" aria-hidden="true" />
        <div className="min-h-[5.5rem] min-w-0">
          <p className={cn('text-base font-semibold leading-relaxed text-white transition-opacity duration-500', typing && 'caret', fading && 'opacity-0')}>{text.slice(0, shown)}</p>
          <p className={cn('mt-2 text-xs font-semibold text-white/70 transition-opacity duration-500', typing || fading ? 'opacity-0' : 'opacity-100')}>— {author}</p>
        </div>
      </div>
      <button type="button" onClick={() => openGoalModal()} className="relative mt-3 rounded-lg bg-rust px-4 py-2 text-xs font-extrabold text-white hover:bg-rust-dark">Set a new goal</button>
    </section>
  );
}

function RightRail() {
  return (
    <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 xl:order-last" aria-label="Streak, reminders and motivation">
      <LoadCard />
      <WeekStrip />
      <section className="hidden rounded-3xl border border-oat bg-soft p-5 xl:block" style={cardShadow} aria-labelledby="railH">
        <div className="flex items-center justify-between"><h2 id="railH" className="text-sm font-extrabold text-charcoal">Reminders &amp; deadlines</h2><span className="grid h-8 w-8 place-items-center rounded-lg bg-rust/10 text-rust-dark"><BellRing className="h-4 w-4" aria-hidden="true" /></span></div>
        <NotifList className="-mx-2 mt-3 grid max-h-72 gap-0.5 overflow-y-auto overflow-x-hidden" empty={<p className="py-6 text-center text-sm text-muted">Nothing coming up. Give a plan a time and you get a reminder when it starts.</p>} />
      </section>
      <FocusAreas />
      <QuoteCard />
    </aside>
  );
}

function GoalsPanel() {
  const { categories, activeCat, setActiveCat, horizonFilter, setHorizonFilter, visibleGoals, activeGoals, search, prio, user, openGoalModal } = useApp();
  const cat = categories.find((c) => String(c.id) === String(activeCat));
  const filtered = !!search.trim() || prio !== 'all' || horizonFilter !== 'all';
  const firstTime = !filtered && !cat && activeGoals.length === 0;
  const count = visibleGoals.filter((g) => g.sub_plans.length === 0 || g.status === 'ACTIVE').length;
  const pills = [{ id: 'all', name: 'All', color: '#B85C38' }, ...categories];

  const emptyTitle = firstTime ? `Welcome, ${user.display_name.split(' ')[0]}! Let's set your first goal`
    : filtered ? 'No goals match your search' : cat ? `No ${cat.name} goals yet` : 'No goals yet';
  const emptyHint = firstTime ? 'Everything you add here is private to your account. Start from an idea or write your own.'
    : filtered ? 'Try a different search, priority or period.' : cat ? `Click New Goal to add one under ${cat.name}.` : 'Click New Goal to set your first goal.';

  return (
    <section className="min-w-0 rounded-[28px] border border-oat bg-soft/60 p-4 md:p-6" style={glassShadow} aria-labelledby="listHeading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-rust-dark">Your goals</p>
          <h2 className="mt-0.5 text-xl font-extrabold tracking-tight text-charcoal" id="listHeading">{cat ? `${cat.name} goals` : 'All goals'}</h2>
        </div>
        <span className="rounded-full bg-soft px-3 py-1 text-xs font-bold tabular-nums text-rust-dark shadow-sm">{count} active</span>
      </div>
      <div className="mt-4 inline-grid grid-cols-4 gap-1 rounded-2xl bg-oat/60 p-1" role="group" aria-label="Show goals for">
        {[{ id: 'all', label: 'All' }, ...HORIZONS].map((x) => {
          const on = horizonFilter === x.id;
          return (
            <button key={x.id} type="button" aria-pressed={on} onClick={() => setHorizonFilter(x.id)}
              className={cn('rounded-xl px-3 py-1.5 text-xs font-extrabold transition-colors duration-200', on ? 'bg-rust text-white shadow-sm' : 'text-charcoal hover:bg-soft/70 hover:text-rust-dark')}>
              {x.label}
            </button>
          );
        })}
      </div>
      <nav className="mt-3" aria-label="Filter goals by category">
        <div className="flex flex-wrap gap-2">
          {pills.map((c) => {
            const on = String(c.id) === String(activeCat);
            return (
              <button key={c.id} type="button" aria-pressed={on} onClick={() => setActiveCat(c.id)}
                className={cn('flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors', !on && 'border-oat bg-soft text-charcoal/80 hover:border-rust')}
                style={on ? { background: `${c.color}26`, borderColor: c.color, color: '#352D29' } : undefined}>
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />{c.name}
              </button>
            );
          })}
        </div>
      </nav>
      <div className="my-5 h-px bg-oat" />

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 min-[1180px]:grid-cols-3 xl:grid-cols-2 min-[1850px]:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {visibleGoals.map((g) => <GoalCard key={g.id} goal={g} />)}
        </AnimatePresence>
      </div>

      {visibleGoals.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-xl rounded-3xl border border-dashed border-blush bg-soft p-10 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-rust text-white"><Target className="h-7 w-7" aria-hidden="true" /></div>
          <p className="text-lg font-extrabold text-charcoal">{emptyTitle}</p>
          <p className="mt-1 text-sm text-muted">{emptyHint}</p>
          {firstTime && (
            <div className="mt-6 text-left">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Or start from an idea</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {TEMPLATES.map((t) => (
                  <button key={t.title} type="button" onClick={() => openGoalModal(t)} className="rounded-xl border border-oat bg-soft px-3 py-2.5 text-left hover:border-rust">
                    <span className="block text-sm font-bold text-charcoal">{t.title}</span>
                    <span className="block text-xs text-muted">{t.cat} &middot; {t.tasks.length} plans</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </section>
  );
}

export default function Dashboard() {
  const { activeGoals } = useApp();
  const totals = taskTotals(activeGoals);
  const open = totals.total - totals.done;
  return (
    <div className="grid gap-6">
      <Hero totals={totals} open={open} />
      <CatchUpBanner />
      <StatCards totals={totals} open={open} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <RightRail />
        <GoalsPanel />
      </div>
    </div>
  );
}
