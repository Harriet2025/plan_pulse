import { forwardRef, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, BookHeart, CheckCircle2, Clock, RotateCcw, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TIERS, catIcon } from '../lib/constants';
import { cn, computeAnalytics, fmtWhen, progressOf } from '../lib/utils';
import { Bar, InfoTip, Ring, TwoTapButton } from './ui';
import { POINTS, WEEK_MEDALS } from '../lib/rewards';

const panel = 'mt-3 rounded-2xl border border-oat bg-soft p-5';
const H2 = ({ children, id }) => <h2 id={id} className="text-sm font-bold uppercase tracking-[0.14em] text-charcoal">{children}</h2>;

const shortWeek = (start) => {
  const [y, m, d] = start.split('-').map(Number);
  return `Week of ${new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
};

/** Level, points, perfect days and medal weeks: the rewards for everyday effort. */
function Trophies({ r }) {
  const tally = [1, 2, 3].map((rank) => r.medalWeeks.filter((w) => w.medal.rank === rank).length);
  return (
    <section aria-labelledby="trophyH">
      <div className="flex items-center gap-1"><H2 id="trophyH">Your rewards</H2>
        <InfoTip label="How points work" text={`+${POINTS.plan} per plan ticked off, +${POINTS.step} per goal step, +${POINTS.perfectDay} for a perfect day (every plan that day done), +${POINTS.goal} per goal completed. Perfect days in a week earn a medal: 5 Bronze, 6 Silver, 7 Gold.`} /></div>
      <div className={cn(panel, 'grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]')}>
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-rust text-2xl font-extrabold text-white">{r.level.n}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Level {r.level.n}</p>
            <p className="text-xl font-extrabold text-charcoal">{r.level.name}</p>
            <Bar pct={r.level.pct} height="h-2" className="mt-2" label="Progress to the next level" />
            <p className="mt-1 text-xs text-muted"><span className="font-bold tabular-nums text-charcoal">{r.points.toLocaleString()} pts</span>
              {r.level.next ? ` · ${r.level.toNext.toLocaleString()} to ${r.level.next.name}` : ' · Top level!'}</p>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[['⭐', r.perfectDays, 'Perfect days'], ['✅', r.counts.plans, 'Plans done'], ['🎯', r.counts.goals, 'Goals done']].map(([e, v, k]) => (
            <div key={k} className="rounded-xl border border-oat bg-panel px-2 py-3">
              <dd className="text-xl font-extrabold tabular-nums text-charcoal"><span aria-hidden="true">{e} </span>{v}</dd>
              <dt className="text-[11px] font-semibold text-muted">{k}</dt>
            </div>
          ))}
        </dl>
        <div className="md:col-span-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Weekly medals</h3>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[1, 2, 3].map((rank) => {
              const M = WEEK_MEDALS[rank], n = tally[rank - 1];
              return (
                <div key={rank} className={cn('rounded-xl border p-2.5 text-center', n ? 'border-rust/40 bg-rust/5' : 'border-oat opacity-60')}>
                  <div className={cn('text-3xl leading-none', !n && 'grayscale')} aria-hidden="true">{M.emoji}</div>
                  <div className="mt-1 text-xs font-extrabold text-charcoal">{M.name}</div>
                  <div className="text-[11px] text-muted">{n ? `${n} earned` : `${M.days} perfect days`}</div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-charcoal">
            <span className="font-bold">This week:</span> {r.week.perfect} perfect day{r.week.perfect === 1 ? '' : 's'}
            {r.week.medal ? ` · ${r.week.medal.emoji} ${r.week.medal.name} earned` : ''}
            {r.week.next ? ` · ${r.week.next.days - r.week.perfect} more for ${r.week.next.emoji} ${r.week.next.name}` : ''}
          </p>
          {r.medalWeeks.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {r.medalWeeks.slice(0, 8).map((w) => (
                <li key={w.start} className="rounded-full border border-oat bg-panel px-3 py-1 text-xs font-semibold text-charcoal">{w.medal.emoji} {shortWeek(w.start)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Performance({ a, badges }) {
  const o = a.overall;
  return (
    <section className="xl:col-span-2" aria-labelledby="perfH">
      <H2 id="perfH">Performance</H2>
      <div className={panel}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="relative h-32 w-32 shrink-0" role="img" aria-label="Goal steps done">
            <Ring pct={o.completion_pct} track="rgb(var(--oat))" stroke="rgb(var(--rust))" strokeWidth={10} />
            <div className="absolute inset-0 grid place-items-center text-center"><div><div className="text-3xl font-extrabold tabular-nums text-charcoal">{o.completion_pct}%</div><div className="text-[10px] font-bold uppercase tracking-wider text-muted">Goal steps</div></div></div>
          </div>
          <dl className="grid min-w-[14rem] flex-1 gap-3 text-sm">
            {[['Goals completed', `${o.goals_completed}/${o.goals_total}`], ['Goal steps done', `${o.tasks_done}/${o.tasks_total}`], ['Goal badges earned', badges]].map(([k, v], i, arr) => (
              <div key={k} className={cn('flex items-baseline justify-between gap-2 pb-2', i < arr.length - 1 && 'border-b border-oat')}>
                <dt className="text-muted">{k}</dt><dd className="text-lg font-extrabold tabular-nums text-charcoal">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <h3 className="mt-6 text-xs font-bold uppercase tracking-wider text-muted">By category</h3>
        <div className="mt-3 grid gap-x-8 gap-y-5 md:grid-cols-2">
          {a.categories.length ? a.categories.map((c) => (
            <div key={c.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 font-bold text-charcoal"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} /><span className="truncate">{c.name}</span></span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">{c.tasks_done}/{c.tasks_total} steps &middot; <span className="text-charcoal">{c.completion_pct}%</span></span>
              </div>
              <Bar pct={c.completion_pct} className="mt-1.5" fillStyle={{ background: c.color }} label={`${c.name} task completion`} />
              <p className="mt-1 text-[11px] text-muted">{c.goals_completed} of {c.goals_total} goal{c.goals_total === 1 ? '' : 's'} completed</p>
            </div>
          )) : <p className="text-sm text-muted">Add goals and finish tasks to see your breakdown by category.</p>}
        </div>
      </div>
    </section>
  );
}

function BadgeGallery({ reviews }) {
  const counts = [1, 2, 3].map((r) => reviews.filter((x) => x.tier === r).length);
  return (
    <section aria-labelledby="badgeH">
      <H2 id="badgeH">Badge gallery</H2>
      <div className={panel}>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((r) => {
            const T = TIERS[r], n = counts[r - 1];
            return (
              <div key={r} className={cn('rounded-2xl border p-3 text-center', !n && 'border-oat bg-soft opacity-60')}
                style={n ? { borderColor: `${T.color}88`, background: `${T.color}14` } : undefined}>
                <div className={cn('text-4xl leading-none', !n && 'grayscale')} aria-hidden="true">{T.emoji}</div>
                <div className="mt-2 text-xs font-extrabold uppercase tracking-wider text-charcoal">{T.name}</div>
                <div className={cn('text-lg font-extrabold tabular-nums', n ? 'text-charcoal' : 'text-muted')}>{n}</div>
                <div className="text-[10px] text-muted">{n ? 'earned' : `${T.min}%+ to unlock`}</div>
              </div>
            );
          })}
        </div>
        <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted">Latest</h3>
        <ul className="mt-3 grid gap-2">
          {reviews.slice(0, 4).map((b) => {
            const T = TIERS[Math.min(3, b.tier)];
            return (
              <li key={b.id} className="flex items-center gap-3 rounded-xl border border-oat bg-soft px-3 py-2">
                <span className="text-2xl" aria-hidden="true">{T.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-charcoal">{b.goal_title}</p>
                  <p className="text-[11px] text-muted">{T.name} badge &middot; {Math.round(b.pct)}% &middot; {fmtWhen(b.reviewed_at)}</p>
                </div>
              </li>
            );
          })}
          {!reviews.length && <li className="text-sm text-muted">No badges yet. Get a goal to 50% to earn Bronze.</li>}
        </ul>
      </div>
    </section>
  );
}

// forwardRef: AnimatePresence (popLayout) needs a ref to the card to animate it out
const HistoryCard = forwardRef(function HistoryCard({ g }, ref) {
  const { restoreGoal, deleteGoal, categories, journal, openReflection } = useApp();
  const reflected = journal.some((e) => e.kind === 'GOAL' && e.goal_id === g.id);
  const done = g.status === 'COMPLETED';
  const T = g.best_tier_rank ? TIERS[Math.min(3, g.best_tier_rank)] : null;
  const cat = categories.find((c) => c.id === g.category_id);
  const StatusIcon = done ? CheckCircle2 : Archive;
  const when = done ? `Completed ${fmtWhen(g.completed_at || g.updated_at)}` : `Archived ${fmtWhen(g.updated_at)}`;
  const tasks = g.sub_plans.filter((t) => t.done).length;
  return (
    <motion.article ref={ref} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
      className="rounded-2xl border border-oat bg-soft p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider', done ? 'border-success/50 bg-success/15 text-success' : 'border-blush bg-oat text-charcoal')}>
          <StatusIcon className="h-3 w-3" aria-hidden="true" />{done ? 'Completed' : 'Archived'}
        </span>
        {cat && (
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold" style={{ background: `${cat.color}22`, borderColor: `${cat.color}88`, color: 'rgb(var(--charcoal))' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color }} />{cat.name}
          </span>
        )}
        {T && <span className="ml-auto text-xl leading-none" title={`${T.name} badge`} aria-label={`${T.name} badge`}>{T.emoji}</span>}
      </div>
      <h3 className="mt-2.5 break-words text-base font-extrabold leading-snug text-charcoal">{g.title}</h3>
      <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{when}</p>
      <div className="mt-3 flex items-center gap-3">
        <Bar pct={progressOf(g)} height="h-1.5" className="flex-1" fill={done ? 'bg-success' : 'bg-blush'} label={`${g.title} progress`} />
        <span className="text-xs font-semibold tabular-nums text-muted">{tasks}/{g.sub_plans.length} plans</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {done && (
          <button type="button" onClick={() => openReflection(g.id)} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold', reflected ? 'border border-oat bg-oat text-charcoal hover:border-rust' : 'bg-success text-on-status hover:opacity-90')}>
            <BookHeart className="h-3.5 w-3.5" aria-hidden="true" />{reflected ? 'Read reflection' : 'Write a reflection'}
          </button>
        )}
        {g.status === 'ARCHIVED' && (
          <button type="button" onClick={() => restoreGoal(g.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-oat bg-oat px-3 py-1.5 text-xs font-bold text-charcoal hover:border-rust">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Restore
          </button>
        )}
        <TwoTapButton onConfirm={() => deleteGoal(g.id)} icon={Trash2} label={`Delete "${g.title}" for good`} confirmText="Tap again to delete for good"
          className="ml-auto rounded-lg px-2.5 py-1.5 text-xs font-bold text-muted hover:bg-danger/10 hover:text-danger">Delete</TwoTapButton>
      </div>
    </motion.article>
  );
});

export default function HistoryView() {
  const { goals, reviews, categories, rewards } = useApp();
  const [filter, setFilter] = useState('all');
  const analytics = useMemo(() => computeAnalytics(goals, categories), [goals, categories]);
  const past = goals
    .filter((g) => g.status !== 'ACTIVE')
    .sort((a, b) => new Date(b.completed_at || b.updated_at) - new Date(a.completed_at || a.updated_at));
  const shown = past.filter((g) => filter === 'all' || g.status === filter);

  return (
    <div className="grid gap-8">
      <Trophies r={rewards} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Performance a={analytics} badges={reviews.length} />
        <BadgeGallery reviews={reviews} />
      </div>

      <section aria-labelledby="histH">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <H2 id="histH">History</H2>
          <div className="flex gap-1 rounded-xl border border-oat bg-soft p-0.5" role="group" aria-label="Filter history">
            {[['all', 'All'], ['COMPLETED', 'Completed'], ['ARCHIVED', 'Archived']].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className="seg-btn rounded-lg px-3 py-1.5 text-xs font-bold">{label}</button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 items-start gap-6 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">{shown.map((g) => <HistoryCard key={g.id} g={g} />)}</AnimatePresence>
        </div>
        {shown.length === 0 && (
          <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-dashed border-oat bg-soft p-10 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-oat text-rust-dark"><Archive className="h-6 w-6" aria-hidden="true" /></div>
            <p className="font-bold text-charcoal">{filter === 'all' ? 'Nothing here yet' : `No ${filter.toLowerCase()} goals`}</p>
            <p className="mt-1 text-sm text-muted">Finish every task in a goal, or archive one, and it will show up here.</p>
          </div>
        )}
      </section>
    </div>
  );
}
