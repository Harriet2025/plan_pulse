import { CATEGORIES } from './constants';

export const cn = (...parts) => parts.filter(Boolean).join(' ');

export const progressOf = (g) =>
  g.sub_plans.length ? Math.round((100 * g.sub_plans.filter((t) => t.done).length) / g.sub_plans.length) : 0;

const pad = (n) => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toInputValue = (d) => `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/** ISO weekday of a Date: 1 = Monday ... 7 = Sunday (what the server stores for rest days). */
export const isoWeekday = (d) => ((d.getDay() + 6) % 7) + 1;
export const isRestDate = (d, restDays = []) => restDays.includes(isoWeekday(d));
export const shortDay = (d) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

const addDays = (from, n) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + n);

/**
 * The quick "move it to..." choices on the Catch up page: tomorrow, the weekend, next week.
 * Choices that land on the same day are merged, and ones that land on a rest day are dropped.
 */
export function rescheduleOptions(restDays = [], from = new Date()) {
  const day = from.getDay(); // 0 = Sunday
  const options = [
    { id: 'tomorrow', label: 'Tomorrow', date: addDays(from, 1) },
    { id: 'weekend', label: 'Weekend', date: addDays(from, day === 6 ? 1 : day === 0 ? 6 : 6 - day) },
    { id: 'nextweek', label: 'Next week', date: addDays(from, (8 - day) % 7 || 7) },
  ];
  const seen = new Set();
  return options.filter((o) => {
    const key = localDate(o.date);
    if (seen.has(key) || (o.id !== 'tomorrow' && isRestDate(o.date, restDays))) return false;
    seen.add(key);
    return true;
  });
}

export const daysUntil = (iso) => Math.round((new Date(`${iso}T00:00:00`) - startOfToday()) / 86400000);

export const daysLabel = (n) =>
  n < 0 ? `Overdue by ${-n} day${n === -1 ? '' : 's'}` : n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : `${n} days left`;

export function dueInfo(iso) {
  if (!iso) return { text: 'No due date', cls: 'text-muted' };
  const n = daysUntil(iso);
  if (n < 0) return { text: daysLabel(n), cls: 'text-danger' };
  if (n <= 1) return { text: daysLabel(n), cls: 'text-warning' };
  return { text: daysLabel(n), cls: n <= 3 ? 'text-warning' : 'text-charcoal/80' };
}

export const fmtShort = (d) =>
  d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function fmtWhen(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return s;
  const opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleString(undefined, opts);
}

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

// ---- Time estimates and the realistic-day check -------------------------------------------------

/** 45 -> "45m", 90 -> "1h 30m", 120 -> "2h". */
export const fmtMinutes = (m) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`);

/**
 * "45", "45m", "1h", "1.5h", "1h30", "1h 30m" -> minutes (5 to 720), or null when it is not a time.
 * With requireUnit, a bare number does not count (so "Call (15)" in a task title is left alone).
 */
export function parseEstimate(text, requireUnit = false) {
  const s = String(text ?? '').trim().toLowerCase().replace(/,/g, '.');
  let minutes = null, m;
  if ((m = /^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\s*(?:(\d+)\s*(?:m|min|mins|minutes?)?)?$/.exec(s))) minutes = Math.round(parseFloat(m[1]) * 60 + (m[2] ? parseInt(m[2], 10) : 0));
  else if ((m = /^(\d+)\s*(?:m|min|mins|minutes?)$/.exec(s))) minutes = parseInt(m[1], 10);
  else if (!requireUnit && /^\d+$/.test(s)) minutes = parseInt(s, 10);
  return minutes !== null && minutes >= 5 && minutes <= 720 ? minutes : null;
}

/** "Write the intro ~45m" or "Write the intro (1h)" -> { text: "Write the intro", estimate: 45 }. */
export function splitTaskLine(line) {
  const raw = line.trim();
  for (const re of [/^(.*\S)\s*~\s*([^~]+)$/, /^(.*\S)\s*\(\s*([^()]+?)\s*\)$/]) {
    const m = re.exec(raw);
    const estimate = m && parseEstimate(m[2], true);
    if (estimate) return { text: m[1].trim(), estimate };
  }
  return { text: raw, estimate: null };
}

/**
 * What a day holds: tasks with a reminder that day, plus tasks with no reminder whose goal is due that day
 * (they have to be done by then). Mirrors plan_for_day() in backend/notify.php, so keep the two in step.
 */
export function plannedFor(goals, dateKey) {
  const tasks = [];
  for (const goal of goals) {
    if (goal.status !== 'ACTIVE') continue;
    for (const task of goal.sub_plans) {
      if (task.done) continue;
      if ((task.remind ? task.remind.slice(0, 10) : goal.due_date) === dateKey) tasks.push({ goal, task });
    }
  }
  tasks.sort((a, b) => (a.task.remind ?? '9').localeCompare(b.task.remind ?? '9') || a.task.id - b.task.id);
  const planned = tasks.reduce((n, x) => n + (x.task.estimate ?? 0), 0);
  return { tasks, planned, unestimated: tasks.filter((x) => !x.task.estimate).length };
}

/** ok (comfortable), tight (nearly full), over (more than fits), rest (things planned on a day off). */
export function loadState(planned, capacity) {
  if (capacity <= 0) return planned > 0 ? 'rest' : 'ok';
  const ratio = planned / capacity;
  return ratio > 1 ? 'over' : ratio > 0.75 ? 'tight' : 'ok';
}

/** The full picture for one day: its tasks, minutes planned, minutes available, and how full that is. */
export function dayLoad(goals, user, dateKey) {
  const plan = plannedFor(goals, dateKey);
  const date = new Date(`${dateKey}T00:00:00`);
  const capacity = isRestDate(date, user.rest_days ?? []) ? 0 : user.daily_capacity_min ?? 240;
  return { ...plan, capacity, state: loadState(plan.planned, capacity), over: Math.max(0, plan.planned - capacity), free: Math.max(0, capacity - plan.planned) };
}

/** The first of the next `days` days that has more planned than fits, or null. */
export function nextHeavyDay(goals, user, days = 7, from = new Date()) {
  for (let n = 1; n <= days; n++) {
    const key = localDate(addDays(from, n));
    const load = dayLoad(goals, user, key);
    if (load.state === 'over') return { key, ...load };
  }
  return null;
}

/**
 * What to move off a too-full day, and where to. Lowest-priority tasks go first. Within a priority, the smallest task
 * that covers what is still over goes, otherwise the biggest, so as little as possible is moved. A task never moves
 * past its goal's due date, and each lands on the first work day with room for it.
 *
 * @returns {{ picks: Array<{goal, task, to: Date}>, over: number }} `over` is how much is still too much afterwards
 *   (for example when the rest belongs to goals that are due that day).
 */
export function lightenPlan(goals, user, dateKey) {
  const day = dayLoad(goals, user, dateKey);
  if (day.state !== 'over') return { picks: [], over: 0 };
  const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  const start = new Date(`${dateKey}T00:00:00`);
  const restDays = user.rest_days ?? [];
  const added = new Map();

  // The first work day after the date that has room, and that is not past the goal's due date
  const placeFor = ({ goal, task }) => {
    for (let n = 1; n <= 14; n++) {
      const d = addDays(start, n), key = localDate(d);
      if (goal.due_date && key > goal.due_date) return null;
      if (isRestDate(d, restDays)) continue;
      if (dayLoad(goals, user, key).free - (added.get(key) ?? 0) >= task.estimate) return d;
    }
    return null;
  };

  // Tasks of a goal that is due today (or earlier) cannot move later, and a task needs an estimate to count
  let pool = day.tasks.filter((x) => x.task.estimate && !(x.goal.due_date && x.goal.due_date <= dateKey));
  let planned = day.planned;
  const picks = [];
  while (planned > day.capacity && pool.length) {
    const lowest = Math.min(...pool.map((x) => rank[x.goal.priority]));
    const group = pool.filter((x) => rank[x.goal.priority] === lowest).sort((a, b) => a.task.estimate - b.task.estimate);
    const need = planned - day.capacity;
    const ordered = [group.find((x) => x.task.estimate >= need), ...[...group].reverse()].filter(Boolean);   // smallest that covers it, else biggest
    let chosen = null, to = null;
    for (const c of ordered) { if ((to = placeFor(c))) { chosen = c; break; } }
    if (!chosen) { pool = pool.filter((x) => rank[x.goal.priority] !== lowest); continue; }   // nothing in this group can move, so try the next priority
    added.set(localDate(to), (added.get(localDate(to)) ?? 0) + chosen.task.estimate);
    picks.push({ ...chosen, to });
    planned -= chosen.task.estimate;
    pool = pool.filter((x) => x !== chosen);
  }
  return { picks, over: Math.max(0, planned - day.capacity) };
}

/**
 * Dates for items that slipped, filling each coming work day up to the user's capacity (counting what is already
 * planned there). `weight` is each item's minutes; the order of the items is kept.
 */
export function spreadByCapacity(items, goals, user, from = new Date()) {
  const added = new Map();
  const dates = [];
  let n = 1;
  for (const it of items) {
    const w = it.weight ?? 30;
    let chosen = null;
    for (let tries = 0, k = n; tries < 21 && !chosen; tries++, k++) {
      const d = addDays(from, k), key = localDate(d);
      if (isRestDate(d, user.rest_days ?? [])) continue;
      if (dayLoad(goals, user, key).free - (added.get(key) ?? 0) >= w) { chosen = d; n = k; }
    }
    if (!chosen) {   // nothing has room: start a fresh work day
      for (let k = n; !chosen && k < n + 60; k++) { const d = addDays(from, k); if (!isRestDate(d, user.rest_days ?? [])) { chosen = d; n = k; } }
    }
    added.set(localDate(chosen), (added.get(localDate(chosen)) ?? 0) + w);
    dates.push(chosen);
  }
  return dates;
}

/** Totals for a set of goals: { total, done, pct } over their tasks. */
export function taskTotals(goals) {
  const total = goals.reduce((n, g) => n + g.sub_plans.length, 0);
  const done = goals.reduce((n, g) => n + g.sub_plans.filter((t) => t.done).length, 0);
  return { total, done, pct: total ? Math.round((100 * done) / total) : 0 };
}

/** Completion stats overall and by category across every goal the user has (any status). */
export function computeAnalytics(goals) {
  const groups = new Map();
  for (const g of goals) {
    const cat = CATEGORIES.find((c) => c.id === g.category_id);
    const key = cat ? cat.id : 'none';
    if (!groups.has(key)) {
      groups.set(key, { id: cat?.id ?? null, name: cat?.name ?? 'Uncategorized', color: cat?.color ?? '#8A7F76', goals: [] });
    }
    groups.get(key).goals.push(g);
  }
  const pct = (d, t) => (t ? Math.round((100 * d) / t) : 0);
  const categories = [...groups.values()].map((c) => {
    const t = taskTotals(c.goals);
    return {
      id: c.id, name: c.name, color: c.color,
      goals_total: c.goals.length,
      goals_completed: c.goals.filter((g) => g.status === 'COMPLETED').length,
      tasks_total: t.total, tasks_done: t.done, completion_pct: t.pct,
    };
  }).sort((a, b) => b.tasks_total - a.tasks_total || a.name.localeCompare(b.name));

  const t = taskTotals(goals);
  const goalsCompleted = goals.filter((g) => g.status === 'COMPLETED').length;
  return {
    overall: {
      goals_total: goals.length, goals_completed: goalsCompleted,
      tasks_total: t.total, tasks_done: t.done, completion_pct: t.pct,
      goal_completion_pct: pct(goalsCompleted, goals.length),
    },
    categories,
  };
}
