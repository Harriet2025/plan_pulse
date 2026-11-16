// Chat wallpapers, shared by both partners. Each is drawn from the theme's colours, so it suits light and dark mode
// and every app colour. Light mode needs stronger patterns to show on a near-white page, so each strength is
// multiplied by --wp (and a photo's veil is --wp-veil); both are set per theme in index.css. Messages, dates and notes
// sit on solid bubbles and pills, so they stay readable on any wallpaper. Saved as 'preset:<id>' or 'photo:<path>'.

const a = (n) => `calc(${n} * var(--wp, 1))`;   // a pattern strength, scaled for the theme

export const WALLPAPERS = [
  { id: 'plain', name: 'Plain', style: { background: 'rgb(var(--ivory))' } },
  { id: 'dots', name: 'Dots', style: { backgroundColor: 'rgb(var(--ivory))', backgroundImage: `radial-gradient(rgb(var(--rust) / ${a(0.24)}) 1.6px, transparent 1.9px)`, backgroundSize: '18px 18px' } },
  { id: 'grid', name: 'Grid', style: { backgroundColor: 'rgb(var(--ivory))', backgroundImage: `linear-gradient(rgb(var(--rust) / ${a(0.12)}) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--rust) / ${a(0.12)}) 1px, transparent 1px)`, backgroundSize: '26px 26px' } },
  { id: 'stripes', name: 'Stripes', style: { backgroundColor: 'rgb(var(--ivory))', backgroundImage: `repeating-linear-gradient(135deg, rgb(var(--blush) / ${a(0.14)}) 0 12px, transparent 12px 24px)` } },
  { id: 'sky', name: 'Sky', style: { backgroundImage: `linear-gradient(165deg, rgb(var(--rust) / ${a(0.26)}), rgb(var(--blush) / ${a(0.16)}) 55%, rgb(var(--ivory)))` } },
  { id: 'mint', name: 'Mint', style: { backgroundImage: `linear-gradient(165deg, rgb(var(--success) / ${a(0.28)}), rgb(var(--success) / ${a(0.06)}) 75%, rgb(var(--ivory)))` } },
  { id: 'rose', name: 'Rose', style: { backgroundImage: `linear-gradient(165deg, rgb(var(--tab-partners) / ${a(0.26)}), rgb(var(--tab-partners) / ${a(0.06)}) 75%, rgb(var(--ivory)))` } },
  { id: 'sunset', name: 'Sunset', style: { backgroundImage: `linear-gradient(165deg, rgb(var(--warning) / ${a(0.3)}), rgb(var(--tab-partners) / ${a(0.18)}) 50%, rgb(var(--ivory)))` } },
  { id: 'hearts', name: 'Hearts', style: {
    backgroundColor: 'rgb(var(--ivory))',
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><path d="M22 30s-8-5-8-10a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 5-8 10-8 10z" fill="#E0457B" fill-opacity=".34"/></svg>')}")`,
    backgroundSize: '44px 44px' } },
];

/** The style for a saved wallpaper value; a photo needs its link (photoUrl). */
export function wallpaperStyle(value, photoUrl) {
  if (value?.startsWith('photo:') && photoUrl) {
    // A light veil of the page colour: the photo stays clear, and the solid bubbles on top keep the text readable
    return { backgroundImage: `linear-gradient(rgb(var(--ivory) / var(--wp-veil, .3)), rgb(var(--ivory) / var(--wp-veil, .3))), url("${photoUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  const id = value?.startsWith('preset:') ? value.slice(7) : 'plain';
  return (WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0]).style;
}
