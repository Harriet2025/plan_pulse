import { BellRing, CalendarClock, Clock, Calendar } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { daysLabel, fmtShort } from '../lib/utils';

function Row({ icon: Icon, tone, title, sub, onClick }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-oat/60">
        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-charcoal">{title}</span>
          <span className="block truncate text-xs text-muted">{sub}</span>
        </span>
      </button>
    </li>
  );
}
const Head = ({ children }) => <li className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{children}</li>;

export const useNotifCount = () => { const { notif } = useApp(); return notif.due.length + notif.urgent.length; };

/** Due reminders and approaching deadlines. Renders `empty` when there is nothing to show. */
export default function NotifList({ onPick, empty, className }) {
  const { notif: { due, soon, urgent, later }, openGoal } = useApp();
  if (!(due.length || soon.length || urgent.length || later.length)) return empty;
  const go = (id) => { onPick?.(); openGoal(id); };
  const amber = 'bg-warning/15 text-warning';
  const calm = 'bg-oat text-charcoal/80';

  return (
    <ul className={className}>
      {(due.length > 0 || urgent.length > 0) && <Head>Needs attention</Head>}
      {due.map((r) => <Row key={`d${r.sub_plan_id}`} icon={BellRing} tone={amber} title={r.task_description} sub={`${r.goal_title} · reminder ${fmtShort(new Date(r.remind_at))}`} onClick={() => go(r.goal_id)} />)}
      {urgent.map((d) => <Row key={`u${d.goal_id}`} icon={CalendarClock} tone={d.days_left < 0 ? 'bg-danger/15 text-danger' : amber} title={d.title} sub={daysLabel(d.days_left)} onClick={() => go(d.goal_id)} />)}
      {(soon.length > 0 || later.length > 0) && <Head>Coming up</Head>}
      {soon.map((r) => <Row key={`s${r.sub_plan_id}`} icon={Clock} tone={calm} title={r.task_description} sub={`${r.goal_title} · ${fmtShort(new Date(r.remind_at))}`} onClick={() => go(r.goal_id)} />)}
      {later.map((d) => <Row key={`l${d.goal_id}`} icon={Calendar} tone={calm} title={d.title} sub={daysLabel(d.days_left)} onClick={() => go(d.goal_id)} />)}
    </ul>
  );
}
