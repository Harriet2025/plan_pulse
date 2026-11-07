/** @type {import('tailwindcss').Config} */

// Every color is a CSS variable defined in src/index.css (as space-separated RGB), once for the light theme and once
// for the dark one, so the whole palette lives in one place and opacity modifiers like bg-rust/10 still work.
// Read the names by role: see the comment at the top of src/index.css.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Typography is its own variable, never part of a theme
      fontFamily: { sans: ['var(--font-sans)'] },
      colors: {
        ivory: token('ivory'),       // page background
        soft: token('soft'),         // cards, modals, inputs
        panel: token('panel'),       // secondary surfaces
        raised: token('raised'),     // elevated surfaces
        oat: token('oat'),           // borders, dividers, progress tracks, quiet fills
        // primary: DEFAULT = accent and fills, strong = hover / selected fill, dark = the primary as text or an icon
        rust: { DEFAULT: token('rust'), strong: token('rust-strong'), dark: token('rust-dark') },
        blush: { DEFAULT: token('blush'), dark: token('blush-dark') },  // secondary accent; dark = as text or an icon
        charcoal: token('charcoal'), // main text
        muted: token('muted'),       // secondary text
        faint: token('faint'),       // least important text (still 4.5:1)
        'on-status': token('on-status'),  // text and icons on a solid success / warning / danger / secondary fill
        deep: token('deep'),         // contrast panel, dark in both themes
        ink: token('ink'),           // always near-black: dialog backdrops
        success: token('success'),   // done / low priority
        warning: token('warning'),   // soon due / medium priority
        danger: token('danger'),     // overdue / errors / high priority
      },
    },
  },
  plugins: [],
};
