import { CalendarDays, ChevronRight, LayoutDashboard, LifeBuoy, ListChecks, Tags, BarChart3, Settings, LogOut, Users, BookOpen } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cn } from '../lib/utils';
import { Avatar, Logo, cardShadow } from './ui';

export const TABS = [
  { id: 'active', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'planner', label: 'Planner', icon: ListChecks },
  { id: 'partners', label: 'Partners', icon: Users },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'catchup', label: 'Catch up', icon: LifeBuoy },
  { id: 'categories', label: 'Categories', icon: Tags },
  { id: 'history', label: 'History & Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const { user, view, setView, categories, activeGoals, activeCat, setActiveCat, signOut, slipped, unreadTotal } = useApp();

  return (
    <aside
      className="sticky top-4 m-4 mr-0 hidden h-[calc(100vh-2rem)] w-64 shrink-0 flex-col gap-5 overflow-y-auto rounded-[28px] border border-oat bg-soft p-4 md:flex lg:w-72"
      style={cardShadow} aria-label="Sidebar"
    >
      <div className="px-1 pt-1"><Logo /></div>

      <button type="button" onClick={() => setView('settings')} aria-label="Open your profile and settings"
        className="flex items-center gap-3 rounded-2xl border border-oat bg-ivory p-3 text-left transition-colors hover:border-blush">
        <Avatar user={user} className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-charcoal">{user.display_name}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      </button>

      <nav className="grid shrink-0 gap-1" role="tablist" aria-orientation="vertical" aria-label="Sections">
        <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">Menu</p>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
            className="tab flex items-center gap-3 rounded-2xl px-2.5 py-2 text-left text-sm font-bold">
            <span className="tabicon grid h-9 w-9 place-items-center rounded-xl bg-oat text-rust-dark"><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
            {label}
            {id === 'partners' && unreadTotal > 0 && (
              <span className="ml-auto rounded-full bg-rust px-2 py-0.5 text-[11px] font-extrabold tabular-nums text-white" aria-label={`${unreadTotal} new`}>{unreadTotal}</span>
            )}
            {id === 'catchup' && slipped.length > 0 && (
              <span className="ml-auto rounded-full bg-blush px-2 py-0.5 text-[11px] font-extrabold tabular-nums text-charcoal" aria-label={`${slipped.length} slipped`}>{slipped.length}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="shrink-0">
        <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">Categories</p>
        <div className="grid gap-0.5" role="group" aria-label="Quick category filter">
          {categories.map((c) => {
            const on = String(activeCat) === String(c.id);
            const n = activeGoals.filter((g) => g.category_id === c.id).length;
            return (
              <button key={c.id} type="button" aria-pressed={on}
                onClick={() => { setActiveCat(on ? 'all' : c.id); setView('active'); }} // click again to clear
                className={cn('flex items-center gap-3 rounded-xl px-3 py-1.5 text-left text-sm font-semibold transition-colors', on ? 'bg-oat/70 text-charcoal' : 'text-muted hover:bg-oat/40')}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color, boxShadow: on ? `0 0 0 3px ${c.color}33` : undefined }} />
                <span className="flex-1 truncate">{c.name}</span>
                {n > 0 && <span className="rounded-full bg-oat px-2 text-[11px] font-bold tabular-nums text-rust-dark">{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <button type="button" onClick={signOut} className="mt-auto flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold text-danger hover:bg-danger/10">
        <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />Sign out
      </button>
    </aside>
  );
}
