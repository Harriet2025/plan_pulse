// "What should I do now?": picks the best next thing to do from today's day plans and the goals' plans,
// given how much time there is and, optionally, how much energy.
import { clockToMinutes, fmtClock, fmtMinutes, localDate, parseDay, plansOn } from './utils';

const PRIORITY_POINTS = { HIGH: 30, MEDIUM: 20, LOW: 10 };
const DAY_MS = 86400000;

/**
 * How long there is before the next timed plan today (that is not done yet), capped at 4 hours, so the suggestion
 * fits the gap. Returns { minutes, until } where `until` describes what comes next, or null.
 */
export function freeTime(dayPlans, now = new Date()) {
  const key = localDate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const next = plansOn(dayPlans, key).filter((x) => x.start && !x.done && clockToMinutes(x.start) > nowMin)[0];
  if (!next) return { minutes: 60, until: null };
  const gap = clockToMinutes(next.start) - nowMin;
  return { minutes: Math.max(5, Math.min(240, gap)), until: `${next.plan.title} at ${fmtClock(new Date(`${key}T${next.start}`))}` };
}

/**
 * Every candidate with a score and the reasons behind it, best first.
 * @param {{ goals, dayPlans, minutes: number, energy?: 'low'|'medium'|'high', skipped?: Set<string>, now?: Date }} input
 * @returns {Array<{ id, kind: 'day'|'goal', title, context, minutes: number|null, score, reasons: string[], fits: boolean|null, ref }>}
 */
export function recommend({ goals, dayPlans, minutes, energy = 'medium', skipped = new Set(), now = new Date() }) {
  const key = localDate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = parseDay(key);
  const out = [];

  // Today's day plans that are not done: one happening now comes first; ones set for later today wait for their time
  for (const x of plansOn(dayPlans, key)) {
    if (x.done) continue;
    let score = 30;
    const reasons = [];
    if (x.start) {
      const s = clockToMinutes(x.start), e = s + (x.minutes ?? 30);
      if (s > nowMin + 10) continue;                       // it has its own time later today
      if (nowMin < e) { score += 100; reasons.push('Happening now'); }
      else { score += 40; reasons.push(`Planned for ${fmtClock(new Date(`${key}T${x.start}`))}, not done yet`); }
    } else reasons.push('On your plan for today');
    out.push({ id: `d${x.plan.id}`, kind: 'day', title: x.plan.title, context: 'Today', minutes: x.minutes ?? null, score, reasons, ref: { planId: x.plan.id, key } });
  }

  // The plans of active goals: deadline and priority first
  for (const g of goals) {
    if (g.status !== 'ACTIVE') continue;
    const left = g.sub_plans.filter((t) => !t.done);
    const daysLeft = g.due_date ? Math.round((parseDay(g.due_date) - today) / DAY_MS) : null;
    for (const t of left) {
      let score = PRIORITY_POINTS[g.priority] ?? 20;
      const reasons = [];
      if (g.priority === 'HIGH') reasons.push('High priority');
      if (daysLeft !== null) {
        if (daysLeft < 0) { score += 45; reasons.push('Goal is overdue'); }
        else if (daysLeft === 0) { score += 40; reasons.push('Goal is due today'); }
        else if (daysLeft === 1) { score += 30; reasons.push('Goal is due tomorrow'); }
        else if (daysLeft <= 3) { score += 20; reasons.push(`Goal is due in ${daysLeft} days`); }
        else if (daysLeft <= 7) score += 10;
      }
      if (g.timeframe === 'YEARLY') score -= 5;            // a year goal can usually wait for a better moment
      if (left.length === 1) { score += 12; reasons.push('Finishes the goal'); }
      out.push({ id: `g${t.id}`, kind: 'goal', title: t.text, context: g.title, minutes: t.estimate ?? null, score, reasons, ref: { goalId: g.id, taskId: t.id } });
    }
  }

  // Fit to the time there is, and to the energy
  for (const c of out) {
    if (c.minutes) {
      c.fits = c.minutes <= minutes;
      if (c.fits) { c.score += 25; c.reasons.push(`Fits your ${fmtMinutes(minutes)}`); }
      else { c.score -= 60; c.reasons.push(`Needs ${fmtMinutes(c.minutes)}, you have ${fmtMinutes(minutes)}`); }
    } else c.fits = null;
    if (energy === 'low') {
      if (c.minutes && c.minutes <= 30) { c.score += 15; c.reasons.push('Short, good for low energy'); }
      else if (c.minutes && c.minutes >= 90) c.score -= 20;
      else if (!c.minutes) c.score -= 5;
    } else if (energy === 'high' && ((c.minutes && c.minutes >= 45) || c.reasons.includes('High priority'))) {
      c.score += 10; c.reasons.push('Good use of high energy');
    }
  }

  return out.filter((c) => !skipped.has(c.id)).sort((a, b) => b.score - a.score || (a.minutes ?? 999) - (b.minutes ?? 999));
}
