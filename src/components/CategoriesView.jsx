import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { catIcon } from '../lib/constants';
import { taskTotals } from '../lib/utils';
import { Bar, cardShadow } from './ui';

export default function CategoriesView() {
  const { categories, activeGoals, setActiveCat, setView } = useApp();
  return (
    <div>
      <p className="text-sm text-muted">Your active goals grouped by category. Pick one to see just those goals.</p>
      <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {categories.map((c, i) => {
          const gs = activeGoals.filter((g) => g.category_id === c.id);
          const { total, done, pct } = taskTotals(gs);
          const Icon = catIcon(c.name);
          return (
            <motion.button
              key={c.id} type="button" onClick={() => { setActiveCat(c.id); setView('active'); }}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} whileHover={{ y: -2 }}
              className="group relative overflow-hidden rounded-3xl border border-oat bg-soft p-5 text-left" style={cardShadow}
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-15" style={{ background: c.color }} />
              <div className="relative flex items-center justify-between gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl text-white" style={{ background: c.color }}><Icon className="h-6 w-6" aria-hidden="true" /></span>
                <ArrowUpRight className="h-5 w-5 shrink-0 text-muted/60 transition-colors group-hover:text-rust-dark" aria-hidden="true" />
              </div>
              <p className="relative mt-4 text-lg font-extrabold text-charcoal">{c.name}</p>
              <p className="relative text-sm text-muted"><span className="font-extrabold tabular-nums text-charcoal">{gs.length}</span> active goal{gs.length === 1 ? '' : 's'}</p>
              <Bar pct={pct} className="relative mt-4" fillStyle={{ background: c.color }} label={`${c.name} progress`} />
              <p className="relative mt-1.5 text-xs tabular-nums text-muted">{done}/{total} tasks &middot; {pct}%</p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
