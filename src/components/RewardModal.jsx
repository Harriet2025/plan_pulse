import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TIERS } from '../lib/constants';
import { playSound } from '../lib/sound';
import { cn } from '../lib/utils';

function burstConfetti(rank) {
  const base = { colors: TIERS[rank].confetti, disableForReducedMotion: true, zIndex: 100, ticks: 260 };
  confetti({ ...base, particleCount: 90 + rank * 40, spread: 360, startVelocity: 48, gravity: 0.9, origin: { x: 0.5, y: 0.45 }, scalar: 1.1 }); // center
  setTimeout(() => { // side cannons
    confetti({ ...base, particleCount: 50 + rank * 20, angle: 60, spread: 65, startVelocity: 62, origin: { x: 0, y: 0.75 } });
    confetti({ ...base, particleCount: 50 + rank * 20, angle: 120, spread: 65, startVelocity: 62, origin: { x: 1, y: 0.75 } });
  }, 220);
  if (rank === 3) setTimeout(() => confetti({ ...base, particleCount: 120, spread: 160, startVelocity: 25, gravity: 0.7, origin: { x: 0.5, y: 0 } }), 650);
}

// Shown for the first badge in the queue; claiming it reveals the next one
export default function RewardModal({ item }) {
  const { claimReward } = useApp();
  const T = TIERS[item.rank];

  useEffect(() => { burstConfetti(item.rank); playSound('fanfare', item.rank); }, [item.id, item.rank]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') claimReward(); if (e.key === 'Tab') e.preventDefault(); }; // one control inside
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [claimReward]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center px-4">
      <motion.div className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={claimReward} />
      <motion.div
        role="dialog" aria-modal="true" aria-labelledby="rwTitle" aria-describedby="rwMsg"
        initial={{ opacity: 0, scale: 0.82, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 12 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.3 }}
        className="relative max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-3xl border border-oat bg-soft p-6 text-center shadow-2xl"
      >
        <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-rust-dark">Achievement unlocked</p>
        <div className="relative mx-auto mt-5 grid h-36 w-36 place-items-center">
          <motion.div className="halo" style={{ background: T.glow }} animate={{ scale: [1, 1.12, 1], opacity: [0.55, 0.8, 0.55] }} transition={{ duration: 3, repeat: Infinity }} />
          <motion.div
            initial={{ scale: 0.2, rotate: -35, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.45 }}
            className="shine relative grid h-32 w-32 place-items-center rounded-full border-2 text-[4.5rem] leading-none"
            style={{ borderColor: T.color, background: `radial-gradient(circle at 30% 25%, ${T.color}55, ${T.color}14 70%)`, boxShadow: `0 0 40px ${T.glow}` }}
          >
            <span aria-hidden="true">{T.emoji}</span>
          </motion.div>
        </div>
        <h2 id="rwTitle" className="mt-5 text-2xl font-extrabold text-charcoal">{T.name} Tier Badge</h2>
        <p id="rwMsg" className="mt-2 text-sm leading-relaxed text-charcoal/80">{T.msg}</p>
        <div className="mt-4 rounded-2xl border border-oat bg-oat/40 p-3 text-left">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Goal</p>
          <p className="mt-0.5 break-words text-sm font-bold text-charcoal">{item.title}</p>
          <div className="mt-2 flex items-center justify-between text-xs"><span className="font-semibold text-muted">Progress</span><span className="font-extrabold tabular-nums text-charcoal">{item.pct}% completed</span></div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[1, 2, 3].map((r) => {
              const on = r <= item.rank, X = TIERS[r];
              return (
                <div key={r} className={cn('rounded-xl border px-2 py-1.5 text-center', !on && 'border-oat opacity-50')} style={on ? { borderColor: `${X.color}88`, background: `${X.color}1a` } : undefined}>
                  <div className="text-lg leading-none" aria-hidden="true">{X.emoji}</div>
                  <div className={cn('mt-1 text-[10px] font-bold uppercase tracking-wider', on ? 'text-charcoal' : 'text-muted')}>{X.name}</div>
                  <div className="text-[10px] tabular-nums text-muted">{X.min}%+</div>
                </div>
              );
            })}
          </div>
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-sm font-extrabold text-rust-dark"><Trophy className="h-4 w-4" aria-hidden="true" />+1 reward</p>
        <button type="button" autoFocus onClick={claimReward} className="mt-4 w-full rounded-xl bg-rust py-3 text-sm font-extrabold text-white active:scale-[.99]">Claim reward</button>
      </motion.div>
    </div>
  );
}
