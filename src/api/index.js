// Talks to the PHP backend in /backend. In development Vite proxies /api to the PHP server (see vite.config.js),
// so the browser sees one origin and the login cookie just works.
//
// Every function is async and throws an Error with a user-facing message. `error.auth` is true when the
// session has expired, and `error.network` when the server could not be reached.

const BASE = '/api';

async function request(path, { method = 'GET', body } = {}) {
  // FormData (file uploads) sets its own multipart Content-Type; everything else is JSON
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method,
      credentials: 'same-origin', // sends the login session cookie
      headers: { Accept: 'application/json', ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw Object.assign(new Error("Can't reach the server. Start the PHP server with npm run api, then try again."), { network: true });
  }

  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!data) {
    // No JSON back almost always means the dev proxy could not reach PHP (it answers 500 or 502 itself)
    const msg = res.status >= 500
      ? "Can't reach the PHP server. Open a terminal in the project folder, run npm run api, then press Try again."
      : `The server sent an unexpected response (HTTP ${res.status}).`;
    throw Object.assign(new Error(msg), { network: true, status: res.status });
  }
  if (!res.ok || data.success === false) {
    throw Object.assign(new Error(data.error || `Request failed (HTTP ${res.status}).`), { status: res.status, auth: !!data.auth_required });
  }
  return data;
}

// MySQL returns "2026-10-26 14:00:00"; the browser wants the "T" form
const iso = (s) => (s ? s.replace(' ', 'T') : s);

const fromTask = (t) => ({
  id: t.id, text: t.task_description, done: !!t.is_completed,
  remind: t.remind_at ? iso(t.remind_at).slice(0, 16) : null, // datetime-local format
  estimate: t.estimate_min ?? null,                           // minutes, or null when there is no estimate
});

const fromGoal = (g) => ({
  id: g.id, title: g.title, category_id: g.category_id, priority: g.priority, timeframe: g.timeframe,
  due_date: g.due_date, quote: g.quote, status: g.status, best_tier_rank: g.best_tier_rank,
  completed_at: iso(g.completed_at), created_at: iso(g.created_at), updated_at: iso(g.updated_at),
  sub_plans: g.sub_plans.map(fromTask),
});

// ---- Auth --------------------------------------------------------------

export async function getCurrentUser() {
  const r = await request('auth.php');
  return r.authenticated ? r.user : null;
}
export async function signup({ display_name, email, password }) {
  return (await request('auth.php', { method: 'POST', body: { action: 'signup', display_name, email, password } })).user;
}
export async function login({ email, password }) {
  return (await request('auth.php', { method: 'POST', body: { action: 'login', email, password } })).user;
}
export async function logout() {
  await request('auth.php', { method: 'POST', body: { action: 'logout' } });
}

/** Asks for a reset link by email. The answer is always the same, whether or not the address has an account. */
export async function requestPasswordReset(email) {
  return (await request('auth.php', { method: 'POST', body: { action: 'forgot', email } })).message;
}
/** Sets a new password using the token from the emailed link. */
export async function resetPassword(token, password) {
  return (await request('auth.php', { method: 'POST', body: { action: 'reset', token, password } })).message;
}

// ---- Profile -----------------------------------------------------------

/** Any of { display_name, email, new_password }. Changing the email or password also needs current_password. Returns the user. */
export async function updateProfile(fields) {
  return (await request('profile.php', { method: 'PATCH', body: fields })).user;
}

/** `blob` is the cropped image from prepareAvatar(). Returns the updated user. */
export async function uploadAvatar(blob) {
  const form = new FormData();
  form.append('avatar', blob, 'avatar.jpg');
  return (await request('avatar.php', { method: 'POST', body: form })).user;
}

export async function deleteAvatar() {
  return (await request('avatar.php', { method: 'DELETE' })).user;
}

/** The photo's URL. The version changes with every upload, so a new photo is never served from the browser cache. */
export const avatarUrl = (user) => (user?.avatar_v ? `${BASE}/avatar.php?v=${user.avatar_v}` : null);

// ---- Reads -------------------------------------------------------------

/** The signed-in user's profile, every goal (newest first) and every badge earned. */
export async function snapshot() {
  const r = await request('snapshot.php');
  return {
    user: r.user,
    goals: r.goals.map(fromGoal),
    reviews: r.reviews.map((v) => ({ ...v, reviewed_at: iso(v.reviewed_at) })),
  };
}

// ---- Goals -------------------------------------------------------------

export async function createGoal(input) {
  const r = await request('goals.php', {
    method: 'POST',
    body: {
      title: input.title, category_id: input.category_id, priority: input.priority, timeframe: input.timeframe,
      due_date: input.due_date || null, quote: input.quote || null,
      // each task is a string, or { text, estimate } when it has a time estimate
      sub_plans: (input.tasks ?? [])
        .map((t) => (typeof t === 'string' ? { text: t.trim(), estimate: null } : { text: t.text.trim(), estimate: t.estimate ?? null }))
        .filter((t) => t.text)
        .map((t) => ({ task_description: t.text, ...(t.estimate ? { estimate_min: t.estimate } : {}) })),
    },
  });
  return fromGoal(r.goal);
}

/** Archives a goal, or restores an archived one (back to COMPLETED if every task was done). */
export async function setGoalStatus(goalId, status) {
  const r = await request('goals.php', { method: 'PATCH', body: { id: goalId, status } });
  return fromGoal(r.goal);
}

// ---- Tasks -------------------------------------------------------------

export async function setTaskDone(_goalId, taskId, done) {
  const r = await request('sub_plans.php', { method: 'PATCH', body: { id: taskId, is_completed: done ? 1 : 0 } });
  // `streak` is only set when a task was finished: { count, best, freezes, events: [freeze_used | freeze_earned | reset] }
  return { goal_status: r.goal_status, streak_count: r.streak_count, streak: r.streak, progress: r.progress };
}

/**
 * Applies several changes at once, all or nothing. Each action is one of
 *   { kind: 'task', id, op: 'move', to: 'YYYY-MM-DDTHH:mm' | null }   (a task's reminder)
 *   { kind: 'goal', id, op: 'move', to: 'YYYY-MM-DD' | null }         (a goal's due date)
 *   { kind: 'goal', id, op: 'archive' | 'restore' }
 */
export async function reschedule(actions) {
  await request('reschedule.php', { method: 'POST', body: { actions } });
}

export async function addTask(goalId, text, estimate = null) {
  await request('sub_plans.php', { method: 'POST', body: { goal_id: goalId, task_description: text, ...(estimate ? { estimate_min: estimate } : {}) } });
}

/** Minutes (5 to 720), or null to remove the estimate. */
export async function setEstimate(taskId, minutes) {
  await request('sub_plans.php', { method: 'PATCH', body: { id: taskId, estimate_min: minutes } });
}

/** `value` is a datetime-local string (YYYY-MM-DDTHH:mm), or null to clear the reminder. */
export async function setReminder(_goalId, taskId, value) {
  await request('sub_plans.php', { method: 'PATCH', body: { id: taskId, remind_at: value || null } });
}

// ---- Notifications -----------------------------------------------------

/** { vapid_public, devices: [{ id, label, added, key }], mail_configured, worker_running } */
export async function getNotifyConfig() {
  return request('push.php');
}
/** `subscription` is what the browser's pushManager.subscribe() returned, as JSON. */
export async function subscribePush(subscription) {
  await request('push.php', { method: 'POST', body: { action: 'subscribe', subscription } });
}
export async function unsubscribePush(endpoint) {
  await request('push.php', { method: 'POST', body: { action: 'unsubscribe', endpoint } });
}
export async function testPush() {
  return request('push.php', { method: 'POST', body: { action: 'test' } });
}
/** Emails today's summary now. `delivered` is 'email', or 'log' when the server has no email set up yet. */
export async function sendDigestPreview() {
  return request('digest.php', { method: 'POST' });
}

// ---- Badges ------------------------------------------------------------

/** Asks the server to record a badge. The server works out the tier from the database and never trusts the client. */
export async function awardBadge(goalId) {
  const r = await request('reviews.php', { method: 'POST', body: { goal_id: goalId } });
  if (!r.created) return { created: false };
  return { created: true, review: { id: r.review.id, tier: r.review.reward_rank, pct: r.review.completion_percentage } };
}
