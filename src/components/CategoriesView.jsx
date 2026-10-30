import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { catIcon } from '../lib/constants';
import { taskTotals } from '../lib/utils';
import CategoryForm from './CategoryForm';
import { Bar, TwoTapButton, cardShadow } from './ui';

function CategoryCard({ c, i }) {
  const { activeGoals, setActiveCat, setView, updateCategory, deleteCategory } = useApp();
  const [editing, setEditing] = useState(false);
  const gs = activeGoals.filter((g) => g.category_id === c.id);
  const { total, done, pct } = taskTotals(gs);
  const Icon = c.personal ? Tag : catIcon(c.name);

  if (editing) {
    return (
      <div className="rounded-3xl border border-oat bg-soft p-3" style={cardShadow}>
        <CategoryForm initial={c} saveLabel="Save" onCancel={() => setEditing(false)}
          onSave={async (name, color) => { if (await updateCategory(c.id, { name, color })) setEditing(false); }} />
      </div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
      className="group relative overflow-hidden rounded-3xl border border-oat bg-soft p-5" style={cardShadow}>
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-15" style={{ background: c.color }} />
      <div className="relative flex items-center justify-between gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl text-white" style={{ background: c.color }}><Icon className="h-6 w-6" aria-hidden="true" /></span>
        {c.personal && (
          <span className="flex gap-1">
            <button type="button" onClick={() => setEditing(true)} aria-label={`Rename or recolour ${c.name}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-oat/60 hover:text-charcoal"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
            <TwoTapButton onConfirm={() => deleteCategory(c.id)} icon={Trash2} label={`Delete ${c.name} (its goals move to Others)`} confirmText="Delete?" className="rounded-lg px-2 text-xs font-bold text-muted hover:bg-danger/10 hover:text-danger" />
          </span>
        )}
      </div>
      <button type="button" onClick={() => { setActiveCat(c.id); setView('active'); }} className="relative mt-4 block w-full text-left">
        <span className="flex items-center gap-2 text-lg font-extrabold text-charcoal">{c.name}<ArrowUpRight className="h-4 w-4 text-muted/60 group-hover:text-rust-dark" aria-hidden="true" /></span>
        <span className="block text-sm text-muted"><span className="font-extrabold tabular-nums text-charcoal">{gs.length}</span> active goal{gs.length === 1 ? '' : 's'}{c.personal ? ' · yours' : ''}</span>
        <Bar pct={pct} className="mt-4" fillStyle={{ background: c.color }} label={`${c.name} progress`} />
        <span className="mt-1.5 block text-xs tabular-nums text-muted">{done}/{total} plans &middot; {pct}%</span>
      </button>
    </motion.div>
  );
}

export default function CategoriesView() {
  const { categories, createCategory } = useApp();
  const [adding, setAdding] = useState(false);
  const builtIn = categories.filter((c) => !c.personal), mine = categories.filter((c) => c.personal);
  const grid = 'mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  return (
    <div className="grid gap-8">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-charcoal">Your own categories</h2>
            <p className="text-sm text-muted">Make "Others" specific: add the areas that matter to you, like Content creation or Side hustle.</p>
          </div>
          {!adding && <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-xl bg-rust px-4 py-2.5 text-sm font-extrabold text-white hover:bg-rust-dark"><Plus className="h-4 w-4" strokeWidth={3} aria-hidden="true" />New category</button>}
        </div>
        <div className={grid}>
          {adding && (
            <div className="rounded-3xl border border-oat bg-soft p-3" style={cardShadow}>
              <CategoryForm onCancel={() => setAdding(false)} onSave={async (name, color) => { if (await createCategory(name, color)) setAdding(false); }} />
            </div>
          )}
          {mine.map((c, i) => <CategoryCard key={c.id} c={c} i={i} />)}
          {!mine.length && !adding && <p className="rounded-3xl border-2 border-dashed border-blush bg-soft/60 p-6 text-sm text-muted sm:col-span-2">You have not added any yet. They also appear when you choose a category for a goal.</p>}
        </div>
      </section>
      <section>
        <h2 className="text-lg font-extrabold text-charcoal">Built-in categories</h2>
        <p className="text-sm text-muted">Pick one to see just those goals.</p>
        <div className={grid}>{builtIn.map((c, i) => <CategoryCard key={c.id} c={c} i={i} />)}</div>
      </section>
    </div>
  );
}
