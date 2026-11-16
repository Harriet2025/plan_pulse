import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Info, Sparkles } from 'lucide-react';
import { avatarUrl } from '../api';
import { RING } from '../lib/constants';
import { cn } from '../lib/utils';

// Full-colour 3D icons (Microsoft Fluent Emoji, MIT licence: public/emoji/LICENSE.txt), so each section and reward
// can be recognised without reading. Saved as small 128px WebP files in public/emoji/.
const EMOJI_FILES = { '🥉': 'bronze', '🥈': 'silver', '🥇': 'gold', '🏆': 'trophy', '🏅': 'medal', '⭐': 'star', '🌟': 'star', '✅': 'check', '🎯': 'target', '🎉': 'party' };
/** A section's picture, by the id used for the menu. */
export const SECTION_EMOJI = { active: 'dashboard', planner: 'planner', partners: 'partners', journal: 'journal', calendar: 'calendar', catchup: 'catchup', categories: 'categories', history: 'history', settings: 'settings' };
/**
 * One 3D icon: by file name (`name`, e.g. "journal") or by the emoji it stands for (`char`, e.g. "🥉"). An emoji
 * with no picture is shown as itself. Decorative unless a `label` is given.
 */
export function Emoji({ name, char, label, className = 'h-6 w-6' }) {
  const file = name ?? EMOJI_FILES[char];
  if (MEDAL_OF[file]) return <Medal metal={MEDAL_OF[file]} label={label} className={className} />;
  if (!file) return <span className={className} aria-hidden={label ? undefined : true} aria-label={label}>{char}</span>;
  return <img src={`/emoji/${file}.webp`} alt={label ?? ''} aria-hidden={label ? undefined : true} draggable={false} decoding="async"
    className={cn('inline-block shrink-0 select-none object-contain', className)} />;
}

// Medals are drawn, not pictures: polished metal with a bevelled rim, a raised star and a dark ribbon, so the
// badges look like real awards rather than cartoons. 'medal' (no tier yet) is plain steel.
const MEDAL_OF = { gold: 'gold', silver: 'silver', bronze: 'bronze', medal: 'steel' };
const METALS = {
  gold: { hi: '#FFF4C7', mid: '#E2B33C', lo: '#8C5E0C', edge: '#6E4806', stripe: '#E2B33C' },
  silver: { hi: '#FFFFFF', mid: '#C3CBD6', lo: '#6F7B8B', edge: '#56606E', stripe: '#C3CBD6' },
  bronze: { hi: '#FFE0C4', mid: '#C27A45', lo: '#6E3A17', edge: '#552B0F', stripe: '#C27A45' },
  steel: { hi: '#F4F6F9', mid: '#A9B3C0', lo: '#5D6775', edge: '#4A5360', stripe: '#A9B3C0' },
};
export function Medal({ metal = 'gold', label, className = 'h-10 w-10' }) {
  const m = METALS[metal] ?? METALS.gold;
  const id = useRef(`md${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <svg viewBox="0 0 64 64" className={cn('inline-block shrink-0', className)} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={m.hi} /><stop offset=".45" stopColor={m.mid} /><stop offset="1" stopColor={m.lo} /></linearGradient>
        <linearGradient id={`${id}rr`} x1="1" y1="1" x2="0" y2="0"><stop offset="0" stopColor={m.hi} /><stop offset=".5" stopColor={m.mid} /><stop offset="1" stopColor={m.lo} /></linearGradient>
        <radialGradient id={`${id}f`} cx=".38" cy=".32" r=".8"><stop offset="0" stopColor={m.hi} /><stop offset=".55" stopColor={m.mid} /><stop offset="1" stopColor={m.lo} /></radialGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1F2A44" /><stop offset="1" stopColor="#141B2E" /></linearGradient>
      </defs>
      {/* Ribbon */}
      <path d="M19 2h10l7 22h-10z" fill={`url(#${id}b)`} />
      <path d="M35 2h10l-7 22H28z" fill={`url(#${id}b)`} />
      <path d="M22.6 2h2.8l7 22h-2.8z" fill={m.stripe} opacity=".9" />
      <path d="M38.6 2h2.8l-7 22h-2.8z" fill={m.stripe} opacity=".9" />
      {/* Medal: rim, face, inner ring, raised star, shine */}
      <circle cx="32" cy="41" r="20" fill={m.edge} />
      <circle cx="32" cy="40.4" r="19.2" fill={`url(#${id}r)`} />
      <circle cx="32" cy="40.4" r="15.4" fill={`url(#${id}rr)`} />
      <circle cx="32" cy="40.4" r="14.4" fill={`url(#${id}f)`} />
      <circle cx="32" cy="40.4" r="12.2" fill="none" stroke={m.lo} strokeOpacity=".35" strokeWidth=".8" />
      <path d="M32 31.2l2.75 5.6 6.15.9-4.45 4.33 1.05 6.12L32 45.3l-5.5 2.9 1.05-6.12-4.45-4.33 6.15-.9z" fill={m.lo} opacity=".55" transform="translate(.6 .8)" />
      <path d="M32 31.2l2.75 5.6 6.15.9-4.45 4.33 1.05 6.12L32 45.3l-5.5 2.9 1.05-6.12-4.45-4.33 6.15-.9z" fill={`url(#${id}r)`} />
      <ellipse cx="25" cy="32" rx="7" ry="3.2" fill="#fff" opacity=".28" transform="rotate(-35 25 32)" />
    </svg>
  );
}

/**
 * The streak flame. Lit (orange and yellow, gently burning) while there is a streak; grey when there is none.
 * Pass burning={false} to keep it lit but still. Colours are fixed: fire looks like fire in every theme and app colour.
 */
export function StreakFlame({ lit = true, burning = true, className = "h-5 w-5" }) {
  const id = useRef(`fl${Math.random().toString(36).slice(2, 8)}`).current;
  const move = lit && burning;
  return (
    <svg viewBox="0 0 24 24" className={cn("shrink-0 overflow-visible", className)} aria-hidden="true">
      {lit && (
        <defs>
          <linearGradient id={`${id}o`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#E8380D" /><stop offset=".55" stopColor="#FF7A1A" /><stop offset="1" stopColor="#FFA733" /></linearGradient>
          <linearGradient id={`${id}i`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#FFB830" /><stop offset="1" stopColor="#FFE680" /></linearGradient>
          <radialGradient id={`${id}g`}><stop offset="0" stopColor="#FF8A1F" stopOpacity=".55" /><stop offset="1" stopColor="#FF8A1F" stopOpacity="0" /></radialGradient>
        </defs>
      )}
      {lit && <ellipse className={move ? "flame-glow" : undefined} cx="12" cy="16" rx="10" ry="8" fill={`url(#${id}g)`} />}
      <path className={move ? "flame-outer" : undefined} fill={lit ? `url(#${id}o)` : "rgb(var(--faint) / .55)"}
        d="M12 1.5c.7 3.3 3.2 5.1 4.9 7.4 1.5 2.1 2.6 4.1 2.6 6.4 0 4.3-3.3 7.2-7.5 7.2s-7.5-2.9-7.5-7.2c0-2.7 1.4-4.9 3.1-6.6.2 1.8 1 3.1 2.2 3.8C9.4 8.6 10.4 4.7 12 1.5z" />
      <path className={move ? "flame-inner" : undefined} fill={lit ? `url(#${id}i)` : "rgb(var(--faint) / .35)"}
        d="M12.2 11.2c.4 1.9 1.9 3 2.8 4.3.6.9.9 1.7.9 2.6 0 2.2-1.7 3.6-3.9 3.6S8.1 20.3 8.1 18.1c0-1.5.8-2.7 1.8-3.6.1.9.5 1.5 1.1 1.8-.1-1.9.3-3.6 1.2-5.1z" />
    </svg>
  );
}

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
