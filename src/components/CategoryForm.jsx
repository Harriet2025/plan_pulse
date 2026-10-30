import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../lib/utils';

// Muted, earthy colours that sit beside the ivory / rust / rose palette and stay readable with white icons on them
export const CATEGORY_COLORS = ['#3F6F9B', '#B38A3A', '#8A6E9B', '#3F8F83', '#5F8F6B', '#B8647D', '#9A7B4F', '#6E86B0', '#A0623D', '#5E7A3A', '#7A5C8E', '#4F7F8F'];

/** Name and colour for a personal category. `initial` fills it in for renaming. Calls onSave(name, color). */
export default function CategoryForm({ initial, onSave, onCancel, saveLabel = 'Add category', compact = false }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!name.trim()) return;
    setBusy(true);
    await onSave(name.trim(), color);
    setBusy(false);
  };
  return (
    // A div, not a form, so it can sit inside the goal form without nesting forms
    <div className={cn('rounded-2xl border border-rust/40 bg-soft', compact ? 'p-3' : 'p-4')} onKeyDown={(e) => { if (e.key === 'Enter') submit(e); }}>
      <label className="block text-[11px] font-semibold text-muted">Name
        <input className="field mt-1 !py-2" maxLength={40} placeholder="e.g. Content creation" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <p className="mt-2.5 text-[11px] font-semibold text-muted">Colour</p>
      <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colour">
        {CATEGORY_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)}
            className={cn('grid h-7 w-7 place-items-center rounded-full ring-offset-2 ring-offset-soft transition-transform hover:scale-110', color === c && 'ring-2 ring-charcoal')} style={{ background: c }}>
            {color === c && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3.5} aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={submit} disabled={busy || !name.trim()} className="rounded-lg bg-rust px-3.5 py-2 text-xs font-extrabold text-white hover:bg-rust-dark disabled:opacity-50">{busy ? 'Saving…' : saveLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-xs font-bold text-muted hover:bg-oat/60 hover:text-charcoal">Cancel</button>}
      </div>
    </div>
  );
}
