import { addDays, clockMinutes, isoWeekday, localDate, minutesToClock, parseDay, parseEstimate, parseTimeRange } from './utils';

// ---- Quick add: a day plan typed the way you would say it ----------------------------------------------------------
//
//   "gym tomorrow 6-7am"                  tomorrow, 06:00 for an hour
//   "church every Sunday 9am"             every Sunday at 09:00, starting this Sunday
//   "call mum Friday 30 min"              Friday, 30 minutes, any time
//   "study weekdays 7pm for 2h until 20 Dec"
//
// The words that set the day, time, length or repeat are taken out, and whatever is left is the plan's name.
// Everything is read on the device, so it is instant, free and works offline.

const WEEKDAYS = [
  ['mon', 'monday'], ['tue', 'tues', 'tuesday'], ['wed', 'weds', 'wednesday'], ['thu', 'thur', 'thurs', 'thursday'],
  ['fri', 'friday'], ['sat', 'saturday'], ['sun', 'sunday'],
];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const ANY_DAY = WEEKDAYS.flat().sort((a, b) => b.length - a.length).join('|');
const FULL_DAY = WEEKDAYS.map((w) => w[w.length - 1]).join('|');
const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
const NTH = String.raw`(\d{1,2})(?:st|nd|rd|th)?`;
const CLOCK = String.raw`\d{1,2}(?:[:.]\d{2})?(?:\s*[ap]\.?m\.?)?`;
const DASH = String.raw`\s*(?:-|–|—|to|until|till)\s*`;

const LIST_SEP = /\s*,\s*|\s+and\s+|\s*&\s*/i;
const SEP = String.raw`(?:\s*,\s*|\s+and\s+|\s*&\s*)`;
const DAY_LIST = String.raw`(?:${ANY_DAY})s?(?:${SEP}(?:${ANY_DAY})s?)*`;                 // after "every"
const PLURAL_LIST = String.raw`(?:${FULL_DAY})s(?:${SEP}(?:${FULL_DAY})s?)*`;            // "Mondays and Thursdays"

/** "mon" / "Monday" / "Mondays" -> 1 ... 7, or null. */
function weekdayOf(word) {
  let w = word.trim().toLowerCase();
  if (w.endsWith('days')) w = w.slice(0, -1);
  const i = WEEKDAYS.findIndex((names) => names.includes(w));
  return i < 0 ? null : i + 1;
}
const monthOf = (word) => MONTHS.indexOf(word.toLowerCase().slice(0, 3));

/** The next date (today included) that falls on ISO weekday `n`. */
const nextWeekday = (from, n) => addDays(from, (n - isoWeekday(from) + 7) % 7);

/** A real calendar date in the coming year: "12 Nov" said in December means next November. */
function upcoming(today, month, day, year = null) {
  let d = new Date(year ?? today.getFullYear(), month, day);
  if (d.getMonth() !== month || d.getDate() !== day) return null;   // 31 Feb and the like
  if (year === null && localDate(d) < localDate(today)) d = new Date(today.getFullYear() + 1, month, day);
  return d;
}

/**
 * Reads one date phrase at the very start of `s`. Returns { date, length } (length = characters used), or null.
 * Day names and "next week" never land in the past.
 */
function readDate(s, today) {
  let m;
  if ((m = /^(?:today|tonight|this (?:morning|afternoon|evening))\b/i.exec(s))) return { date: today, length: m[0].length };
  if ((m = /^(?:the\s+)?day after (?:tomorrow|tmrw|tmr)\b/i.exec(s))) return { date: addDays(today, 2), length: m[0].length };
  if ((m = /^(?:tomorrow|tmrw|tmr)\b/i.exec(s))) return { date: addDays(today, 1), length: m[0].length };
  if ((m = /^in (\d{1,2}) days?\b/i.exec(s))) return { date: addDays(today, Number(m[1])), length: m[0].length };
  if ((m = /^in a week\b/i.exec(s))) return { date: addDays(today, 7), length: m[0].length };
  if ((m = /^next week\b/i.exec(s))) return { date: nextWeekday(addDays(today, 1), 1), length: m[0].length };
  if ((m = /^this weekend\b/i.exec(s))) return { date: isoWeekday(today) >= 6 ? today : nextWeekday(today, 6), length: m[0].length };
  // "next Friday" is the Friday of next week; "this Friday", "on Fri" and "Friday" are the coming one
  if ((m = new RegExp(String.raw`^next (${ANY_DAY})\b`, 'i').exec(s))) {
    const monday = nextWeekday(addDays(today, 1), 1);
    return { date: addDays(monday, weekdayOf(m[1]) - 1), length: m[0].length };
  }
  if ((m = new RegExp(String.raw`^(?:this |on )(${ANY_DAY})\b`, 'i').exec(s)) || (m = new RegExp(String.raw`^(${FULL_DAY})\b`, 'i').exec(s))) {
    return { date: nextWeekday(today, weekdayOf(m[1])), length: m[0].length };
  }
  // "12 Nov", "12th of November", "Nov 12", "November 12th", "12/11" (day first), "12/11/2026"
  if ((m = new RegExp(String.raw`^(?:on )?(?:the )?${NTH}(?: of)? (${MONTH})\b`, 'i').exec(s))) {
    const d = upcoming(today, monthOf(m[2]), Number(m[1]));
    if (d) return { date: d, length: m[0].length };
  }
  if ((m = new RegExp(String.raw`^(?:on )?(${MONTH}) ${NTH}\b`, 'i').exec(s))) {
    const d = upcoming(today, monthOf(m[1]), Number(m[2]));
    if (d) return { date: d, length: m[0].length };
  }
  if ((m = /^(?:on )?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/.exec(s))) {
    const d = upcoming(today, Number(m[2]) - 1, Number(m[1]), m[3] ? Number(m[3]) : null);
    if (d) return { date: d, length: m[0].length };
  }
  // "on the 15th": the next 15th of a month
  if ((m = /^(?:on )?the (\d{1,2})(?:st|nd|rd|th)\b/i.exec(s))) {
    const day = Number(m[1]);
    for (let k = 0; k < 3; k++) {
      const d = upcoming(today, today.getMonth() + k > 11 ? today.getMonth() + k - 12 : today.getMonth() + k, day, today.getFullYear() + (today.getMonth() + k > 11 ? 1 : 0));
      if (d && localDate(d) >= localDate(today)) return { date: d, length: m[0].length };
    }
  }
  return null;
}

/** Finds the first place in `text` where `read` recognises something, at a word boundary. */
function findAt(text, read) {
  for (let i = 0; i < text.length; i++) {
    if (i > 0 && /\w/.test(text[i - 1])) continue;
    const r = read(text.slice(i));
    if (r) return { ...r, index: i };
  }
  return null;
}

/**
 * Reads a plan typed in plain words. `today` is the day it is typed (a Date), `defaultDate` the day to use when no
 * day is mentioned (YYYY-MM-DD, e.g. the day open in the Planner).
 *
 * Returns { title, date, start, minutes, repeat, days, until, found, problem }: the fields createDayPlan() takes,
 * plus `found` (what was understood, for showing back) and `problem` (a message when it cannot be added as it is).
 */
export function parsePlan(input, today = new Date(), defaultDate = null) {
  today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Words in quotes always stay in the name, and so do names like "Sunday school" or "Friday prayers"
  const kept = [];
  const keep = (s) => `\u0001${kept.push(s) - 1}\u0001`;
  let text = ` ${String(input ?? '').replace(/\s+/g, ' ').trim()} `
    .replace(/"([^"]+)"|“([^”]+)”/g, (_, a, b) => keep(a ?? b))
    .replace(new RegExp(String.raw`(^|\s)((?:${FULL_DAY}) (?:school|service|mass|worship|prayers?|fellowship|best|brunch|roast))(?=\s)`, 'gi'), (_, sp, w) => sp + keep(w));
  const out = { title: '', date: defaultDate ?? localDate(today), start: null, minutes: null, repeat: 'NONE', days: [], until: null, found: {}, problem: '' };
  const cut = (index, length) => { text = `${text.slice(0, index)} ${text.slice(index + length)}`; };
  let m;

  // ---- How often. Done first, so "every Sunday" is not read as one Sunday.
  if ((m = /\s(?:every ?day|daily|each day)(?=\s)/i.exec(text))) {
    out.repeat = 'DAILY'; cut(m.index, m[0].length);
  } else if ((m = /\s(?:every |on )?weekdays?(?=\s)/i.exec(text)) && !/\s(?:this|next) weekday/i.test(text)) {
    out.repeat = 'WEEKLY'; out.days = [1, 2, 3, 4, 5]; cut(m.index, m[0].length);
  } else if ((m = /\s(?:every weekend|on weekends|weekends)(?=\s)/i.exec(text))) {
    out.repeat = 'WEEKLY'; out.days = [6, 7]; cut(m.index, m[0].length);
  } else if ((m = new RegExp(String.raw`\severy (${DAY_LIST})(?=\s)`, 'i').exec(text)) || (m = new RegExp(String.raw`\s(?:on )?(${PLURAL_LIST})(?=\s)`, 'i').exec(text))) {
    // "every Mon and Wed", "every Sunday", "Mondays and Thursdays"
    out.repeat = 'WEEKLY'; out.days = [...new Set(m[1].split(LIST_SEP).map(weekdayOf).filter(Boolean))].sort(); cut(m.index, m[0].length);
  } else if ((m = /\s(?:every week|weekly|each week)(?=\s)/i.exec(text))) {
    out.repeat = 'WEEKLY'; cut(m.index, m[0].length);
  } else if ((m = /\s(?:every month|monthly|each month)(?=\s)/i.exec(text))) {
    out.repeat = 'MONTHLY'; cut(m.index, m[0].length);
  }

  // ---- Until when (only for a repeating plan)
  if (out.repeat !== 'NONE') {
    const u = findAt(text, (s) => {
      const k = /^(?:until|till|til|through|up to) /i.exec(s);
      if (!k) return null;
      const d = readDate(s.slice(k[0].length), today);
      return d ? { date: d.date, length: k[0].length + d.length } : null;
    });
    if (u) { out.until = localDate(u.date); cut(u.index, u.length); }
  }

  // ---- Which day (for a repeating plan: the first day)
  const d = findAt(text, (s) => readDate(s, today));
  if (d) { out.date = localDate(d.date); out.found.date = true; cut(d.index, d.length); }
  if (out.repeat === 'WEEKLY' && out.days.length) {
    // Start on the first chosen weekday from that day on, so the first day is one it really happens
    let first = parseDay(out.date);
    for (let k = 0; k < 7 && !out.days.includes(isoWeekday(first)); k++) first = addDays(first, 1);
    out.date = localDate(first);
  }
  if (out.repeat === 'WEEKLY' && !out.days.length) out.days = [isoWeekday(parseDay(out.date))];

  // ---- What time: "6-7am", "from 6 to 7pm", "at 9", "9am", "9:30", "noon"
  if ((m = new RegExp(String.raw`\s(?:(at|from)\s+|@\s*)?(${CLOCK}${DASH}${CLOCK})(?=\s)`, 'i').exec(text))) {
    // A bare "2-4" needs "at" or "from" in front, so "chapters 2-4" stays in the name
    const marked = m[1] || /@/.test(m[0]) || /[:.]|[ap]\.?m/i.test(m[2]);
    const range = marked ? parseTimeRange(m[2]) : null;
    if (range) { out.start = range.start; out.minutes = range.minutes; cut(m.index, m[0].length); }
  }
  if (!out.start && (m = /\s(?:at\s+|@\s*)?(noon|midday)(?=\s)/i.exec(text))) {
    out.start = '12:00'; cut(m.index, m[0].length);
  }
  if (!out.start && (m = new RegExp(String.raw`\s(at\s+|@\s*)?(${CLOCK})(?=\s)`, 'i').exec(text))) {
    // "at 9" works; a bare number needs am / pm or a colon, so "read 20 pages" keeps its 20
    const marked = m[1] || /[:.]|[ap]\.?m/i.test(m[2]);
    const mins = marked ? clockMinutes(m[2].replace(/\s+/g, '')) : null;
    if (mins !== null) {
      // "at 7" with no am / pm: nobody plans for 7 in the morning without saying so, unless it is 7 to 11
      const plain = !/[ap]\.?m/i.test(m[2]) && !/:/.test(m[2]);
      out.start = minutesToClock(plain && mins < 7 * 60 ? mins + 720 : mins);
      cut(m.index, m[0].length);
    }
  }

  // ---- How long: "for 30 min", "1h", "2 hours", "~45m", "(1h)"
  if ((m = /\s(?:for\s+|~\s*|\(\s*)?(\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?)(?:\s*\d+\s*(?:m|min|mins|minutes?)?)?|\d+\s*(?:m|min|mins|minutes?))\s*\)?(?=\s)/i.exec(text))) {
    const est = parseEstimate(m[1], true);
    if (est) { if (out.minutes === null) out.minutes = est; cut(m.index, m[0].length); }
  }

  // ---- The name: what is left, without loose joining words at either end
  let title = text.replace(/\s+/g, ' ').trim();
  for (let k = 0; k < 4; k++) title = title.replace(/^(?:on|at|from|for|every|by|in|the|and|,|-|–)\s+/i, '').replace(/\s+(?:on|at|from|for|every|by|in|the|and|,|-|–)$/i, '').replace(/[,;–-]+$/, '').trim();
  title = title.replace(/\u0001(\d+)\u0001/g, (_, i) => kept[Number(i)]).trim();
  out.title = title ? title[0].toUpperCase() + title.slice(1) : '';

  out.found.time = !!out.start;
  out.found.length = out.minutes !== null;
  out.found.repeat = out.repeat !== 'NONE';
  if (!out.title) out.problem = 'Add what the plan is, e.g. "gym tomorrow 6-7am".';
  else if (out.title.length > 255) out.problem = 'Keep the name under 255 characters.';
  else if (out.start && out.minutes && clockMinutesOf(out.start) + out.minutes > 24 * 60) out.problem = 'A plan has to end by midnight.';
  else if (out.until && out.until < out.date) out.problem = 'It cannot end before it starts.';
  return out;
}
const clockMinutesOf = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
