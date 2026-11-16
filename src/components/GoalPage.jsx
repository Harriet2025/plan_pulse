import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, BookHeart, CalendarClock, CalendarRange, ChevronRight, CircleDot, Clock3, Eye, Flag, Folder, Gauge, MessageCircle,
  MessageSquare, Pencil, Pin, PinOff, Plus, Send, SmilePlus, Trash2, UserRound, Users,
} from 'lucide-react';
import * as api from '../api';
import { useApp } from '../context/AppContext';
import { PRIORITY, TIERS } from '../lib/constants';
import { cn, dueInfo, fmtWhen, goalPeriodLabel, parseDay, periodLabel, progressOf } from '../lib/utils';
import BlockEditor from './BlockEditor';
import { logSummary } from './ProgressLog';
import { TaskItem } from './GoalCard';
import { sharedText } from './ShareWith';
import { TeamGoalForm, Tick } from './Together';
import { Avatar, Bar, TwoTapButton, cardShadow } from './ui';

// A goal opens into a page: its details at the top, then why it matters, the steps and free-form notes, with the
// goal's activity (and, for a shared goal, the discussion) alongside. Your own goal's page is private; a shared
// goal's page is edited by both partners.

const first = (name) => name.trim().split(/\s+/)[0];
const STATUS = { ACTIVE: ['Active', 'bg-rust/10 text-rust-dark'], COMPLETED: ['Completed', 'bg-success/15 text-success'], ARCHIVED: ['Archived', 'bg-oat text-muted'] };

// ---- Layout pieces shared by both pages ---------------------------------------------------------------------

function Shell({ crumbs, onBack, icon, title, actions, children }) {
  return (
    <article className="mx-auto max-w-6xl rounded-3xl border border-oat bg-soft" style={cardShadow}>
      <header className="border-b border-oat px-5 pb-5 pt-4 md:px-8 md:pt-5">
        <div className="flex items-center gap-2 text-xs text-muted">
          <button type="button" onClick={onBack} className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-semibold text-charcoal hover:bg-panel">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />Back
          </button>
          <nav aria-label="Where you are" className="flex min-w-0 items-center gap-1">
            {crumbs.map((c, i) => (
              <span key={c} className="flex min-w-0 items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-faint" aria-hidden="true" />}
                <span className={cn('truncate', i === crumbs.length - 1 && 'font-semibold text-charcoal')}>{c}</span>
              </span>
            ))}
          </nav>
        </div>
        <div className="mt-4 flex flex-wrap items-start gap-x-4 gap-y-3">
          {icon}
          <h1 className="min-w-[12rem] flex-1 break-words text-2xl font-extrabold leading-tight tracking-tight text-charcoal md:text-[2rem]">{title}</h1>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </header>
      {children}
    </article>
  );
}

/** The details, as a neat two-column list (label, value). */
function Properties({ rows }) {
  return (
    <dl className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 border-b border-oat px-5 py-5 md:grid-cols-[8.5rem_minmax(0,1fr)_8.5rem_minmax(0,1fr)] md:px-8">
      {rows.filter(Boolean).map(([Icon, label, value]) => (
        <div key={label} className="contents">
          <dt className="flex items-center gap-2 text-[13px] text-muted"><Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{label}</dt>
          <dd className="min-w-0 self-center text-[13px] font-semibold text-charcoal">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, aside, children, className }) {
  return (
    <section className={cn('py-5', className)} aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-muted">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const Pill = ({ className, children }) => <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-bold', className)}>{children}</span>;
const ActionButton = ({ icon: Icon, children, ...rest }) => (
  <button type="button" {...rest} className="inline-flex items-center gap-1.5 rounded-lg border border-oat bg-soft px-3 py-1.5 text-sm font-semibold text-charcoal hover:border-rust disabled:opacity-50">
    <Icon className="h-4 w-4 text-muted" aria-hidden="true" />{children}
  </button>
);

/** "Saving…", "Saved", or what went wrong. */
function SaveState({ state }) {
  const text = { saving: 'Saving…', saved: 'Saved', dirty: 'Editing…', error: 'Not saved. Retrying when you edit again.' }[state];
  if (!text) return null;
  return <span className={cn('text-xs', state === 'error' ? 'text-danger' : 'text-muted')} aria-live="polite">{text}</span>;
}

function NotReady() {
  return (
    <p className="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[13px] text-charcoal">
      Notes need a one-time database update before they can be saved. Everything else on this page works.
    </p>
  );
}

/** The notes pinned to the top of the page, so the important things are always in view. */
function Pinned({ blocks, onUnpin }) {
  const pinned = blocks.filter((b) => b.pinned && b.type !== 'divider' && (b.text.trim() || b.type === 'log'));
  if (!pinned.length) return null;
  const jump = (id) => {
    const el = document.getElementById(`blk-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.querySelector('textarea')?.focus({ preventScroll: true });
  };
  return (
    <section aria-label="Pinned" className="border-b border-oat px-5 py-4 md:px-8">
      <h2 className="mb-2.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-muted"><Pin className="h-3.5 w-3.5 rotate-45" aria-hidden="true" />Pinned</h2>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {pinned.map((b) => (
          <li key={b.id} className="group flex items-start gap-2 rounded-lg border border-oat bg-ivory px-3 py-2.5">
            <button type="button" onClick={() => jump(b.id)} className="min-w-0 flex-1 text-left" title="Show it in the notes">
              <span className={cn('line-clamp-3 break-words text-[13px] leading-5 text-charcoal', b.type === 'h' && 'font-bold', b.type === 'quote' && 'italic', b.type === 'todo' && b.done && 'text-muted line-through')}>
                {b.type === 'todo' ? (b.done ? '☑ ' : '☐ ') : ''}{b.type === 'log' ? logSummary(b) : b.text}
              </span>
            </button>
            <button type="button" onClick={() => onUnpin(b.id)} aria-label="Unpin" title="Unpin"
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-faint hover:bg-oat/60 hover:text-charcoal"><PinOff className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
    </section>
  );
}
const unpin = (blocks, id) => blocks.map((b) => (b.id === id ? { ...b, pinned: false } : b));

/** "Kwame is here", with a live green dot, while your partner has the page open. */
function Presence({ people, name, partner }) {
  if (!people.length) {
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-oat px-2.5 py-1 text-xs text-muted"><span className="h-2 w-2 rounded-full bg-faint/60" aria-hidden="true" />{name} is not here</span>;
  }
  const editing = people.some((p) => p.block);
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-success/40 bg-success/10 py-1 pl-1 pr-2.5 text-xs font-semibold text-charcoal" aria-live="polite">
      <span className="relative">
        {partner ? <Avatar user={partner} className="h-6 w-6 text-[10px]" /> : <span className="block h-6 w-6 rounded-full bg-oat" />}
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-soft bg-success" aria-hidden="true">
          <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
        </span>
      </span>
      {name} is {editing ? 'editing the notes' : 'here'}
    </span>
  );
}

/** The reactions under a comment, and a button to add one. */
function Reactions({ list = [], onToggle, disabled }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative mt-1 flex flex-wrap items-center gap-1">
      {list.map((r) => (
        <button key={r.emoji} type="button" disabled={disabled} onClick={() => onToggle(r.emoji)} aria-pressed={r.mine} title={r.mine ? 'Take your reaction back' : 'React too'}
          className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[12px] tabular-nums', r.mine ? 'border-rust/50 bg-rust/10 font-bold text-rust-dark' : 'border-oat bg-soft text-charcoal hover:border-rust')}>
          <span className="text-[13px] leading-none">{r.emoji}</span>{r.count}
        </button>
      ))}
      <button type="button" disabled={disabled} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Add a reaction" title="React"
        className="grid h-6 w-6 place-items-center rounded-full text-faint hover:bg-oat/60 hover:text-charcoal"><SmilePlus className="h-3.5 w-3.5" aria-hidden="true" /></button>
      {open && (
        <span className="absolute left-0 top-7 z-20 flex gap-0.5 rounded-full border border-oat bg-soft p-1 shadow-lg" role="group" aria-label="Reactions">
          {api.REACTIONS.map((e) => (
            <button key={e} type="button" onClick={() => { setOpen(false); onToggle(e); }} aria-label={`React with ${e}`}
              className="grid h-8 w-8 place-items-center rounded-full text-lg transition-transform hover:scale-125 hover:bg-panel">{e}</button>
          ))}
        </span>
      )}
    </div>
  );
}

/** A dated list of what happened. items: [{ at, text, icon, tone }] */
function Activity({ items }) {
  const [all, setAll] = useState(false);
  const sorted = [...items].filter((i) => i.at).sort((a, b) => new Date(b.at) - new Date(a.at));
  const shown = all ? sorted : sorted.slice(0, 10);
  if (!sorted.length) return <p className="text-[13px] text-muted">Nothing yet. Ticking a step or writing a note shows up here.</p>;
  return (
    <>
      <ol className="relative grid gap-4 border-l border-oat pl-5">
        {shown.map((i, n) => (
          <li key={`${i.at}-${n}`} className="relative">
            <span className={cn('absolute -left-[1.62rem] top-0.5 grid h-5 w-5 place-items-center rounded-full border border-oat bg-soft', i.tone)}>
              <i.icon className="h-3 w-3" aria-hidden="true" />
            </span>
            <p className="text-[13px] leading-snug text-charcoal">{i.text}</p>
            <p className="text-[11px] text-muted">{fmtWhen(i.at)}</p>
          </li>
        ))}
      </ol>
      {sorted.length > 10 && <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 text-xs font-semibold text-rust-dark hover:underline">{all ? 'Show less' : `Show all ${sorted.length}`}</button>}
    </>
  );
}

/** Saves after a short pause in typing, and once more when the page closes. */
function useAutosave(save, deps, state, setState) {
  const latest = useRef(save);
  latest.current = save;
  useEffect(() => {
    if (state !== 'dirty') return undefined;
    const t = setTimeout(() => latest.current(), 900);
    return () => clearTimeout(t);
  }, [state, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => () => { if (stateRef.current === 'dirty') latest.current(); }, []);
  return setState;
}

// ---- Your own goal --------------------------------------------------------------------------------------------

function OwnGoalPage({ id }) {
  const { goals, categories, partners, closeGoalPage, openGoalEditor, addTask, reviews, journal, openReflection, toast, view } = useApp();
  const g = goals.find((x) => x.id === id);
  const [page, setPage] = useState(null);
  const [notReady, setNotReady] = useState(false);
  const [state, setState] = useState('idle');
  const [newStep, setNewStep] = useState('');
  const pageRef = useRef(null);
  pageRef.current = page;

  useEffect(() => {
    let alive = true;
    api.getGoalPage(id)
      .then((p) => alive && setPage({ why: p.why ?? '', blocks: Array.isArray(p.blocks) ? p.blocks : [] }))
      .catch((e) => { if (!alive) return; setPage({ why: '', blocks: [] }); if (e.notReady) setNotReady(true); else toast(e.message); });
    return () => { alive = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (patch) => { setPage((p) => ({ ...p, ...patch })); setState('dirty'); };
  useAutosave(async () => {
    if (notReady || !pageRef.current) return;
    setState('saving');
    try { await api.saveGoalPage(id, pageRef.current); setState((s) => (s === 'saving' ? 'saved' : s)); }
    catch (e) { if (e.notReady) setNotReady(true); setState('error'); }
  }, [page], state, setState);

  if (!g) {
    return (
      <Shell crumbs={['Goals']} onBack={closeGoalPage} title="This goal is no longer here">
        <p className="px-5 py-8 text-sm text-muted md:px-8">It may have been deleted. Go back to see your goals.</p>
      </Shell>
    );
  }

  const cat = categories.find((c) => c.id === g.category_id);
  const pct = progressOf(g);
  const done = g.sub_plans.filter((t) => t.done).length;
  const due = dueInfo(g.due_date);
  const shared = g.shared_with.filter((pid) => partners.partners.some((p) => p.id === pid));
  const reflection = journal.find((e) => e.kind === 'GOAL' && e.goal_id === g.id);
  const badges = reviews.filter((r) => r.goal_id === g.id);
  const [statusText, statusCls] = STATUS[g.status] ?? STATUS.ACTIVE;
  const from = { active: 'Dashboard', planner: 'Planner', history: 'History', calendar: 'Calendar' }[view] ?? 'Goals';

  const activity = [
    { at: g.created_at, text: 'Goal created', icon: Flag, tone: 'text-muted' },
    ...g.sub_plans.filter((t) => t.done && t.doneAt).map((t) => ({ at: t.doneAt, text: `Finished “${t.text}”`, icon: CircleDot, tone: 'text-success' })),
    ...badges.map((b) => ({ at: b.reviewed_at, text: `${TIERS[b.tier]?.name ?? 'A'} badge earned at ${Math.round(b.pct)}%`, icon: Gauge, tone: 'text-warning' })),
    reflection && { at: reflection.created_at, text: 'Wrote a reflection', icon: BookHeart, tone: 'text-rust-dark' },
    g.completed_at && { at: g.completed_at, text: 'Goal completed', icon: Flag, tone: 'text-success' },
  ].filter(Boolean);

  const submitStep = async (e) => {
    e.preventDefault();
    const t = newStep.trim();
    if (t && await addTask(g.id, t)) setNewStep('');
  };

  return (
    <Shell
      crumbs={[from, goalPeriodLabel(g), g.title]} onBack={closeGoalPage} title={g.title}
      icon={<span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ background: cat?.color ?? 'rgb(var(--rust))' }} aria-hidden="true" />}
      actions={<ActionButton icon={Pencil} onClick={() => openGoalEditor(g)}>Edit details</ActionButton>}
    >
      <Properties rows={[
        [CircleDot, 'Status', <Pill className={statusCls}>{statusText}</Pill>],
        [CalendarRange, 'Period', goalPeriodLabel(g)],
        [CalendarClock, 'Due', g.due_date ? <span>{parseDay(g.due_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} <span className={cn('font-normal', due.cls)}>· {due.text}</span></span> : 'No due date'],
        [Folder, 'Category', cat ? <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: cat.color }} />{cat.name}</span> : 'None'],
        [Flag, 'Priority', PRIORITY[g.priority]?.label ?? g.priority],
        [Gauge, 'Progress', <span className="flex items-center gap-3"><Bar pct={pct} height="h-1.5" className="max-w-[10rem] flex-1" label={`Progress for ${g.title}`} /><span className="tabular-nums">{done} of {g.sub_plans.length} steps</span></span>],
        [Eye, 'Visible to', shared.length ? sharedText(shared, partners.partners) : 'Only you'],
        [Clock3, 'Created', fmtWhen(g.created_at)],
      ]} />
      {page && <Pinned blocks={page.blocks} onUnpin={(bid) => edit({ blocks: unpin(page.blocks, bid) })} />}

      <div className="grid gap-x-10 px-5 md:px-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 divide-y divide-oat">
          <Section title="Why it matters" aside={<SaveState state={state} />}>
            <textarea value={page?.why ?? ''} disabled={!page || notReady} onChange={(e) => edit({ why: e.target.value })} maxLength={2000} rows={3}
              placeholder="What will reaching this goal change for you? You will see this when it gets hard."
              className="w-full resize-none rounded-lg border border-transparent bg-transparent px-0 text-[15px] leading-7 text-charcoal outline-none placeholder:text-faint focus:border-oat focus:bg-ivory focus:px-3 focus:py-2" />
            {g.quote && <p className="mt-2 border-l-[3px] border-charcoal/50 pl-3 text-sm italic text-muted">“{g.quote}”</p>}
          </Section>

          <Section title={`Steps · ${done}/${g.sub_plans.length}`}>
            {g.sub_plans.length > 0 && <ul className="-mx-2 grid gap-0.5 [&_.ttext]:flex-initial">{g.sub_plans.map((t) => <TaskItem key={t.id} goal={g} task={t} />)}</ul>}
            <form onSubmit={submitStep} className="mt-2 flex items-center gap-2">
              <label htmlFor="pgStep" className="sr-only">Add a step</label>
              <Plus className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
              <input id="pgStep" value={newStep} onChange={(e) => setNewStep(e.target.value)} maxLength={500} placeholder="Add a step"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] text-charcoal outline-none placeholder:text-faint" />
              {newStep.trim() && <button type="submit" className="rounded-lg bg-rust px-3 py-1.5 text-sm font-bold text-white">Add</button>}
            </form>
          </Section>

          <Section title="Notes">
            {notReady && <NotReady />}
            {page ? <BlockEditor blocks={page.blocks} readOnly={notReady} onChange={(blocks) => edit({ blocks })} label={`Notes for ${g.title}`} />
              : <p className="text-sm text-muted">Loading…</p>}
          </Section>
        </div>

        <aside className="min-w-0 border-t border-oat lg:border-l lg:border-t-0 lg:pl-8">
          {g.status === 'COMPLETED' && (
            <Section title="Reflection">
              <p className="text-[13px] text-charcoal">{reflection ? 'You wrote a reflection on this goal.' : 'How did it go? Capture it while it is fresh.'}</p>
              <button type="button" onClick={() => openReflection(g.id)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-rust-dark hover:underline">
                <BookHeart className="h-4 w-4" aria-hidden="true" />{reflection ? 'Read your reflection' : 'Write a reflection'}
              </button>
            </Section>
          )}
          <Section title="Activity"><Activity items={activity} /></Section>
        </aside>
      </div>
    </Shell>
  );
}

// ---- A shared goal --------------------------------------------------------------------------------------------

function TeamGoalPage({ id, pid }) {
  const { partners, user, markTeamPlan, closeGoalPage, toast, openPartner, refreshShared } = useApp();
  const entry = partners.partners.find((p) => p.id === pid);
  const name = entry ? first(entry.partner.display_name) : 'Your partner';
  const [data, setData] = useState(null);
  const [notReady, setNotReady] = useState(false);
  const [blocks, setBlocks] = useState([]);
  const [state, setState] = useState('idle');
  const [conflict, setConflict] = useState(null);     // your version, kept when your partner saved first
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [comment, setComment] = useState('');
  const [about, setAbout] = useState('');
  const [posting, setPosting] = useState(false);
  const [people, setPeople] = useState([]);           // who else has this page open right now
  const live = useRef(null);
  const notesAt = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const load = useCallback(async () => {
    try {
      const d = await api.getTeamGoalPage(id);
      setData(d);
      if (stateRef.current === 'idle' || stateRef.current === 'saved') { setBlocks(Array.isArray(d.notes.blocks) ? d.notes.blocks : []); notesAt.current = d.notes.updated_at; }
    } catch (e) {
      if (!e.notReady) { toast(e.message); return; }
      setNotReady(true);
      // Without the page tables, still show the goal itself from the partner view
      const t = await api.getTogether(pid).catch(() => null);
      const goal = t?.goals.find((x) => x.id === id);
      if (goal) setData({ goal, comments: [], activity: [], notes: { blocks: [] } });
    }
  }, [id, pid, toast]);

  useEffect(() => {
    load();
    const t = setInterval(load, 12000);   // your partner's ticks, notes and comments show up while you look
    return () => clearInterval(t);
  }, [load]);

  // Live: who else is here, which block they are in, and an instant refresh when they change something
  useEffect(() => {
    const ch = api.liveTeamGoal(id, { id: user.id, name: first(user.display_name) }, { onPeople: setPeople, onChange: () => load() });
    live.current = ch;
    return () => { ch.leave(); live.current = null; };
  }, [id, user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useAutosave(async () => {
    if (notReady) return;
    setState('saving');
    try {
      const mine = blocksRef.current;
      const r = await api.saveTeamPage(id, mine, notesAt.current);
      if (r.conflict) {
        setConflict(mine);
        setBlocks(r.blocks); notesAt.current = r.updated_at; setState('idle');
        toast(`${name} just edited these notes. Their version is shown; yours is kept below.`);
        return;
      }
      notesAt.current = r.updated_at;
      live.current?.changed('notes');
      setState((s) => (s === 'saving' ? 'saved' : s));
    } catch (e) { if (e.notReady) setNotReady(true); setState('error'); }
  }, [blocks], state, setState);

  if (!data) {
    return <Shell crumbs={['Partners', name]} onBack={closeGoalPage} title="Loading…"><p className="px-5 py-8 text-sm text-muted md:px-8">Loading the shared goal…</p></Shell>;
  }

  const goal = data.goal;
  const archived = goal.status === 'ARCHIVED';
  const total = goal.plans.length, done = goal.plans.filter((p) => p.done).length;
  const minePlans = goal.plans.filter((p) => p.who !== 'THEM');
  const mineDone = minePlans.filter((p) => (p.who === 'TOGETHER' ? p.done : p.me_done || p.done)).length;
  const pct = total ? Math.round((100 * done) / total) : 0;
  const due = dueInfo(goal.due_date);
  const [statusText, statusCls] = STATUS[goal.status] ?? STATUS.ACTIVE;
  const whoText = (p) => ({ TOGETHER: 'Together', EACH: 'Each of us', ME: 'You', THEM: name }[p.who]);
  const planText = (planId) => goal.plans.find((p) => p.id === planId)?.text;
  const countFor = (planId) => data.comments.filter((c) => c.plan_id === planId).length;

  const tick = async (plan, want) => {
    setBusy(plan.id);
    const r = await markTeamPlan(plan.id, want);
    if (r) { await load(); refreshShared(); live.current?.changed('steps'); }
    setBusy(null);
  };
  const post = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setPosting(true);
    try { const r = await api.addTeamComment(id, comment.trim(), about ? Number(about) : null); setData(r); setComment(''); setAbout(''); live.current?.changed('comments'); }
    catch (ex) { toast(ex.message); }
    setPosting(false);
  };
  const removeComment = async (cid) => { try { setData(await api.deleteTeamComment(cid)); live.current?.changed('comments'); } catch (ex) { toast(ex.message); } };
  const react = async (cid, emoji) => {
    try { setData(await api.reactToComment(cid, emoji)); live.current?.changed('comments'); }
    catch (ex) { toast(ex.notReady ? 'Reactions need a one-time database update first.' : ex.message); }
  };
  const editingBy = Object.fromEntries(people.filter((p) => p.block).map((p) => [p.block, p.name || name]));

  const activity = [
    { at: goal.created_at, text: `${goal.started_by_me ? 'You' : name} started this shared goal`, icon: Flag, tone: 'text-muted' },
    ...data.activity.map((a) => ({ at: a.at, text: `${a.mine ? 'You' : name} ticked “${a.text}”`, icon: CircleDot, tone: a.mine ? 'text-success' : 'text-rust-dark' })),
    goal.completed_at && { at: goal.completed_at, text: 'Completed together', icon: Flag, tone: 'text-success' },
    data.notes?.updated_at && { at: data.notes.updated_at, text: `${data.notes.updated_by_me ? 'You' : name} edited the notes`, icon: Pencil, tone: 'text-muted' },
  ].filter(Boolean);

  return (
    <Shell
      crumbs={['Partners', name, 'Shared goals']} onBack={closeGoalPage} title={goal.title}
      icon={<span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-oat bg-ivory text-2xl" aria-hidden="true">{goal.emoji}</span>}
      actions={<>
        <Presence people={people} name={name} partner={entry?.partner} />
        {!archived && entry && <ActionButton icon={Pencil} onClick={() => setEditing((v) => !v)} aria-expanded={editing}>Edit goal</ActionButton>}
        <ActionButton icon={MessageCircle} onClick={() => openPartner(pid, 'chat')}>Chat</ActionButton>
      </>}
    >
      {editing && entry && (
        <div className="border-b border-oat px-5 py-5 md:px-8">
          <TeamGoalForm entry={entry} goal={goal} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); refreshShared(); }} />
        </div>
      )}

      <Properties rows={[
        [Users, 'Partners', <span className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><Avatar user={user} className="h-5 w-5 text-[10px]" />You</span>
          {entry && <span className="inline-flex items-center gap-1.5"><span className="relative"><Avatar user={entry.partner} className="h-5 w-5 text-[10px]" />{people.length > 0 && <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-soft bg-success" aria-label="here now" />}</span>{name}</span>}
        </span>],
        [CircleDot, 'Status', <Pill className={statusCls}>{statusText}</Pill>],
        [CalendarRange, 'Period', periodLabel(goal.timeframe, parseDay(goal.due_date))],
        [CalendarClock, 'Ends', <span>{parseDay(goal.due_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} <span className={cn('font-normal', due.cls)}>· {due.text}</span></span>],
        [Gauge, 'Progress', <span className="flex items-center gap-3"><Bar pct={pct} height="h-1.5" className="max-w-[10rem] flex-1" label={`${goal.title}: ${pct}%`} /><span className="tabular-nums">{done} of {total} steps</span></span>],
        [UserRound, 'Your part', <span className="tabular-nums">{mineDone} of {minePlans.length} done</span>],
      ]} />
      <Pinned blocks={blocks} onUnpin={(bid) => { setBlocks(unpin(blocks, bid)); setState('dirty'); }} />

      <div className="grid gap-x-10 px-5 md:px-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 divide-y divide-oat">
          <Section title="Why we're doing this">
            <p className={cn('text-[15px] leading-7', goal.why ? 'text-charcoal' : 'text-faint')}>{goal.why || 'No reason written yet. Add one with Edit goal.'}</p>
          </Section>

          <Section title={`Steps · ${done}/${total}`}>
            {total === 0 ? <p className="text-[13px] text-muted">No steps yet. Add them with Edit goal.</p> : (
              <ul className="grid gap-1">
                {goal.plans.map((p) => {
                  const n = countFor(p.id);
                  return (
                    <li key={p.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-panel/70">
                      <span className="mt-0.5">
                        {p.who === 'EACH' ? (
                          <span className="flex items-center gap-1">
                            <Tick small on={p.me_done} busy={busy === p.id} label={`Your part: ${p.text}`} onClick={archived ? undefined : () => tick(p, !p.me_done)} />
                            <Tick small on={p.them_done} label={`${name}'s part`} />
                          </span>
                        ) : <Tick small on={p.done} busy={busy === p.id} label={p.text} onClick={p.who !== 'THEM' && !archived ? () => tick(p, !p.done) : undefined} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block break-words text-[15px] leading-6', p.done ? 'text-muted line-through' : 'text-charcoal')}>{p.text}</span>
                        <span className="text-[12px] text-muted">{whoText(p)}{p.who === 'EACH' && !p.done && (p.me_done ? ` · waiting for ${name}` : p.them_done ? ` · ${name} has done theirs` : '')}</span>
                      </span>
                      {!notReady && (
                        <button type="button" onClick={() => { setAbout(String(p.id)); document.getElementById('cmt')?.focus(); }} title="Discuss this step"
                          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-muted hover:bg-oat/60 hover:text-charcoal">
                          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />{n > 0 ? n : <span className="sr-only">Discuss</span>}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title="Shared notes" aside={<span className="flex items-center gap-3"><SaveState state={state} />{!notReady && <span className="hidden text-xs text-muted sm:inline">Both of you can edit</span>}</span>}>
            {notReady && <NotReady />}
            {conflict && (
              <div className="mb-4 rounded-lg border border-oat bg-panel p-3">
                <p className="text-[13px] font-semibold text-charcoal">{name} saved changes while you were writing. Their version is above; this was yours:</p>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md bg-soft p-2 text-[13px] text-charcoal">
                  {conflict.filter((b) => b.text).map((b) => <p key={b.id} className="whitespace-pre-wrap">{b.type === 'todo' ? (b.done ? '☑ ' : '☐ ') : b.type === 'bullet' ? '• ' : ''}{b.text}</p>)}
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => { setBlocks(conflict); setConflict(null); setState('dirty'); }} className="rounded-lg bg-rust px-3 py-1.5 text-sm font-bold text-white">Use mine instead</button>
                  <button type="button" onClick={() => setConflict(null)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:bg-oat/60">Keep theirs</button>
                </div>
              </div>
            )}
            <BlockEditor blocks={blocks} readOnly={notReady} onChange={(b) => { setBlocks(b); setState('dirty'); }} label={`Shared notes for ${goal.title}`}
              others={editingBy} onFocusBlock={(bid) => live.current?.focus(bid)} />
          </Section>
        </div>

        <aside className="min-w-0 border-t border-oat lg:border-l lg:border-t-0 lg:pl-8">
          <Section title={`Discussion${data.comments.length ? ` · ${data.comments.length}` : ''}`}>
            {notReady ? <p className="text-[13px] text-muted">The discussion needs the same one-time update as notes.</p> : (
              <>
                {data.comments.length === 0 && <p className="mb-3 text-[13px] text-muted">Agree who does what, share a link, or ask how it is going.</p>}
                <ul className="grid gap-3">
                  {data.comments.map((c) => (
                    <li key={c.id} className="flex gap-2.5">
                      <Avatar user={c.mine ? user : (entry?.partner ?? { display_name: name })} className="mt-0.5 h-7 w-7 text-xs" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] text-muted"><span className="font-semibold text-charcoal">{c.mine ? 'You' : name}</span> · {fmtWhen(c.at)}</p>
                        {c.plan_id && planText(c.plan_id) && <p className="mt-0.5 truncate text-[12px] text-muted">On “{planText(c.plan_id)}”</p>}
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-[14px] leading-6 text-charcoal">{c.body}</p>
                        <Reactions list={c.reactions} onToggle={(e) => react(c.id, e)} />
                        {c.mine && <TwoTapButton onConfirm={() => removeComment(c.id)} icon={Trash2} label="Delete this comment" confirmText="Delete?" className="mt-0.5 rounded px-1 py-0.5 text-[11px] text-muted hover:text-danger" armedClassName="text-danger" />}
                      </div>
                    </li>
                  ))}
                </ul>
                <form onSubmit={post} className="mt-4 rounded-xl border border-oat bg-ivory p-2 focus-within:border-rust">
                  <label htmlFor="cmt" className="sr-only">Write a comment</label>
                  <textarea id="cmt" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={2} placeholder={`Write to ${name}…`}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(e); }}
                    className="w-full resize-none bg-transparent px-1 text-[14px] leading-6 text-charcoal outline-none placeholder:text-faint" />
                  <div className="flex items-center gap-2">
                    <label htmlFor="cmtAbout" className="sr-only">About</label>
                    <select id="cmtAbout" value={about} onChange={(e) => setAbout(e.target.value)} className="min-w-0 flex-1 truncate rounded-md border border-oat bg-soft px-1.5 py-1 text-[12px] text-charcoal">
                      <option value="">The whole goal</option>
                      {goal.plans.map((p) => <option key={p.id} value={p.id}>{p.text.length > 40 ? `${p.text.slice(0, 40)}…` : p.text}</option>)}
                    </select>
                    <button type="submit" disabled={posting || !comment.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-rust px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50">
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />Post
                    </button>
                  </div>
                </form>
              </>
            )}
          </Section>
          <Section title="Activity" className="border-t border-oat"><Activity items={activity} /></Section>
        </aside>
      </div>
    </Shell>
  );
}

export default function GoalPage() {
  const { goalPage } = useApp();
  if (!goalPage) return null;
  return goalPage.kind === 'team'
    ? <TeamGoalPage key={`t${goalPage.id}`} id={goalPage.id} pid={goalPage.pid} />
    : <OwnGoalPage key={`g${goalPage.id}`} id={goalPage.id} />;
}

