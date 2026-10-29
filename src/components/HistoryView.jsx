import { forwardRef, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TIERS, catIcon } from '../lib/constants';
import { cn, computeAnalytics, fmtWhen, progressOf } from '../lib/utils';
import { Bar, Ring } from './ui';

const panel = 'mt-3 rounded-2xl border border-oat bg-soft p-5';
const H2 = ({ children, id }) => <h2 id={id} className="text-sm font-bold uppercase tracking-[0.14em] text-charcoal/80">{children}</h2>;

function Performance({ a, badges }) {
  const o = a.overall;
  return (
    <section className="xl:col-span-2" aria-labelledby="perfH">
      <H2 id="perfH">Performance</H2>
      <div className={panel}>
        <div className="flex flex-wrap items-center gap-6">
          <div className="relative h-32 w-32 shrink-0" role="img" aria-label="Overall task completion">
            <Ring pct={o.completion_pct} track="#E8DCCB" stroke="#B85C38" strokeWidth={10} />
            <div className="absolute inset-0 grid place-items-center text-center"><div><div className="text-3xl font-extrabold tabular-nums text-charcoal">{o.completion_pct}%</div><div className="text-[10px] font-bold uppercase tracking-wider text-muted">Tasks done</div></div></div>
          </div>
          <dl className="grid min-w-[14rem] flex-1 gap-3 text-sm">
            {[['Goals completed', `${o.goals_completed}/${o.goals_total}`], ['Tasks finished', `${o.tasks_done}/${o.tasks_total}`], ['Badges earned', badges]].map(([k, v], i, arr) => (
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
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">{c.tasks_done}/{c.tasks_total} tasks &middot; <span className="text-charcoal">{c.completion_pct}%</span></span>
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
  const { restoreGoal, categories } = useApp();
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
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider', done ? 'border-success/50 bg-success/15 text-success' : 'border-blush bg-oat text-charcoal/80')}>
          <StatusIcon className="h-3 w-3" aria-hidden="true" />{done ? 'Completed' : 'Archived'}
        </span>
        {cat && (
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold" style={{ background: `${cat.color}22`, borderColor: `${cat.color}88`, color: '#352D29' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color }} />{cat.name}
          </span>
        )}
        {T && <span className="ml-auto text-xl leading-none" title={`${T.name} badge`} aria-label={`${T.name} badge`}>{T.emoji}</span>}
      </div>
      <h3 className="mt-2.5 break-words text-base font-extrabold leading-snug text-charcoal">{g.title}</h3>
      <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{when}</p>
      <div className="mt-3 flex items-center gap-3">
        <Bar pct={progressOf(g)} height="h-1.5" className="flex-1" fill={done ? 'bg-success' : 'bg-blush'} label={`${g.title} progress`} />
        <span className="text-xs font-semibold tabular-nums text-muted">{tasks}/{g.sub_plans.length} tasks</span>
      </div>
      {g.status === 'ARCHIVED' && (
        <button type="button" onClick={() => restoreGoal(g.id)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-oat bg-oat px-3 py-1.5 text-xs font-bold text-charcoal hover:border-rust">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Restore
        </button>
      )}
    </motion.article>
  );
});

export default function HistoryView() {
  const { goals, reviews } = useApp();
  const [filter, setFilter] = useState('all');
  const analytics = useMemo(() => computeAnalytics(goals), [goals]);
  const past = goals
    .filter((g) => g.status !== 'ACTIVE')
    .sort((a, b) => new Date(b.completed_at || b.updated_at) - new Date(a.completed_at || a.updated_at));
  const shown = past.filter((g) => filter === 'all' || g.status === filter);

  return (
    <div className="grid gap-8">
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
