import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

// The everyday emojis, in tabs. Recently used ones are remembered on this device and come first.
const GROUPS = [
  ['😀', 'Smileys', '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫣 🤭 🫢 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👻 💀 🤡 💩 🙈 🙉 🙊'],
  ['👍', 'People', '👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 💪 🦾 🧠 👀 👁️ 👅 👄 🫦 👶 🧒 👦 👧 🧑 👨 👩 🧔 👱 👴 👵 🙋 🙆 🙅 🤷 🤦 🙇 💁 🧑‍🎓 🧑‍💻 🧑‍🍳 🧑‍🏫 🏃 🚶 💃 🕺 🧘 🏋️ 🤸 👫 💑 💏 👪'],
  ['❤️', 'Hearts', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 😻 💋 💌 🌹 💐 🫂'],
  ['🎉', 'Celebrate', '🎉 🎊 🥳 🎈 🎁 🎂 🍰 🧁 🥂 🍾 🏆 🥇 🥈 🥉 🏅 🎖️ ⭐ 🌟 ✨ 💫 🔥 💯 ✅ ☑️ ✔️ 🎯 🚀 💥 👑 💎 🙌'],
  ['⚽', 'Activities', '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏓 🏸 🥊 🏊 🚴 🧗 ⛹️ 🎮 🎲 🧩 ♟️ 🎨 🎬 🎤 🎧 🎸 🎹 🥁 🎵 🎶 📚 📖 ✏️ 📝 🎓 💼 💻 📱 ⏰ ⏳ 📅 📌 💡 🛒 ✈️ 🚗 🏠 ⛪ 🕌 🏖️ 🌍'],
  ['🍕', 'Food', '🍎 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍍 🥭 🥥 🥑 🍅 🥕 🌽 🌶️ 🥦 🍞 🥐 🧀 🥚 🍳 🥞 🍗 🍖 🍔 🍟 🍕 🌭 🥪 🌮 🍝 🍜 🍲 🍛 🍣 🍚 🍪 🍩 🍫 🍿 🍦 ☕ 🍵 🧃 🥤 🧋 🍹'],
  ['🌸', 'Nature', '☀️ 🌤️ ⛅ 🌧️ ⛈️ 🌈 ❄️ 🌙 ⭐ 🌊 🌸 🌺 🌻 🌷 🌼 🌱 🌿 🍀 🌴 🌵 🍁 🍂 🐶 🐱 🐰 🦊 🐻 🐼 🐨 🦁 🐯 🐮 🐵 🐔 🐧 🦋 🐝 🐢 🐬 🐳'],
].map(([icon, name, list]) => ({ icon, name, emojis: list.split(' ') }));

const RECENT_KEY = 'auragoal.recentEmoji';
const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 24); } catch { return []; } };

/** A panel of emojis that opens above the message box. onPick(emoji) inserts it; onClose closes. */
export default function EmojiPicker({ onPick, onClose }) {
  const [recent, setRecent] = useState(readRecent);
  const [tab, setTab] = useState(() => (readRecent().length ? 'Recent' : GROUPS[0].name));
  const ref = useRef(null);

  useEffect(() => {
    const away = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest?.('[data-emoji-toggle]')) onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [onClose]);

  const pick = (e) => {
    onPick(e);
    const next = [e, ...recent.filter((x) => x !== e)].slice(0, 24);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* fine */ }
  };
  const tabs = [...(recent.length ? [{ icon: '🕘', name: 'Recent', emojis: recent }] : []), ...GROUPS];
  const shown = tabs.find((t) => t.name === tab) ?? tabs[0];

  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}
      className="absolute bottom-full left-0 right-0 z-30 mb-2 rounded-2xl border border-oat bg-soft p-2 shadow-xl sm:right-auto sm:w-[22rem]" role="dialog" aria-label="Emojis">
      <div className="flex gap-0.5 overflow-x-auto border-b border-oat pb-1.5 no-scrollbar" role="tablist" aria-label="Emoji groups">
        {tabs.map((t) => (
          <button key={t.name} type="button" role="tab" aria-selected={shown.name === t.name} aria-label={t.name} title={t.name} onClick={() => setTab(t.name)}
            className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg', shown.name === t.name ? 'bg-rust/15' : 'hover:bg-panel')}>{t.icon}</button>
        ))}
      </div>
      <p className="px-1 pt-1.5 text-[11px] font-bold text-muted">{shown.name}</p>
      <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto pt-1">
        {shown.emojis.map((e, i) => (
          <button key={`${e}${i}`} type="button" onClick={() => pick(e)} aria-label={e}
            className="grid h-10 place-items-center rounded-lg text-[1.35rem] leading-none hover:bg-panel active:scale-90">{e}</button>
        ))}
      </div>
    </motion.div>
  );
}
