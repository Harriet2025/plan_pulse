// Rewards for everyday effort: points, levels, perfect days and weekly medals.
// Everything is worked out from what is already saved (ticked day plans, finished goal steps, completed goals), so
// past work counts too, and unticking something takes its points back. Goal badges (Bronze / Silver / Gold on a
// goal) stay as they are; these sit beside them.
import { addDays, isoWeekday, localDate, plansOn } from './utils';

export const POINTS = { plan: 10, step: 15, goal: 100, perfectDay: 25 };
/** A week's medal by how many perfect days it had: 5 → Bronze, 6 → Silver, 7 → Gold. */
export const WEEK_MEDALS = [
  null,
  { rank: 1, name: 'Bronze week', emoji: '🥉', days: 5, points: 50 },
  { rank: 2, name: 'Silver week', emoji: '🥈', days: 6, points: 100 },
  { rank: 3, name: 'Gold week', emoji: '🥇', days: 7, points: 200 },
];
export const weekMedal = (perfectDays) => WEEK_MEDALS[perfectDays >= 7 ? 3 : perfectDays >= 6 ? 2 : perfectDays >= 5 ? 1 : 0];

export const LEVELS = [
  { name: 'Starter', at: 0 },
  { name: 'Mover', at: 100 },
  { name: 'Builder', at: 300 },
  { name: 'Doer', at: 600 },
  { name: 'Achiever', at: 1000 },
  { name: 'Go-getter', at: 1600 },
  { name: 'Champion', at: 2500 },
  { name: 'Master', at: 4000 },
  { name: 'Legend', at: 6000 },
  { name: 'Icon', at: 9000 },
];

export function levelOf(points) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].at) i += 1;
  const next = LEVELS[i + 1];
  return {
    n: i + 1, name: LEVELS[i].name, next: next ?? null,
    toNext: next ? next.at - points : 0,
    pct: next ? Math.round((100 * (points - LEVELS[i].at)) / (next.at - LEVELS[i].at)) : 100,
  };
}

const mondayOf = (d) => addDays(d, 1 - isoWeekday(d));
const parse = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };

/**
 * Everything the reward screens need:
 * { points, level, today: { done, total, perfect }, perfectDays, week: { start, perfect, medal, next },
 *   medalWeeks: [{ start, perfect, medal }], counts: { plans, steps, goals } }
 * A perfect day is one with at least one plan where every plan was done (plans taken off that day do not count).
 */
export function computeRewards(goals, dayPlans, now = new Date()) {
  const todayKey = localDate(now);
  let plans = 0;
  for (const p of dayPlans) for (const [k, s] of Object.entries(p.marks)) if (s === 'DONE' && k <= todayKey) plans += 1;
  const steps = goals.reduce((n, g) => n + g.sub_plans.filter((t) => t.done).length, 0);
  const goalsDone = goals.filter((g) => g.status === 'COMPLETED').length;

  // Walk the days from the first plan (at most two years back) to today
  const perfectKeys = new Set();
  const first = dayPlans.reduce((m, p) => (p.date < m ? p.date : m), todayKey);
  let day = parse(first);
  const floor = addDays(now, -730);
  if (day < floor) day = floor;
  for (; localDate(day) <= todayKey; day = addDays(day, 1)) {
    const key = localDate(day);
    const list = plansOn(dayPlans, key);
    if (list.length && list.every((x) => x.done)) perfectKeys.add(key);
  }

  // Perfect days grouped into Monday–Sunday weeks
  const weeks = new Map();
  for (const key of perfectKeys) {
    const start = localDate(mondayOf(parse(key)));
    weeks.set(start, (weeks.get(start) ?? 0) + 1);
  }
  const medalWeeks = [...weeks.entries()].map(([start, perfect]) => ({ start, perfect, medal: weekMedal(perfect) }))
    .filter((w) => w.medal).sort((a, b) => b.start.localeCompare(a.start));

  const thisStart = localDate(mondayOf(now));
  const thisPerfect = weeks.get(thisStart) ?? 0;
  const medal = weekMedal(thisPerfect);
  const next = WEEK_MEDALS.find((m) => m && m.days > thisPerfect) ?? null;

  const todayList = plansOn(dayPlans, todayKey);
  const today = { done: todayList.filter((x) => x.done).length, total: todayList.length, perfect: perfectKeys.has(todayKey) };

  const points = plans * POINTS.plan + steps * POINTS.step + goalsDone * POINTS.goal + perfectKeys.size * POINTS.perfectDay
    + medalWeeks.reduce((n, w) => n + w.medal.points, 0);

  return {
    points, level: levelOf(points), today, perfectDays: perfectKeys.size,
    week: { start: thisStart, perfect: thisPerfect, medal, next, daysLeft: 8 - isoWeekday(now) },
    medalWeeks, counts: { plans, steps, goals: goalsDone },
  };
}
