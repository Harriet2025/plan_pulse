// Talks to the PHP backend in /backend. In development Vite proxies /api to the PHP server (see vite.config.js),
// so the browser sees one origin and the login cookie just works.
//
// Every function is async and throws an Error with a user-facing message. `error.auth` is true when the
// session has expired, and `error.network` when the server could not be reached.

const BASE = '/api';

/**
 * The address of an endpoint, without ".php": "auth.php?x=1" -> "/api/auth?x=1". Hosts such as Vercel block any
 * address ending in .php, so the extension is added back where PHP runs: by the Vite proxy in development
 * (vite.config.js) and by the forwarding rule in production (vercel.json).
 */
const endpoint = (path) => `${BASE}/${path.replace(/\.php(?=\?|$)/, '')}`;

// On someone's own computer the fix is to start the PHP server; on a website, its back end is not reachable
const onLaptop = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const UNREACHABLE = onLaptop
  ? "Can't reach the PHP server. Open a terminal in the project folder, run npm run api, then press Try again."
  : "Can't reach the AuraGoal server right now. Please try again in a little while.";

async function request(path, { method = 'GET', body } = {}) {
  // FormData (file uploads) sets its own multipart Content-Type; everything else is JSON
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res;
  try {
    res = await fetch(endpoint(path), {
      method,
      credentials: 'same-origin', // sends the login session cookie
      headers: { Accept: 'application/json', ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw Object.assign(new Error(onLaptop ? UNREACHABLE : "Can't reach the AuraGoal server. Check your internet connection and try again."), { network: true });
  }

  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  // Our PHP always answers JSON with `success`. No JSON, or someone else's JSON (a host's own { error: { code } },
  // a firewall's "Forbidden"), means the AuraGoal server itself was not reached.
  if (!data || typeof data !== 'object' || typeof data.error === 'object' || (!('success' in data) && !res.ok)) {
    throw Object.assign(new Error(UNREACHABLE), { network: true, status: res.status });
  }
  if (!res.ok || data.success === false) {
    throw Object.assign(new Error(data.error || `Request failed (HTTP ${res.status}).`), { status: res.status, auth: !!data.auth_required });
  }
  return data;
}

// MySQL returns "2026-10-26 14:00:00"; the browser wants the "T" form
const iso = (s) => (s ? s.replace(' ', 'T') : s);

// A goal's plan: one step in its checklist
const fromTask = (t) => ({ id: t.id, text: t.task_description, done: !!t.is_completed });

// A day plan: { id, title, date, start: 'HH:MM' | null, minutes, repeat: NONE|DAILY|WEEKLY|MONTHLY, days: [1..7], until,
// marks: { 'YYYY-MM-DD': 'DONE' | 'SKIPPED' } }
const fromDayPlan = (p) => ({ ...p, marks: { ...(p.marks ?? {}) } });

const fromGoal = (g) => ({
  id: g.id, title: g.title, category_id: g.category_id, priority: g.priority, timeframe: g.timeframe,
  due_date: g.due_date, quote: g.quote, is_private: !!g.is_private, status: g.status, best_tier_rank: g.best_tier_rank,
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

/**
 * The photo's URL. The version changes with every upload, so a new photo is never served from the browser cache.
 * `partner` asks for an accountability partner's photo (the server only serves it between partners).
 */
export const avatarUrl = (user, partner = false) =>
  user?.avatar_v ? endpoint(`avatar.php?${partner ? `user=${user.id}&` : ''}v=${user.avatar_v}`) : null;

// ---- Reads -------------------------------------------------------------

/** The signed-in user's profile, every goal (newest first), every day plan and every badge earned. */
export async function snapshot() {
  const r = await request('snapshot.php');
  return {
    user: r.user,
    goals: r.goals.map(fromGoal),
    dayPlans: (r.day_plans ?? []).map(fromDayPlan),
    reviews: r.reviews.map((v) => ({ ...v, reviewed_at: iso(v.reviewed_at) })),
  };
}

// ---- Goals -------------------------------------------------------------

export async function createGoal(input) {
  const r = await request('goals.php', {
    method: 'POST',
    body: {
      title: input.title, category_id: input.category_id, priority: input.priority, timeframe: input.timeframe, is_private: !!input.is_private,
      due_date: input.due_date || null, quote: input.quote || null,
      sub_plans: (input.tasks ?? []).map((t) => t.trim()).filter(Boolean),   // the goal's plans, in order
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
 *   { kind: 'plan', id, op: 'move', to: 'YYYY-MM-DD' }                (a one-off day plan)
 *   { kind: 'plan', id, op: 'skip' | 'unskip' }                       (let a missed day plan go, or bring it back)
 *   { kind: 'goal', id, op: 'move', to: 'YYYY-MM-DD' | null }         (a goal's due date)
 *   { kind: 'goal', id, op: 'archive' | 'restore' }
 */
export async function reschedule(actions) {
  await request('reschedule.php', { method: 'POST', body: { actions } });
}

export async function addTask(goalId, text) {
  await request('sub_plans.php', { method: 'POST', body: { goal_id: goalId, task_description: text } });
}

// ---- Day plans ---------------------------------------------------------

const dayPlanCall = (body) => request('day_plans.php', { method: 'POST', body });

/** { title, date, start?, minutes?, repeat?, days?, until? }. Returns the new plan. */
export async function createDayPlan(fields) {
  return fromDayPlan((await dayPlanCall({ action: 'create', ...fields })).plan);
}
/** Any of the create fields. Returns the updated plan. */
export async function updateDayPlan(id, fields) {
  return fromDayPlan((await dayPlanCall({ action: 'update', id, ...fields })).plan);
}
/** Marks one day of a plan DONE or SKIPPED, or null to undo it. `streak` is set when a plan was finished. */
export async function markDayPlan(id, date, state) {
  const r = await dayPlanCall({ action: 'mark', id, date, state });
  return { plan: fromDayPlan(r.plan), streak: r.streak };
}
/** Deletes the plan and every day of it. */
export async function deleteDayPlan(id) {
  await dayPlanCall({ action: 'delete', id });
}

/** Hides a goal from accountability partners, or shares it again. */
export async function setGoalPrivate(goalId, isPrivate) {
  return fromGoal((await request('goals.php', { method: 'PATCH', body: { id: goalId, is_private: isPrivate } })).goal);
}

// ---- Accountability partners -------------------------------------------

/** { partners: [{ id, partner, unread, last, chat_streak }], incoming: [{ id, from }], outgoing: [{ id, email }], message? } */
export async function getPartners() {
  return request('partners.php');
}
/** action: invite (with email), accept, decline or remove (with id). Returns the same shape as getPartners(). */
export async function partnerAction(action, fields) {
  return request('partners.php', { method: 'POST', body: { action, ...fields } });
}
/** What a partner shares: { partner, date, goals: [{ ..., plans }], today: [...], scoreboard: { me, them } }. */
export async function getPartnerView(partnershipId) {
  return request(`partner.php?id=${encodeURIComponent(partnershipId)}`);
}
/** The chat, oldest first: { messages: [{ id, sender_id, kind, body, goal_id, goal_title, at }], chat_streak }. */
export async function getMessages(partnershipId, after = 0) {
  return request(`messages.php?p=${encodeURIComponent(partnershipId)}&after=${after}`);
}
/** action: text ({ body }), cheer ({ emoji, goal_id }) or nudge. Returns the new messages after `after`. */
export async function sendMessage(partnershipId, action, fields = {}, after = 0) {
  return request('messages.php', { method: 'POST', body: { p: partnershipId, action, after, ...fields } });
}

/** A partner chat photo or video's URL (the server only serves it to the two partners). */
export const chatMediaUrl = (media) => endpoint(media.url);

/**
 * Sends a photo or video (with an optional caption) to a partner. `onProgress(0..1)` reports the upload.
 * Resolves like sendMessage(); rejects with a user-facing Error.
 */
export function sendMedia(partnershipId, file, caption = '', after = 0, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('p', partnershipId); form.append('action', 'media'); form.append('caption', caption); form.append('after', after);
    form.append('file', file, file.name || 'upload');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint('messages.php'));
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onerror = () => reject(Object.assign(new Error("Can't reach the server. Check your connection and try again."), { network: true }));
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status === 413 && !data) return reject(new Error('That file is too large for the server. Restart it with npm run api, or send a smaller file.'));
      if (!data || xhr.status >= 400 || data.success === false) return reject(Object.assign(new Error(data?.error || `Upload failed (HTTP ${xhr.status}).`), { auth: !!data?.auth_required }));
      resolve(data);
    };
    xhr.send(form);
  });
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
