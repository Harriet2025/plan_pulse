/** @type {import('tailwindcss').Config} */

// Every color is a CSS variable defined in src/index.css (as space-separated RGB), so the whole palette
// lives in one place and opacity modifiers like bg-rust/10 still work.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
      colors: {
        ivory: token('ivory'),       // page background
        soft: token('soft'),         // cards, modals, inputs
        oat: token('oat'),           // borders, dividers, progress tracks
        rust: { DEFAULT: token('rust'), dark: token('rust-dark') },     // primary actions; dark = hover and text-on-light
        blush: { DEFAULT: token('blush'), dark: token('blush-dark') },  // secondary accents, badges, gamification
        charcoal: token('charcoal'), // headings and primary text
        muted: token('muted'),       // secondary text
        success: token('success'),   // done / low priority
        warning: token('warning'),   // soon due / medium priority
        danger: token('danger'),     // overdue / errors / high priority
      },
    },
  },
  plugins: [],
};
