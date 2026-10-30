import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api';
import { CATEGORIES, TIERS, tierOf } from '../lib/constants';
import { playSound, setSoundEnabled } from '../lib/sound';
import { pushFlag } from '../lib/push';
import { addDays, daysUntil, fmtSpan, localDate, plansOn } from '../lib/utils';

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
  const [dayPlans, setDayPlans] = useState([]); // the user's day plans (stand-alone, can repeat), with done / skipped days
  const [categories, setCategories] = useState(CATEGORIES);   // built-in plus the user's own (from the server)
  const [journal, setJournal] = useState([]);    // private notes and reflections
  const [reflectGoal, setReflectGoal] = useState(null);   // the goal whose reflection is open, or null
  const [pendingReflect, setPendingReflect] = useState(null);
  const [nextOpen, setNextOpen] = useState(false);
  const [syncedAt, setSyncedAt] = useState(null);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));   // the "What should I do now?" window
  // The task being worked on with the focus timer: { id, kind, title, context, minutes, endsAt, ref }. Kept in this
  // browser so a reload does not lose it.
  const [focus, setFocusState] = useState(() => { try { return JSON.parse(localStorage.getItem('auragoal.focus') || 'null'); } catch { return null; } });
  const setFocus = (f) => { setFocusState(f); try { f ? localStorage.setItem('auragoal.focus', JSON.stringify(f)) : localStorage.removeItem('auragoal.focus'); } catch { /* ignore */ } };   // a goal just completed: its reflection opens after the badge
  const [reviews, setReviews] = useState([]);  // every badge earned

  // A push about a partner's message opens the app at #partners
  const [view, setView] = useState(() => (window.location.hash === '#partners' ? 'partners' : 'active'));
  const [activeCat, setActiveCat] = useState('all');
  const [horizonFilter, setHorizonFilter] = useState('all');   // all, or WEEKLY / MONTHLY / YEARLY
  const [search, setSearch] = useState('');
  const [prio, setPrio] = useState('all');
  const [soundOn, setSoundOn] = useState(true);

  const [goalModal, setGoalModal] = useState(null);   // null, or { draft } when the New Goal sheet is open
  const [lighten, setLighten] = useState(null);       // null, or { date } when the "lighten this day" panel is open
  const [calendarFocus, setCalendarFocus] = useState(null); // asks the calendar to show a particular day
  const [plannerAt, setPlannerAt] = useState(null);   // the Planner's tab and period: { horizon, key }, null = today
  const [freshId, setFreshId] = useState(null);       // newly created goal opens expanded
  const [focusReq, setFocusReq] = useState(null);     // ask a card to scroll into view and open
  const [linger, setLinger] = useState(() => new Set()); // just-completed goals stay in the feed for a moment
  const [toastMsg, setToastMsg] = useState(null);
  const [rewardQueue, setRewardQueue] = useState([]);
  const [now, setNow] = useState(() => new Date());
  const [partners, setPartners] = useState({ partners: [], incoming: [], outgoing: [] });   // accountability partners and invites

  useEffect(() => setSoundEnabled(soundOn), [soundOn]);

  // ---- Data
  const refresh = useCallback(async () => {
    const s = await api.snapshot();
    setUser(s.user); setGoals(s.goals); setDayPlans(s.dayPlans); setReviews(s.reviews); setJournal(s.journal);
    setSyncedAt(new Date());   // when the data on screen was last fetched (shown while offline)
    // Built-in categories keep the palette's colours (src/lib/constants.js); personal ones use the colour the user picked
    if (s.categories) setCategories(s.categories.map((c) => (c.personal ? c : { ...c, color: CATEGORIES.find((k) => k.id === c.id)?.color ?? c.color })));
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
    setUser(null); setGoals([]); setDayPlans([]); setReviews([]); setJournal([]); setCategories(CATEGORIES); setPartners({ partners: [], incoming: [], outgoing: [] }); setRewardQueue([]); setGoalModal(null); setLighten(null);
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
    setFreshId(g.id); setGoalModal(null);
    setView((v) => (v === 'planner' ? v : 'active'));   // a goal made in the Planner stays there, in its period
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
    // Invite a reflection on the finished goal (it opens once any badge has been celebrated)
    if (res.goal_status === 'COMPLETED' && want) setPendingReflect(goalId);
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

  const addTask = (goalId, text) => run(async () => { await api.addTask(goalId, text); await refresh(); playSound('check'); return true; });

  // ---- Day plans. Each returns true when it worked.
  const addDayPlan = (fields) => run(async () => { await api.createDayPlan(fields); await refresh(); playSound('check'); toast('Added to your day.'); return true; });
  const editDayPlan = (id, fields) => run(async () => { await api.updateDayPlan(id, fields); await refresh(); toast('Plan updated.'); return true; });
  /** Ticks one day of a plan off (or back on). Finishing one keeps the streak going, like a goal's plan. */
  const toggleDayPlan = (id, date, done) => run(async () => {
    const res = await api.markDayPlan(id, date, done ? 'DONE' : null);
    playSound(done ? 'check' : 'uncheck');
    streakMessages(res.streak).forEach((m, i) => setTimeout(() => toast(m), i * 3000));
    await refresh();
    return true;
  });
  /** Takes one day out of a repeating plan; the rest of the series stays. Offers Undo. */
  const skipDayPlan = (id, date) => run(async () => {
    await api.markDayPlan(id, date, 'SKIPPED');
    await refresh();
    toast('Removed from this day.', { action: { label: 'Undo', onClick: () => run(async () => { await api.markDayPlan(id, date, null); await refresh(); }) } });
    return true;
  });
  const deleteDayPlan = (id) => run(async () => { await api.deleteDayPlan(id); await refresh(); toast('Plan deleted.'); return true; });

  /** Hides a goal from partners, or shares it again. */
  const setGoalPrivate = (id, isPrivate) => run(async () => {
    await api.setGoalPrivate(id, isPrivate);
    await refresh();
    toast(isPrivate ? 'Private: your partners cannot see this goal.' : 'Shared with your partners again.');
    return true;
  });

  // ---- Accountability partners
  const refreshPartners = useCallback(async () => {
    try { setPartners(await api.getPartners()); } catch (e) { if (e.auth) setUser(null); }
  }, []);
  /** invite ({ email }), accept / decline / remove ({ id }). Returns the server's message, or undefined on failure. */
  const partnerAction = (action, fields) => run(async () => {
    const r = await api.partnerAction(action, fields);
    setPartners({ partners: r.partners, incoming: r.incoming, outgoing: r.outgoing });
    return r.message ?? true;
  });
  // The list (and its unread counts) stays fresh while the app is open
  useEffect(() => {
    if (!user) return undefined;
    refreshPartners();
    const t = setInterval(refreshPartners, 20000);
    return () => clearInterval(t);
  }, [user?.id, refreshPartners]); // eslint-disable-line react-hooks/exhaustive-deps
  const unreadTotal = partners.partners.reduce((n, p) => n + p.unread, 0) + partners.incoming.length;

  /** Edits a goal's title, category, priority, period, finish-by date or quote. Throws, so the form can show the message. */
  const updateGoal = async (id, fields) => {
    try { await api.updateGoal(id, fields); } catch (e) { if (e.auth) setUser(null); throw e; }
    await refresh(); setGoalModal(null); toast('Goal updated.');
  };
  const setTaskEstimate = (taskId, minutes) => run(async () => { await api.setTaskEstimate(taskId, minutes); await refresh(); return true; });
  const renameTask = (taskId, text) => run(async () => { await api.renameTask(taskId, text); await refresh(); return true; });

  // ---- Personal categories. Each returns true (or the new id) when it worked.
  const createCategory = (name, color) => run(async () => { const r = await api.createCategory(name, color); setCategories(r.categories); toast(`Added "${name}".`); return r.id; });
  const updateCategory = (id, fields) => run(async () => { const r = await api.updateCategory(id, fields); setCategories(r.categories); return true; });
  const deleteCategory = (id) => run(async () => {
    const r = await api.deleteCategory(id); setCategories(r.categories); await refresh();
    if (String(activeCat) === String(id)) setActiveCat('all');
    toast('Category deleted. Its goals are now under Others.'); return true;
  });

  // ---- Journal
  const saveJournal = (entry) => run(async () => { const e = await api.saveJournal(entry); await refresh(); toast('Saved to your journal.'); return e; });
  const deleteJournal = (id) => run(async () => { await api.deleteJournal(id); await refresh(); toast('Entry deleted.'); return true; });

  /** Deletes a goal for good (the card asks twice first). */
  const deleteGoal = (id) => run(async () => { await api.deleteGoal(id); await refresh(); toast('Goal deleted.'); return true; });
  /** Removes one plan from a goal. */
  const deleteTask = (taskId) => run(async () => {
    const r = await api.deleteTask(taskId);
    await refresh();
    toast(r.goal_status === 'COMPLETED' ? 'Plan removed. Every plan left is done, so the goal is complete!' : 'Plan removed.');
    return true;
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
      if (horizonFilter !== 'all' && g.timeframe !== horizonFilter) return false;
      if (prio !== 'all' && g.priority !== prio) return false;
      if (q && !(`${g.title} ${g.sub_plans.map((t) => t.text).join(' ')}`).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activeGoals, activeCat, horizonFilter, search, prio]);

  // Things that slipped: goals past their due date, and one-off day plans from an earlier day that were not done.
  // A missed day of a repeating plan does not count (the next one is already coming), and today never does.
  const slipped = useMemo(() => {
    const items = [];
    for (const g of goals) {
      if (g.status !== 'ACTIVE' || !g.due_date || daysUntil(g.due_date) >= 0) continue;
      const cat = categories.find((x) => x.id === g.category_id);
      items.push({
        key: `g${g.id}`, kind: 'goal', goalId: g.id, color: cat?.color ?? '#B85C38', category: cat?.name, title: g.title, timeframe: g.timeframe,
        due_date: g.due_date, daysLate: -daysUntil(g.due_date), done: g.sub_plans.filter((t) => t.done).length, total: g.sub_plans.length, weight: 30,
      });
    }
    for (const p of dayPlans) {
      if (p.repeat !== 'NONE' || p.marks[p.date] || daysUntil(p.date) >= 0) continue;
      items.push({
        key: `p${p.id}`, kind: 'plan', planId: p.id, color: '#B85C38', title: p.title, date: p.date, start: p.start, minutes: p.minutes,
        span: fmtSpan(p.start, p.minutes), daysLate: -daysUntil(p.date), weight: p.minutes ?? 30,
      });
    }
    return items.sort((x, y) => y.daysLate - x.daysLate || x.key.localeCompare(y.key));
  }, [goals, dayPlans, categories, now]);

  // Connection: nothing is cached on the device, so when it comes back (or when the app is reopened after a while,
  // for example an installed app brought back from the background) the data is fetched fresh, never left stale.
  useEffect(() => {
    const goOnline = () => { setOnline(true); if (user) refresh().then(() => toast('Back online. Everything is up to date.')).catch(() => {}); };
    const goOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && user && navigator.onLine && (!syncedAt || Date.now() - syncedAt.getTime() > 60000)) refresh().catch(() => {});
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); document.removeEventListener('visibilitychange', onVisible); };
  }, [user, syncedAt, refresh, toast]);

  // A just-completed goal's reflection opens once the badge pop-up (if any) is out of the way
  useEffect(() => {
    if (!pendingReflect || rewardQueue.length || reflectGoal || goalModal) return undefined;
    const t = setTimeout(() => { setReflectGoal(pendingReflect); setPendingReflect(null); }, 900);
    return () => clearTimeout(t);
  }, [pendingReflect, rewardQueue.length, reflectGoal, goalModal]);

  // Rewards shown in the header exclude badges still waiting to be claimed
  const rewardsTotal = Math.max(0, reviews.length - rewardQueue.length);

  // ---- Notifications: timed day plans today and in the next two days, goals ending within 3 days
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, [user]);

  const notif = useMemo(() => {
    const today = localDate(now);
    const timed = [0, 1, 2].flatMap((n) => {
      const key = localDate(addDays(now, n));
      return plansOn(dayPlans, key).filter((x) => x.start && !x.done).map((x) => ({
        id: `${x.plan.id}@${key}`, plan_id: x.plan.id, title: x.plan.title, key, at: new Date(`${key}T${x.start}`), span: fmtSpan(x.start, x.minutes),
      }));
    });
    const deadlines = goals
      .filter((g) => g.status === 'ACTIVE' && g.due_date)
      .map((g) => ({ goal_id: g.id, title: g.title, due_date: g.due_date, days_left: daysUntil(g.due_date) }))
      .filter((x) => x.days_left <= 3)
      .sort((x, y) => x.days_left - y.days_left);
    return {
      due: timed.filter((r) => r.key === today && r.at <= now),   // started and not ticked off yet
      soon: timed.filter((r) => r.at > now),
      urgent: deadlines.filter((x) => x.days_left <= 1),
      later: deadlines.filter((x) => x.days_left > 1),
    };
  }, [goals, dayPlans, now]);

  // Alert once per reminder (remembered in this browser) when its time arrives
  const alerted = useRef(false);
  useEffect(() => {
    if (!user) { alerted.current = false; return; }
    const seen = getNotified();
    // Only plans that started in the last 15 minutes: opening the app in the evening does not ring for the morning
    const fresh = notif.due.filter((r) => now - r.at < 15 * 60000 && !seen.has(r.id));
    if (!fresh.length) return;
    fresh.forEach((r) => seen.add(r.id));
    saveNotified(seen);
    playSound('bell');
    toast(fresh.length === 1 ? `Time for: ${fresh[0].title}` : `${fresh.length} plans are starting`);
    // A device that gets server pushes shows its own notification, so the page skips it to avoid a double
    if ('Notification' in window && Notification.permission === 'granted' && !pushFlag.get()) {
      fresh.slice(0, 3).forEach((r) => { try { new Notification(r.title, { body: `${r.span} · AuraGoal` }); } catch { /* ignore */ } });
    }
  }, [notif.due, user, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const openGoal = (id) => {
    if (!activeGoals.some((g) => g.id === id)) { toast('That goal is not in your active list.'); return; }
    setSearch(''); setPrio('all'); setActiveCat('all'); setHorizonFilter('all'); setView('active');
    setFocusReq({ id, n: Date.now() });
  };

  const value = {
    booted, bootError, boot, user, goals, reviews, categories, online, syncedAt, refresh,
    createCategory, updateCategory, deleteCategory, updateGoal, renameTask, setTaskEstimate,
    nextOpen, openNext: () => setNextOpen(true), closeNext: () => setNextOpen(false), focus, setFocus,
    journal, saveJournal, deleteJournal, reflectGoal, openReflection: (id) => setReflectGoal(id), closeReflection: () => setReflectGoal(null),
    openGoalEditor: (goal) => setGoalModal({ draft: { edit: goal } }),
    view, setView, activeCat, setActiveCat, horizonFilter, setHorizonFilter, search, setSearch, prio, setPrio,
    soundOn, setSoundOn, goalModal, openGoalModal: (draft = null) => setGoalModal({ draft }), closeGoalModal: () => setGoalModal(null),
    freshId, focusReq, consumeFocus: () => setFocusReq(null), openGoal,
    lighten, openLighten: (date) => setLighten({ date }), closeLighten: () => setLighten(null),
    calendarFocus, consumeCalendarFocus: () => setCalendarFocus(null),
    openCalendarDay: (key) => { setView('calendar'); setCalendarFocus({ key, n: Date.now() }); },
    plannerAt, setPlannerAt,
    openPlanner: (horizon, key) => { setPlannerAt({ horizon, key }); setView('planner'); },
    openDay: (key) => { setPlannerAt({ horizon: 'DAILY', key }); setView('planner'); },
    partners, refreshPartners, setPartners, partnerAction, unreadTotal, setGoalPrivate,
    dayPlans, addDayPlan, editDayPlan, toggleDayPlan, skipDayPlan, deleteDayPlan,
    activeGoals, visibleGoals, rewardsTotal, notif, now, slipped, rescheduleItems,
    toastMsg, toast, dismissToast, rewardQueue, claimReward: () => {
      const item = rewardQueue[0];
      if (!item) return;
      setRewardQueue((q) => q.slice(1));
      toast(`${TIERS[item.rank].name} badge saved. Rewards: ${reviews.length - rewardQueue.length + 1}`);
    },
    updateProfile, uploadAvatar, removeAvatar,
    signIn, signOut, createGoal, toggleTask, addTask, archiveGoal, deleteGoal, deleteTask, restoreGoal,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
