import { Target, ListChecks, BarChart3, LifeBuoy, Settings, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';

// Six fit on a phone: Categories is in the dashboard's filters, and the Calendar opens from the Planner
const ITEMS = [
  { id: 'active', label: 'Active', icon: Target },
  { id: 'planner', label: 'Planner', icon: ListChecks },
  { id: 'partners', label: 'Partners', icon: Users },
  { id: 'catchup', label: 'Catch up', icon: LifeBuoy },
  { id: 'history', label: 'History', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

// Phones only; the sidebar takes over from md up
export default function BottomNav() {
  const { view, setView, slipped, unreadTotal } = useApp();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 md:hidden" aria-label="Main">
      <div className="px-3" style={{ paddingBottom: 'calc(.5rem + env(safe-area-inset-bottom, 0px))' }}>
        <div className="grid grid-cols-6 gap-0.5 rounded-2xl border border-oat bg-soft p-1 backdrop-blur-md" role="tablist">
          {ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
              className="tab relative flex flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-[10px] font-bold">
              <Icon className="h-5 w-5" aria-hidden="true" />{label}
              {id === 'partners' && unreadTotal > 0 && (
                <span className="absolute right-1 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rust px-1 text-[9px] font-extrabold tabular-nums text-white" aria-label={`${unreadTotal} new`}>{unreadTotal}</span>
              )}
              {id === 'catchup' && slipped.length > 0 && (
                <span className="absolute right-1 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-blush px-1 text-[9px] font-extrabold tabular-nums text-charcoal" aria-label={`${slipped.length} slipped`}>{slipped.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
