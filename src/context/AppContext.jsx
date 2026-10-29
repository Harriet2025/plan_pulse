import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api';
import { CATEGORIES, TIERS, tierOf } from '../lib/constants';
import { playSound, setSoundEnabled } from '../lib/sound';
import { pushFlag } from '../lib/push';
import { daysUntil } from '../lib/utils';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

/** Plain-language messages for what just happened to the streak (freeze spent, freeze earned, streak restarted). */
function streakMessages(streak) {
  return (streak?.events ?? []).map((e) => {
    if (e.type === 'freeze_used') return `A streak freeze covered ${e.count === 1 ? 'a missed day' : `${e.count} missed days`}, so your ${e.streak}-day streak is still alive.`;
    if (e.type === 'freeze_earned') return `${e.streak} days in a row. You earned a streak freeze, and it will cover one missed day.`;
    if (e.type === 'reset') return `Fresh start today. Your best streak is ${e.best} days, so you know you can do it.`;
    return null;
  }).filter(Boolean);
}

const NOTIFIED_KEY = 'auragoal.notified';
const getNotified = () => { try { return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]')); } catch { return new Set(); } };
const saveNotified = (s) => { try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...s].slice(-300))); } catch { /* ignore */ } };

export function AppProvider({ children }) {
  const [booted, setBooted] = useState(false);
  const [user, setUser] = useState(null);
  const [goals, setGoals] = useState([]);      // every goal the user has, any status
  const [reviews, setReviews] = useState([]);  // every badge earned

  const [view, setView] = useState('active');  // active | categories | history
  const [activeCat, setActiveCat] = useState('all');
  const [search, setSearch] = useState('');
  const [prio, setPrio] = useState('all');
  const [soundOn, setSoundOn] = useState(true);

  const [goalModal, setGoalModal] = useState(null);   // null, or { draft } when the New Goal sheet is open
  const [lighten, setLighten] = useState(null);       // null, or { date } when the "lighten this day" panel is open
  const [calendarFocus, setCalendarFocus] = useState(null); // asks the calendar to show a particular day
  const [freshId, setFreshId] = useState(null);       // newly created goal opens expanded
  const [focusReq, setFocusReq] = useState(null);     // ask a card to scroll into view and open
  const [linger, setLinger] = useState(() => new Set()); // just-completed goals stay in the feed for a moment
  const [toastMsg, setToastMsg] = useState(null);
  const [rewardQueue, setRewardQueue] = useState([]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => setSoundEnabled(soundOn), [soundOn]);

  // ---- Data
  const refresh = useCallback(async () => {
    const s = await api.snapshot();
    setUser(s.user); setGoals(s.goals); setReviews(s.reviews);
    // Tell the server this browser's time zone, so reminders, the morning email and streak days follow the user's
    // clock (the server's own clock can be in a different zone)
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && s.user.timezone !== tz) {
      try { setUser(await api.updateProfile({ timezone: tz })); } catch { /* keep using the server's zone */ }
    }
  }, []);

  // Ask the server who is signed in. If it is unreachable, the sign-in screen explains why.
  const [bootError, setBootError] = useState('');
  const boot = useCallback(async () => {
    setBootError('');
    try { if (await api.getCurrentUser()) await refresh(); } catch (e) { setBootError(e.message); }
    setBooted(true);
  }, [refresh]);
  useEffect(() => { boot(); }, [boot]);

  // toast(msg) or toast(msg, { action: { label, onClick } }). A toast with an action (like Undo) stays up longer.
  const toast = useCallback((msg, opts = {}) => setToastMsg({ msg, id: Date.now() + Math.random(), action: opts.action ?? null }), []);
  const dismissToast = useCallback(() => setToastMsg(null), []);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), toastMsg.action ? 7000 : 2600);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const run = useCallback(async (fn) => {
    try {
      return await fn();
    } catch (e) {
      if (e.auth) { setUser(null); return undefined; } // session expired: back to the sign-in screen
      toast(e.message);
      return undefined;
    }
  }, [toast]);

  // ---- Auth
  const signIn = async (mode, fields) => {
    const u = mode === 'signup' ? await api.signup(fields) : await api.login(fields);
    await refresh();
    setView('active'); setActiveCat('all'); setSearch(''); setPrio('all');
    toast(mode === 'signup' ? `Welcome, ${u.display_name}!` : `Welcome back, ${u.display_name}.`);
  };
  const signOut = async () => {
    await api.logout();
    setUser(null); setGoals([]); setReviews([]); setRewardQueue([]); setGoalModal(null); setLighten(null);
  };

  // ---- Profile. These throw, so the settings forms can show the server's message next to the field.
  // An expired session sends the user back to the sign-in screen
  const guard = async (fn) => { try { setUser(await fn()); } catch (e) { if (e.auth) setUser(null); throw e; } };
  const updateProfile = (fields) => guard(() => api.updateProfile(fields));
  const uploadAvatar = (blob) => guard(() => api.uploadAvatar(blob));
  const removeAvatar = () => guard(() => api.deleteAvatar());

  // ---- Goals and tasks
  const createGoal = async (input) => {
    const g = await api.createGoal(input);
    await refresh();
    setFreshId(g.id); setView('active'); setGoalModal(null);
    toast('Goal saved.');
  };

  const toggleTask = (goalId, taskId, want) => run(async () => {
    const res = await api.setTaskDone(goalId, taskId, want);
    playSound(want ? 'check' : 'uncheck');
    const messages = [];
    if (res.goal_status === 'COMPLETED') {
      // A finished goal moves to History; the card leaves the feed after a short moment
      setLinger((s) => new Set(s).add(goalId));
      messages.push('Goal complete! It now lives in History.');
      setTimeout(() => setLinger((s) => { const n = new Set(s); n.delete(goalId); return n; }), 2200);
    }
    messages.push(...streakMessages(res.streak));
    messages.forEach((m, i) => setTimeout(() => toast(m), i * 3000));   // one toast shows at a time, so queue them
    await refresh();
    // Earned badges are kept if you uncheck, so only a check can award one
    if (want && tierOf(res.progress.percentage) > 0) {
      const rv = await api.awardBadge(goalId);
      if (rv.created) {
        const goal = goals.find((g) => g.id === goalId);
        await refresh();
        setRewardQueue((q) => [...q, { id: rv.review.id, title: goal?.title ?? '', rank: Math.min(3, rv.review.tier), pct: rv.review.pct }]);
      }
    }
  });

  /**
   * Applies a batch of changes from the Catch up page, then offers to undo them. `undo` is the same batch pointing
   * back at the old values. Returns true when it worked.
   */
  const rescheduleItems = (actions, undo, message) => run(async () => {
    await api.reschedule(actions);
    playSound('check');
    await refresh();
    toast(message, {
      action: {
        label: 'Undo',
        onClick: () => run(async () => { await api.reschedule(undo); await refresh(); toast('Put back the way it was.'); }),
      },
    });
    return true;
  });

  const addTask = (goalId, text, estimate = null) => run(async () => { await api.addTask(goalId, text, estimate); await refresh(); playSound('check'); return true; });
  /** Minutes (5 to 720), or null to remove the estimate. */
  const setEstimate = (taskId, minutes) => run(async () => { await api.setEstimate(taskId, minutes); await refresh(); return true; });
  const setReminder = (goalId, taskId, value) => run(async () => {
    await api.setReminder(goalId, taskId, value);
    await refresh();
    toast(value ? 'Reminder set.' : 'Reminder removed.');
  });
  const archiveGoal = (id) => run(async () => { await api.setGoalStatus(id, 'ARCHIVED'); await refresh(); toast('Archived. You can restore it from History.'); });
  const restoreGoal = (id) => run(async () => {
    const g = await api.setGoalStatus(id, 'ACTIVE');
    await refresh();
    toast(g.status === 'COMPLETED' ? 'Restored as a completed goal.' : 'Restored to Active Goals.');
  });

  // ---- Derived
  const activeGoals = useMemo(() => goals.filter((g) => g.status === 'ACTIVE' || linger.has(g.id)), [goals, linger]);

  const visibleGoals = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeGoals.filter((g) => {
      if (activeCat !== 'all' && g.category_id !== Number(activeCat)) return false;
      if (prio !== 'all' && g.priority !== prio) return false;
      if (q && !(`${g.title} ${g.sub_plans.map((t) => t.text).join(' ')}`).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activeGoals, activeCat, search, prio]);

  // Things that slipped: goals past their due date and unfinished tasks whose reminder day has passed.
  // Earlier today does not count, so the Catch up page never nags about the current day.
  const slipped = useMemo(() => {
    const items = [];
    for (const g of goals) {
      if (g.status !== 'ACTIVE') continue;
      const cat = CATEGORIES.find((c) => c.id === g.category_id);
      const common = { goalId: g.id, color: cat?.color ?? '#B85C38', category: cat?.name };
      if (g.due_date && daysUntil(g.due_date) < 0) {
        // `weight` is how many minutes this adds to a day (the tasks that have to be done by the new due date)
        const left = g.sub_plans.filter((t) => !t.done && !t.remind).reduce((n, t) => n + (t.estimate ?? 30), 0);
        items.push({ ...common, key: `g${g.id}`, kind: 'goal', title: g.title, due_date: g.due_date, daysLate: -daysUntil(g.due_date), done: g.sub_plans.filter((t) => t.done).length, total: g.sub_plans.length, weight: left || 30 });
      }
      for (const t of g.sub_plans) {
        if (t.done || !t.remind || daysUntil(t.remind.slice(0, 10)) >= 0) continue;
        items.push({ ...common, key: `t${t.id}`, kind: 'task', taskId: t.id, title: t.text, goalTitle: g.title, remind: t.remind, daysLate: -daysUntil(t.remind.slice(0, 10)), estimate: t.estimate, weight: t.estimate ?? 30 });
      }
    }
    return items.sort((a, b) => b.daysLate - a.daysLate || a.key.localeCompare(b.key));
  }, [goals, now]);

  // Rewards shown in the header exclude badges still waiting to be claimed
  const rewardsTotal = Math.max(0, reviews.length - rewardQueue.length);

  // ---- Notifications: task reminders within a week, goals due within 3 days
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, [user]);

  const notif = useMemo(() => {
    const open = goals.filter((g) => g.status === 'ACTIVE');
    const horizon = now.getTime() + 7 * 86400000;
    const reminders = open
      .flatMap((g) => g.sub_plans
        .filter((t) => !t.done && t.remind && new Date(t.remind).getTime() <= horizon)
        .map((t) => ({ sub_plan_id: t.id, goal_id: g.id, goal_title: g.title, task_description: t.text, remind_at: t.remind })))
      .sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at));
    const deadlines = open
      .filter((g) => g.due_date)
      .map((g) => ({ goal_id: g.id, title: g.title, due_date: g.due_date, days_left: daysUntil(g.due_date) }))
      .filter((d) => d.days_left <= 3)
      .sort((a, b) => a.days_left - b.days_left);
    return {
      due: reminders.filter((r) => new Date(r.remind_at) <= now),
      soon: reminders.filter((r) => new Date(r.remind_at) > now),
      urgent: deadlines.filter((d) => d.days_left <= 1),
      later: deadlines.filter((d) => d.days_left > 1),
    };
  }, [goals, now]);

  // Alert once per reminder (remembered in this browser) when its time arrives
  const alerted = useRef(false);
  useEffect(() => {
    if (!user) { alerted.current = false; return; }
    const seen = getNotified();
    const fresh = notif.due.filter((r) => !seen.has(`${r.sub_plan_id}@${r.remind_at}`));
    if (!fresh.length) return;
    fresh.forEach((r) => seen.add(`${r.sub_plan_id}@${r.remind_at}`));
    saveNotified(seen);
    playSound('bell');
    toast(fresh.length === 1 ? `Reminder: ${fresh[0].task_description}` : `${fresh.length} reminders are due`);
    // A device that gets server pushes shows its own notification, so the page skips it to avoid a double
    if ('Notification' in window && Notification.permission === 'granted' && !pushFlag.get()) {
      fresh.slice(0, 3).forEach((r) => { try { new Notification('AuraGoal reminder', { body: `${r.task_description} (${r.goal_title})` }); } catch { /* ignore */ } });
    }
  }, [notif.due, user, toast]);

  const openGoal = (id) => {
    if (!activeGoals.some((g) => g.id === id)) { toast('That goal is not in your active list.'); return; }
    setSearch(''); setPrio('all'); setActiveCat('all'); setView('active');
    setFocusReq({ id, n: Date.now() });
  };

  const value = {
    booted, bootError, boot, user, goals, reviews, categories: CATEGORIES,
    view, setView, activeCat, setActiveCat, search, setSearch, prio, setPrio,
    soundOn, setSoundOn, goalModal, openGoalModal: (draft = null) => setGoalModal({ draft }), closeGoalModal: () => setGoalModal(null),
    freshId, focusReq, consumeFocus: () => setFocusReq(null), openGoal,
    lighten, openLighten: (date) => setLighten({ date }), closeLighten: () => setLighten(null),
    calendarFocus, consumeCalendarFocus: () => setCalendarFocus(null),
    openCalendarDay: (key) => { setView('calendar'); setCalendarFocus({ key, n: Date.now() }); },
    setEstimate,
    activeGoals, visibleGoals, rewardsTotal, notif, now, slipped, rescheduleItems,
    toastMsg, toast, dismissToast, rewardQueue, claimReward: () => {
      const item = rewardQueue[0];
      if (!item) return;
      setRewardQueue((q) => q.slice(1));
      toast(`${TIERS[item.rank].name} badge saved. Rewards: ${reviews.length - rewardQueue.length + 1}`);
    },
    updateProfile, uploadAvatar, removeAvatar,
    signIn, signOut, createGoal, toggleTask, addTask, setReminder, archiveGoal, restoreGoal,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
