// What the dashboard and the journal need to know about wind-downs, without loading the wind-down sheet itself.
import { localDate, periodKey } from './utils';

export const WIND_TITLE = 'Evening wind-down';
const DONE_KEY = 'auragoal.windDown';
export const windDownDone = (key) => { try { return JSON.parse(localStorage.getItem(DONE_KEY) || '[]').includes(key); } catch { return false; } };
export const markWindDownDone = (key) => {
  try { const s = JSON.parse(localStorage.getItem(DONE_KEY) || '[]'); localStorage.setItem(DONE_KEY, JSON.stringify([...s.filter((k) => k !== key), key].slice(-120))); } catch { /* ignore */ }
};
/** The id a wind-down is remembered by: DAILY:2026-11-16, WEEKLY:2026-11-16 (the period's first day), … */
export const windKey = (horizon, date) => `${horizon}:${horizon === 'DAILY' ? localDate(date) : periodKey(horizon, date)}`;
