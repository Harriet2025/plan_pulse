// Chat wallpapers. Each is drawn from the theme's colours, so it suits light and dark mode and never fights the
// messages: bubbles keep their solid colours on top. A wallpaper is saved as 'preset:<id>' or 'photo:<path>'.

export const WALLPAPERS = [
  { id: 'plain', name: 'Plain', style: { background: 'rgb(var(--ivory))' } },
  { id: 'dots', name: 'Dots', style: { backgroundColor: 'rgb(var(--ivory))', backgroundImage: 'radial-gradient(rgb(var(--rust) / .22) 1.3px, transparent 1.5px)', backgroundSize: '18px 18px' } },
  { id: 'grid', name: 'Grid', style: { backgroundColor: 'rgb(var(--ivory))', backgroundImage: 'linear-gradient(rgb(var(--oat)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--oat)) 1px, transparent 1px)', backgroundSize: '26px 26px' } },
  { id: 'stripes', name: 'Stripes', style: { backgroundColor: 'rgb(var(--ivory))', backgroundImage: 'repeating-linear-gradient(135deg, rgb(var(--blush) / .12) 0 12px, transparent 12px 24px)' } },
  { id: 'sky', name: 'Sky', style: { backgroundImage: 'linear-gradient(165deg, rgb(var(--rust) / .22), rgb(var(--blush) / .14) 55%, rgb(var(--ivory)))' } },
  { id: 'mint', name: 'Mint', style: { backgroundImage: 'linear-gradient(165deg, rgb(var(--success) / .24), rgb(var(--ivory)) 70%)' } },
  { id: 'rose', name: 'Rose', style: { backgroundImage: 'linear-gradient(165deg, rgb(var(--tab-partners) / .22), rgb(var(--ivory)) 70%)' } },
  { id: 'sunset', name: 'Sunset', style: { backgroundImage: 'linear-gradient(165deg, rgb(var(--warning) / .26), rgb(var(--tab-partners) / .14) 50%, rgb(var(--ivory)))' } },
  { id: 'hearts', name: 'Hearts', style: {
    backgroundColor: 'rgb(var(--ivory))',
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><path d="M22 30s-8-5-8-10a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 5-8 10-8 10z" fill="#D6336C" fill-opacity=".16"/></svg>')}")`,
    backgroundSize: '44px 44px' } },
];

/** The style for a saved wallpaper value; a photo needs its link (photoUrl). */
export function wallpaperStyle(value, photoUrl) {
  if (value?.startsWith('photo:') && photoUrl) {
    // A veil of the page colour over the photo keeps the dates and notes on it readable
    return { backgroundImage: `linear-gradient(rgb(var(--ivory) / .55), rgb(var(--ivory) / .55)), url("${photoUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  const id = value?.startsWith('preset:') ? value.slice(7) : 'plain';
  return (WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0]).style;
}
