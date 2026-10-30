import { useState } from 'react';
import { BarChart3, BookOpen, ChevronLeft, ChevronRight, Undo2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { horizonOf } from '../lib/constants';
import { cn, localDate, periodEnd, periodKey, periodLabel, periodPhrase, periodRange, periodStart, shiftPeriod } from '../lib/utils';
import { EntryCard, MOODS, NoteEditor, PeriodReflection } from './JournalParts';
import { cardShadow } from './ui';

const TABS = [['ALL', 'All'], ['WEEKLY', 'Week'], ['MONTHLY', 'Month'], ['YEARLY', 'Year']];
const PAGE = 30;

/** Which day an entry belongs to when browsing by period: a goal reflection by its goal's end, a review by its period. */
function entryDay(e, goals) {
  if (e.kind === 'REVIEW') return e.period_key;
  if (e.kind === 'GOAL') return goals.find((g) => g.id === e.goal_id)?.due_date ?? e.date;
  return e.date;
}

export default function JournalView() {
  const { journal, goals, now, setView } = useApp();
  const [tab, setTab] = useState('ALL');
  const [anchor, setAnchor] = useState(() => new Date(now));
  const [limit, setLimit] = useState(PAGE);
  const browsing = tab !== 'ALL';
  const from = browsing ? localDate(periodStart(tab, anchor)) : null, to = browsing ? localDate(periodEnd(tab, anchor)) : null;
  const label = browsing ? periodLabel(tab, anchor, now) : '';
  const isCurrent = browsing && periodKey(tab, anchor) === periodKey(tab, now);

  // In a period: its notes and goal reflections (its own reflection is shown above them); otherwise everything
  const entries = journal
    .filter((e) => !browsing || (e.kind !== 'REVIEW' || e.period !== tab || e.period_key !== from) && entryDay(e, goals) >= from && entryDay(e, goals) <= to)
    .sort((a, b) => entryDay(b, goals).localeCompare(entryDay(a, goals)) || b.id - a.id);
  const moods = entries.filter((e) => e.mood).map((e) => e.mood);
  const avgMood = moods.length ? MOODS[Math.round(moods.reduce((n, m) => n + m, 0) / moods.length) - 1] : null;
  const shown = browsing ? entries : entries.slice(0, limit);

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <section className="rounded-3xl border border-oat bg-soft p-4 md:p-5" style={cardShadow}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-charcoal"><BookOpen className="h-5 w-5 text-rust-dark" aria-hidden="true" />Write in your journal</h2>
          <button type="button" onClick={() => setView('history')} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-muted hover:bg-oat/60 hover:text-charcoal"><BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />History &amp; analytics</button>
        </div>
        <p className="mb-3 text-xs text-muted">Private notes for you to look back on at the end of each week, month and year. Partners never see them.</p>
        <NoteEditor />
      </section>

      <section className="rounded-3xl border border-oat bg-soft p-4 md:p-5" style={cardShadow} aria-label="Your entries">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid grid-cols-4 gap-1 rounded-2xl bg-oat/60 p-1" role="tablist" aria-label="Look back by">
            {TABS.map(([id, text]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setAnchor(new Date(now)); }}
                className={cn('rounded-xl px-3 py-1.5 text-sm font-extrabold transition-colors', tab === id ? 'bg-rust text-white shadow-md' : 'text-charcoal hover:bg-soft/70')}>{text}</button>
            ))}
          </div>
          {browsing && (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setAnchor(shiftPeriod(tab, anchor, -1))} aria-label={`Previous ${horizonOf(tab).unit}`} className="grid h-9 w-9 place-items-center rounded-xl border border-oat bg-ivory hover:border-rust"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
              <div className="min-w-[8.5rem] text-center" aria-live="polite">
                <p className="text-sm font-extrabold text-charcoal">{label}</p>
                <p className="text-[11px] font-semibold text-muted">{periodRange(tab, anchor)}</p>
              </div>
              <button type="button" onClick={() => setAnchor(shiftPeriod(tab, anchor, 1))} aria-label={`Next ${horizonOf(tab).unit}`} className="grid h-9 w-9 place-items-center rounded-xl border border-oat bg-ivory hover:border-rust"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
              {!isCurrent && <button type="button" onClick={() => setAnchor(new Date(now))} className="inline-flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-bold text-rust-dark hover:bg-oat/60"><Undo2 className="h-3.5 w-3.5" aria-hidden="true" />{horizonOf(tab).this}</button>}
            </div>
          )}
        </div>

        {browsing && (
          <div className="mt-4 grid gap-4">
            <p className="text-sm text-charcoal">
              {entries.length ? `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} from ${periodPhrase(label)}` : `No notes from ${periodPhrase(label)} yet.`}
              {avgMood && <span className="text-muted"> · mostly {avgMood.emoji} {avgMood.label.toLowerCase()}</span>}
            </p>
            <PeriodReflection key={`${tab}:${from}`} horizon={tab} periodStartKey={from} label={periodPhrase(label)} />
          </div>
        )}

        <div className="mt-4 grid gap-3">
          {shown.map((e) => <EntryCard key={e.id} entry={e} />)}
          {!browsing && !entries.length && <p className="rounded-2xl border-2 border-dashed border-blush bg-ivory p-8 text-center text-sm text-muted">Your journal is empty. Write your first note above.</p>}
          {!browsing && entries.length > limit && (
            <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="justify-self-center rounded-xl px-4 py-2 text-sm font-bold text-rust-dark hover:bg-oat/60">Show older entries</button>
          )}
        </div>
      </section>
    </div>
  );
}

