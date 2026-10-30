import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Crown, Eye, Film, Flame, Hand, ImagePlus, Lock, MessageCircle, Send, Sun, Target, UserMinus, UserPlus, Users, X } from 'lucide-react';
import * as api from '../api';
import { useApp } from '../context/AppContext';
import { catIcon, horizonOf } from '../lib/constants';
import { cn, fmtSpan, parseDay, periodLabel } from '../lib/utils';
import { Avatar, Bar, cardShadow } from './ui';

const CHEERS = ['🔥', '👏', '💪', '❤️', '🎉', '⭐'];
const QUICK = ['You got this! 💪', 'Proud of you 🎉', 'How is your day going?', 'Let’s finish strong today 🔥'];
const first = (name) => name.trim().split(/\s+/)[0];

/** "Send a message today" / "Both of you chatted today", with the streak count. */
function ChatStreak({ streak, name, compact }) {
  const alive = streak.count > 0;
  const text = streak.me_today && streak.them_today ? 'You both chatted today'
    : streak.me_today ? `Waiting for ${name} today`
    : streak.them_today ? 'Reply today to keep it' : alive ? 'Chat today to keep it' : 'Both chat today to start one';
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full font-bold', compact ? 'text-[11px]' : 'px-3 py-1 text-xs', alive ? 'bg-rust/10 text-rust-dark' : 'bg-oat text-muted', compact && 'bg-transparent px-0')}
      title="Days in a row you both sent a message (UTC days)">
      <Flame className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden="true" />
      {streak.count}{compact ? '' : `-day chat streak · ${text}`}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The list, invites and the invite form
// ---------------------------------------------------------------------------------------------------------------

function InviteForm() {
  const { partnerAction, toast } = useApp();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const msg = await partnerAction('invite', { email });
    if (msg) { setEmail(''); toast(typeof msg === 'string' ? msg : 'Invite sent.'); }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="rounded-3xl border border-oat bg-soft p-4" style={cardShadow}>
      <p className="flex items-center gap-2 text-sm font-extrabold text-charcoal"><UserPlus className="h-4 w-4 text-rust-dark" aria-hidden="true" />Invite a partner</p>
      <p className="mt-1 text-xs text-muted">They accept it when they sign in to AuraGoal with this email. Up to 5 partners.</p>
      <div className="mt-3 flex gap-2">
        <label className="sr-only" htmlFor="partnerEmail">Their email</label>
        <input id="partnerEmail" type="email" required maxLength={255} className="field !py-2" placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
        <button type="submit" disabled={busy} className="shrink-0 rounded-xl bg-rust px-4 text-sm font-extrabold text-white hover:bg-rust-dark disabled:opacity-60">Invite</button>
      </div>
    </form>
  );
}

function Invites() {
  const { partners: { incoming, outgoing }, partnerAction, toast } = useApp();
  if (!incoming.length && !outgoing.length) return null;
  return (
    <div className="grid gap-2">
      {incoming.map((i) => (
        <motion.div key={`i${i.id}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border-2 border-rust/40 bg-rust/5 p-3">
          <div className="flex items-center gap-3">
            <Avatar user={i.from} className="h-10 w-10 text-sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-charcoal">{i.from.display_name}</p>
              <p className="truncate text-xs text-muted">wants to be your accountability partner</p>
            </div>
          </div>
          <div className="mt-2.5 flex gap-2">
            <button type="button" onClick={async () => { const m = await partnerAction('accept', { id: i.id }); if (m) toast(typeof m === 'string' ? m : 'You are partners now.'); }}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rust py-2 text-xs font-extrabold text-white hover:bg-rust-dark"><Check className="h-3.5 w-3.5" aria-hidden="true" />Accept</button>
            <button type="button" onClick={() => partnerAction('decline', { id: i.id })} className="rounded-xl px-3 py-2 text-xs font-bold text-muted hover:bg-oat/60 hover:text-charcoal">Decline</button>
          </div>
        </motion.div>
      ))}
      {outgoing.map((o) => (
        <div key={`o${o.id}`} className="flex items-center gap-3 rounded-2xl border border-dashed border-blush bg-soft px-3 py-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-oat text-muted"><Send className="h-4 w-4" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-charcoal">{o.email}</span>
            <span className="block text-[11px] text-muted">Invite waiting for them</span>
          </span>
          <button type="button" onClick={() => partnerAction('decline', { id: o.id })} aria-label={`Cancel the invite to ${o.email}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-oat/60 hover:text-danger"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      ))}
    </div>
  );
}

function PartnerList({ selected, onSelect }) {
  const { partners: { partners } } = useApp();
  if (!partners.length) return null;
  return (
    <ul className="grid gap-1.5" aria-label="Your partners">
      {partners.map((p) => (
        <li key={p.id}>
          <button type="button" onClick={() => onSelect(p.id)} aria-current={selected === p.id ? 'true' : undefined}
            className={cn('flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors', selected === p.id ? 'border-rust bg-rust/10' : 'border-oat bg-soft hover:border-blush')}>
            <span className="relative">
              <Avatar user={p.partner} partner className="h-11 w-11 text-base" />
              {p.partner.streak_active_today && <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-success text-white ring-2 ring-soft" title="Active today"><Check className="h-2.5 w-2.5" strokeWidth={4} aria-hidden="true" /></span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-extrabold text-charcoal">{p.partner.display_name}</span>
                <ChatStreak streak={p.chat_streak} compact name="" />
              </span>
              <span className={cn('block truncate text-xs', p.unread ? 'font-bold text-charcoal' : 'text-muted')}>
                {p.last ? `${p.last.mine ? 'You: ' : ''}${p.last.kind === 'CHEER' ? `cheered ${p.last.body}` : p.last.kind === 'NUDGE' ? 'sent a nudge 👋' : p.last.kind === 'IMAGE' ? `📷 ${p.last.body || 'Photo'}` : p.last.kind === 'VIDEO' ? `🎬 ${p.last.body || 'Video'}` : p.last.body}` : 'Say hello 👋'}
              </span>
            </span>
            {p.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rust px-1.5 text-[11px] font-extrabold tabular-nums text-white" aria-label={`${p.unread} unread`}>{p.unread}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// One partner: scoreboard, chat, their goals and their day
// ---------------------------------------------------------------------------------------------------------------

function Scoreboard({ me, them, name }) {
  const max = Math.max(me, them, 1);
  const row = (label, n, lead, mine) => (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_2rem] items-center gap-2 text-xs">
      <span className="flex items-center gap-1 truncate font-bold text-charcoal">{lead && <Crown className="h-3.5 w-3.5 shrink-0 text-warning" aria-label="Leading" />}{label}</span>
      <Bar pct={Math.round((100 * n) / max)} height="h-2" fill={mine ? 'bg-rust' : 'bg-blush-dark'} label={`${label}: ${n} plans done this week`} />
      <span className="text-right font-extrabold tabular-nums text-charcoal">{n}</span>
    </div>
  );
  return (
    <div className="rounded-2xl border border-oat bg-ivory p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Plans done this week</p>
      <div className="grid gap-1.5">
        {row('You', me, me > them, true)}
        {row(name, them, them > me, false)}
      </div>
      <p className="mt-2 text-[11px] text-muted">{me === them ? (me ? 'Neck and neck. Keep pushing each other!' : 'A fresh week. Who finishes the first plan?') : me > them ? `You are ahead. Cheer ${name} on!` : `${name} is ahead. Time to catch up!`}</p>
    </div>
  );
}

const IMAGE_MAX = 10 * 1024 * 1024, VIDEO_MAX = 50 * 1024 * 1024;
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const fmtSize = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** A photo or video in the chat. Photos keep their shape while loading and open full screen when tapped. */
function MediaBubble({ m, mine, time, onOpen }) {
  const src = api.chatMediaUrl(m.media);
  const ratio = m.media.w && m.media.h ? `${m.media.w} / ${m.media.h}` : undefined;
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cn('my-1 flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[78%] overflow-hidden rounded-2xl', mine ? 'rounded-br-md bg-rust text-white' : 'rounded-bl-md bg-oat text-charcoal')}>
        {m.kind === 'IMAGE' ? (
          <button type="button" onClick={() => onOpen(m)} className="block" aria-label="Open the photo">
            <img src={src} alt={m.body || 'Photo'} loading="lazy" className="block max-h-80 w-full max-w-[18rem] bg-oat object-cover" style={{ aspectRatio: ratio }} />
          </button>
        ) : (
          <video src={src} controls playsInline preload="metadata" className="block max-h-80 w-full max-w-[18rem] bg-charcoal" aria-label={m.body || 'Video'} />
        )}
        <div className="px-3 py-1.5">
          {m.body && <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>}
          <p className={cn('text-right text-[10px]', mine ? 'text-white/75' : 'text-muted')}>{m.kind === 'VIDEO' ? '🎬 ' : ''}{time}</p>
        </div>
      </div>
    </motion.div>
  );
}

const dayKeyOf = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const dayHeading = (d) => {
  const t = new Date(), y = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1);
  if (dayKeyOf(d) === dayKeyOf(t)) return 'Today';
  if (dayKeyOf(d) === dayKeyOf(y)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
};

function Chat({ entry, onStreak }) {
  const { user, toast, refreshPartners } = useApp();
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [attachment, setAttachment] = useState(null);   // { file, url, kind } waiting to be sent
  const [progress, setProgress] = useState(null);       // 0..1 while a file uploads
  const [viewing, setViewing] = useState(null);         // a photo shown full screen
  const lastId = useRef(0);
  const scroller = useRef(null);
  const picker = useRef(null);
  const name = first(entry.partner.display_name);

  useEffect(() => () => { if (attachment) URL.revokeObjectURL(attachment.url); }, [attachment]);
  useEffect(() => {
    if (!viewing) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setViewing(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [viewing]);

  // Checked here first, so a too-big video is caught before it uploads (the server checks again)
  const pick = (file) => {
    if (!file) return;
    const kind = VIDEO_TYPES.includes(file.type) ? 'VIDEO' : IMAGE_TYPES.includes(file.type) ? 'IMAGE' : null;
    if (!kind) { toast('Send a photo (JPG, PNG, WebP, GIF) or a video (MP4, WebM, MOV).'); return; }
    if (file.size > (kind === 'VIDEO' ? VIDEO_MAX : IMAGE_MAX)) { toast(kind === 'VIDEO' ? 'That video is over 50 MB. Send a shorter clip.' : 'That photo is over 10 MB.'); return; }
    setAttachment({ file, url: URL.createObjectURL(file), kind });
  };
  const sendAttachment = async () => {
    setBusy(true); setProgress(0);
    try {
      const r = await api.sendMedia(entry.id, attachment.file, text.trim(), lastId.current, setProgress);
      merge(r.messages); onStreak(r.chat_streak);
      setAttachment(null); setText('');
      refreshPartners();
    } catch (e) { toast(e.message); }
    setBusy(false); setProgress(null);
  };

  const merge = useCallback((rows) => {
    if (!rows.length) return;
    lastId.current = Math.max(lastId.current, rows[rows.length - 1].id);
    setMessages((m) => { const seen = new Set((m ?? []).map((x) => x.id)); return [...(m ?? []), ...rows.filter((x) => !seen.has(x.id))]; });
  }, []);

  // Load, then check for new messages every few seconds while the chat is open
  useEffect(() => {
    let alive = true;
    lastId.current = 0;
    setMessages(null);
    const load = async () => {
      try {
        const r = await api.getMessages(entry.id, lastId.current);
        if (!alive) return;
        if (lastId.current === 0) setMessages([]);
        merge(r.messages); onStreak(r.chat_streak);
      } catch { /* try again on the next tick */ }
    };
    load().then(refreshPartners);
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [messages?.length]);

  const send = async (action, fields = {}) => {
    setBusy(true);
    try {
      const r = await api.sendMessage(entry.id, action, fields, lastId.current);
      merge(r.messages); onStreak(r.chat_streak);
      if (action === 'text') setText('');
      if (action === 'nudge') toast(`Nudged ${name} 👋`);
      refreshPartners();
    } catch (e) { toast(e.message); }
    setBusy(false);
  };

  let lastDay = '';
  return (
    <div className="flex min-h-0 flex-col">
      <div ref={scroller} className="h-[min(52vh,460px)] overflow-y-auto rounded-2xl border border-oat bg-ivory p-3" aria-live="polite" aria-label={`Chat with ${entry.partner.display_name}`}>
        {messages === null && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
        {messages?.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <div>
              <MessageCircle className="mx-auto h-8 w-8 text-blush" aria-hidden="true" />
              <p className="mt-2 text-sm font-bold text-charcoal">Say hello to {name}</p>
              <p className="text-xs text-muted">Chat, or share a photo or video of what you are doing, every day you both can to grow your chat streak.</p>
            </div>
          </div>
        )}
        {messages?.map((m) => {
          const d = new Date(m.at), mine = m.sender_id === user.id;
          const heading = dayKeyOf(d) !== lastDay ? dayHeading(d) : null;
          lastDay = dayKeyOf(d);
          const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
          return (
            <div key={m.id}>
              {heading && <p className="my-2 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{heading}</p>}
              {m.kind === 'IMAGE' || m.kind === 'VIDEO' ? (
                <MediaBubble m={m} mine={mine} time={time} onOpen={setViewing} />
              ) : m.kind === 'TEXT' ? (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cn('my-1 flex', mine ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', mine ? 'rounded-br-md bg-rust text-white' : 'rounded-bl-md bg-oat text-charcoal')}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={cn('mt-0.5 text-right text-[10px]', mine ? 'text-white/75' : 'text-muted')}>{time}</p>
                  </div>
                </motion.div>
              ) : (
                <motion.p initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="my-2 text-center">
                  <span className="inline-flex max-w-[90%] items-center gap-1.5 rounded-full bg-blush/25 px-3 py-1 text-xs font-semibold text-charcoal">
                    {m.kind === 'CHEER'
                      ? <><span className="text-base leading-none">{m.body}</span>{mine ? `You cheered ${name}` : `${name} cheered you`}{m.goal_title ? ` on “${m.goal_title}”` : ''}</>
                      : <><Hand className="h-3.5 w-3.5" aria-hidden="true" />{mine ? `You nudged ${name}` : `${name} nudged you: time to plan your day`}</>}
                    <span className="text-muted">· {time}</span>
                  </span>
                </motion.p>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Quick messages">
        {QUICK.map((q) => <button key={q} type="button" disabled={busy} onClick={() => send('text', { body: q })} className="shrink-0 rounded-full border border-oat bg-soft px-3 py-1.5 text-xs font-semibold text-charcoal hover:border-rust disabled:opacity-50">{q}</button>)}
      </div>
      {attachment && (
        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-rust/40 bg-soft p-2" aria-label="Ready to send">
          {attachment.kind === 'IMAGE'
            ? <img src={attachment.url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
            : <video src={attachment.url} muted className="h-16 w-16 shrink-0 rounded-xl bg-charcoal object-cover" />}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-bold text-charcoal">{attachment.kind === 'VIDEO' ? <Film className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />}{attachment.kind === 'VIDEO' ? 'Video' : 'Photo'} · {fmtSize(attachment.file.size)}</p>
            {progress !== null
              ? <Bar pct={Math.round(progress * 100)} height="h-1.5" className="mt-1.5" label="Uploading" />
              : <p className="text-xs text-muted">Add a caption below if you like, then send.</p>}
          </div>
          <button type="button" onClick={() => setAttachment(null)} disabled={busy} aria-label="Remove the attachment" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-oat/60 hover:text-danger"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      )}
      <form className="mt-1.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (attachment) sendAttachment(); else if (text.trim()) send('text', { body: text.trim() }); }}>
        <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        <button type="button" onClick={() => picker.current?.click()} disabled={busy} aria-label="Add a photo or video" title="Photo or video"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-oat bg-soft text-rust-dark hover:border-rust disabled:opacity-50"><ImagePlus className="h-5 w-5" aria-hidden="true" /></button>
        <label className="sr-only" htmlFor="chatInput">Message</label>
        <input id="chatInput" className="field !py-2.5" maxLength={1000} placeholder={attachment ? 'Add a caption…' : `Message ${name}…`} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} autoComplete="off" />
        <button type="button" onClick={() => send('nudge')} disabled={busy} title={`Nudge ${name} to plan their day (once every few hours)`} aria-label={`Nudge ${name}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-oat bg-soft text-rust-dark hover:border-rust disabled:opacity-50"><Hand className="h-5 w-5" aria-hidden="true" /></button>
        <button type="submit" disabled={busy || (!text.trim() && !attachment)} aria-label="Send" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rust text-white hover:bg-rust-dark disabled:opacity-50"><Send className="h-4 w-4" aria-hidden="true" /></button>
      </form>
      {viewing && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-charcoal/90 p-4" role="dialog" aria-modal="true" aria-label="Photo" onClick={() => setViewing(null)}>
          <img src={api.chatMediaUrl(viewing.media)} alt={viewing.body || 'Photo'} className="max-h-[85vh] max-w-full rounded-xl object-contain" />
          {viewing.body && <p className="mt-3 max-w-xl text-center text-sm text-white">{viewing.body}</p>}
          <button type="button" onClick={() => setViewing(null)} aria-label="Close" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
      )}
    </div>
  );
}

/** Which of my categories (and whether my day plans) this partner can see. Nothing is shared until I choose. */
function Sharing({ entry }) {
  const { categories, goals, partnerAction, toast } = useApp();
  const name = first(entry.partner.display_name);
  const [picked, setPicked] = useState(() => new Set(entry.my_shares.filter((c) => c !== 0)));
  const [dayPlans, setDayPlans] = useState(entry.my_shares.includes(0));
  const [busy, setBusy] = useState(false);
  const counts = (id) => goals.filter((g) => g.status === 'ACTIVE' && !g.is_private && (g.category_id ?? 9) === id).length;
  const toggle = (id) => setPicked((s0) => { const n = new Set(s0); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const dirty = [...picked].sort().join() !== entry.my_shares.filter((c) => c !== 0).sort().join() || dayPlans !== entry.my_shares.includes(0);
  const theirs = entry.their_shares;

  const save = async () => {
    setBusy(true);
    if (await partnerAction('share', { id: entry.id, categories: [...picked], day_plans: dayPlans })) {
      toast(picked.size || dayPlans ? `Saved. ${name} can see what you picked.` : `Saved. ${name} cannot see any of your goals or plans.`);
    }
    setBusy(false);
  };

  return (
    <div className="grid gap-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-charcoal"><Eye className="h-4 w-4 text-rust-dark" aria-hidden="true" />What {name} can see</h3>
        <p className="mt-0.5 text-xs text-muted">Pick the areas of your life to share with {name}. Everything else stays hidden, and so does any goal you mark private.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Categories ${name} can see`}>
          {categories.map((c) => {
            const on = picked.has(c.id), Icon = catIcon(c.name), n = counts(c.id);
            return (
              <button key={c.id} type="button" aria-pressed={on} onClick={() => toggle(c.id)}
                className={cn('inline-flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-sm font-bold transition-colors', on ? 'text-charcoal' : 'border-oat bg-soft text-muted hover:border-blush')}
                style={on ? { borderColor: c.color, background: `${c.color}22` } : undefined}>
                {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} style={{ color: c.color }} aria-hidden="true" /> : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
                {c.name}{n > 0 && <span className="text-[11px] font-semibold text-muted">{n}</span>}
              </button>
            );
          })}
        </div>
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-2xl border border-oat bg-ivory p-3">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#B85C38]" checked={dayPlans} onChange={(e) => setDayPlans(e.target.checked)} />
          <span><b className="text-sm text-charcoal">My day plans</b><span className="block text-xs text-muted">{name} sees what you planned for today and what you have ticked off (not plans you mark private).</span></span>
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={save} disabled={busy || !dirty} className="rounded-xl bg-rust px-5 py-2.5 text-sm font-extrabold text-white hover:bg-rust-dark disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={() => { setPicked(new Set(categories.map((c) => c.id))); setDayPlans(true); }} className="rounded-xl px-3 py-2.5 text-xs font-bold text-muted hover:bg-oat/60 hover:text-charcoal">Share everything</button>
          <button type="button" onClick={() => { setPicked(new Set()); setDayPlans(false); }} className="rounded-xl px-3 py-2.5 text-xs font-bold text-muted hover:bg-oat/60 hover:text-charcoal">Share nothing</button>
        </div>
      </div>
      <div className="rounded-2xl border border-oat bg-ivory p-3 text-xs text-muted">
        <b className="text-charcoal">{name} shares with you:</b>{' '}
        {theirs.length ? [...categories.filter((c) => theirs.includes(c.id)).map((c) => c.name), ...(theirs.includes(0) ? ['day plans'] : [])].join(', ') : 'nothing yet. They choose that on their side.'}
      </div>
    </div>
  );
}

function TheirGoals({ entry, view, onCheered }) {
  const { categories, toast } = useApp();
  const name = first(entry.partner.display_name);
  const [cheered, setCheered] = useState({});   // goal id -> emoji just sent
  if (!view.goals.length) return <p className="rounded-2xl border border-dashed border-blush bg-ivory p-6 text-center text-sm text-muted">{view.shares.some((c) => c !== 0) ? `${name} has no goals in the areas they share with you right now.` : `${name} has not shared any of their goals with you yet.`}</p>;
  const cheer = async (goal, emoji) => {
    try {
      const r = await api.sendMessage(entry.id, 'cheer', { emoji, goal_id: goal.id });
      setCheered((c) => ({ ...c, [goal.id]: emoji }));
      onCheered(r.chat_streak);
      toast(`Cheered ${name} ${emoji}`);
    } catch (e) { toast(e.message); }
  };
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {view.goals.map((g) => {
        const cat = g.category ?? categories.find((c) => c.id === g.category_id);   // their own category, with its name and colour
        const done = g.plans.filter((x) => x.done).length, pct = g.plans.length ? Math.round((100 * done) / g.plans.length) : 0;
        return (
          <article key={g.id} className="rounded-2xl border border-oat bg-soft p-4" style={cardShadow}>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cat?.color ?? '#B85C38' }} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{horizonOf(g.timeframe).label} goal · {periodLabel(g.timeframe, parseDay(g.due_date))}{cat ? ` · ${cat.name}` : ''}</p>
                <h4 className={cn('break-words text-base font-extrabold leading-snug', g.status === 'COMPLETED' ? 'text-success' : 'text-charcoal')}>{g.title}{g.status === 'COMPLETED' && ' ✓'}</h4>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2"><Bar pct={pct} height="h-2" className="flex-1" label={`${g.title} progress`} /><span className="text-xs font-bold tabular-nums text-muted">{done}/{g.plans.length}</span></div>
            {g.plans.length > 0 && (
              <ul className="mt-2 grid gap-1">
                {g.plans.map((x, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className={cn('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border-[1.5px]', x.done ? 'border-success bg-success' : 'border-charcoal/30')}>{x.done && <Check className="h-3 w-3 text-white" strokeWidth={4} aria-hidden="true" />}</span>
                    <span className={x.done ? 'text-muted line-through' : 'text-charcoal'}>{x.text}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-oat pt-2.5" role="group" aria-label={`Cheer ${name} on ${g.title}`}>
              <span className="mr-1 text-[11px] font-bold text-muted">{cheered[g.id] ? `You cheered ${cheered[g.id]}` : 'Cheer:'}</span>
              {CHEERS.map((e) => (
                <motion.button key={e} type="button" whileTap={{ scale: 1.4 }} onClick={() => cheer(g, e)} aria-label={`Cheer ${e}`}
                  className={cn('grid h-8 w-8 place-items-center rounded-full text-lg hover:bg-oat/70', cheered[g.id] === e && 'bg-rust/15')}>{e}</motion.button>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function TheirDay({ entry, view }) {
  const name = first(entry.partner.display_name);
  if (!view.today.length) return <p className="rounded-2xl border border-dashed border-blush bg-ivory p-6 text-center text-sm text-muted">{view.shares.includes(0) ? `${name} has no plans for today yet. A nudge might help 👋` : `${name} has not shared their day plans with you.`}</p>;
  const done = view.today.filter((x) => x.done).length;
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-charcoal">{done} of {view.today.length} done today</p>
      <ul className="grid gap-1.5">
        {view.today.map((x, i) => (
          <li key={i} className="flex items-center gap-3 rounded-xl border border-oat bg-ivory px-3 py-2.5">
            <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border-[1.5px]', x.done ? 'border-success bg-success' : 'border-charcoal/30')}>{x.done && <Check className="h-3.5 w-3.5 text-white" strokeWidth={4} aria-hidden="true" />}</span>
            <span className={cn('min-w-0 flex-1 truncate text-sm font-semibold', x.done ? 'text-muted line-through' : 'text-charcoal')}>{x.title}</span>
            <span className="shrink-0 text-xs font-bold tabular-nums text-muted">{x.start ? fmtSpan(x.start, x.minutes) : 'Any time'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PartnerPanel({ entry, onBack }) {
  const { partnerAction, toast } = useApp();
  const [tab, setTab] = useState(entry.my_shares.length ? 'chat' : 'sharing');
  const [view, setView] = useState(null);
  const [streak, setStreak] = useState(entry.chat_streak);
  const [armed, setArmed] = useState(false);
  const name = first(entry.partner.display_name);

  useEffect(() => {
    let alive = true;
    setView(null); setTab(entry.my_shares.length ? 'chat' : 'sharing'); setStreak(entry.chat_streak); setArmed(false);
    const load = () => api.getPartnerView(entry.id).then((v) => alive && setView(v)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs = [['chat', 'Chat', MessageCircle, 'Chat'], ['goals', 'Their goals', Target, 'Goals'], ['day', 'Their day', Sun, 'Day'], ['sharing', 'Sharing', Lock, 'Sharing']];
  return (
    <section className="min-w-0 rounded-3xl border border-oat bg-soft p-4 md:p-5" style={cardShadow} aria-label={`Partner ${entry.partner.display_name}`}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={onBack} aria-label="Back to partners" className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-oat/60 lg:hidden"><ArrowLeft className="h-5 w-5" aria-hidden="true" /></button>
        <Avatar user={entry.partner} partner className="h-14 w-14 text-xl" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-extrabold tracking-tight text-charcoal">{entry.partner.display_name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-oat px-2.5 py-1 text-xs font-bold text-charcoal" title={`${name}'s own planning streak`}>
              <Flame className="h-3.5 w-3.5 text-rust" aria-hidden="true" />{entry.partner.streak_count}-day streak{entry.partner.streak_active_today ? ' · active today' : ''}
            </span>
            <ChatStreak streak={streak} name={name} />
          </div>
        </div>
        <button type="button" onClick={async () => { if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 3000); return; } if (await partnerAction('remove', { id: entry.id })) { toast(`You and ${name} are no longer partners.`); onBack(); } }}
          className={cn('hidden shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold sm:inline-flex', armed ? 'bg-danger/10 text-danger' : 'text-muted hover:bg-oat/60 hover:text-danger')}>
          <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />{armed ? 'Tap again to remove' : 'Remove'}
        </button>
      </div>

      {view && <div className="mt-4"><Scoreboard me={view.scoreboard.me} them={view.scoreboard.them} name={name} /></div>}

      {!entry.my_shares.length && tab !== 'sharing' && (
        <button type="button" onClick={() => setTab('sharing')} className="mt-4 flex w-full items-center gap-2 rounded-2xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-left text-xs font-semibold text-charcoal hover:bg-warning/15">
          <Lock className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />You are not sharing anything with {name} yet. Choose what {name} can see.
        </button>
      )}
      <div className="mt-4 grid grid-cols-4 gap-1 rounded-2xl bg-oat/60 p-1" role="tablist" aria-label={`With ${name}`}>
        {tabs.map(([id, label, Icon, short]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn('flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1.5 py-2 text-xs font-extrabold transition-colors sm:text-sm', tab === id ? 'bg-rust text-white shadow-md' : 'text-charcoal hover:bg-soft/70')}>
            <Icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" /><span className="truncate sm:hidden">{short}</span><span className="hidden truncate sm:inline">{label}</span>
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === 'chat' && <Chat entry={entry} onStreak={setStreak} />}
        {(tab === 'goals' || tab === 'day') && !view && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
        {tab === 'goals' && view && <TheirGoals entry={entry} view={view} onCheered={setStreak} />}
        {tab === 'day' && view && <TheirDay entry={entry} view={view} />}
        {tab === 'sharing' && <Sharing key={entry.my_shares.join()} entry={entry} />}
      </div>
      <p className="mt-4 flex items-start gap-1.5 text-[11px] text-muted"><Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{name} only sees what you pick under Sharing, and never a goal or plan you mark private.</p>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export default function PartnersView() {
  const { partners: { partners }, refreshPartners } = useApp();
  const [selected, setSelected] = useState(null);
  useEffect(() => { refreshPartners(); }, [refreshPartners]);
  useEffect(() => { if (window.location.hash === '#partners') window.history.replaceState(null, '', window.location.pathname + window.location.search); }, []);
  // On wide screens the first partner opens straight away
  useEffect(() => {
    if (selected && !partners.some((p) => p.id === selected)) setSelected(null);
    if (!selected && partners.length && window.matchMedia('(min-width: 1024px)').matches) setSelected(partners[0].id);
  }, [partners, selected]);
  const entry = partners.find((p) => p.id === selected);

  if (!partners.length) {
    return (
      <div className="mx-auto grid max-w-3xl gap-5">
        <section className="relative overflow-hidden rounded-[28px] bg-rust p-6 text-white md:p-8" style={{ boxShadow: '0 18px 36px -20px rgba(154,73,41,.55)' }}>
          <Users className="h-10 w-10 text-white/90" aria-hidden="true" />
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight">Better together</h2>
          <p className="mt-1 max-w-lg text-sm text-white/85">Invite an accountability partner. You see each other's goals and plans, chat to keep each other going, cheer wins, nudge when one of you goes quiet, and race each other on a weekly scoreboard.</p>
          <ul className="mt-4 grid gap-1.5 text-sm text-white/90 sm:grid-cols-2">
            <li className="flex items-center gap-2"><Flame className="h-4 w-4" aria-hidden="true" />A chat streak for every day you both talk</li>
            <li className="flex items-center gap-2"><span aria-hidden="true">🔥</span>Cheers on each other's goals</li>
            <li className="flex items-center gap-2"><Hand className="h-4 w-4" aria-hidden="true" />Nudges that arrive as a notification</li>
            <li className="flex items-center gap-2"><Crown className="h-4 w-4" aria-hidden="true" />A weekly race of plans done</li>
          </ul>
        </section>
        <Invites />
        <InviteForm />
      </div>
    );
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className={cn('grid gap-4', entry && 'hidden lg:grid')} aria-label="Partners and invites">
        <PartnerList selected={selected} onSelect={setSelected} />
        <Invites />
        <InviteForm />
      </aside>
      {/* No exit animations or `layout` here: they would keep App's page transition from finishing */}
      {entry ? (
        <motion.div key={entry.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }} className="min-w-0">
          <PartnerPanel entry={entry} onBack={() => setSelected(null)} />
        </motion.div>
      ) : (
        <div className="hidden rounded-3xl border border-dashed border-blush bg-soft/60 p-10 text-center text-sm text-muted lg:block">Pick a partner to chat and see their goals.</div>
      )}
    </div>
  );
}
