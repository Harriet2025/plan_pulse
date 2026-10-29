// Sounds are synthesized with Web Audio, so there are no audio files.
let ctx;
let enabled = true;

export const setSoundEnabled = (v) => { enabled = v; };

function tone(from, to, start, dur, vol, type = 'sine') {
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.55);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// Rising arpeggio into a held major chord; higher tiers add notes and sparkle
function fanfare(rank) {
  const run = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  run.forEach((f, i) => tone(f, f * 1.004, i * 0.1, 0.32, 0.13, 'triangle'));
  const at = run.length * 0.1;
  const chord = [...run];
  if (rank >= 2) chord.push(1318.5);
  if (rank >= 3) chord.push(1568, 2093);
  chord.forEach((f) => { tone(f, f * 1.003, at, 1.1, 0.07, 'sawtooth'); tone(f, f * 1.003, at, 1.3, 0.08, 'triangle'); });
  tone(130.81, 130.81, at, 1.2, 0.12, 'sine');
  for (let i = 0; i < rank * 2 + 1; i++) tone(2400 + i * 260, 3000 + i * 260, at + 0.15 + i * 0.07, 0.18, 0.04, 'sine');
}

export function playSound(kind, rank = 1) {
  if (!enabled) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    if (kind === 'check') tone(480, 1000, 0, 0.16, 0.2);
    else if (kind === 'uncheck') tone(420, 190, 0, 0.14, 0.16);
    else if (kind === 'fanfare') fanfare(rank);
    else if (kind === 'bell') { tone(880, 880, 0, 0.45, 0.16); tone(1320, 1320, 0.14, 0.55, 0.12); tone(1760, 1760, 0.3, 0.6, 0.07); }
  } catch { /* audio unavailable */ }
}
