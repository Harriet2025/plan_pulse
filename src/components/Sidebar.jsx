import { CalendarDays, ChevronRight, ClipboardList, LayoutDashboard, LifeBuoy, NotebookPen, Tags, BarChart3, Settings, LogOut, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar, Logo, cardShadow } from './ui';

// Each section has its own colour, so its icon is easy to tell apart at a glance
export const TAB_COLORS = {
  active: '#3B5BDB', planner: '#0F9488', partners: '#D6336C', journal: '#7048E8', calendar: '#1C7ED6',
  catchup: '#E8590C', categories: '#2F9E44', history: '#B8860B', settings: '#64748B',
};
/** The icon's colour and a soft tint of it behind, unless the tab is selected (then it is white on the primary). */
export const tabIconStyle = (id, selected) => (selected ? undefined : { color: TAB_COLORS[id], background: `${TAB_COLORS[id]}1F` });

export const TABS = [
  { id: 'active', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'planner', label: 'Planner', icon: ClipboardList },
  { id: 'partners', label: 'Partners', icon: Users },
  { id: 'journal', label: 'Journal', icon: NotebookPen },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'catchup', label: 'Catch up', icon: LifeBuoy },
  { id: 'categories', label: 'Categories', icon: Tags },
  { id: 'history', label: 'History & Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const { user, view, setView, signOut, slipped, unreadTotal } = useApp();

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
            <span className="tabicon grid h-9 w-9 place-items-center rounded-xl" style={tabIconStyle(id, view === id)}><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
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

      <button type="button" onClick={signOut} className="mt-auto flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold text-danger hover:bg-danger/10">
        <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />Sign out
      </button>
    </aside>
  );
}
