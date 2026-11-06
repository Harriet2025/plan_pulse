// AuraGoal's one server-side job: everything that needs a secret the browser must never hold.
//   * partner invite emails, "they accepted" emails, and pushes for chat messages
//   * the Settings page: notification status, test push, morning email preview
//   * every minute (called by pg_cron): reminder pushes and morning emails
//
// The function does its own authentication: people send their Supabase session, the cron job sends the worker secret
// from public.server_settings. Secrets: SMTP_USER and SMTP_PASS (a Gmail app password), optional SMTP_HOST and SMTP_FROM.
// Edge Functions cannot use port 587, so mail goes out over TLS on port 465.
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-worker-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const REMINDER_WINDOW_MINUTES = 5;   // a plan that started this recently still gets its reminder
const DIGEST_GRACE_HOURS = 3;        // a morning email later than this is not worth sending

class Refused extends Error { constructor(message: string, public status = 400) { super(message); } }
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function setting(key: string): Promise<any> {
  const { data } = await db.from('server_settings').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}
const appUrl = async () => String((await setting('app_url')) ?? '').replace(/\/$/, '');

/** Records that something was sent. False when it already had been, so nothing goes out twice. */
async function claim(user_id: string, kind: string, ref_id: number, stamp: string): Promise<boolean> {
  const { data, error } = await db.from('notification_log')
    .upsert({ user_id, kind, ref_id, stamp }, { onConflict: 'user_id,kind,ref_id,stamp', ignoreDuplicates: true }).select('id');
  if (error) throw error;
  return (data ?? []).length === 1;
}

// ---------------------------------------------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------------------------------------------
const mailConfigured = () => !!(Deno.env.get('SMTP_USER') && Deno.env.get('SMTP_PASS'));
const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
};
const wrap76 = (s: string) => s.replace(/(.{76})/g, '$1\r\n');
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

/** Sends one message. Throws when the mail server refuses it. */
async function smtpSend(to: string, subject: string, text: string, html: string): Promise<void> {
  const user = Deno.env.get('SMTP_USER')!, pass = Deno.env.get('SMTP_PASS')!;
  const from = oneLine(Deno.env.get('SMTP_FROM') ?? user);
  const host = Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com';
  if (!/^[^@\s<>]+@[^@\s<>]+$/.test(to)) throw new Error('Bad recipient');
  const conn = await Deno.connectTls({ hostname: host, port: 465 });
  const dec = new TextDecoder(), enc = new TextEncoder();
  let buf = '';
  const read = async (ok: number[]) => {
    for (;;) {
      const lines = buf.split('\r\n');
      const last = lines.findIndex((l) => /^\d{3} /.test(l));
      if (last >= 0) {
        buf = lines.slice(last + 1).join('\r\n');
        const code = Number(lines[last].slice(0, 3));
        if (!ok.includes(code)) throw new Error(`SMTP said: ${lines[last]}`);
        return;
      }
      const chunk = new Uint8Array(4096);
      const n = await conn.read(chunk);
      if (n === null) throw new Error('SMTP connection closed');
      buf += dec.decode(chunk.subarray(0, n));
    }
  };
  const cmd = async (line: string, ok: number[]) => { await conn.write(enc.encode(line + '\r\n')); await read(ok); };
  try {
    await read([220]);
    await cmd('EHLO auragoal', [250]);
    await cmd('AUTH LOGIN', [334]);
    await cmd(btoa(user), [334]);
    await cmd(btoa(pass), [235]);
    await cmd(`MAIL FROM:<${from}>`, [250]);
    await cmd(`RCPT TO:<${to}>`, [250, 251]);
    await cmd('DATA', [354]);
    const boundary = `auragoal-${crypto.randomUUID()}`;
    const message = [
      `From: =?UTF-8?B?${b64('AuraGoal')}?= <${from}>`, `To: <${to}>`, `Subject: =?UTF-8?B?${b64(oneLine(subject))}?=`,
      `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomUUID()}@auragoal>`, 'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
      `--${boundary}`, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64(text)),
      `--${boundary}`, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64(html)),
      `--${boundary}--`, '.',
    ].join('\r\n');
    await cmd(message, [250]);
    await conn.write(enc.encode('QUIT\r\n')).catch(() => 0);
  } finally {
    try { conn.close(); } catch { /* already closed */ }
  }
}

/** True when the email went out. A failure is logged and never undoes what was just saved. */
async function sendMail(to: string, subject: string, text: string, html: string): Promise<boolean> {
  if (!mailConfigured()) return false;
  try {
    await smtpSend(to, subject, text, html);
    return true;
  } catch (e) {
    console.error('[AuraGoal] Could not send mail:', e instanceof Error ? e.message : e);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** A short email with one button: [text, html]. */
function buttonEmail(name: string, lines: string[], button: string, link: string, footer: string): [string, string] {
  const text = `Hi ${name},\n\n${lines.join('\n\n')}\n\n${button}: ${link}\n\n${footer}\n\nAuraGoal`;
  const html = '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#352D29">'
    + `<h2 style="color:#B85C38;margin:0 0 16px">AuraGoal</h2><p>Hi ${esc(name)},</p>`
    + lines.map((l) => `<p>${esc(l)}</p>`).join('')
    + `<p><a href="${esc(link)}" style="display:inline-block;background:#B85C38;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">${esc(button)}</a></p>`
    + `<p style="font-size:13px;color:#76685F">${esc(footer)}</p></div>`;
  return [text, html];
}

// ---------------------------------------------------------------------------------------------------------------
// Web Push (RFC 8291 encryption, RFC 8292 VAPID)
// ---------------------------------------------------------------------------------------------------------------
const b64uEnc = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uDec = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const utf8 = (s: string) => new TextEncoder().encode(s);

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

async function encryptPush(payload: string, uaPublic: Uint8Array, authSecret: Uint8Array): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, pair.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(utf8('WebPush: info\0'), uaPublic, senderPublic), 32);
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(utf8(payload), new Uint8Array([2]))));   // 2 marks the last record
  return concat(salt, new Uint8Array([0, 0, 16, 0, 65]), senderPublic, cipher);   // record size 4096, key length 65
}

/** The app's push identity, made on first use and kept in server_settings. */
async function vapidKeys(): Promise<{ jwk: JsonWebKey; public: string }> {
  const have = await setting('vapid');
  if (have) return have;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const value = { jwk: await crypto.subtle.exportKey('jwk', pair.privateKey), public: b64uEnc(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))) };
  await db.from('server_settings').upsert({ key: 'vapid', value }, { onConflict: 'key', ignoreDuplicates: true });   // two first calls at once: the first one wins
  return await setting('vapid');
}

/** Only real push services: the address comes from a browser, so it must not be able to point anywhere else. */
function endpointAllowed(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:' || u.username || (u.port && u.port !== '443')) return false;
    const h = u.hostname.toLowerCase();
    return h === 'fcm.googleapis.com' || h === 'android.googleapis.com' || ['.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com'].some((s) => h.endsWith(s));
  } catch { return false; }
}

async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: string): Promise<{ ok: boolean; gone: boolean; error?: string }> {
  if (!endpointAllowed(sub.endpoint)) return { ok: false, gone: true, error: 'Not a known push service' };
  try {
    const vapid = await vapidKeys();
    const key = await crypto.subtle.importKey('jwk', vapid.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const part = (o: unknown) => b64uEnc(utf8(JSON.stringify(o)));
    const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: new URL(sub.endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: `mailto:${Deno.env.get('SMTP_USER') ?? 'admin@example.com'}` })}`;
    const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(unsigned)));
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm', TTL: '3600', Urgency: 'normal', Authorization: `vapid t=${unsigned}.${b64uEnc(signature)}, k=${vapid.public}` },
      body: await encryptPush(payload, b64uDec(sub.p256dh), b64uDec(sub.auth)),
    });
    await res.body?.cancel();
    return { ok: res.ok, gone: res.status === 404 || res.status === 410, error: res.ok ? undefined : `Push service answered HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, gone: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Sends one notification to every device of a user. Devices that say the subscription is gone are forgotten. */
async function pushToUser(userId: string, payload: Record<string, unknown>): Promise<{ sent: number; failed: number; errors: string[] }> {
  const out = { sent: 0, failed: 0, errors: [] as string[] };
  const { data } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
  for (const sub of data ?? []) {
    const r = await sendPush(sub, JSON.stringify(payload));
    if (r.ok) { out.sent++; continue; }
    out.failed++;
    out.errors.push(r.error ?? 'unknown error');
    if (r.gone) await db.from('push_subscriptions').delete().eq('id', sub.id);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Days and plans, on each person's own clock
// ---------------------------------------------------------------------------------------------------------------
function localParts(now: Date, tz: string): { day: string; minutes: number } {
  let f: Intl.DateTimeFormat;
  const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  try { f = new Intl.DateTimeFormat('en-CA', { ...opts, timeZone: tz || 'UTC' }); } catch { f = new Intl.DateTimeFormat('en-CA', { ...opts, timeZone: 'UTC' }); }
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
const dayNum = (s: string) => Date.parse(`${s}T00:00:00Z`) / 86400000;
const dayStr = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);

/** Mirrors occursOn() in src/lib/utils.js and private.day_plan_occurs() in the database. */
function occursOn(p: any, day: string): boolean {
  if (day < p.plan_date || (p.repeat_until && day > p.repeat_until)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  switch (p.repeat_rule) {
    case 'NONE': return day === p.plan_date;
    case 'DAILY': return true;
    case 'WEEKLY': return ((p.repeat_days >> ((d.getUTCDay() + 6) % 7)) & 1) === 1;
    case 'MONTHLY': return d.getUTCDate() === Math.min(Number(p.plan_date.slice(8, 10)), new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate());
    default: return false;
  }
}

/** A user's day plans on a day that are not done or skipped yet, timed ones first. */
async function planForDay(userId: string, day: string) {
  const { data } = await db.from('day_plans').select('id, title, plan_date, start_time, duration_min, repeat_rule, repeat_days, repeat_until, day_plan_marks(on_date)')
    .eq('user_id', userId).lte('plan_date', day).eq('day_plan_marks.on_date', day)
    .order('start_time', { nullsFirst: false }).order('id');
  const tasks: { id: number; title: string; start: string | null; minutes: number | null }[] = [];
  let planned = 0, unestimated = 0;
  for (const p of data ?? []) {
    if ((p.day_plan_marks ?? []).length || !occursOn(p, day)) continue;
    if (p.duration_min === null) unestimated++; else planned += p.duration_min;
    tasks.push({ id: p.id, title: p.title, start: p.start_time ? p.start_time.slice(0, 5) : null, minutes: p.duration_min });
  }
  return { tasks, planned, unestimated };
}

const fmtMinutes = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`);
function planSpan(start: string | null, minutes: number | null): string {
  if (start === null) return '';
  if (minutes === null) return start;
  const end = (Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + minutes) % 1440;
  return `${start}–${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------------------------------------------
// The morning email
// ---------------------------------------------------------------------------------------------------------------
async function buildDigest(userId: string) {
  const { data: u } = await db.rpc('user_payload_for', { p_id: userId });
  if (!u?.email) return null;
  const url = await appUrl();
  const { day } = localParts(new Date(), u.timezone);
  const plan = await planForDay(userId, day);
  const capacity = u.rest_today ? 0 : u.daily_capacity_min;
  const ratio = capacity > 0 ? plan.planned / capacity : 0;
  const state = capacity <= 0 ? (plan.planned > 0 ? 'rest' : 'ok') : ratio > 1 ? 'over' : ratio > 0.75 ? 'tight' : 'ok';
  const { data: due } = await db.from('goals').select('title').eq('user_id', userId).eq('status', 'ACTIVE').eq('due_date', day).order('id');
  const goalsDue = (due ?? []).map((g) => g.title as string);
  const { count: lateGoals } = await db.from('goals').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'ACTIVE').lt('due_date', day);
  const { data: oneOffs } = await db.from('day_plans').select('plan_date, day_plan_marks(on_date)').eq('user_id', userId).eq('repeat_rule', 'NONE').lt('plan_date', day);
  const slipped = (lateGoals ?? 0) + (oneOffs ?? []).filter((p: any) => !(p.day_plan_marks ?? []).some((m: any) => m.on_date === p.plan_date)).length;
  const n = plan.tasks.length;
  const empty = n === 0 && !goalsDue.length && slipped === 0;

  const load = plan.planned === 0 ? null
    : state === 'over' ? `That is about ${fmtMinutes(plan.planned - capacity)} more than your ${fmtMinutes(capacity)} day. Consider moving something to a lighter day.`
    : state === 'tight' ? 'That is a full day. Leave a little slack for the unexpected.'
    : state === 'rest' ? 'Today is a rest day. Move these if you would rather rest.'
    : `That fits comfortably in your ${fmtMinutes(capacity)} day.`;
  const streakLine = u.rest_today ? `Today is a rest day, so your streak is safe.${u.streak_count > 0 ? ` (${u.streak_count} days)` : ''}`
    : u.streak_active_today ? `You have already kept your ${u.streak_count}-day streak today.`
    : u.streak_protected ? `A streak freeze is covering you. Finish one plan today to keep your ${u.streak_count}-day streak.`
    : u.streak_count > 0 ? `Finish one plan today to keep your ${u.streak_count}-day streak.`
    : u.best_streak > 0 ? `Start a new streak today. Your best is ${u.best_streak} days.`
    : 'Finish a plan today to start a streak.';
  const first = String(u.display_name).trim().split(/\s+/)[0];
  const subject = n > 0 ? `Today: ${n} ${n === 1 ? 'plan' : 'plans'}${plan.planned ? `, about ${fmtMinutes(plan.planned)}` : ''}`
    : goalsDue.length ? `Today: ${goalsDue.length} ${goalsDue.length === 1 ? 'goal ends' : 'goals end'}`
    : 'Your AuraGoal morning';
  const slipWords = slipped === 1 ? 'thing slipped' : 'things slipped', them = slipped === 1 ? 'it' : 'them';
  const extra = plan.unestimated ? ` (+${plan.unestimated} without an estimate)` : '';

  let text = `Good morning, ${first}.\n\n`;
  if (n) {
    text += `TODAY\n${plan.tasks.map((t) => `  - ${t.start !== null ? `${planSpan(t.start, t.minutes)}  ` : ''}${t.title}${t.start === null && t.minutes !== null ? ` (${fmtMinutes(t.minutes)})` : ''}`).join('\n')}\n`;
    if (load) text += `\nAbout ${fmtMinutes(plan.planned)} planned${extra}. ${load}\n`;
    text += '\n';
  }
  if (goalsDue.length) text += `GOALS ENDING TODAY\n${goalsDue.map((g) => `  - ${g}`).join('\n')}\n\n`;
  if (slipped) text += `${slipped} ${slipWords} past its date. Sort ${them} out on the Catch up page: ${url}\n\n`;
  if (empty) text += 'Nothing is planned for today yet. Add a few plans for your day in the Planner.\n\n';
  text += `${streakLine}\n\nOpen AuraGoal: ${url}\n\nYou can turn this email off in Settings, under Notifications.`;

  const rows = plan.tasks.map((t) => `<tr><td style="padding:6px 10px 6px 0;color:#76685F;white-space:nowrap;vertical-align:top">${t.start !== null ? esc(planSpan(t.start, t.minutes)) : 'Any time'}</td>`
    + `<td style="padding:6px 0"><b>${esc(t.title)}</b>${t.start === null && t.minutes !== null ? ` <span style="color:#76685F">${esc(fmtMinutes(t.minutes))}</span>` : ''}</td></tr>`).join('');
  const section = (title: string, body: string) => `<h3 style="margin:22px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#76685F">${title}</h3>${body}`;
  const html = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#352D29;line-height:1.5">'
    + `<h2 style="color:#B85C38;margin:0 0 4px">AuraGoal</h2><p style="margin:0 0 4px">Good morning, ${esc(first)}.</p>`
    + (n ? section('Today', `<table style="border-collapse:collapse;font-size:15px">${rows}</table>`)
      + (load ? `<p style="margin:10px 0 0;padding:10px 12px;border-radius:10px;background:#F4EDE2">About <b>${esc(fmtMinutes(plan.planned))}</b> planned${extra}. ${esc(load)}</p>` : '') : '')
    + (goalsDue.length ? section('Goals ending today', `<ul style="margin:0;padding-left:18px">${goalsDue.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>`) : '')
    + (slipped ? `<p style="margin:18px 0 0;padding:10px 12px;border-radius:10px;background:#F7E8E3">${slipped} ${slipWords} past its date. That happens. <a style="color:#9A4929" href="${esc(url)}">Sort ${them} out</a>.</p>` : '')
    + (empty ? '<p>Nothing is planned for today yet. Add a few plans for your day in the Planner.</p>' : '')
    + `<p style="margin:18px 0 0">${esc(streakLine)}</p>`
    + `<p style="margin:20px 0"><a href="${esc(url)}" style="display:inline-block;background:#B85C38;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:bold">Open AuraGoal</a></p>`
    + '<p style="font-size:12px;color:#76685F">You can turn this email off in Settings, under Notifications.</p></div>';
  return { subject, text, html, empty, to: u.email as string };
}

// ---------------------------------------------------------------------------------------------------------------
// Every minute: reminders and morning emails
// ---------------------------------------------------------------------------------------------------------------
async function tick() {
  const stats = { reminders: 0, digests: 0, failed: 0 };
  const now = new Date();
  const url = await appUrl();

  // 1. Day plans whose start time came in the last few minutes, for users with a subscribed device.
  //    A repeating plan reminds on every day it happens; the log keys each one by plan and day.
  const { data: subs } = await db.from('push_subscriptions').select('user_id');
  const ids = [...new Set((subs ?? []).map((s) => s.user_id as string))];
  const { data: zones } = ids.length ? await db.from('profiles').select('id, timezone').in('id', ids) : { data: [] };
  for (const u of zones ?? []) {
    const { day, minutes } = localParts(now, u.timezone);
    const windows = [{ day, from: minutes - REMINDER_WINDOW_MINUTES, to: minutes }];
    if (minutes < REMINDER_WINDOW_MINUTES) windows.push({ day: dayStr(dayNum(day) - 1), from: 1440 + minutes - REMINDER_WINDOW_MINUTES, to: 1440 });   // the window can start before midnight
    for (const w of windows) {
      for (const t of (await planForDay(u.id, w.day)).tasks) {
        if (t.start === null) continue;
        const at = Number(t.start.slice(0, 2)) * 60 + Number(t.start.slice(3, 5));
        if (at > w.to || at <= w.from) continue;
        if (!(await claim(u.id, 'plan', t.id, `${w.day} ${t.start}:00`))) continue;   // already sent
        const r = await pushToUser(u.id, {
          kind: 'plan', title: t.title.length > 90 ? `${t.title.slice(0, 89)}…` : t.title,
          body: `${t.minutes !== null ? planSpan(t.start, t.minutes) : 'Now'} · AuraGoal`, tag: `plan-${t.id}`, url: `${url}/`,
        });
        stats.reminders += r.sent; stats.failed += r.failed;
      }
    }
  }

  // 2. Morning emails whose time has come (and is not hours old): 07:30 means 07:30 where the user is
  const { data: morning } = await db.from('profiles').select('id, digest_time, timezone').eq('digest_enabled', true);
  for (const u of morning ?? []) {
    const { day, minutes } = localParts(now, u.timezone);
    const slot = Number(u.digest_time.slice(0, 2)) * 60 + Number(u.digest_time.slice(3, 5));
    if (minutes < slot || minutes >= slot + DIGEST_GRACE_HOURS * 60) continue;
    if (!(await claim(u.id, 'digest', 0, day))) continue;   // today's is already done
    const d = await buildDigest(u.id);
    if (!d || d.empty) continue;
    if (await sendMail(d.to, d.subject, d.text, d.html)) stats.digests++; else stats.failed++;
  }

  // 3. Forget old log rows once an hour, and say the worker is alive
  if (now.getUTCMinutes() === 0) await db.from('notification_log').delete().lt('created_at', new Date(Date.now() - 7 * 86400000).toISOString());
  await db.from('server_settings').upsert({ key: 'worker_beat', value: Date.now() }, { onConflict: 'key' });
  return stats;
}

// ---------------------------------------------------------------------------------------------------------------
// What the app asks for. Every request is checked against the signed-in user.
// ---------------------------------------------------------------------------------------------------------------
const nameOf = async (id: string) => (await db.from('profiles').select('display_name').eq('id', id).single()).data?.display_name as string;
const emailOf = async (id: string) => (await db.auth.admin.getUserById(id)).data.user?.email as string;

/** Forgets a claim, so an email that could not be sent can be tried again. */
const unclaim = (user_id: string, kind: string, ref_id: number, stamp: string) =>
  db.from('notification_log').delete().match({ user_id, kind, ref_id, stamp });

/**
 * The partner invite email (and a push, once, if they already use AuraGoal). The email goes once when the invite is
 * made; `again` is the "Email it again" button, at most once an hour. A failed email can always be tried again.
 */
async function sendInvite(uid: string, id: number, again: boolean) {
  const { data: p } = await db.from('partnerships').select('*').eq('id', id).eq('inviter_id', uid).eq('status', 'PENDING').maybeSingle();
  if (!p) throw new Refused('Invite not found.', 404);
  const url = await appUrl();
  const from = await nameOf(uid), to = p.invitee_email as string;
  const { data: theirId } = await db.rpc('user_id_by_email', { p_email: to });
  if (theirId && (await claim(uid, 'invite-push', id, 'sent'))) {
    await pushToUser(theirId, { kind: 'chat', title: `${from} wants to be your accountability partner`, body: 'Open Partners to accept.', tag: 'invite', url: `${url}/#partners` });
  }
  if (!mailConfigured()) return { emailed: false, mail_configured: false };
  const stamp = again ? `again-${Math.floor(Date.now() / 3600000)}` : 'sent';
  if (!(await claim(uid, 'invite', id, stamp))) {
    if (again) throw new Refused('You just emailed this invite. You can send it again in an hour.', 429);
    return { emailed: false, mail_configured: true };
  }
  // The link opens AuraGoal on the invite with their email filled in ("#" keeps it out of server logs)
  const link = `${url}/#invite=${encodeURIComponent(to)}${theirId ? '&account=1' : ''}`;
  const [text, html] = buttonEmail('there', [
    `${from} invited you to be their accountability partner on AuraGoal. Partners chat, cheer each other on, keep a chat streak going and see only the goals the other one chooses to share.`,
    theirId ? `Sign in with ${to} to accept.` : `Create a free account with ${to} to accept. It takes a minute.`,
  ], theirId ? 'Accept the invite' : 'Join and accept', link, `If you don't know ${from}, ignore this email; nothing happens unless you accept.`);
  const emailed = await sendMail(to, `${from} invited you to be accountability partners`, text, html);
  if (!emailed) await unclaim(uid, 'invite', id, stamp);
  return { emailed, mail_configured: true };
}

/** Tells the inviter, so they can choose what to share. */
async function sendAccepted(uid: string, id: number) {
  const { data: p } = await db.from('partnerships').select('*').eq('id', id).eq('invitee_id', uid).eq('status', 'ACCEPTED').maybeSingle();
  if (!p) throw new Refused('Partner not found.', 404);
  if (!(await claim(uid, 'accepted', id, 'sent'))) return { emailed: false };
  const url = await appUrl();
  const me = await nameOf(uid);
  const [text, html] = buttonEmail(await nameOf(p.inviter_id), [
    `${me} accepted your invite. You are accountability partners now.`,
    `Every goal of yours stays private until you share it. Pick the goals ${me} can see, and whether they see your day plans.`,
  ], 'Choose what to share', `${url}/#partners`, 'You can change what you share, or remove a partner, at any time in Partners.');
  const emailed = await sendMail(await emailOf(p.inviter_id), `${me} accepted your AuraGoal invite`, text, html);
  if (!emailed) await unclaim(uid, 'accepted', id, 'sent');
  await pushToUser(p.inviter_id, { kind: 'chat', title: `${me} accepted your invite 🎉`, body: `Choose what ${me} can see of yours.`, tag: `partner-${id}`, url: `${url}/#partners` });
  return { emailed };
}

/** The push for something just sent in a chat. At most one for text messages every 2 minutes. */
async function sendMessagePush(uid: string, id: number) {
  const { data: m } = await db.from('partner_messages').select('*, partnerships(inviter_id, invitee_id), goals(title)').eq('id', id).eq('sender_id', uid).maybeSingle();
  if (!m) throw new Refused('Message not found.', 404);
  const partner = m.partnerships.inviter_id === uid ? m.partnerships.invitee_id : m.partnerships.inviter_id;
  if (!(await claim(uid, 'message', id, 'sent'))) return { sent: 0 };
  const me = await nameOf(uid);
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  let title = me, body = '';
  if (m.kind === 'TEXT') {
    if (!(await claim(partner, 'chat', m.partnership_id, String(Math.floor(Date.now() / 120000))))) return { sent: 0 };
    body = clip(m.body, 120);
  } else if (m.kind === 'CHEER') {
    title = `${me} cheered you on ${m.body}`; body = `For “${m.goals?.title ?? 'your goal'}”. Keep going!`;
  } else if (m.kind === 'NUDGE') {
    title = `${me} nudged you 👋`; body = 'Time to plan your day and get going.';
  } else {
    body = `${m.kind === 'VIDEO' ? '🎬 Sent a video' : '📷 Sent a photo'}${m.body ? `: ${clip(m.body, 100)}` : ''}`;
  }
  const r = await pushToUser(partner, { kind: 'chat', title, body, tag: `chat-${m.partnership_id}`, url: `${await appUrl()}/#partners` });
  return { sent: r.sent };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  try {
    const input = await req.json().catch(() => ({}));

    // The cron job
    const secret = req.headers.get('x-worker-secret');
    if (secret !== null) {
      const want = await setting('worker_secret');
      if (!want || secret !== want) return reply({ error: 'Not allowed.' }, 401);
      return reply(await tick());
    }

    // Everyone else: a signed-in person
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = token ? await db.auth.getUser(token) : { data: { user: null } };
    const uid = auth.user?.id;
    if (!uid) return reply({ error: 'Please sign in to continue.' }, 401);

    switch (input.type) {
      case 'status': {
        const beat = Number((await setting('worker_beat')) ?? 0);
        return reply({ vapid_public: (await vapidKeys()).public, mail_configured: mailConfigured(), worker_running: Date.now() - beat <= 150000 });
      }
      case 'invite': return reply(await sendInvite(uid, Number(input.id), input.again === true));
      case 'accepted': return reply(await sendAccepted(uid, Number(input.id)));
      case 'message': return reply(await sendMessagePush(uid, Number(input.id)));
      case 'test': {
        const r = await pushToUser(uid, { kind: 'test', title: 'Notifications are working', body: 'You will get reminders here, even when AuraGoal is closed.', tag: 'test', url: `${await appUrl()}/` });
        if (r.sent === 0 && r.failed === 0) throw new Refused('No device has notifications turned on yet.', 422);
        if (r.sent === 0) throw new Refused(`The push service did not accept the message. ${r.errors[0] ?? ''}`, 502);
        return reply({ sent: r.sent, failed: r.failed });
      }
      case 'digest-preview': {
        // At most one a minute, so the button cannot be used to flood an inbox
        if (!(await claim(uid, 'preview', 0, new Date().toISOString().slice(0, 16)))) throw new Refused('A preview was just sent. Wait a minute and try again.', 429);
        if (!mailConfigured()) return reply({ delivered: 'none' });
        const d = await buildDigest(uid);
        if (!d || !(await sendMail(d.to, d.subject, d.text, d.html))) throw new Refused('The email could not be sent. Check the email settings in Supabase.', 502);
        return reply({ delivered: 'email' });
      }
      default: return reply({ error: 'Unknown request.' }, 422);
    }
  } catch (e) {
    if (e instanceof Refused) return reply({ error: e.message }, e.status);
    console.error('[AuraGoal]', e);
    return reply({ error: 'Something went wrong on the server.' }, 500);
  }
});
