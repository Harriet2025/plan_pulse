import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, LineChart, Plus, Trash2 } from 'lucide-react';
import { cn, localDate, parseDay } from '../lib/utils';

// A progress log block: a number you track over time (km run, money saved, pages read, weight…), drawn as a line
// chart with an optional target. One series in the app colour, 2px line, dots with a surface ring, recessive grid,
// a dashed target line, a crosshair and tooltip on hover or tap, and the entries as a table underneath.
// Block: { id, type: 'log', text: what is tracked, unit, target, entries: [{ d: 'YYYY-MM-DD', v: number }] }

const MAX_ENTRIES = 500;
const fmt = (n) => (Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const shortDate = (k) => parseDay(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Round axis bounds: [min, max] widened to friendly numbers, with 3 gridlines. */
function niceDomain(lo, hi) {
  if (lo === hi) { lo -= 1; hi += 1; }
  if (lo >= 0 && lo < hi * 0.35) lo = 0;
  const span = hi - lo, step = 10 ** Math.floor(Math.log10(span / 3));
  const pick = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => span / s <= 4) ?? step * 10;
  return { lo: Math.floor(lo / pick) * pick, hi: Math.ceil(hi / pick) * pick, step: pick };
}

function Chart({ entries, unit, target, title }) {
  const box = useRef(null);
  const [w, setW] = useState(560);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    setW(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 168, padL = 44, padR = 14, padT = 14, padB = 26;
  const vals = entries.map((e) => e.v).concat(target != null ? [target] : []);
  const dom = niceDomain(Math.min(...vals), Math.max(...vals));
  const t0 = parseDay(entries[0].d).getTime(), t1 = parseDay(entries[entries.length - 1].d).getTime();
  const x = (k) => (t1 === t0 ? (padL + w - padR) / 2 : padL + ((parseDay(k).getTime() - t0) / (t1 - t0)) * (w - padL - padR));
  const y = (v) => padT + (1 - (v - dom.lo) / (dom.hi - dom.lo)) * (H - padT - padB);
  const pts = entries.map((e) => [x(e.d), y(e.v), e]);
  const grid = [];
  for (let v = dom.lo; v <= dom.hi + 1e-9; v += dom.step) grid.push(v);

  const near = (clientX) => {
    const r = box.current.getBoundingClientRect();
    const px = clientX - r.left;
    let best = null;
    for (const p of pts) if (!best || Math.abs(p[0] - px) < Math.abs(best[0] - px)) best = p;
    setHover(best);
  };
  const last = entries[entries.length - 1];

  return (
    <div ref={box} className="relative select-none" onPointerMove={(e) => near(e.clientX)} onPointerDown={(e) => near(e.clientX)} onPointerLeave={() => setHover(null)}>
      <svg width="100%" height={H} viewBox={`0 0 ${w} ${H}`} preserveAspectRatio="xMinYMid meet" className="block" role="img"
        aria-label={`${title || 'Progress'}: ${entries.length} entries from ${shortDate(entries[0].d)} to ${shortDate(last.d)}, latest ${fmt(last.v)} ${unit}${target != null ? `, target ${fmt(target)} ${unit}` : ''}.`}>
        {grid.map((v) => (
          <g key={v}>
            <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="rgb(var(--oat))" strokeWidth="1" />
            <text x={padL - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize="11" fill="rgb(var(--muted))" className="tabular-nums">{fmt(v)}</text>
          </g>
        ))}
        <text x={padL} y={H - 6} fontSize="11" fill="rgb(var(--muted))">{shortDate(entries[0].d)}</text>
        {entries.length > 1 && <text x={w - padR} y={H - 6} textAnchor="end" fontSize="11" fill="rgb(var(--muted))">{shortDate(last.d)}</text>}
        {target != null && (
          <g>
            <line x1={padL} x2={w - padR} y1={y(target)} y2={y(target)} stroke="rgb(var(--charcoal) / .55)" strokeWidth="1.5" strokeDasharray="5 4" />
            <text x={w - padR} y={y(target) - 6} textAnchor="end" fontSize="11" fontWeight="600" fill="rgb(var(--charcoal))">Target {fmt(target)}{unit ? ` ${unit}` : ''}</text>
          </g>
        )}
        {pts.length > 1 && <polyline points={pts.map((p) => `${p[0]},${p[1]}`).join(' ')} fill="none" stroke="rgb(var(--rust))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {hover && <line x1={hover[0]} x2={hover[0]} y1={padT} y2={H - padB} stroke="rgb(var(--muted) / .6)" strokeWidth="1" />}
        {pts.map((p) => (
          <circle key={p[2].d + p[2].v} cx={p[0]} cy={p[1]} r={hover === p ? 5.5 : pts.length > 40 ? 3 : 4} fill="rgb(var(--rust))" stroke="rgb(var(--ivory))" strokeWidth="2" />
        ))}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-oat bg-soft px-2.5 py-1.5 text-[12px] shadow-lg"
          style={{ left: Math.min(Math.max(hover[0], 60), w - 60) }}>
          <span className="block text-muted">{parseDay(hover[2].d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <span className="block font-bold tabular-nums text-charcoal">{fmt(hover[2].v)}{unit ? ` ${unit}` : ''}</span>
        </div>
      )}
    </div>
  );
}

export default function ProgressLog({ block, onChange, readOnly }) {
  const entries = useMemo(() => [...(block.entries ?? [])].sort((a, b) => a.d.localeCompare(b.d)), [block.entries]);
  const [date, setDate] = useState(() => localDate());
  const [value, setValue] = useState('');
  const [showAll, setShowAll] = useState(false);
  const unit = block.unit ?? '';
  const target = block.target === '' || block.target == null || Number.isNaN(Number(block.target)) ? null : Number(block.target);

  const add = (e) => {
    e.preventDefault();
    const v = Number(String(value).replace(',', '.'));
    if (value === '' || !Number.isFinite(v) || !date) return;
    // One entry per day: a second one for the same day replaces it
    const next = [...entries.filter((x) => x.d !== date), { d: date, v }].sort((a, b) => a.d.localeCompare(b.d)).slice(-MAX_ENTRIES);
    onChange({ entries: next });
    setValue('');
  };
  const remove = (d) => onChange({ entries: entries.filter((x) => x.d !== d) });

  const last = entries[entries.length - 1], firstE = entries[0];
  const total = entries.reduce((n, x) => n + x.v, 0);
  const best = entries.length ? Math.max(...entries.map((x) => x.v)) : null;
  const change = entries.length > 1 ? last.v - firstE.v : null;
  const u = unit ? ` ${unit}` : '';
  const field = 'rounded-md border border-oat bg-soft px-2 py-1.5 text-sm text-charcoal outline-none focus:border-rust disabled:opacity-60';

  return (
    <div className="my-2 rounded-xl border border-oat bg-ivory p-3 md:p-4" role="group" aria-label={`Progress log: ${block.text || 'untitled'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <LineChart className="h-4 w-4 shrink-0 text-rust-dark" aria-hidden="true" />
        <input value={block.text} readOnly={readOnly} maxLength={120} onChange={(e) => onChange({ text: e.target.value })} placeholder="What are you tracking? e.g. Km run"
          aria-label="What you are tracking" className="min-w-[10rem] flex-1 bg-transparent text-[15px] font-bold text-charcoal outline-none placeholder:font-normal placeholder:text-faint" />
        <input value={unit} readOnly={readOnly} maxLength={12} onChange={(e) => onChange({ unit: e.target.value })} placeholder="Unit" aria-label="Unit, e.g. km" className={cn(field, 'w-20')} />
        <input value={block.target ?? ''} readOnly={readOnly} inputMode="decimal" maxLength={12} onChange={(e) => onChange({ target: e.target.value.replace(/[^0-9.,-]/g, '').replace(',', '.') })}
          placeholder="Target" aria-label="Target (optional)" className={cn(field, 'w-24')} />
      </div>

      {entries.length > 0 && (
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
          <div><dt className="inline text-muted">Latest </dt><dd className="inline font-bold tabular-nums text-charcoal">{fmt(last.v)}{u}</dd></div>
          <div><dt className="inline text-muted">Total </dt><dd className="inline font-bold tabular-nums text-charcoal">{fmt(total)}{u}</dd></div>
          <div><dt className="inline text-muted">Best </dt><dd className="inline font-bold tabular-nums text-charcoal">{fmt(best)}{u}</dd></div>
          {change !== null && <div><dt className="inline text-muted">Since start </dt><dd className="inline font-bold tabular-nums text-charcoal">{change > 0 ? '+' : ''}{fmt(change)}{u}</dd></div>}
          {target != null && <div><dt className="inline text-muted">Target </dt><dd className="inline font-bold tabular-nums text-charcoal">{fmt(target)}{u}</dd></div>}
        </dl>
      )}

      <div className="mt-3 overflow-hidden">
        {entries.length ? <Chart entries={entries} unit={unit} target={target} title={block.text} />
          : <p className="rounded-lg border border-dashed border-oat px-3 py-6 text-center text-[13px] text-muted">Add your first entry below. A line chart appears as you log more.</p>}
      </div>

      {!readOnly && (
        <form onSubmit={add} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Day" className={field} />
          <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder={unit ? `Amount (${unit})` : 'Amount'} aria-label="Amount" className={cn(field, 'w-32')} />
          <button type="submit" disabled={value === ''} className="inline-flex items-center gap-1 rounded-lg bg-rust px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4" aria-hidden="true" />Log it</button>
        </form>
      )}

      {entries.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-charcoal">
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAll && 'rotate-180')} aria-hidden="true" />{showAll ? 'Hide entries' : `Show entries (${entries.length})`}
          </button>
          {showAll && (
            <table className="mt-2 w-full max-w-sm text-[13px]">
              <thead><tr className="text-left text-muted"><th className="py-1 font-semibold">Day</th><th className="py-1 text-right font-semibold">Amount</th><th className="w-8" /></tr></thead>
              <tbody>
                {[...entries].reverse().map((x) => (
                  <tr key={x.d} className="border-t border-oat">
                    <td className="py-1 text-charcoal">{parseDay(x.d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="py-1 text-right font-semibold tabular-nums text-charcoal">{fmt(x.v)}{u}</td>
                    <td className="py-1 text-right">{!readOnly && <button type="button" onClick={() => remove(x.d)} aria-label={`Delete the entry for ${x.d}`} className="rounded p-1 text-faint hover:text-danger"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

/** A one-line summary for the Pinned band: "Km run · 5 km (latest)". */
export const logSummary = (b) => {
  const e = [...(b.entries ?? [])].sort((a, c) => a.d.localeCompare(c.d));
  const last = e[e.length - 1];
  return `${b.text || 'Progress log'}${last ? ` · ${fmt(last.v)}${b.unit ? ` ${b.unit}` : ''} (latest)` : ''}`;
};
