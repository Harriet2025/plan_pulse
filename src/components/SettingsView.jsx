import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Camera, Check, Clock, Eye, EyeOff, Flame, Gauge, Mail, Moon, RefreshCw, Send, Snowflake, TriangleAlert, Trash2, Trophy } from 'lucide-react';
import * as api from '../api';
import { useApp } from '../context/AppContext';
import { prepareAvatar } from '../lib/image';
import { currentSubscription, disablePush, enablePush, endpointKey, pushFlag, pushPermission } from '../lib/push';
import { cn, fmtMinutes } from '../lib/utils';
import { Avatar, Bar, cardShadow } from './ui';

const label = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted';
const primary = 'rounded-xl bg-rust px-5 py-2.5 text-sm font-extrabold text-white hover:bg-rust-dark disabled:cursor-not-allowed disabled:opacity-60';
const secondary = 'inline-flex items-center gap-2 rounded-xl border border-oat bg-soft px-4 py-2.5 text-sm font-bold text-charcoal hover:border-blush disabled:cursor-not-allowed disabled:opacity-60';

function Card({ title, description, children }) {
  return (
    <section className="rounded-3xl border border-oat bg-soft p-5 md:p-6" style={cardShadow}>
      <h2 className="text-base font-extrabold text-charcoal">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

// kind: 'ok' | 'err'
function Notice({ note }) {
  return (
    <AnimatePresence initial={false}>
      {note && (
        <motion.p
          key={note.text} role={note.kind === 'err' ? 'alert' : 'status'}
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className={cn('mt-4 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm', note.kind === 'err' ? 'border-danger/40 bg-danger/10 text-danger' : 'border-success/40 bg-success/10 text-success')}
        >
          {note.kind === 'err' ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          {note.text}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

function PasswordInput({ id, value, onChange, show, autoComplete, onToggle }) {
  return (
    <div className="relative">
      <input id={id} className="field !pr-11" type={show ? 'text' : 'password'} maxLength={72} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />
      {onToggle && (
        <button type="button" onClick={onToggle} aria-label={show ? 'Hide passwords' : 'Show passwords'} aria-pressed={show}
          className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-charcoal">
          {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}

function PhotoCard() {
  const { user, uploadAvatar, removeAvatar } = useApp();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const run = async (fn, ok) => {
    setBusy(true); setNote(null);
    try { await fn(); setNote({ kind: 'ok', text: ok }); } catch (ex) { setNote({ kind: 'err', text: ex.message }); }
    setBusy(false);
  };
  const onPick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so picking the same file again still fires
    if (file) run(async () => uploadAvatar(await prepareAvatar(file)), 'Your photo is updated.');
  };

  return (
    <Card title="Profile photo" description="Shown in the sidebar. We crop it to a square for you.">
      <div className="flex flex-wrap items-center gap-5">
        <Avatar user={user} className="h-24 w-24 text-4xl ring-4 ring-ivory" />
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={cn(primary, 'inline-flex items-center gap-2')}>
              <Camera className="h-4 w-4" aria-hidden="true" />{busy ? 'Working…' : user.avatar_v ? 'Change photo' : 'Upload photo'}
            </button>
            {user.avatar_v && (
              <button type="button" disabled={busy} onClick={() => run(removeAvatar, 'Your photo was removed.')} className={cn(secondary, 'text-danger hover:!border-danger')}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />Remove
              </button>
            )}
          </div>
          <p className="text-xs text-muted">JPG, PNG or WebP.</p>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={onPick} aria-label="Choose a profile photo" />
      </div>
      <Notice note={note} />
    </Card>
  );
}

function DetailsCard() {
  const { user, updateProfile } = useApp();
  const [name, setName] = useState(user.display_name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const nameChanged = name.trim() !== user.display_name;
  const emailChanged = email.trim().toLowerCase() !== user.email;
  const dirty = nameChanged || emailChanged;

  const submit = async (e) => {
    e.preventDefault();
    setNote(null);
    if (!name.trim()) { setNote({ kind: 'err', text: 'Enter your name.' }); return; }
    setBusy(true);
    try {
      await updateProfile({
        ...(nameChanged ? { display_name: name } : {}),
        ...(emailChanged ? { email, current_password: password } : {}),
      });
      setPassword('');
      setNote({ kind: 'ok', text: 'Your details are saved.' });
    } catch (ex) {
      setNote({ kind: 'err', text: ex.message });
    }
    setBusy(false);
  };

  return (
    <Card title="Your details" description="The name shown on your dashboard and the email you sign in with.">
      <form onSubmit={submit} noValidate className="grid gap-4">
        <div>
          <label htmlFor="setName" className={label}>Name</label>
          <input id="setName" className="field" type="text" maxLength={100} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="setEmail" className={label}>Email</label>
          <input id="setEmail" className="field" type="email" maxLength={255} autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <AnimatePresence initial={false}>
          {emailChanged && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="-mx-1 overflow-hidden px-1">
              <label htmlFor="setEmailPass" className={label}>Current password</label>
              <PasswordInput id="setEmailPass" value={password} onChange={setPassword} autoComplete="current-password" />
              <p className="mt-1.5 text-xs text-muted">Needed to confirm a change of email.</p>
            </motion.div>
          )}
        </AnimatePresence>
        <div><button type="submit" disabled={!dirty || busy} className={primary}>{busy ? 'Saving…' : 'Save changes'}</button></div>
      </form>
      <Notice note={note} />
    </Card>
  );
}

function PasswordCard() {
  const { updateProfile } = useApp();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setNote(null);
    if (!current || !next) { setNote({ kind: 'err', text: 'Fill in your current and new password.' }); return; }
    if (next.length < 8 || next.length > 72) { setNote({ kind: 'err', text: 'Your new password must be 8 to 72 characters.' }); return; }
    if (next !== again) { setNote({ kind: 'err', text: 'The two new passwords do not match.' }); return; }
    setBusy(true);
    try {
      await updateProfile({ new_password: next, current_password: current });
      setCurrent(''); setNext(''); setAgain('');
      setNote({ kind: 'ok', text: 'Your password is changed.' });
    } catch (ex) {
      setNote({ kind: 'err', text: ex.message });
    }
    setBusy(false);
  };

  return (
    <Card title="Password" description="Use at least 8 characters. You stay signed in on this device.">
      <form onSubmit={submit} noValidate className="grid gap-4">
        <div>
          <label htmlFor="pwCurrent" className={label}>Current password</label>
          <PasswordInput id="pwCurrent" value={current} onChange={setCurrent} show={show} autoComplete="current-password" onToggle={() => setShow((s) => !s)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pwNew" className={label}>New password</label>
            <PasswordInput id="pwNew" value={next} onChange={setNext} show={show} autoComplete="new-password" />
          </div>
          <div>
            <label htmlFor="pwAgain" className={label}>Repeat new password</label>
            <PasswordInput id="pwAgain" value={again} onChange={setAgain} show={show} autoComplete="new-password" />
          </div>
        </div>
        <div><button type="submit" disabled={busy} className={primary}>{busy ? 'Saving…' : 'Change password'}</button></div>
      </form>
      <Notice note={note} />
    </Card>
  );
}

const WEEKDAYS = [[1, 'Mon', 'Monday'], [2, 'Tue', 'Tuesday'], [3, 'Wed', 'Wednesday'], [4, 'Thu', 'Thursday'], [5, 'Fri', 'Friday'], [6, 'Sat', 'Saturday'], [7, 'Sun', 'Sunday']];
const MAX_REST_DAYS = 3;
const FREEZE_EVERY = 7;
const MAX_FREEZES = 2;

function StatTile({ icon: Icon, value, label, tone }) {
  return (
    <div className="rounded-2xl border border-oat bg-ivory p-3 text-center">
      <span className={cn('mx-auto grid h-8 w-8 place-items-center rounded-lg', tone)}><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <div className="mt-2 text-2xl font-extrabold tabular-nums text-charcoal">{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

function StreakCard() {
  const { user, updateProfile } = useApp();
  const [days, setDays] = useState(user.rest_days ?? []);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);

  const toggle = async (n, name) => {
    const on = days.includes(n);
    if (!on && days.length >= MAX_REST_DAYS) { setNote({ kind: 'err', text: `You can pick up to ${MAX_REST_DAYS} rest days, so the streak still means something.` }); return; }
    const next = on ? days.filter((d) => d !== n) : [...days, n].sort();
    setDays(next); setNote(null); setSaving(true);                 // show the change at once, then save it
    try {
      await updateProfile({ rest_days: next });
      setNote({ kind: 'ok', text: on ? `${name}s are a work day again.` : `${name}s are now rest days.` });
    } catch (ex) {
      setDays(days); setNote({ kind: 'err', text: ex.message });   // put it back if saving failed
    }
    setSaving(false);
  };

  const toNext = FREEZE_EVERY - (user.streak_count % FREEZE_EVERY);
  const full = user.streak_freezes >= MAX_FREEZES;
  const progress = full ? 100 : Math.round(((FREEZE_EVERY - toNext) / FREEZE_EVERY) * 100);

  return (
    <Card title="Rest days and streak" description="Days off never break your streak, and a freeze covers a day you miss.">
      <div className="grid grid-cols-3 gap-3">
        <StatTile icon={Flame} value={user.streak_count} label="Streak" tone="bg-rust/10 text-rust-dark" />
        <StatTile icon={Trophy} value={user.best_streak} label="Best" tone="bg-blush/30 text-blush-dark" />
        <StatTile icon={Snowflake} value={`${user.streak_freezes}/${MAX_FREEZES}`} label="Freezes" tone="bg-blush/30 text-blush-dark" />
      </div>

      <h3 className="mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-muted">Your rest days</h3>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="group" aria-label="Rest days">
        {WEEKDAYS.map(([n, short, name]) => {
          const on = days.includes(n);
          return (
            <motion.button
              key={n} type="button" aria-pressed={on} aria-label={name} onClick={() => toggle(n, name)} disabled={saving} whileTap={{ scale: 0.94 }}
              className={cn(
                'flex flex-col items-center gap-1 rounded-2xl border px-1 py-2.5 text-xs font-bold transition-colors disabled:opacity-70',
                on ? 'border-blush bg-blush/30 text-charcoal' : 'border-oat bg-ivory text-muted hover:border-blush',
              )}
            >
              <Moon className={cn('h-4 w-4 transition-opacity', on ? 'text-blush-dark opacity-100' : 'opacity-30')} aria-hidden="true" />
              {short}
            </motion.button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">{days.length} of {MAX_REST_DAYS} chosen. You can still finish tasks on a rest day, and it counts.</p>

      <div className="mt-5 rounded-2xl border border-oat bg-ivory p-4">
        <div className="flex items-center gap-2 text-sm font-extrabold text-charcoal"><Snowflake className="h-4 w-4 text-blush-dark" aria-hidden="true" />Streak freezes</div>
        <p className="mt-1 text-sm text-muted">
          Every {FREEZE_EVERY} days in a row earns a freeze (you can hold {MAX_FREEZES}). If you miss a day, a freeze is used automatically and your streak carries on.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Bar pct={progress} height="h-2" className="flex-1" fill="bg-blush-dark" label="Progress to the next freeze" />
          <span className="shrink-0 text-xs font-bold text-muted">{full ? `Holding the maximum (${MAX_FREEZES})` : `${toNext} more day${toNext === 1 ? '' : 's'} to the next`}</span>
        </div>
      </div>
      <Notice note={note} />
    </Card>
  );
}

// 1 hour to 12 hours in half-hour steps
const CAPACITY_OPTIONS = Array.from({ length: 23 }, (_, i) => 60 + i * 30);

function PlanningCard() {
  const { user, updateProfile } = useApp();
  const [value, setValue] = useState(user.daily_capacity_min);
  const [note, setNote] = useState(null);
  const options = CAPACITY_OPTIONS.includes(value) ? CAPACITY_OPTIONS : [...CAPACITY_OPTIONS, value].sort((a, b) => a - b);

  const change = async (e) => {
    const minutes = Number(e.target.value), before = value;
    setValue(minutes); setNote(null);
    try { await updateProfile({ capacity_min: minutes }); setNote({ kind: 'ok', text: `A normal day is now ${fmtMinutes(minutes)}.` }); }
    catch (ex) { setValue(before); setNote({ kind: 'err', text: ex.message }); }
  };

  return (
    <Card title="Your day" description="Be honest about how much time you really have. AuraGoal warns you when a day is planned past it.">
      <label htmlFor="capacity" className={label}>Time I can realistically give on a normal day</label>
      <select id="capacity" className="field !w-auto min-w-40" value={value} onChange={change}>
        {options.map((m) => <option key={m} value={m}>{fmtMinutes(m)}</option>)}
      </select>
      <ul className="mt-4 grid gap-2 text-sm text-muted">
        <li className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-blush-dark" aria-hidden="true" /><span>Give your day plans a time (2:00 to 4:00pm) or a length (45 minutes) when you add them in the Planner.</span></li>
        <li className="flex gap-2"><Gauge className="mt-0.5 h-4 w-4 shrink-0 text-blush-dark" aria-hidden="true" /><span>A day holds the plans you set for it, repeating ones included. Rest days count as zero hours.</span></li>
      </ul>
      <Notice note={note} />
    </Card>
  );
}

function Switch({ on, onChange, label: aria, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={aria} disabled={disabled} onClick={() => onChange(!on)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60', on ? 'bg-rust' : 'bg-oat')}>
      <motion.span className="absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow" animate={{ x: on ? 22 : 2 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }} />
    </button>
  );
}

function NotificationsCard() {
  const { user, updateProfile } = useApp();
  const [cfg, setCfg] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [permission, setPermission] = useState(pushPermission());
  const [thisKey, setThisKey] = useState(null);      // how the server labels this browser, if it is subscribed
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null);
  const [time, setTime] = useState(user.digest_time);

  const refresh = async () => {
    try {
      const c = await api.getNotifyConfig();
      setCfg(c); setLoadError('');
      const sub = await currentSubscription();
      const key = sub ? await endpointKey(sub.endpoint) : null;
      if (sub && !c.devices.some((d) => d.key === key)) {   // the browser is subscribed but the server lost it: quietly put it back
        try { await api.subscribePush(sub.toJSON()); c.devices.push({ id: 0, label: 'This device', added: '', key }); } catch { /* shown as off */ }
      }
      setThisKey(sub && c.devices.some((d) => d.key === key) ? key : null);
      pushFlag.set(!!(sub && c.devices.some((d) => d.key === key)));
      setPermission(pushPermission());
    } catch (ex) { setLoadError(ex.message); }
  };
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (name, fn, ok) => {
    setBusy(name); setNote(null);
    try { const r = await fn(); if (ok) setNote({ kind: 'ok', text: typeof ok === 'function' ? ok(r) : ok }); }
    catch (ex) { setNote({ kind: 'err', text: ex.message }); }
    setBusy('');
  };

  const enable = () => run('enable', async () => { const sub = await enablePush(cfg.vapid_public); await api.subscribePush(sub); pushFlag.set(true); await refresh(); }, 'Notifications are on for this device.');
  const disable = () => run('disable', async () => { const endpoint = await disablePush(); if (endpoint) await api.unsubscribePush(endpoint); pushFlag.set(false); await refresh(); }, 'Notifications are off for this device.');
  const test = () => run('test', () => api.testPush(), 'Sent. It should appear in a moment.');
  const toggleDigest = (on) => run('digest', async () => { await updateProfile({ digest_enabled: on }); }, on ? `You will get a morning email at ${user.digest_time}.` : 'The morning email is off.');
  // Save a moment after the time stops changing, so picking one never depends on clicking away from the field
  useEffect(() => {
    if (time === user.digest_time || !/^\d\d:\d\d$/.test(time)) return undefined;
    const id = setTimeout(() => run('time', () => updateProfile({ digest_time: time }), `The email will come at ${time}.`), 700);
    return () => clearTimeout(id);
  }, [time]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = () => run('preview', () => api.sendDigestPreview(),
    (r) => (r.delivered === 'email' ? `Sent to ${user.email}. Check your inbox.` : 'Email is not set up on the server yet, so it was saved to storage/mail.log instead.'));

  const on = !!thisKey;
  const supported = permission !== 'unsupported';

  return (
    <Card title="Notifications" description="Get your reminders and a morning summary even when AuraGoal is closed.">
      {loadError && <p className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{loadError}</p>}

      <h3 className="text-xs font-bold uppercase tracking-wider text-muted">On this device</h3>
      <div className="mt-2 flex flex-wrap items-center gap-3 rounded-2xl border border-oat bg-ivory p-3.5">
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white', on ? 'bg-success' : 'bg-blush-dark')}><Bell className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-sm font-extrabold text-charcoal">{on ? 'Reminders are on' : 'Reminders are off'}</p>
          <p className="text-xs text-muted">
            {!supported ? 'This browser cannot show notifications while it is closed. Try Chrome, Edge or Firefox.'
              : permission === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser’s site settings, then reload.'
              : on ? 'A notification appears when a day plan’s start time arrives.' : 'Turn them on to be reminded even with the browser closed.'}
          </p>
        </div>
        {supported && permission !== 'denied' && (on
          ? <div className="flex flex-wrap gap-2">
              <button type="button" onClick={test} disabled={!!busy} className={secondary}><Send className="h-4 w-4" aria-hidden="true" />{busy === 'test' ? 'Sending…' : 'Send a test'}</button>
              <button type="button" onClick={disable} disabled={!!busy} className={cn(secondary, 'text-muted')}>Turn off</button>
            </div>
          : <button type="button" onClick={enable} disabled={!cfg || !!busy} className={primary}>{busy === 'enable' ? 'Turning on…' : 'Turn on'}</button>)}
      </div>
      {cfg && cfg.devices.length > 0 && (
        <ul className="mt-2 grid gap-1 text-xs text-muted" aria-label="Devices with notifications">
          {cfg.devices.map((d) => (
            <li key={d.key} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />{d.label}{d.added && ` · added ${new Date(d.added.replace(' ', 'T')).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}{d.key === thisKey && <span className="rounded-full bg-oat px-2 py-0.5 text-[10px] font-bold text-charcoal">This device</span>}</li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-muted">Morning email</h3>
      <div className="rounded-2xl border border-oat bg-ivory p-3.5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rust text-white"><Mail className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-charcoal">Today’s plan, in your inbox</p>
            <p className="truncate text-xs text-muted">Sent to {user.email}: your tasks, what is due, what slipped, and how full the day is.</p>
          </div>
          <Switch on={user.digest_enabled} onChange={toggleDigest} label="Send me a morning email" disabled={busy === 'digest'} />
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-oat pt-3">
          <div>
            <label htmlFor="digestTime" className={label}>Send it at</label>
            <input id="digestTime" type="time" className="field !w-auto" value={time} disabled={!user.digest_enabled} onChange={(e) => setTime(e.target.value)} />
          </div>
          <button type="button" onClick={preview} disabled={!!busy} className={secondary}><Send className="h-4 w-4" aria-hidden="true" />{busy === 'preview' ? 'Sending…' : 'Send me a preview now'}</button>
        </div>
        {cfg && !cfg.mail_configured && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-xs font-semibold text-charcoal"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" /><span>Email is not set up on the server yet, so messages are saved to <code className="rounded bg-oat px-1">storage/mail.log</code> instead of being sent. See the README to add your mail account.</span></p>
        )}
      </div>

      <h3 className="mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-muted">Background worker</h3>
      <div className={cn('flex flex-wrap items-center gap-3 rounded-2xl border p-3.5', cfg?.worker_running ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10')}>
        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', cfg?.worker_running ? 'bg-success' : 'bg-warning')} aria-hidden="true" />
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-sm font-extrabold text-charcoal">{!cfg ? 'Checking…' : cfg.worker_running ? 'The worker is running' : 'The worker is not running'}</p>
          <p className="text-xs text-muted">
            {cfg?.worker_running ? 'It checks every 30 seconds and sends reminders and emails on time.'
              : <>Reminders and emails are only sent while it runs. Open a terminal in the project folder, run <code className="rounded bg-oat px-1 font-bold text-charcoal">npm run worker</code>, and leave it open.</>}
          </p>
        </div>
        <button type="button" onClick={refresh} className={secondary}><RefreshCw className="h-4 w-4" aria-hidden="true" />Check again</button>
      </div>
      <Notice note={note} />
    </Card>
  );
}

export default function SettingsView() {
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PhotoCard />
      <StreakCard />
      <PlanningCard />
      <NotificationsCard />
      <DetailsCard />
      <PasswordCard />
    </div>
  );
}
