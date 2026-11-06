import { Check, Lock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cn } from '../lib/utils';
import { Avatar } from './ui';

export const firstName = (name) => name.trim().split(/\s+/)[0];

/** "Only you", "Ama" or "Ama and Kofi": who can see a goal, from its shared_with ids. */
export function sharedText(ids, partners) {
  const names = partners.filter((p) => ids.includes(p.id)).map((p) => firstName(p.partner.display_name));
  if (!names.length) return 'Only you';
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Pick which partners can see a goal. Every goal is private to you until you tick someone here.
 * `value` and `onChange` work with a list of partner (partnership) ids. Shows nothing when you have no partners.
 */
export default function ShareWith({ value, onChange, disabled, compact }) {
  const { partners: { partners } } = useApp();
  if (!partners.length) return null;
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id].sort((a, b) => a - b));
  return (
    <div>
      {!compact && <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Who can see it</p>}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Partners who can see this goal">
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold', value.length ? 'text-muted' : 'bg-oat text-charcoal')}>
          <Lock className="h-3 w-3" aria-hidden="true" />{value.length ? 'You, and' : 'Only you'}
        </span>
        {partners.map((p) => {
          const on = value.includes(p.id);
          return (
            <button key={p.id} type="button" aria-pressed={on} disabled={disabled} onClick={() => toggle(p.id)}
              className={cn('inline-flex items-center gap-1.5 rounded-full border-2 py-0.5 pl-0.5 pr-2.5 text-xs font-bold transition-colors disabled:opacity-50',
                on ? 'border-rust bg-rust/10 text-rust-dark' : 'border-oat bg-soft text-muted hover:border-blush')}>
              <Avatar user={p.partner} className="h-5 w-5 text-[9px]" />
              {firstName(p.partner.display_name)}
              {on && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {!compact && <p className="mt-1.5 text-xs text-muted">{value.length ? 'They see this goal and its plans, and can cheer you on.' : 'Your goals are private. Tap a partner to let them see this one.'}</p>}
    </div>
  );
}
