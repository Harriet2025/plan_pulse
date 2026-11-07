import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Info, Sparkles } from 'lucide-react';
import { avatarUrl } from '../api';
import { RING } from '../lib/constants';
import { cn } from '../lib/utils';

const spring = { type: 'spring', stiffness: 90, damping: 14 };

/**
 * A small ⓘ that shows an explanation in a bubble when tapped (tap again, tap elsewhere or Escape to close).
 * For the things worth explaining; obvious things get no text at all.
 */
export function InfoTip({ text, label = 'More about this', align = 'left', className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <span ref={ref} className={cn('relative inline-flex align-middle', className)}>
      <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((o) => !o); }} aria-expanded={open} aria-label={label}
        className={cn('grid h-6 w-6 place-items-center rounded-full transition-colors', open ? 'bg-oat text-charcoal' : 'text-muted hover:bg-oat/70 hover:text-charcoal')}>
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <span role="note" className={cn('absolute top-full z-40 mt-1 w-[min(17rem,78vw)] rounded-xl bg-deep px-3 py-2 text-left text-xs font-medium normal-case leading-relaxed tracking-normal text-white shadow-lg',
          align === 'right' ? 'right-0' : 'left-0')}>
          {text}
        </span>
      )}
    </span>
  );
}

/**
 * Circular progress. Draws from empty to `pct` and springs when it changes. `track` and `stroke` are CSS colours,
 * theme variables included (rgb(var(--rust))): they are set as styles, since SVG attributes cannot read variables.
 */
export function Ring({ pct, track, stroke, strokeWidth = 9, defs, style }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
      {defs}
      <circle cx="50" cy="50" r="42" fill="none" strokeWidth={strokeWidth} style={{ stroke: track }} />
      <motion.circle
        cx="50" cy="50" r="42" fill="none" strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={RING} initial={{ strokeDashoffset: RING }}
        animate={{ strokeDashoffset: RING * (1 - pct / 100) }}
        transition={{ type: 'spring', stiffness: 40, damping: 12 }} style={{ stroke, ...style }}
      />
    </svg>
  );
}

/** Horizontal bar that springs to its width. `track` and `fill` take Tailwind classes. */
export function Bar({ pct, track = 'bg-oat', fill = 'bg-rust', fillStyle, height = 'h-2', label, className }) {
  return (
    <div
      className={cn('overflow-hidden rounded-full', height, track, className)}
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}
    >
      <motion.div
        className={cn('h-full rounded-full', fill)} style={fillStyle}
        initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={spring}
      />
    </div>
  );
}

/** The user's profile photo, or their initial on a dusty-rose circle when they have none (or it fails to load). Size comes from className. */
export function Avatar({ user, className }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    avatarUrl(user).then((u) => { if (alive) setUrl(u); }).catch(() => {});
    return () => { alive = false; };
  }, [user?.id, user?.avatar_v]); // eslint-disable-line react-hooks/exhaustive-deps
  const [failed, setFailed] = useState(null);
  if (url && failed !== url) {
    return <img src={url} alt="" onError={() => setFailed(url)} className={cn('shrink-0 rounded-full bg-oat object-cover', className)} />;
  }
  return (
    <div aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-full bg-blush font-extrabold text-charcoal', className)}>
      {(user.display_name.trim()[0] || '?').toUpperCase()}
    </div>
  );
}

// Signature decoration for the rust and charcoal panels: fine diagonal "linen" hairlines that fade out
// toward the content, so they add texture without competing with text.
export function LinenTexture({ className }) {
  const fade = 'linear-gradient(to left, #000 0%, transparent 60%)';
  return (
    <div
      aria-hidden="true" className={cn('pointer-events-none absolute inset-0', className)}
      style={{
        backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,.1) 0, rgba(255,255,255,.1) 1px, transparent 1px, transparent 10px)',
        WebkitMaskImage: fade, maskImage: fade,
      }}
    />
  );
}

// One soft shadow style for every raised surface (in dark mode it simply sinks into the background)
export const cardShadow = { boxShadow: '0 1px 2px rgba(11,14,20,.05), 0 10px 24px -14px rgba(11,14,20,.18)' };
// The big banners (dashboard, partners, sign-in): electric blue sliding into charcoal, with a thin electric
// edge along the top. Colours come from the theme (--hero-from / --hero-to), so dark mode gets a deeper version.
export const heroStyle = {
  backgroundImage: 'linear-gradient(125deg, rgb(var(--hero-from)) 0%, rgb(var(--hero-from)) 30%, rgb(var(--hero-to)) 100%)',
  boxShadow: 'inset 0 2px 0 rgb(var(--blush) / .55), 0 18px 36px -22px rgb(var(--hero-from) / .55)',
};
export const glassShadow = cardShadow;

// onDark: for use on the rust brand panel (light tile, all-white wordmark)
export function Logo({ size = 'h-10 w-10', icon = 'h-5 w-5', text = 'text-xl', onDark = false }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn('grid place-items-center rounded-xl', onDark ? 'bg-soft text-rust-dark' : 'bg-rust text-white', size)}>
        <Sparkles className={icon} />
      </div>
      <span className={cn('font-extrabold tracking-tight', onDark ? 'text-white' : 'text-charcoal', text)}>Aura<span className={onDark ? '' : 'text-rust-dark'}>Goal</span></span>
    </div>
  );
}

/**
 * A button that needs two taps: the first asks "Tap again to …", the second does it. It resets after 3 seconds,
 * so a stray tap never deletes anything.
 */
export function TwoTapButton({ onConfirm, children, confirmText, icon: Icon, className, armedClassName = 'bg-danger/10 text-danger', label }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  const tap = async () => {
    if (!armed) { setArmed(true); return; }
    setBusy(true);
    await onConfirm();
    setBusy(false); setArmed(false);
  };
  return (
    <button type="button" onClick={tap} disabled={busy} aria-label={armed ? confirmText : label} title={armed ? undefined : label}
      className={cn('inline-flex items-center gap-1.5 transition-colors disabled:opacity-60', className, armed && armedClassName)}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {armed ? <span>{confirmText}</span> : children}
    </button>
  );
}
