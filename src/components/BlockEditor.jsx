import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, CheckSquare, GripVertical, Heading2, Lightbulb, List, Minus, Pilcrow, Pin, PinOff, Plus, Quote, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

// A small page editor made of blocks: text, headings, to-dos, bullets, quotes, callouts and dividers.
//   * Type "/" in an empty block for the list of block types (arrow keys and Enter, or tap one).
//   * Shortcuts at the start of a block: "# " heading, "- " bullet, "[] " to-do, "> " quote, "---" divider.
//   * Enter starts a new block (a list keeps going; Enter on an empty list item ends the list), Backspace at the
//     start joins a block to the one above, and the handle on the left changes, moves or deletes a block.
// Blocks: [{ id, type, text, done }]. The editor only reports changes (onChange); saving is up to the page.

export const BLOCK_TYPES = [
  { type: 'p', label: 'Text', hint: 'Plain writing', icon: Pilcrow },
  { type: 'h', label: 'Heading', hint: 'A section title', icon: Heading2 },
  { type: 'todo', label: 'To-do', hint: 'A box to tick', icon: CheckSquare },
  { type: 'bullet', label: 'Bulleted list', hint: 'A simple list', icon: List },
  { type: 'quote', label: 'Quote', hint: 'Words worth keeping', icon: Quote },
  { type: 'callout', label: 'Callout', hint: 'Make something stand out', icon: Lightbulb },
  { type: 'divider', label: 'Divider', hint: 'A line between sections', icon: Minus },
];
const MAX_BLOCKS = 300;
const newId = () => Math.random().toString(36).slice(2, 10);
export const newBlock = (type = 'p', text = '') => ({ id: newId(), type, text, ...(type === 'todo' ? { done: false } : {}) });
const SHORTCUTS = [[/^#\s$/, 'h'], [/^[-*]\s$/, 'bullet'], [/^\[\]\s$/, 'todo'], [/^>\s$/, 'quote'], [/^---$/, 'divider']];

/** A text area that grows with its text. */
function AutoText({ value, onChange, onKeyDown, onFocus, onBlur, className, placeholder, setRef, readOnly, label }) {
  const ref = useRef(null);
  const fit = () => { const el = ref.current; if (el) { el.style.height = '0px'; el.style.height = `${el.scrollHeight}px`; } };
  useLayoutEffect(fit, [value]);
  useEffect(() => { window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); }, []);
  return (
    <textarea ref={(n) => { ref.current = n; setRef?.(n); }} rows={1} value={value} readOnly={readOnly} aria-label={label} placeholder={placeholder} maxLength={4000}
      onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} onFocus={onFocus} onBlur={onBlur}
      className={cn('block w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-faint', className)} />
  );
}

/** A small menu that closes on a click outside or Escape. */
function Popover({ onClose, className, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [onClose]);
  return <div ref={ref} className={cn('absolute z-30 w-64 rounded-xl border border-oat bg-soft p-1.5 shadow-xl', className)}>{children}</div>;
}

/**
 * others: { [blockId]: name } for blocks someone else is editing right now (shown with their name).
 * onFocusBlock(id | null): which block you are in, for the other person to see.
 */
export default function BlockEditor({ blocks, onChange, readOnly = false, label = 'Notes', placeholder = 'Write anything. Type / for headings, to-dos, lists and more.', others = {}, onFocusBlock }) {
  const virtualId = useRef(newId());   // while the page is empty, one empty block to type into
  const shown = blocks.length ? blocks : [{ id: virtualId.current, type: 'p', text: '' }];
  // Always edit the newest list, even if two keys arrive before the page draws again
  const latest = useRef(shown);
  latest.current = shown;
  const list = shown;
  const refs = useRef(new Map());
  const [focusReq, setFocusReq] = useState(null);    // { id, pos: number | 'end' }
  const [slash, setSlash] = useState(null);          // { id, query, index }
  const [menu, setMenu] = useState(null);            // the block whose options are open

  // Moves the cursor before the browser handles the next key, so fast typing after Enter lands in the new block
  useLayoutEffect(() => {
    if (!focusReq) return;
    const el = refs.current.get(focusReq.id);
    if (el) { el.focus(); const p = focusReq.pos === 'end' ? el.value.length : Math.min(focusReq.pos, el.value.length); el.setSelectionRange(p, p); }
    setFocusReq(null);
  }, [focusReq, blocks]);

  const commit = (next) => { const v = next.slice(0, MAX_BLOCKS); latest.current = v; onChange(v); };
  const replace = (id, patch) => commit(latest.current.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const insertAfter = (idx, block) => { const next = [...latest.current]; next.splice(idx + 1, 0, block); commit(next); return block; };
  const remove = (idx) => { const next = latest.current.filter((_, i) => i !== idx); commit(next); };
  const move = (idx, by) => { const j = idx + by; if (j < 0 || j >= latest.current.length) return; const next = [...latest.current]; [next[idx], next[j]] = [next[j], next[idx]]; commit(next); };

  const setType = (b, idx, type) => {
    const list = latest.current;
    setSlash(null); setMenu(null);
    if (type === 'divider') {
      const next = list.map((x) => (x.id === b.id ? { id: x.id, type: 'divider', text: '' } : x));
      const after = newBlock('p');
      next.splice(idx + 1, 0, after);
      commit(next);
      setFocusReq({ id: after.id, pos: 0 });
      return;
    }
    replace(b.id, { type, text: b.text.startsWith('/') ? '' : b.text, ...(type === 'todo' ? { done: !!b.done } : {}) });
    setFocusReq({ id: b.id, pos: 'end' });
  };

  const onText = (b, idx, text) => {
    const hit = b.type === 'p' && SHORTCUTS.find(([re]) => re.test(text));
    if (hit) { setType({ ...b, text: '' }, idx, hit[1]); return; }
    if (text.startsWith('/') && !/\s/.test(text) && text.length <= 20) setSlash({ id: b.id, query: text.slice(1).toLowerCase(), index: 0 });
    else if (slash?.id === b.id) setSlash(null);
    replace(b.id, { text });
  };

  const matches = slash ? BLOCK_TYPES.filter((t) => t.label.toLowerCase().includes(slash.query) || t.type.startsWith(slash.query)) : [];

  const onKey = (e, b, idx) => {
    const list = latest.current;
    const el = e.currentTarget;
    if (slash?.id === b.id && matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlash({ ...slash, index: (slash.index + 1) % matches.length }); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlash({ ...slash, index: (slash.index - 1 + matches.length) % matches.length }); return; }
      if (e.key === 'Enter') { e.preventDefault(); setType(b, idx, matches[slash.index].type); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSlash(null); return; }
    }
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd = el.selectionStart === el.value.length;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if ((b.type === 'todo' || b.type === 'bullet') && !b.text) { replace(b.id, { type: 'p' }); return; }
      if (list.length >= MAX_BLOCKS) return;
      const cut = el.selectionStart;
      const keep = b.text.slice(0, cut), rest = b.text.slice(el.selectionEnd);
      const next = newBlock(b.type === 'todo' || b.type === 'bullet' ? b.type : 'p', rest);
      const arr = list.map((x) => (x.id === b.id ? { ...x, text: keep } : x));
      arr.splice(idx + 1, 0, next);
      commit(arr);
      setFocusReq({ id: next.id, pos: 0 });
      return;
    }
    if (e.key === 'Backspace' && atStart) {
      if (b.type !== 'p') { e.preventDefault(); replace(b.id, { type: 'p' }); return; }
      if (idx === 0) return;
      e.preventDefault();
      const prev = list[idx - 1];
      if (prev.type === 'divider') { remove(idx - 1); setFocusReq({ id: b.id, pos: 0 }); return; }
      const pos = prev.text.length;
      commit(list.filter((_, i) => i !== idx).map((x) => (x.id === prev.id ? { ...x, text: x.text + b.text } : x)));
      setFocusReq({ id: prev.id, pos });
      return;
    }
    if (e.key === 'ArrowUp' && atStart && idx > 0) { const t = list.slice(0, idx).reverse().find((x) => x.type !== 'divider'); if (t) { e.preventDefault(); setFocusReq({ id: t.id, pos: 'end' }); } }
    if (e.key === 'ArrowDown' && atEnd && idx < list.length - 1) { const t = list.slice(idx + 1).find((x) => x.type !== 'divider'); if (t) { e.preventDefault(); setFocusReq({ id: t.id, pos: 0 }); } }
  };

  const textFor = (b, idx, className, ph) => (
    <AutoText value={b.text} readOnly={readOnly} label={`${label}: ${BLOCK_TYPES.find((t) => t.type === b.type)?.label ?? 'Text'}`}
      setRef={(n) => (n ? refs.current.set(b.id, n) : refs.current.delete(b.id))}
      placeholder={ph} className={className} onChange={(t) => onText(b, idx, t)} onKeyDown={(e) => onKey(e, b, idx)}
      onFocus={() => onFocusBlock?.(b.id)} onBlur={() => onFocusBlock?.(null)} />
  );

  return (
    <div className="grid gap-0.5 pl-7" role="group" aria-label={label}>
      {list.map((b, idx) => {
        const first = idx === 0 && list.length === 1 && !b.text;
        let body;
        if (b.type === 'divider') body = <div className="py-3"><hr className="border-oat" /></div>;
        else if (b.type === 'h') body = textFor(b, idx, 'pt-3 pb-1 text-lg font-bold leading-snug text-charcoal md:text-xl', 'Heading');
        else if (b.type === 'todo') {
          body = (
            <div className="flex items-start gap-2.5">
              <button type="button" disabled={readOnly} onClick={() => replace(b.id, { done: !b.done })} aria-pressed={!!b.done} aria-label={b.done ? 'Mark not done' : 'Mark done'}
                className={cn('mt-[.3rem] grid h-[1.05rem] w-[1.05rem] shrink-0 place-items-center rounded-[4px] border-[1.5px] transition-colors', b.done ? 'border-rust bg-rust text-white' : 'border-charcoal/35 hover:border-rust')}>
                {b.done && <Check className="h-3 w-3" strokeWidth={3.5} aria-hidden="true" />}
              </button>
              {textFor(b, idx, cn('text-[15px] leading-7', b.done ? 'text-muted line-through' : 'text-charcoal'), 'To-do')}
            </div>
          );
        } else if (b.type === 'bullet') {
          body = <div className="flex items-start gap-2.5"><span className="mt-[.72rem] h-[5px] w-[5px] shrink-0 rounded-full bg-charcoal" aria-hidden="true" />{textFor(b, idx, 'text-[15px] leading-7 text-charcoal', 'List item')}</div>;
        } else if (b.type === 'quote') {
          body = <div className="border-l-[3px] border-charcoal/60 pl-3.5">{textFor(b, idx, 'text-[15px] italic leading-7 text-charcoal', 'Quote')}</div>;
        } else if (b.type === 'callout') {
          body = (
            <div className="my-1 flex items-start gap-2.5 rounded-lg border border-oat bg-panel px-3 py-2">
              <Lightbulb className="mt-[.35rem] h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              {textFor(b, idx, 'text-[15px] leading-7 text-charcoal', 'Something to remember')}
            </div>
          );
        } else body = textFor(b, idx, 'text-[15px] leading-7 text-charcoal', first ? placeholder : (readOnly ? '' : "Type '/' for options"));

        return (
          <div key={b.id} id={`blk-${b.id}`} className={cn('group relative -ml-7 flex scroll-mt-24 items-start rounded-md pl-0 transition-shadow', b.pinned && 'pr-6', others[b.id] && 'bg-rust/[.04] shadow-[inset_-3px_0_0_rgb(var(--rust)/.55)]')}>
            {others[b.id] && (
              <span className="pointer-events-none absolute -top-2.5 right-1 z-10 rounded-md bg-rust px-1.5 py-px text-[10px] font-bold text-white">{others[b.id]} is editing</span>
            )}
            {b.pinned && <Pin className="pointer-events-none absolute right-1 top-2 h-3.5 w-3.5 rotate-45 text-rust-dark" aria-label="Pinned" />}
            {!readOnly ? (
              <button type="button" onClick={() => setMenu(menu === b.id ? null : b.id)} aria-label="Block options" aria-expanded={menu === b.id}
                className="mt-[.35rem] grid h-6 w-6 shrink-0 place-items-center rounded text-faint opacity-0 transition-opacity hover:bg-panel hover:text-charcoal focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-60">
                <GripVertical className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : <span className="w-6 shrink-0" />}
            <div className="ml-1 min-w-0 flex-1">{body}</div>

            {menu === b.id && (
              <Popover onClose={() => setMenu(null)} className="left-0 top-8">
                <p className="px-2 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-wider text-muted">Turn into</p>
                {BLOCK_TYPES.filter((t) => t.type !== b.type).map((t) => (
                  <button key={t.type} type="button" onClick={() => setType(b, idx, t.type)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-charcoal hover:bg-panel">
                    <t.icon className="h-4 w-4 text-muted" aria-hidden="true" />{t.label}
                  </button>
                ))}
                <div className="my-1 border-t border-oat" />
                {b.type !== 'divider' && (
                  <button type="button" disabled={!b.pinned && !b.text.trim()} onClick={() => { replace(b.id, { pinned: !b.pinned }); setMenu(null); }}
                    title={!b.pinned && !b.text.trim() ? 'Write something first' : undefined}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-charcoal hover:bg-panel disabled:opacity-40">
                    {b.pinned ? <PinOff className="h-4 w-4 text-muted" aria-hidden="true" /> : <Pin className="h-4 w-4 text-muted" aria-hidden="true" />}{b.pinned ? 'Unpin' : 'Pin to top'}
                  </button>
                )}
                <button type="button" disabled={idx === 0} onClick={() => { move(idx, -1); setMenu(null); }} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-charcoal hover:bg-panel disabled:opacity-40"><ArrowUp className="h-4 w-4 text-muted" aria-hidden="true" />Move up</button>
                <button type="button" disabled={idx === list.length - 1} onClick={() => { move(idx, 1); setMenu(null); }} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-charcoal hover:bg-panel disabled:opacity-40"><ArrowDown className="h-4 w-4 text-muted" aria-hidden="true" />Move down</button>
                <button type="button" onClick={() => { remove(idx); setMenu(null); }} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-danger hover:bg-danger/10"><Trash2 className="h-4 w-4" aria-hidden="true" />Delete</button>
              </Popover>
            )}
            {slash?.id === b.id && matches.length > 0 && (
              <Popover onClose={() => setSlash(null)} className="left-7 top-full mt-1">
                <p className="px-2 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-wider text-muted">Blocks</p>
                <div role="listbox" aria-label="Block types">
                  {matches.map((t, i) => (
                    <button key={t.type} type="button" role="option" aria-selected={i === slash.index} onMouseDown={(e) => e.preventDefault()} onClick={() => setType(b, idx, t.type)}
                      className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left', i === slash.index ? 'bg-panel' : 'hover:bg-panel')}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-oat bg-soft"><t.icon className="h-4 w-4 text-charcoal" aria-hidden="true" /></span>
                      <span className="min-w-0"><span className="block text-sm font-semibold text-charcoal">{t.label}</span><span className="block text-xs text-muted">{t.hint}</span></span>
                    </button>
                  ))}
                </div>
              </Popover>
            )}
          </div>
        );
      })}
      {!readOnly && list.length < MAX_BLOCKS && (
        <button type="button" onClick={() => { const nb = insertAfter(list.length - 1, newBlock('p')); setFocusReq({ id: nb.id, pos: 0 }); }}
          className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-faint hover:bg-panel hover:text-charcoal">
          <Plus className="h-4 w-4" aria-hidden="true" />Add a block
        </button>
      )}
    </div>
  );
}
