import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Camera, Check, Eye, EyeOff, Flame, Info, LogOut, Mail, Monitor, Moon, MoonStar, Send, Snowflake, Sun, TriangleAlert, Trash2, Trophy, Volume2, VolumeX } from 'lucide-react';
import * as api from '../api';
import { useApp } from '../context/AppContext';
import { prepareAvatar } from '../lib/image';
import { currentSubscription, disablePush, enablePush, endpointKey, pushFlag, pushPermission } from '../lib/push';
import { cn, fmtMinutes } from '../lib/utils';
import { Avatar, Bar, cardShadow } from './ui';
import { InstallCard } from './AppStatus';
import { useTheme } from '../lib/theme';

const label = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted';
const primary = 'rounded-xl bg-rust px-5 py-2.5 text-sm font-extrabold text-white hover:bg-rust-strong disabled:cursor-not-allowed disabled:opacity-60';
const secondary = 'inline-flex items-center gap-2 rounded-xl border border-oat bg-soft px-4 py-2.5 text-sm font-bold text-charcoal hover:border-blush disabled:cursor-not-allowed disabled:opacity-60';

/** A settings section. `info` is an explanation kept behind a small ⓘ button, for whoever wants it. */
function Card({ title, info, children }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-3xl border border-oat bg-soft p-5 md:p-6" style={cardShadow}>
      <div className="flex items-center gap-1">
        <h2 className="text-base font-extrabold text-charcoal">{title}</h2>
        {info && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`About ${title.toLowerCase()}`}
            className={cn('grid h-7 w-7 place-items-center rounded-full transition-colors', open ? 'bg-oat text-charcoal' : 'text-muted hover:bg-oat/60 hover:text-charcoal')}>
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <p className="mt-2 rounded-xl bg-oat/50 px-3 py-2 text-sm text-charcoal">{info}</p>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mt-4">{children}</div>
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
    <Card title="Profile photo">
      <div className="flex flex-wrap items-center gap-5">
        <Avatar user={user} className="h-24 w-24 text-4xl ring-4 ring-ivory" />
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
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={onPick} aria-label="Choose a profile photo" />
      </div>
      <Notice note={note} />
    </Card>
  );
}

function DetailsCard() {
  const { user, updateProfile } = useApp();
  const [name, setName] = useState(user.display_name);
  const [nick, setNick] = useState(user.nickname ?? '');
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const nameChanged = name.trim() !== user.display_name;
  const nickChanged = nick.trim() !== (user.nickname ?? '');
  const emailChanged = email.trim().toLowerCase() !== user.email;
  const dirty = nameChanged || nickChanged || emailChanged;

  const submit = async (e) => {
    e.preventDefault();
    setNote(null);
    if (!name.trim()) { setNote({ kind: 'err', text: 'Enter your name.' }); return; }
    setBusy(true);
    try {
      await updateProfile({
        ...(nameChanged ? { display_name: name } : {}),
        ...(nickChanged ? { nickname: nick } : {}),
        ...(emailChanged ? { email, current_password: password } : {}),
      });
      setPassword('');
      setNote({ kind: 'ok', text: emailChanged ? `Saved. We sent a link to ${email.trim()}: open it to finish changing your email.` : 'Your details are saved.' });
    } catch (ex) {
      setNote({ kind: 'err', text: ex.message });
    }
    setBusy(false);
  };

  return (
    <Card title="Your details" info="Your nickname is what AuraGoal calls you, for example when the dashboard says good morning. Partners still see your name, unless they give you a nickname of their own.">
      <form onSubmit={submit} noValidate className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="setName" className={label}>Name</label>
            <input id="setName" className="field" type="text" maxLength={100} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="setNick" className={label}>Nickname <span className="normal-case tracking-normal">(optional)</span></label>
            <input id="setNick" className="field" type="text" maxLength={40} autoComplete="nickname" placeholder={name.trim().split(/\s+/)[0] || 'e.g. Harry'} value={nick} onChange={(e) => setNick(e.target.value)} />
          </div>
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
    <Card title="Password" info="Use at least 8 characters. You stay signed in on this device.">
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
    <Card title="Rest days and streak"
      info={`Rest days never break your streak (pick up to ${MAX_REST_DAYS}), and plans you finish on them still count. Every ${FREEZE_EVERY} days in a row earns a streak freeze (you can hold ${MAX_FREEZES}); if you miss a day, one is used automatically and your streak carries on.`}>
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
      <div className="mt-5 flex items-center gap-3">
        <Snowflake className="h-4 w-4 shrink-0 text-blush-dark" aria-hidden="true" />
        <Bar pct={progress} height="h-2" className="flex-1" fill="bg-blush-dark" label="Progress to the next freeze" />
        <span className="shrink-0 text-xs font-bold text-muted">{full ? 'Freezes full' : `Next freeze in ${toNext} day${toNext === 1 ? '' : 's'}`}</span>
      </div>
      <Notice note={note} />
    </Card>
  );
}

// 1 hour to 12 hours in half-hour steps
const CAPACITY_OPTIONS = Array.from({ length: 23 }, (_, i) => 60 + i * 30);

const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

  const [planDay, setPlanDay] = useState(user.planning_day ?? 7);
  const changeDay = async (e) => {
    const day = Number(e.target.value), before = planDay;
    setPlanDay(day); setNote(null);
    try { await updateProfile({ planning_day: day }); setNote({ kind: 'ok', text: `"Plan your week" will show up on ${WEEKDAY_LONG[day - 1]}s.` }); }
    catch (ex) { setPlanDay(before); setNote({ kind: 'err', text: ex.message }); }
  };

  return (
    <Card title="Your day"
      info={'AuraGoal warns you when a day is planned past the time you have. Give day plans a time or a length in the Planner so it can add them up; rest days count as zero hours. On your planning day, the dashboard invites you to plan the week ahead.'}>
      <label htmlFor="capacity" className={label}>Time I have on a normal day</label>
      <select id="capacity" className="field !w-auto min-w-40" value={value} onChange={change}>
        {options.map((m) => <option key={m} value={m}>{fmtMinutes(m)}</option>)}
      </select>
      <label htmlFor="planDay" className={`${label} mt-4`}>Plan my week on</label>
      <select id="planDay" className="field !w-auto min-w-40" value={planDay} onChange={changeDay}>
        {WEEKDAY_LONG.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
      </select>
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
    (r) => (r.delivered === 'email' ? `Sent to ${user.email}. Check your inbox.` : 'The email could not be sent right now. Try again later.'));

  const on = !!thisKey;
  const supported = permission !== 'unsupported';

  return (
    <Card title="Notifications"
      info="Reminders pop up on this device when a day plan's start time arrives, even with AuraGoal closed. The morning email lists your plans for the day, what is due and what slipped.">

      {loadError && <p className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{loadError}</p>}

      <h3 className="text-xs font-bold uppercase tracking-wider text-muted">On this device</h3>
      <div className="mt-2 flex flex-wrap items-center gap-3 rounded-2xl border border-oat bg-ivory p-3.5">
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl text-on-status', on ? 'bg-success' : 'bg-blush-dark')}><Bell className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-sm font-extrabold text-charcoal">{on ? 'Reminders are on' : 'Reminders are off'}</p>
          {/* Only said when something stops them working */}
          {!supported && <p className="text-xs text-muted">This browser can’t show notifications. Try Chrome, Edge or Firefox.</p>}
          {supported && permission === 'denied' && <p className="text-xs text-muted">Blocked in your browser’s site settings. Allow them, then reload.</p>}
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
          <p className="min-w-0 flex-1 text-sm font-extrabold text-charcoal">Today’s plan, in your inbox</p>
          <Switch on={user.digest_enabled} onChange={toggleDigest} label="Send me a morning email" disabled={busy === 'digest'} />
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-oat pt-3">
          <div>
            <label htmlFor="digestTime" className={label}>Send it at</label>
            <input id="digestTime" type="time" className="field !w-auto" value={time} disabled={!user.digest_enabled} onChange={(e) => setTime(e.target.value)} />
          </div>
          <button type="button" onClick={preview} disabled={!!busy} className={secondary}><Send className="h-4 w-4" aria-hidden="true" />{busy === 'preview' ? 'Sending…' : 'Send a preview'}</button>
        </div>
      </div>
      <Notice note={note} />
    </Card>
  );
}

// A miniature of each theme for the Appearance picker. These are pictures of the two themes, so their colours are
// fixed on purpose (they must look the same whichever theme is showing); "system" shows half of each.
const PREVIEW = {
  light: { bg: '#F5F7FA', card: '#FFFFFF', line: '#D8E0EA', text: '#202B38', accent: '#356ACB' },
  dark: { bg: '#17191E', card: '#242831', line: '#3A414D', text: '#F3F5F8', accent: '#477BDB' },
};
function ThemePreview({ kind }) {
  const half = (p) => (
    <div className="flex h-full flex-1 flex-col gap-1 p-1.5" style={{ background: p.bg }}>
      <div className="h-1.5 w-8 rounded-full" style={{ background: p.text }} />
      <div className="flex flex-1 flex-col gap-1 rounded-md p-1.5" style={{ background: p.card, border: `1px solid ${p.line}` }}>
        <div className="h-1 w-3/4 rounded-full" style={{ background: p.line }} />
        <div className="h-1.5 w-1/2 rounded-full" style={{ background: p.accent }} />
      </div>
    </div>
  );
  return (
    <div className="flex h-16 w-full overflow-hidden rounded-xl border border-oat" aria-hidden="true">
      {kind === 'system' ? <>{half(PREVIEW.light)}{half(PREVIEW.dark)}</> : half(PREVIEW[kind])}
    </div>
  );
}

function AppearanceCard() {
  const { choice, setChoice } = useTheme();
  const options = [['light', 'Light', Sun], ['dark', 'Dark', MoonStar], ['system', 'System', Monitor]];
  return (
    <Card title="Appearance" info="System follows your phone or computer: light in the day and dark at night if your device does that. Your choice is saved on this device.">
      <div className="grid grid-cols-3 gap-2 sm:gap-3" role="radiogroup" aria-label="Theme">
        {options.map(([id, text, Icon]) => {
          const on = choice === id;
          return (
            <button key={id} type="button" role="radio" aria-checked={on} onClick={() => setChoice(id)}
              className={cn('flex flex-col gap-2 rounded-2xl border-2 p-2 text-left transition-colors sm:p-2.5', on ? 'border-rust bg-rust/10' : 'border-oat bg-soft hover:border-blush')}>
              <ThemePreview kind={id} />
              <span className="flex items-center gap-1.5 px-0.5 text-sm font-bold text-charcoal">
                <Icon className={cn('h-4 w-4 shrink-0', on ? 'text-rust-dark' : 'text-muted')} aria-hidden="true" />{text}
                {on && <Check className="ml-auto h-4 w-4 shrink-0 text-rust-dark" aria-hidden="true" />}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/** Phones only: from md up these sit in the top bar and the sidebar. */
function PhoneControls() {
  const { soundOn, setSoundOn, signOut } = useApp();
  const row = 'flex w-full items-center gap-3 rounded-2xl border border-oat bg-soft px-4 py-3 text-left text-sm font-bold';
  return (
    <div className="grid gap-2 md:hidden">
      <button type="button" aria-pressed={soundOn} onClick={() => setSoundOn(!soundOn)} className={cn(row, 'text-charcoal')}>
        {soundOn ? <Volume2 className="h-5 w-5 shrink-0" aria-hidden="true" /> : <VolumeX className="h-5 w-5 shrink-0" aria-hidden="true" />}Sound {soundOn ? 'on' : 'off'}
      </button>
      <button type="button" onClick={signOut} className={cn(row, 'text-danger')}><LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />Sign out</button>
    </div>
  );
}

export default function SettingsView() {
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-6">
      <InstallCard />
      <AppearanceCard />
      <PhotoCard />
      <StreakCard />
      <PlanningCard />
      <NotificationsCard />
      <DetailsCard />
      <PasswordCard />
      <PhoneControls />
    </div>
  );
}
