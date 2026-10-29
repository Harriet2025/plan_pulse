import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { avatarUrl } from '../api';
import { RING } from '../lib/constants';
import { cn } from '../lib/utils';

const spring = { type: 'spring', stiffness: 90, damping: 14 };

/** Circular progress. Draws from empty to `pct` and springs when it changes. */
export function Ring({ pct, track, stroke, strokeWidth = 9, defs, style }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
      {defs}
      <circle cx="50" cy="50" r="42" fill="none" stroke={track} strokeWidth={strokeWidth} />
      <motion.circle
        cx="50" cy="50" r="42" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={RING} initial={{ strokeDashoffset: RING }}
        animate={{ strokeDashoffset: RING * (1 - pct / 100) }}
        transition={{ type: 'spring', stiffness: 40, damping: 12 }} style={style}
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
export function Avatar({ user, className, partner = false }) {
  const url = avatarUrl(user, partner);
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

// One soft, warm-brown shadow style for every raised surface
export const cardShadow = { boxShadow: '0 1px 2px rgba(53,45,41,.04), 0 10px 24px -14px rgba(53,45,41,.16)' };
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
