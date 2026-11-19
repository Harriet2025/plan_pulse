import { useState } from 'react';
import { BarChart3, BookOpen, Check, ChevronLeft, ChevronRight, Moon, Undo2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { horizonOf } from '../lib/constants';
import { cn, localDate, periodEnd, periodKey, periodLabel, periodPhrase, periodRange, periodStart, shiftPeriod } from '../lib/utils';
import { EntryCard, MOODS, NoteEditor, PeriodReflection } from './JournalParts';
import { cardShadow } from './ui';
import { windDownDone, windKey } from '../lib/winddown';

const TABS = [['ALL', 'All'], ['WEEKLY', 'Week'], ['MONTHLY', 'Month'], ['YEARLY', 'Year']];
const PAGE = 30;

/** Which day an entry belongs to when browsing by period: a goal reflection by its goal's end, a review by its period. */
function entryDay(e, goals) {
  if (e.kind === 'REVIEW') return e.period_key;
  if (e.kind === 'GOAL') return goals.find((g) => g.id === e.goal_id)?.due_date ?? e.date;
  return e.date;
}

export default function JournalView() {
  const { journal, goals, now, setView, openWindDown } = useApp();
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
    // Wide screens: write on the left (it stays in view), read on the right
    <div className="mx-auto grid max-w-3xl items-start gap-5 xl:max-w-none xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
      <section className="rounded-3xl border border-oat bg-soft p-4 md:p-5 xl:sticky xl:top-6" style={cardShadow}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-charcoal"><BookOpen className="h-5 w-5 text-rust-dark" aria-hidden="true" />Write in your journal</h2>
          <button type="button" onClick={() => setView('history')} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-muted hover:bg-oat/60 hover:text-charcoal"><BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />History &amp; analytics</button>
        </div>
        <p className="mb-3 text-xs text-muted">Private to you. Partners never see it.</p>
        <NoteEditor />
        <div className="mt-5 border-t border-oat pt-4">
          <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-muted"><Moon className="h-3.5 w-3.5" aria-hidden="true" />Wind down</p>
          <p className="mt-1 text-xs text-muted">A guided few minutes to close a period: look back, decide what carries over, reflect, and set up the next one.</p>
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['DAILY', 'Today'], ['WEEKLY', 'This week'], ['MONTHLY', 'This month'], ['YEARLY', 'This year']].map(([h, text]) => {
              const done = windDownDone(windKey(h, now));
              return (
                <button key={h} type="button" onClick={() => openWindDown(h, localDate(now))}
                  className="flex items-center justify-between gap-1 rounded-xl border border-oat bg-ivory px-3 py-2 text-left text-sm font-semibold text-charcoal hover:border-rust">
                  {text}{done && <Check className="h-4 w-4 shrink-0 text-success" aria-label="done" />}
                </button>
              );
            })}
          </div>
        </div>
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
          {!browsing && !entries.length && <p className="rounded-2xl border-2 border-dashed border-blush/50 bg-ivory p-8 text-center text-sm text-muted">Your journal is empty. Write your first note to start it.</p>}
          {!browsing && entries.length > limit && (
            <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="justify-self-center rounded-xl px-4 py-2 text-sm font-bold text-rust-dark hover:bg-oat/60">Show older entries</button>
          )}
        </div>
      </section>
    </div>
  );
}

