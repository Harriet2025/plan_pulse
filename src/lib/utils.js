import { horizonOf } from './constants';

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

export const addDays = (from, n) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + n);
export const parseDay = (key) => new Date(`${key}T00:00:00`);

// ---- Periods: a day, a week (Monday to Sunday), a month or a year. Mirrors period_end() in backend/api/lib.php.

export function periodStart(horizon, d) {
  if (horizon === 'WEEKLY') return addDays(d, 1 - isoWeekday(d));
  if (horizon === 'MONTHLY') return new Date(d.getFullYear(), d.getMonth(), 1);
  if (horizon === 'YEARLY') return new Date(d.getFullYear(), 0, 1);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function periodEnd(horizon, d) {
  if (horizon === 'WEEKLY') return addDays(periodStart('WEEKLY', d), 6);
  if (horizon === 'MONTHLY') return new Date(d.getFullYear(), d.getMonth() + 1, 0);
  if (horizon === 'YEARLY') return new Date(d.getFullYear(), 11, 31);
  return periodStart('DAILY', d);
}
/** The period `n` steps before or after the one containing `d` (returns its first day). */
export function shiftPeriod(horizon, d, n) {
  const s = periodStart(horizon, d);
  if (horizon === 'WEEKLY') return addDays(s, 7 * n);
  if (horizon === 'MONTHLY') return new Date(s.getFullYear(), s.getMonth() + n, 1);
  if (horizon === 'YEARLY') return new Date(s.getFullYear() + n, 0, 1);
  return addDays(s, n);
}
export const periodKey = (horizon, d) => localDate(periodStart(horizon, d));

/** "Today", "Next week", "Last month", else "Thu 5 Nov", "Week of 9 Nov", "December 2026", "2028". */
export function periodLabel(horizon, d, today = new Date()) {
  const h = horizonOf(horizon), key = periodKey(horizon, d);
  if (key === periodKey(horizon, today)) return h.this;
  if (key === periodKey(horizon, shiftPeriod(horizon, today, 1))) return h.next;
  if (key === periodKey(horizon, shiftPeriod(horizon, today, -1))) return h.last;
  const s = periodStart(horizon, d);
  const year = s.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {};
  if (horizon === 'WEEKLY') return `Week of ${s.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...year })}`;
  if (horizon === 'MONTHLY') return s.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (horizon === 'YEARLY') return String(s.getFullYear());
  return s.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...year });
}

/** A period's name inside a sentence: "today", "next week", "the week of Nov 9", "Thu, Nov 5", "2028". */
export const periodPhrase = (name) => (name.startsWith('Week of') ? `the week of${name.slice(7)}` : /\d/.test(name) ? name : name.toLowerCase());

/** The dates a period covers, for a subtitle: "2 – 8 Nov", "1 – 30 Nov", "Thursday 29 October". */
export function periodRange(horizon, d) {
  const s = periodStart(horizon, d), e = periodEnd(horizon, d);
  if (horizon === 'DAILY') return s.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  if (horizon === 'YEARLY') return `January – December ${s.getFullYear()}`;
  const sameMonth = s.getMonth() === e.getMonth();
  return `${s.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

/** The first day of the period a goal is for: the period of its horizon that contains its due date. */
export const goalPeriodKey = (g) => periodKey(g.timeframe, g.due_date ? parseDay(g.due_date) : new Date(g.created_at ?? Date.now()));
export const inPeriod = (g, horizon, d) => g.timeframe === horizon && goalPeriodKey(g) === periodKey(horizon, d);
/** The goal's period in words, e.g. "Today", "This week", "Week of 9 Nov". */
export const goalPeriodLabel = (g, today = new Date()) => periodLabel(g.timeframe, g.due_date ? parseDay(g.due_date) : new Date(g.created_at ?? Date.now()), today);

// ---- Times typed with a plan, e.g. "Create content 2pm-4pm"

const CLOCK = String.raw`\d{1,2}(?:[:.]\d{2})?(?:\s*[ap]\.?m\.?)?`;

/** "2pm", "2:30 pm", "14:00", "9.15" -> minutes after midnight, or null. `mer` fills in a missing am / pm. */
function clockMinutes(text, mer = null) {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(?:([ap])\.?m\.?)?$/i.exec(text.trim());
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = (m[3] ?? mer ?? '').toLowerCase();
  if (min > 59) return null;
  if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap === 'p' ? 12 : 0); }
  else if (h > 23) return null;
  return h * 60 + min;
}
const meridiem = (text) => /([ap])\.?m\.?\s*$/i.exec(text)?.[1].toLowerCase() ?? null;
const hhmm = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

/**
 * "2pm-4pm", "2-4pm", "2:00 to 4:00pm", "14:00–16:00", "11am-1pm" -> { start: '14:00', minutes: 120 }, or null.
 * The end has to come after the start on the same day, and a block is 5 minutes to 12 hours.
 */
export function parseTimeRange(text) {
  const m = new RegExp(String.raw`^\s*(${CLOCK})\s*(?:-|–|—|to|until|till)\s*(${CLOCK})\s*$`, 'i').exec(String(text ?? ''));
  if (!m) return null;
  const [a, b] = [m[1], m[2]];
  const ma = meridiem(a), mb = meridiem(b);
  let start, end;
  if (ma && mb) { start = clockMinutes(a); end = clockMinutes(b); }
  else if (mb) {   // "2-4pm" is 2pm to 4pm, "11-1pm" is 11am to 1pm
    end = clockMinutes(b); start = clockMinutes(a, mb);
    if (start !== null && end !== null && start >= end) start = clockMinutes(a, mb === 'p' ? 'a' : 'p');
  } else if (ma) {   // "11am-1" is 11am to 1pm
    start = clockMinutes(a); end = clockMinutes(b, ma);
    if (start !== null && end !== null && end <= start) end = clockMinutes(b, ma === 'p' ? 'a' : 'p');
  } else {
    start = clockMinutes(a); end = clockMinutes(b);
    // "2-4" with no am / pm: nobody plans 2 to 4 in the morning, so read small hours as the afternoon
    if (start !== null && end !== null && end <= 12 * 60 && start < 7 * 60) { start += 720; end += 720; }
  }
  if (start === null || end === null || end <= start) return null;
  const minutes = end - start;
  return minutes >= 5 && minutes <= 720 ? { start: hhmm(start), minutes } : null;
}

/**
 * "Write the intro ~45m" or "Write the intro (1h)" -> { text: "Write the intro", estimate: 45, start: null }.
 * "Create content 2pm-4pm" or "Create content @ 2-4pm" -> { text: "Create content", estimate: 120, start: '14:00' }.
 * "Call mum at 5pm ~15m" -> { text: "Call mum", estimate: 15, start: '17:00' }.
 * So "Read chapters 2-4" is not taken for a time, a range needs am / pm, a colon, or "@", "at" or "from" in front.
 */
export function splitTaskLine(line) {
  const out = { text: line.trim(), estimate: null, start: null };
  const takeEstimate = () => {
    for (const re of [/^(.*\S)\s*~\s*([^~]+)$/, /^(.*\S)\s*\(\s*([^()]+?)\s*\)$/]) {
      const m = re.exec(out.text);
      const est = m && parseEstimate(m[2], true);
      if (est) { out.text = m[1].trim(); out.estimate = est; return; }
    }
  };
  const takeTime = () => {
    let m = new RegExp(String.raw`^(.*?\S)(\s+(?:at|from)\s+|\s*@\s*|\s+)(${CLOCK}\s*(?:-|–|—|to|until|till)\s*${CLOCK})\s*$`, 'i').exec(out.text);
    const marked = m && (/@|at|from/i.test(m[2]) || /[:.]|[ap]\.?m/i.test(m[3]));
    const range = marked ? parseTimeRange(m[3]) : null;
    if (range) { out.text = m[1].trim(); out.estimate = range.minutes; out.start = range.start; return; }
    m = new RegExp(String.raw`^(.*?\S)(\s+at\s+|\s*@\s*)(${CLOCK})\s*$`, 'i').exec(out.text);
    const single = m ? clockMinutes(m[3]) : null;
    if (single !== null) { out.text = m[1].trim(); out.start = hhmm(single); }
  };
  // Either order works: "Call mum at 5pm ~15m" and "Call mum ~15m at 5pm"
  takeEstimate();
  takeTime();
  if (!out.estimate) takeEstimate();
  return out;
}

/** "2:00 PM" in the user's locale, from a Date. */
export const fmtClock = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
/** "14:30" -> minutes after midnight. */
export const clockToMinutes = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
export const minutesToClock = hhmm;
const clockText = (mins) => fmtClock(new Date(2000, 0, 1, Math.floor(mins / 60), mins % 60));

/** "2:00 – 4:00 PM" from a start ('14:00') and a length, "2:00 PM" without a length, '' without a start. */
export function fmtSpan(start, minutes) {
  if (!start) return '';
  const from = clockToMinutes(start);
  return minutes ? `${clockText(from)} – ${clockText(from + minutes)}` : clockText(from);
}

// ---- Day plans: a day's own plans, with an optional time, that can repeat ---------------------------------------

/**
 * Whether a day plan happens on a day (YYYY-MM-DD). Repeating plans run from their first day to `until`; weekly ones
 * on the chosen weekdays; monthly ones on the first day's date (or the month's last day when the month is shorter).
 * Mirrors day_plan_occurs() in backend/api/lib.php, so keep the two in step.
 */
export function occursOn(plan, key) {
  if (key < plan.date || (plan.until && key > plan.until)) return false;
  if (plan.repeat === 'NONE') return key === plan.date;
  if (plan.repeat === 'DAILY') return true;
  const d = parseDay(key);
  if (plan.repeat === 'WEEKLY') return plan.days.includes(isoWeekday(d));
  if (plan.repeat === 'MONTHLY') {
    const want = Number(plan.date.slice(8, 10)), last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(want, last);
  }
  return false;
}

/**
 * The plans on a day, timed ones first in time order: [{ plan, key, done, start, minutes }]. Skipped days are left out.
 */
export function plansOn(dayPlans, key) {
  return dayPlans
    .filter((p) => occursOn(p, key) && p.marks[key] !== 'SKIPPED')
    .map((p) => ({ plan: p, key, done: p.marks[key] === 'DONE', start: p.start, minutes: p.minutes }))
    .sort((a, b) => (a.start ?? '99').localeCompare(b.start ?? '99') || a.plan.id - b.plan.id);
}

/** "Every day", "Mon, Wed, Fri", "Every month on the 5th", or '' for a one-off plan. */
export function repeatText(plan) {
  if (plan.repeat === 'DAILY') return 'Every day';
  if (plan.repeat === 'WEEKLY') {
    const d = [...plan.days].sort();
    if (d.join() === '1,2,3,4,5') return 'Weekdays';
    if (d.join() === '6,7') return 'Weekends';
    return d.map((n) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][n - 1]).join(', ');
  }
  if (plan.repeat === 'MONTHLY') return `Monthly on the ${ordinal(Number(plan.date.slice(8, 10)))}`;
  return '';
}
const ordinal = (n) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

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

/** ok (comfortable), tight (nearly full), over (more than fits), rest (things planned on a day off). */
export function loadState(planned, capacity) {
  if (capacity <= 0) return planned > 0 ? 'rest' : 'ok';
  const ratio = planned / capacity;
  return ratio > 1 ? 'over' : ratio > 0.75 ? 'tight' : 'ok';
}

/**
 * The full picture for one day: its plans still to do (`tasks`), minutes planned, minutes available, and how full that
 * is. Done plans do not count. Mirrors plan_for_day() in backend/notify.php, so keep the two in step.
 */
export function dayLoad(dayPlans, user, dateKey) {
  const tasks = plansOn(dayPlans, dateKey).filter((x) => !x.done);
  const planned = tasks.reduce((n, x) => n + (x.minutes ?? 0), 0);
  const capacity = isRestDate(parseDay(dateKey), user.rest_days ?? []) ? 0 : user.daily_capacity_min ?? 240;
  return {
    tasks, planned, unestimated: tasks.filter((x) => !x.minutes).length,
    capacity, state: loadState(planned, capacity), over: Math.max(0, planned - capacity), free: Math.max(0, capacity - planned),
  };
}

/** The first of the next `days` days that has more planned than fits, or null. */
export function nextHeavyDay(dayPlans, user, days = 7, from = new Date()) {
  for (let n = 1; n <= days; n++) {
    const key = localDate(addDays(from, n));
    const load = dayLoad(dayPlans, user, key);
    if (load.state === 'over') return { key, ...load };
  }
  return null;
}

/**
 * What to move off a too-full day, and where to. Only one-off plans with a length can move (a repeating plan is a
 * habit, so it stays). The smallest plan that covers what is still over goes first, otherwise the biggest, so as little
 * as possible is moved, and each lands on the first work day in the next two weeks with room for it.
 *
 * @returns {{ picks: Array<{plan, minutes, to: Date}>, over: number }} `over` is how much is still too much afterwards.
 */
export function lightenPlan(dayPlans, user, dateKey) {
  const day = dayLoad(dayPlans, user, dateKey);
  if (day.state !== 'over') return { picks: [], over: 0 };
  const start = parseDay(dateKey);
  const added = new Map();
  const placeFor = (x) => {
    for (let n = 1; n <= 14; n++) {
      const d = addDays(start, n), key = localDate(d);
      if (isRestDate(d, user.rest_days ?? [])) continue;
      if (dayLoad(dayPlans, user, key).free - (added.get(key) ?? 0) >= x.minutes) return d;
    }
    return null;
  };

  let pool = day.tasks.filter((x) => x.minutes && x.plan.repeat === 'NONE').sort((a, b) => a.minutes - b.minutes);
  let planned = day.planned;
  const picks = [];
  while (planned > day.capacity && pool.length) {
    const need = planned - day.capacity;
    const ordered = [pool.find((x) => x.minutes >= need), ...[...pool].reverse()].filter(Boolean);   // smallest that covers it, else biggest
    let chosen = null, to = null;
    for (const c of ordered) { if ((to = placeFor(c))) { chosen = c; break; } }
    if (!chosen) break;   // nothing fits anywhere in the next two weeks
    added.set(localDate(to), (added.get(localDate(to)) ?? 0) + chosen.minutes);
    picks.push({ plan: chosen.plan, minutes: chosen.minutes, to });
    planned -= chosen.minutes;
    pool = pool.filter((x) => x !== chosen);
  }
  return { picks, over: Math.max(0, planned - day.capacity) };
}

/**
 * Dates for items that slipped, filling each coming work day up to the user's capacity (counting what is already
 * planned there). `weight` is each item's minutes; the order of the items is kept.
 */
export function spreadByCapacity(items, dayPlans, user, from = new Date()) {
  const added = new Map();
  const dates = [];
  let n = 1;
  for (const it of items) {
    const w = it.weight ?? 30;
    let chosen = null;
    for (let tries = 0, k = n; tries < 21 && !chosen; tries++, k++) {
      const d = addDays(from, k), key = localDate(d);
      if (isRestDate(d, user.rest_days ?? [])) continue;
      if (dayLoad(dayPlans, user, key).free - (added.get(key) ?? 0) >= w) { chosen = d; n = k; }
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
export function computeAnalytics(goals, allCategories = []) {
  const groups = new Map();
  for (const g of goals) {
    const cat = allCategories.find((c) => c.id === g.category_id);
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
