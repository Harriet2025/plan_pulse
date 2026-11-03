// Talks to Supabase. Plain reads and writes go straight to the tables, where the access rules in supabase/schema.sql
// decide what each person can reach. Anything with a rule to enforce (streaks, badges, partners, chat) is a database
// function, and anything needing a secret (email, push) goes through the notify Edge Function.
//
// Every function is async and throws an Error with a user-facing message. `error.auth` is true when the
// session has expired, and `error.network` when the server could not be reached.
import { supabase } from '../lib/supabase';
import { endpointKey } from '../lib/push';
import { prepareChatPhoto } from '../lib/image';

const UNREACHABLE = "Can't reach AuraGoal right now. Check your internet connection and try again.";

function toError(error, status) {
  const message = String(error?.message ?? '');
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message) || status === 0) {
    return Object.assign(new Error(UNREACHABLE), { network: true });
  }
  if (status === 401 || error?.code === 'PGRST301') return Object.assign(new Error('Please sign in to continue.'), { auth: true, status });
  if (error?.code === '42501') return Object.assign(new Error('You do not have access to that.'), { status });
  if (error?.code === '23514') return Object.assign(new Error('That value is not allowed.'), { status });
  if (error?.code === '23505') return Object.assign(new Error('That already exists.'), { status });
  return Object.assign(new Error(message || 'Something went wrong. Please try again.'), { status });
}

/** Runs a query and returns its rows, or throws a user-facing Error. */
async function q(query) {
  const { data, error, status } = await query;
  if (error) throw toError(error, status);
  return data;
}
const rpc = (name, args) => q(supabase.rpc(name, args));

/** Every row of a large read: the API returns at most 1000 at a time. */
async function all(build) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const page = await q(build().range(from, from + 999));
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function myId() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw Object.assign(new Error('Please sign in to continue.'), { auth: true });
  return data.session.user.id;
}

/** The notify Edge Function: email, push and the worker's status. */
async function notify(type, fields = {}) {
  const { data, error } = await supabase.functions.invoke('notify', { body: { type, ...fields } });
  if (!error) return data;
  let message = '';
  try { message = (await error.context.json()).error; } catch { /* not JSON: the function was not reached */ }
  throw Object.assign(new Error(message || UNREACHABLE), { network: !message, status: error.context?.status });
}

// The database's TIME and DATE come back as "14:00:00" and "2026-10-26"
const hhmm = (t) => (t ? t.slice(0, 5) : null);
const daysFromMask = (mask) => [1, 2, 3, 4, 5, 6, 7].filter((d) => (mask >> (d - 1)) & 1);
const maskFromDays = (days) => days.reduce((m, d) => m | (1 << (d - 1)), 0);
const TIER_RANK = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };

// A goal's plan: one step in its checklist
// `estimate` is how long it takes in minutes (null when not known), used by "What should I do now?"
const fromTask = (t) => ({ id: t.id, text: t.task_description, done: !!t.is_completed, estimate: t.estimate_min ?? null });

const GOAL_COLUMNS = 'id, title, category_id, priority, timeframe, due_date, quote, is_private, status, completed_at, created_at, updated_at, sub_plans(id, task_description, is_completed, estimate_min), reviews(reward_badge_tier)';
const fromGoal = (g) => ({
  id: g.id, title: g.title, category_id: g.category_id, priority: g.priority, timeframe: g.timeframe,
  due_date: g.due_date, quote: g.quote, is_private: !!g.is_private, status: g.status,
  best_tier_rank: Math.max(0, ...(g.reviews ?? []).map((r) => TIER_RANK[r.reward_badge_tier] ?? 0)),
  completed_at: g.completed_at, created_at: g.created_at, updated_at: g.updated_at,
  sub_plans: [...(g.sub_plans ?? [])].sort((a, b) => a.id - b.id).map(fromTask),
});
const fetchGoal = async (id) => fromGoal(await q(supabase.from('goals').select(GOAL_COLUMNS).eq('id', id).single()));

// A day plan: { id, title, date, start: 'HH:MM' | null, minutes, repeat: NONE|DAILY|WEEKLY|MONTHLY, days: [1..7], until,
// private, marks: { 'YYYY-MM-DD': 'DONE' | 'SKIPPED' } }
const PLAN_COLUMNS = 'id, title, plan_date, start_time, duration_min, repeat_rule, repeat_days, repeat_until, is_private, day_plan_marks(on_date, state)';
const fromDayPlan = (p) => ({
  id: p.id, title: p.title, date: p.plan_date, start: hhmm(p.start_time), minutes: p.duration_min, repeat: p.repeat_rule,
  days: daysFromMask(p.repeat_days), until: p.repeat_until, private: !!p.is_private,
  marks: Object.fromEntries((p.day_plan_marks ?? []).map((m) => [m.on_date, m.state])),
});
const fetchDayPlan = async (id) => fromDayPlan(await q(supabase.from('day_plans').select(PLAN_COLUMNS).eq('id', id).single()));

const fromEntry = (e) => ({
  id: e.id, kind: e.kind, date: e.entry_date, period: e.period, period_key: e.period_key, goal_id: e.goal_id, title: e.title, body: e.body,
  answers: e.answers ?? {}, mood: e.mood, created_at: e.created_at, updated_at: e.updated_at,
});

const fromCategory = (c) => ({ id: c.id, name: c.name, color: c.color_code, personal: c.user_id !== null });
const fetchCategories = async () => {
  const rows = await q(supabase.from('categories').select('id, user_id, name, color_code').order('id'));
  return [...rows.filter((c) => c.user_id === null), ...rows.filter((c) => c.user_id !== null)].map(fromCategory);   // built-in first
};

// ---- Auth --------------------------------------------------------------

const authError = (error) => {
  if (/failed to fetch|networkerror|load failed/i.test(error.message)) return Object.assign(new Error(UNREACHABLE), { network: true });
  if (/invalid login credentials/i.test(error.message)) return new Error('Incorrect email or password.');
  if (/email not confirmed/i.test(error.message)) return new Error('Confirm your email first: open the link we sent you, then sign in.');
  if (/rate limit|too many/i.test(error.message)) return new Error('Too many emails were sent just now. Wait a little and try again.');
  return new Error(error.message);
};

export async function getCurrentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session ? rpc('my_profile') : null;
}

/** Returns the user, or null when they still have to confirm their email. */
export async function signup({ display_name, email, password }) {
  const name = display_name.trim();
  if (!name || name.length > 100) throw new Error('Enter a name of 1 to 100 characters.');
  if (password.length < 8 || password.length > 72) throw new Error('Your password must be 8 to 72 characters.');
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(), password,
    options: { data: { display_name: name }, emailRedirectTo: window.location.origin },
  });
  if (error) throw authError(error);
  return data.session ? rpc('my_profile') : null;
}
export async function login({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw authError(error);
  return rpc('my_profile');
}
export async function logout() {
  await supabase.auth.signOut({ scope: 'local' });
}

/** Asks for a reset link by email. The answer is always the same, whether or not the address has an account. */
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
  if (error && /rate limit|too many|failed to fetch/i.test(error.message)) throw authError(error);
  return 'If an account uses that email, a reset link is on its way. It works for 60 minutes.';
}
/** Sets a new password using the token from the emailed link (#reset=...), which works on any device. */
export async function resetPassword(token, password) {
  const { data: before } = await supabase.auth.getSession();
  const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: 'recovery' });
  if (error) throw new Error('This reset link is invalid or has expired. Ask for a new one.');
  const { error: failed } = await supabase.auth.updateUser({ password });
  if (failed) throw authError(failed);
  if (!before.session) await supabase.auth.signOut({ scope: 'local' });   // they sign in with the new password
  return 'Your password is changed. Sign in with it now.';
}

// ---- Profile -----------------------------------------------------------

/**
 * Any of { display_name, email, new_password, rest_days, capacity_min, timezone, digest_enabled, digest_time }. Changing
 * the email or password also needs current_password. Returns the user.
 */
export async function updateProfile(fields) {
  const id = await myId();
  const set = {};
  if ('display_name' in fields) {
    const name = String(fields.display_name).trim();
    if (!name || name.length > 100) throw new Error('Enter a name of 1 to 100 characters.');
    set.display_name = name;
  }
  if ('rest_days' in fields) {
    if (fields.rest_days.length > 3) throw new Error('Choose up to 3 rest days.');
    set.rest_days = maskFromDays(fields.rest_days);
  }
  if ('capacity_min' in fields) {
    if (!(fields.capacity_min >= 30 && fields.capacity_min <= 960)) throw new Error('Daily capacity must be between 30 minutes and 16 hours.');
    set.daily_capacity_min = fields.capacity_min;
  }
  if ('timezone' in fields) set.timezone = fields.timezone;
  if ('digest_enabled' in fields) set.digest_enabled = !!fields.digest_enabled;
  if ('digest_time' in fields) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(fields.digest_time)) throw new Error('Choose a time like 07:30.');
    set.digest_time = fields.digest_time;
  }

  // Changing the email or the password needs the current one, so a stolen session cannot take over the account
  const auth = {};
  if (fields.email !== undefined) {
    const email = String(fields.email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address.');
    auth.email = email;
  }
  if (fields.new_password) {
    if (fields.new_password.length < 8 || fields.new_password.length > 72) throw new Error('Your new password must be 8 to 72 characters.');
    auth.password = fields.new_password;
  }
  if (Object.keys(auth).length) {
    if (!fields.current_password) throw new Error('Enter your current password to confirm this change.');
    const { data } = await supabase.auth.getSession();
    const { error } = await supabase.auth.signInWithPassword({ email: data.session.user.email, password: fields.current_password });
    if (error) throw new Error(/invalid login/i.test(error.message) ? 'Your current password is incorrect.' : authError(error).message);
    const { error: failed } = await supabase.auth.updateUser(auth);
    if (failed) throw authError(failed);
  }

  if (Object.keys(set).length) await q(supabase.from('profiles').update(set).eq('id', id));
  return rpc('my_profile');
}

/** `blob` is the cropped image from prepareAvatar(). Returns the updated user. */
export async function uploadAvatar(blob) {
  const id = await myId();
  const { error } = await supabase.storage.from('avatars').upload(`${id}/avatar.jpg`, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  await q(supabase.from('profiles').update({ avatar_updated_at: new Date().toISOString() }).eq('id', id));
  return rpc('my_profile');
}

export async function deleteAvatar() {
  const id = await myId();
  await supabase.storage.from('avatars').remove([`${id}/avatar.jpg`]);
  await q(supabase.from('profiles').update({ avatar_updated_at: null }).eq('id', id));
  return rpc('my_profile');
}

const avatarLinks = new Map();   // user id and photo version -> { url, until }
/**
 * A short-lived link to someone's photo (the storage rules only allow yourself and your partners), or null. The version
 * changes with every upload, so a new photo is never served from the browser cache.
 */
export async function avatarUrl(user) {
  if (!user?.avatar_v) return null;
  const key = `${user.id}:${user.avatar_v}`;
  const known = avatarLinks.get(key);
  if (known && known.until > Date.now()) return known.url;
  const { data, error } = await supabase.storage.from('avatars').createSignedUrl(`${user.id}/avatar.jpg`, 3600);
  if (error) return null;
  avatarLinks.set(key, { url: data.signedUrl, until: Date.now() + 50 * 60000 });
  return data.signedUrl;
}

// ---- Reads -------------------------------------------------------------

/** The signed-in user's profile, every goal (newest first), every day plan and every badge earned. */
export async function snapshot() {
  const [user, goals, dayPlans, categories, journal, reviews] = await Promise.all([
    rpc('my_profile'),
    all(() => supabase.from('goals').select(GOAL_COLUMNS).order('created_at', { ascending: false }).order('id', { ascending: false })),
    all(() => supabase.from('day_plans').select(PLAN_COLUMNS).order('plan_date').order('start_time', { nullsFirst: false }).order('id')),
    fetchCategories(),
    all(() => supabase.from('journal_entries').select('*').order('entry_date', { ascending: false }).order('id', { ascending: false })),
    all(() => supabase.from('reviews').select('id, goal_id, completion_percentage, reward_badge_tier, reviewed_at, goals(title)').neq('reward_badge_tier', 'NONE').order('id', { ascending: false })),
  ]);
  if (!user) throw Object.assign(new Error('Please sign in to continue.'), { auth: true });
  return {
    user,
    goals: goals.map(fromGoal),
    dayPlans: dayPlans.map(fromDayPlan),
    categories,   // built-in plus the user's own: [{ id, name, color, personal }]
    journal: journal.map(fromEntry),
    reviews: reviews.map((r) => ({
      id: r.id, goal_id: r.goal_id, goal_title: r.goals?.title, tier: Math.min(3, TIER_RANK[r.reward_badge_tier] ?? 0),
      pct: Number(r.completion_percentage), reviewed_at: r.reviewed_at,
    })),
  };
}

// ---- Goals -------------------------------------------------------------

const checkGoalText = (title, quote) => {
  if (!title || title.length > 255) throw new Error('Title is required and must be 255 characters or fewer.');
  if (quote && quote.length > 500) throw new Error('Quote must be 500 characters or fewer.');
};

export async function createGoal(input) {
  const title = (input.title ?? '').trim();
  checkGoalText(title, input.quote);
  const tasks = (input.tasks ?? []).map((t) => t.trim()).filter(Boolean);   // the goal's plans, in order
  if (tasks.some((t) => t.length > 500)) throw new Error('Each plan must be 500 characters or fewer.');
  const id = await rpc('create_goal', {
    p_goal: {
      title, category_id: input.category_id || null, priority: input.priority, timeframe: input.timeframe, is_private: !!input.is_private,
      due_date: input.due_date || null, quote: input.quote || null,
    },
    p_tasks: tasks,
  });
  return fetchGoal(id);
}

/** Archives a goal, or restores an archived one (back to COMPLETED if every task was done). */
export async function setGoalStatus(goalId, status) {
  await q(supabase.from('goals').update({ status }).eq('id', goalId).in('status', status === 'ACTIVE' ? ['ARCHIVED'] : ['ACTIVE', 'COMPLETED', 'ARCHIVED']));
  return fetchGoal(goalId);
}

// ---- Tasks -------------------------------------------------------------

export async function setTaskDone(_goalId, taskId, done) {
  // `streak` is only set when a task was finished: { count, best, freezes, events: [freeze_used | freeze_earned | reset] }
  return rpc('set_task_done', { p_task: taskId, p_done: !!done });
}

/**
 * Applies several changes at once, all or nothing. Each action is one of
 *   { kind: 'plan', id, op: 'move', to: 'YYYY-MM-DD' }                (a one-off day plan)
 *   { kind: 'plan', id, op: 'skip' | 'unskip' }                       (let a missed day plan go, or bring it back)
 *   { kind: 'goal', id, op: 'move', to: 'YYYY-MM-DD' | null }         (a goal's due date)
 *   { kind: 'goal', id, op: 'archive' | 'restore' }
 */
export async function reschedule(actions) {
  await rpc('reschedule', { p_actions: actions });
}

export async function addTask(goalId, text) {
  const task_description = text.trim();
  if (!task_description || task_description.length > 500) throw new Error('A plan is 1 to 500 characters.');
  await q(supabase.from('sub_plans').insert({ goal_id: goalId, task_description }));
}

// ---- Day plans ---------------------------------------------------------

/** The request's fields as table columns, checked. */
function planColumns(f) {
  const out = {};
  if ('title' in f) {
    out.title = String(f.title).trim();
    if (!out.title || out.title.length > 255) throw new Error('A plan needs a name of 255 characters or fewer.');
  }
  if ('date' in f) out.plan_date = f.date;
  if ('start' in f) {
    if (f.start && !/^([01]\d|2[0-3]):[0-5]\d$/.test(f.start)) throw new Error('The start time must look like 14:30.');
    out.start_time = f.start ? `${f.start}:00` : null;
  }
  if ('minutes' in f) {
    if (f.minutes !== null && f.minutes !== '' && !(f.minutes >= 5 && f.minutes <= 720)) throw new Error('A time estimate must be between 5 minutes and 12 hours.');
    out.duration_min = f.minutes === '' ? null : f.minutes;
  }
  if ('repeat' in f) out.repeat_rule = String(f.repeat).toUpperCase();
  if ('days' in f) out.repeat_days = maskFromDays(f.days);
  if ('until' in f) out.repeat_until = f.until || null;
  if ('private' in f) out.is_private = !!f.private;
  return out;
}

/** { title, date, start?, minutes?, repeat?, days?, until? }. Returns the new plan. */
export async function createDayPlan(fields) {
  if (!fields.date) throw new Error('Pick the day for this plan.');
  const row = await q(supabase.from('day_plans').insert(planColumns({ title: '', ...fields })).select('id').single());
  return fetchDayPlan(row.id);
}
/** Any of the create fields. Returns the updated plan. */
export async function updateDayPlan(id, fields) {
  await q(supabase.from('day_plans').update(planColumns(fields)).eq('id', id));
  return fetchDayPlan(id);
}
/** Marks one day of a plan DONE or SKIPPED, or null to undo it. `streak` is set when a plan was finished. */
export async function markDayPlan(id, date, state) {
  const r = await rpc('mark_day_plan', { p_id: id, p_date: date, p_state: state });
  return { plan: await fetchDayPlan(id), streak: r.streak };
}
/** Deletes the plan and every day of it. */
export async function deleteDayPlan(id) {
  await q(supabase.from('day_plans').delete().eq('id', id));
}

/** Changes a goal: any of { title, category_id, priority, timeframe, due_date, quote }. */
export async function updateGoal(goalId, fields) {
  const set = { ...fields };
  if ('title' in set) set.title = String(set.title).trim();
  if ('quote' in set) set.quote = String(set.quote ?? '').trim() || null;
  if ('due_date' in set && !set.due_date) delete set.due_date;
  checkGoalText('title' in set ? set.title : 'x', set.quote);
  await q(supabase.from('goals').update(set).eq('id', goalId));
  return fetchGoal(goalId);
}
/** How long one of a goal's plans takes, in minutes (5 to 720), or null when not known. */
export async function setTaskEstimate(taskId, minutes) {
  if (minutes !== null && minutes !== '' && !(minutes >= 5 && minutes <= 720)) throw new Error('A time estimate must be between 5 minutes and 12 hours.');
  await q(supabase.from('sub_plans').update({ estimate_min: minutes === '' ? null : minutes }).eq('id', taskId));
}
/** Renames one of a goal's plans. */
export async function renameTask(taskId, text) {
  const task_description = text.trim();
  if (!task_description || task_description.length > 500) throw new Error('A plan is 1 to 500 characters.');
  await q(supabase.from('sub_plans').update({ task_description }).eq('id', taskId));
}

// ---- Personal categories -------------------------------------------------

/** Each returns { categories } (the full list); create also returns the new id. */
export async function createCategory(name, color) {
  const row = await q(supabase.from('categories').insert({ name, color_code: color }).select('id').single());
  return { id: row.id, categories: await fetchCategories() };
}
export async function updateCategory(id, fields) {
  const set = {};
  if ('name' in fields) set.name = fields.name;
  if ('color' in fields) set.color_code = fields.color;
  await q(supabase.from('categories').update(set).eq('id', id));
  return { categories: await fetchCategories() };
}
export async function deleteCategory(id) {
  await rpc('delete_category', { p_id: id });
  return { categories: await fetchCategories() };
}

// ---- Journal (private) -----------------------------------------------------

const PROMPT_KEYS = ['went', 'ups', 'downs', 'how', 'lessons', 'wins', 'challenges', 'next'];
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * Saves a NOTE, a REVIEW of a period or a GOAL reflection, and returns the saved entry. A goal has one reflection and a
 * period one review: saving another updates that one.
 */
export async function saveJournal(entry) {
  const kind = String(entry.kind ?? 'NOTE').toUpperCase();
  const title = String(entry.title ?? '').trim();
  const body = String(entry.body ?? '').trim();
  if (title.length > 150) throw new Error('A title is 150 characters or fewer.');
  if (body.length > 20000) throw new Error('An entry is 20 000 characters or fewer.');
  const answers = {};
  for (const [k, v] of Object.entries(entry.answers ?? {})) {
    const text = String(v ?? '').trim();
    if (!PROMPT_KEYS.includes(k) || !text) continue;
    if (text.length > 5000) throw new Error('Each answer is 5000 characters or fewer.');
    answers[k] = text;
  }
  if (!body && !title && !Object.keys(answers).length) throw new Error('Write something first.');

  const row = {
    kind, entry_date: entry.date || todayKey(), title: title || null, body: body || null, answers: Object.keys(answers).length ? answers : null,
    mood: entry.mood || null, period: kind === 'REVIEW' ? entry.period : null, period_key: kind === 'REVIEW' ? entry.period_key : null, goal_id: kind === 'GOAL' ? entry.goal_id : null,
  };
  // Which entry to update: the one named, or the existing reflection for this goal / period
  let id = entry.id || null;
  if (!id && kind === 'GOAL') id = (await q(supabase.from('journal_entries').select('id').eq('kind', 'GOAL').eq('goal_id', row.goal_id).maybeSingle()))?.id;
  if (!id && kind === 'REVIEW') id = (await q(supabase.from('journal_entries').select('id').eq('kind', 'REVIEW').eq('period', row.period).eq('period_key', row.period_key).maybeSingle()))?.id;
  const write = id ? supabase.from('journal_entries').update(row).eq('id', id) : supabase.from('journal_entries').insert(row);
  return fromEntry(await q(write.select('*').single()));
}
export async function deleteJournal(id) {
  await q(supabase.from('journal_entries').delete().eq('id', id));
}

/** Deletes a goal for good, with its plans and badges. */
export async function deleteGoal(goalId) {
  await q(supabase.from('goals').delete().eq('id', goalId));
}
/** Removes one plan from a goal. Returns the goal's new status (it can become COMPLETED when the rest are done). */
export async function deleteTask(taskId) {
  const [task] = await q(supabase.from('sub_plans').delete().eq('id', taskId).select('goal_id'));
  if (!task) throw new Error('Plan not found.');
  const goal = await q(supabase.from('goals').select('status').eq('id', task.goal_id).single());
  return { goal_id: task.goal_id, goal_status: goal.status };
}

/** Hides a goal from accountability partners, or shares it again. */
export async function setGoalPrivate(goalId, isPrivate) {
  await q(supabase.from('goals').update({ is_private: !!isPrivate }).eq('id', goalId));
  return fetchGoal(goalId);
}

// ---- Accountability partners -------------------------------------------

/** { partners: [{ id, partner, unread, last, chat_streak }], incoming: [{ id, from }], outgoing: [{ id, email }], message? } */
export async function getPartners() {
  return rpc('partners_payload');
}

/** Deletes a partnership's chat photos and videos (the rows go with the partnership itself). */
async function deleteChatFiles(partnershipId) {
  const { data } = await supabase.storage.from('chat-media').list(String(partnershipId), { limit: 1000 });
  if (data?.length) await supabase.storage.from('chat-media').remove(data.map((f) => `${partnershipId}/${f.name}`));
}

/**
 * action: invite (with email), accept, decline or remove (with id), share (with id, categories, day_plans).
 * Returns the same shape as getPartners().
 */
export async function partnerAction(action, fields) {
  if (action === 'invite') {
    const r = await rpc('invite_partner', { p_email: fields.email });
    if (!r.invite_id) return r;   // they had already invited you, so you are partners now
    const { emailed } = await notify('invite', { id: r.invite_id }).catch(() => ({ emailed: false }));
    const email = fields.email.trim().toLowerCase();
    return { ...r, message: emailed ? `Invite emailed to ${email}. They accept it from the link, or in Partners when they sign in.`
      : `Invite saved, but the email could not be sent. Tell them to sign in to AuraGoal with ${email} to accept it.` };
  }
  if (action === 'accept') {
    const r = await rpc('accept_partner', { p_id: fields.id });
    notify('accepted', { id: fields.id }).catch(() => {});   // the inviter's email never holds this up
    return r;
  }
  if (action === 'share') return rpc('set_partner_shares', { p_id: fields.id, p_categories: fields.categories ?? [], p_day_plans: !!fields.day_plans });
  if (action === 'remove') await deleteChatFiles(fields.id).catch(() => {});
  if (action === 'remove' || action === 'decline') return rpc('drop_partner', { p_id: fields.id });
  throw new Error('Unknown action.');
}
/** What a partner shares: { partner, date, goals: [{ ..., plans }], today: [...], scoreboard: { me, them } }. */
export async function getPartnerView(partnershipId) {
  return rpc('partner_view', { p_id: partnershipId });
}

/** Gives each photo or video a link only the two partners could have asked for. */
async function withMediaLinks(result) {
  const paths = result.messages.filter((m) => m.media).map((m) => m.media.path);
  if (paths.length) {
    const { data } = await supabase.storage.from('chat-media').createSignedUrls(paths, 6 * 3600);
    const links = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
    for (const m of result.messages) if (m.media) m.media.url = links.get(m.media.path) ?? '';
  }
  return result;
}

/** The chat, oldest first: { messages: [{ id, sender_id, kind, body, goal_id, goal_title, at, media }], chat_streak }. */
export async function getMessages(partnershipId, after = 0) {
  return withMediaLinks(await rpc('get_messages', { p_id: partnershipId, p_after: after }));
}
/** action: text ({ body }), cheer ({ emoji, goal_id }) or nudge. Returns the new messages after `after`. */
export async function sendMessage(partnershipId, action, fields = {}, after = 0) {
  const r = await rpc('send_message', { p_id: partnershipId, p_action: action, p_fields: fields, p_after: after });
  notify('message', { id: r.message_id }).catch(() => {});   // the message is saved either way
  return withMediaLinks(r);
}

/** A partner chat photo or video's link. */
export const chatMediaUrl = (media) => media.url;

/**
 * Sends a photo or video (with an optional caption) to a partner. `onProgress(0..1)` reports the upload.
 * Resolves like sendMessage(); rejects with a user-facing Error.
 */
export async function sendMedia(partnershipId, file, caption = '', after = 0, onProgress = () => {}) {
  const video = file.type.startsWith('video/');
  // A photo is drawn again first, which drops hidden details such as where it was taken
  const media = video ? { blob: file, mime: file.type, w: null, h: null } : await prepareChatPhoto(file);
  const ext = { 'image/jpeg': 'jpg', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }[media.mime];
  const path = `${partnershipId}/${crypto.randomUUID()}.${ext}`;
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw Object.assign(new Error('Please sign in to continue.'), { auth: true });

  // A plain request rather than the storage client, because only this reports upload progress
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${import.meta.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/chat-media/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${data.session.access_token}`);
    xhr.setRequestHeader('apikey', import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    xhr.setRequestHeader('Content-Type', media.mime);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onerror = () => reject(Object.assign(new Error("Can't reach the server. Check your connection and try again."), { network: true }));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      if (xhr.status === 413) return reject(new Error('That file is too large. Photos can be up to 10 MB and videos up to 50 MB.'));
      return reject(new Error(`Upload failed (HTTP ${xhr.status}). Please try again.`));
    };
    xhr.send(media.blob);
  });

  try {
    return await sendMessage(partnershipId, 'media', { path, mime: media.mime, w: media.w, h: media.h, caption }, after);
  } catch (e) {
    await supabase.storage.from('chat-media').remove([path]);   // nothing points at it, so do not keep it
    throw e;
  }
}

// ---- Notifications -----------------------------------------------------

function deviceLabel(ua) {
  const has = (s) => ua.includes(s);
  const browser = has('Edg/') ? 'Edge' : has('OPR/') ? 'Opera' : has('Firefox/') ? 'Firefox' : has('Chrome/') ? 'Chrome' : has('Safari/') ? 'Safari' : 'Browser';
  const os = has('Windows') ? 'Windows' : has('Android') ? 'Android' : has('iPhone') || has('iPad') ? 'iPhone/iPad' : has('Mac OS') ? 'Mac' : has('Linux') ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

/** { vapid_public, devices: [{ id, label, added, key }], mail_configured, worker_running } */
export async function getNotifyConfig() {
  const [status, rows] = await Promise.all([notify('status'), q(supabase.from('push_subscriptions').select('id, endpoint, user_agent, created_at').order('id'))]);
  const devices = await Promise.all(rows.map(async (r) => ({ id: r.id, label: r.user_agent ? deviceLabel(r.user_agent) : 'Device', added: r.created_at, key: await endpointKey(r.endpoint) })));
  return { ...status, devices };
}
/** `subscription` is what the browser's pushManager.subscribe() returned, as JSON. */
export async function subscribePush(subscription) {
  await rpc('subscribe_push', { p_endpoint: subscription.endpoint, p_p256dh: subscription.keys?.p256dh, p_auth: subscription.keys?.auth, p_user_agent: navigator.userAgent });
}
export async function unsubscribePush(endpoint) {
  await q(supabase.from('push_subscriptions').delete().eq('endpoint', endpoint));
}
export async function testPush() {
  return notify('test');
}
/** Emails today's summary now. `delivered` is 'email', or 'none' when the server has no email set up yet. */
export async function sendDigestPreview() {
  return notify('digest-preview');
}

// ---- Badges ------------------------------------------------------------

/** Asks the server to record a badge. The server works out the tier from the database and never trusts the client. */
export async function awardBadge(goalId) {
  const r = await rpc('award_badge', { p_goal: goalId });
  if (!r.created) return { created: false };
  return { created: true, review: { id: r.review.id, tier: r.review.reward_rank, pct: r.review.completion_percentage } };
}
