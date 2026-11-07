import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Flame, Moon, MoonStar, Snowflake, Sun, Trophy, Bell, Volume2, VolumeX, Plus, Compass } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../lib/theme';
import NotifList, { useNotifCount } from './NotifList';
import { cardShadow } from './ui';

const TITLES = { active: 'Dashboard', planner: 'Planner', partners: 'Partners', journal: 'Journal', calendar: 'Calendar', catchup: 'Catch up', categories: 'Categories', history: 'History & Analytics', settings: 'Settings' };
const iconBtn = 'relative grid h-10 w-10 place-items-center rounded-xl border border-oat bg-soft text-charcoal hover:border-rust';

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const count = useNotifCount();
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const askPermission = async () => {
    try { setPerm(await Notification.requestPermission()); } catch { /* ignore */ }
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" className={iconBtn} aria-label="Notifications" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Bell className="h-4 w-4" aria-hidden="true" />
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-extrabold tabular-nums text-on-status">{count > 9 ? '9+' : count}</span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }} transition={{ duration: 0.15 }}
            className="fixed inset-x-4 top-16 z-40 rounded-2xl border border-oat bg-soft shadow-2xl backdrop-blur-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96"
          >
            <div className="flex items-center justify-between gap-3 border-b border-oat px-4 py-3">
              <h2 className="text-sm font-extrabold text-charcoal">Notifications</h2>
              {perm === 'default' && (
                <button type="button" onClick={askPermission} className="rounded-lg border border-oat bg-oat px-2.5 py-1 text-xs font-bold text-charcoal hover:border-rust">Turn on desktop alerts</button>
              )}
              {(perm === 'granted' || perm === 'denied') && <span className="text-xs text-muted">{perm === 'granted' ? 'Desktop alerts on' : 'Desktop alerts blocked'}</span>}
            </div>
            <NotifList
              className="grid max-h-[26rem] gap-1 overflow-y-auto overflow-x-hidden p-2" onPick={() => setOpen(false)}
              empty={<p className="px-4 py-8 text-center text-sm text-muted">You're all caught up. Give a day plan a time and you get a reminder when it starts.</p>}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ icon: Icon, value, label, tone, title, badge, className = '' }) {
  return (
    <div className={`flex items-center gap-1 rounded-2xl border py-1.5 pl-2 pr-2.5 md:gap-2 md:pl-2.5 md:pr-3 ${tone.box} ${className}`} title={title ?? label}>
      <Icon className={`h-5 w-5 ${tone.icon}`} aria-hidden="true" />
      <div className="leading-none">
        <div className="flex items-center gap-1.5">
          <motion.div key={value} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className={`text-base font-extrabold tabular-nums ${tone.value}`}>{value}</motion.div>
          {badge}
        </div>
        <div className={`mt-0.5 hidden text-[9px] font-bold uppercase tracking-wider md:block ${tone.label}`}>{label}</div>
      </div>
    </div>
  );
}

// On phones one slim row, so the page gets the screen. Sound and sign out are in Settings there, and search sits with the goals.
export default function TopBar() {
  const { view, user, rewardsTotal, search, setSearch, prio, setPrio, soundOn, setSoundOn, openGoalModal, openNext } = useApp();
  const theme = useTheme();
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <header className="sticky top-2 z-20 mx-3 mt-2 rounded-2xl border border-oat bg-soft/95 px-3 py-2 backdrop-blur-xl md:top-4 md:mx-6 md:mt-4 md:px-5 md:py-3" style={cardShadow}>
      <div className="flex items-center gap-x-2 gap-y-3 md:flex-wrap md:gap-x-4">
        <div className="min-w-0 flex-1 md:basis-48">
          <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted md:text-[11px] md:tracking-[0.18em]">{today}</p>
          <h1 className="truncate text-lg font-extrabold tracking-tight text-charcoal md:text-2xl">{view === 'active' ? 'Active Goals' : TITLES[view]}</h1>
        </div>

        {view === 'active' && (
          <div className="order-last hidden w-full flex-wrap items-center gap-2 md:flex lg:order-none lg:w-auto lg:flex-nowrap">
            <div className="relative min-w-0 flex-1 lg:w-44 lg:flex-none 2xl:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <label htmlFor="search" className="sr-only">Search goals and tasks</label>
              <input id="search" type="search" className="field !pl-9" placeholder="Search goals and tasks" autoComplete="off" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="shrink-0">
              <label htmlFor="prioFilter" className="sr-only">Filter by priority</label>
              <select id="prioFilter" className="field !w-auto" value={prio} onChange={(e) => setPrio(e.target.value)}>
                <option value="all">All priorities</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1.5 md:flex-wrap md:gap-2">
          <Stat
            icon={user.rest_today && !user.streak_active_today ? Moon : Flame} value={user.streak_count}
            label={user.rest_today && !user.streak_active_today ? 'Rest day' : 'Streak'}
            title={`${user.streak_count}-day streak. Best: ${user.best_streak}. Streak freezes: ${user.streak_freezes}.${user.rest_today ? ' Today is a rest day, so your streak is safe.' : ''}`}
            badge={user.streak_freezes > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blush/50 px-1.5 py-0.5 text-[10px] font-extrabold text-charcoal"><Snowflake className="h-2.5 w-2.5" aria-hidden="true" />{user.streak_freezes}</span>
            )}
            tone={{ box: 'border-rust/30 bg-rust/10', icon: 'text-rust', value: 'text-charcoal', label: 'text-rust-dark' }} />
          <Stat icon={Trophy} value={rewardsTotal} label="Rewards" className="max-md:hidden" tone={{ box: 'border-blush/60 bg-blush/20', icon: 'text-blush-dark', value: 'text-charcoal', label: 'text-muted' }} />
          <button type="button" onClick={openNext} aria-label="What should I do now?" title="What should I do now?" className={`${iconBtn} max-md:hidden`}><Compass className="h-4 w-4" aria-hidden="true" /></button>
          <NotificationBell />
          <button type="button" className={iconBtn} onClick={theme.toggle}
            aria-label={theme.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme.theme === 'dark' ? 'Light mode' : 'Dark mode'}>
            {theme.theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden="true" /> : <MoonStar className="h-4 w-4" aria-hidden="true" />}
          </button>
          <button type="button" className={`${iconBtn} max-md:hidden`} aria-label={soundOn ? 'Sound on' : 'Sound off'} aria-pressed={soundOn} onClick={() => setSoundOn(!soundOn)}>
            {soundOn ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
          </button>
          <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={() => openGoalModal()} aria-label="New goal"
            className="fab inline-flex h-10 items-center gap-2 rounded-xl bg-rust px-2.5 text-sm font-extrabold text-white sm:px-4">
            <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" /><span className="hidden sm:inline">New Goal</span>
          </motion.button>
        </div>
      </div>
    </header>
  );
}
