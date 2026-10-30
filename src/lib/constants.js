import { GraduationCap, Briefcase, Church, Heart, HeartPulse, Users, Wallet, Shapes, Tag } from 'lucide-react';

// Life areas. Day / Week / Month / Year are not categories: they are a goal's horizon (see HORIZONS below).
// The ids match the categories table. Muted, earthy hues that sit beside the ivory / rust / rose palette,
// none of them close to rust (primary) or brick red (danger).
export const CATEGORIES = [
  { id: 1,  name: 'School',   color: '#3F6F9B' },
  { id: 2,  name: 'Work',     color: '#B38A3A' },
  { id: 3,  name: 'Church',   color: '#8A6E9B' },
  { id: 8,  name: 'Personal', color: '#3F8F83' },
  { id: 10, name: 'Health',   color: '#5F8F6B' },
  { id: 11, name: 'Family',   color: '#B8647D' },
  { id: 12, name: 'Finance',  color: '#9A7B4F' },
  { id: 9,  name: 'Others',   color: '#8A7F76' },
];

export const CAT_ICONS = {
  School: GraduationCap, Work: Briefcase, Church, Personal: Heart, Health: HeartPulse, Family: Users, Finance: Wallet, Others: Shapes,
};
export const catIcon = (name) => CAT_ICONS[name] || Tag;   // personal categories get a tag

/** The Planner's tabs: a day, a week (Monday to Sunday), a month or a year. */
export const PERIODS = [
  { id: 'DAILY',   label: 'Day',   this: 'Today',      next: 'Tomorrow',   last: 'Yesterday',  unit: 'day' },
  { id: 'WEEKLY',  label: 'Week',  this: 'This week',  next: 'Next week',  last: 'Last week',  unit: 'week' },
  { id: 'MONTHLY', label: 'Month', this: 'This month', next: 'Next month', last: 'Last month', unit: 'month' },
  { id: 'YEARLY',  label: 'Year',  this: 'This year',  next: 'Next year',  last: 'Last year',  unit: 'year' },
];
/** What a goal can be for (goals.timeframe). A day has no goals: it is a list of plans (day plans). */
export const HORIZONS = PERIODS.filter((p) => p.id !== 'DAILY');
export const horizonOf = (id) => PERIODS.find((h) => h.id === id) ?? PERIODS[1];

/** How a day plan repeats. */
export const REPEAT = { NONE: 'Once', DAILY: 'Every day', WEEKLY: 'On certain days', MONTHLY: 'Every month' };
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];   // index 0 = ISO weekday 1

export const QUOTES = [
  ['A goal without a plan is just a wish.', 'Antoine de Saint-Exupéry'],
  ['We are what we repeatedly do. Excellence is a habit.', 'Will Durant'],
  ['It always seems impossible until it is done.', 'Nelson Mandela'],
  ['Small disciplines repeated with consistency lead to great achievements.', 'John C. Maxwell'],
  ['The secret of getting ahead is getting started.', 'Mark Twain'],
  ['Whatever you do, work at it with all your heart.', 'Colossians 3:23'],
];

// Priority keeps its own meaning (red / gold / green) so it stays readable at a glance.
export const PRIORITY = {
  HIGH:   { label: 'High',   card: 'border-danger/45',  badge: 'bg-danger/10 text-danger border-danger/40',     bar: 'bg-danger' },
  MEDIUM: { label: 'Medium', card: 'border-warning/45', badge: 'bg-warning/10 text-warning border-warning/40',  bar: 'bg-warning' },
  LOW:    { label: 'Low',    card: 'border-success/45', badge: 'bg-success/10 text-success border-success/40',  bar: 'bg-success' },
};

export const TIERS = {
  1: { name: 'Bronze', emoji: '🥉', min: 50, color: '#cd7f32', glow: 'rgba(205,127,50,.55)', confetti: ['#cd7f32', '#e8a96b', '#B85C38', '#D9A99B', '#E8DCCB'],
       msg: 'Halfway there and moving. Keep the momentum going.' },
  2: { name: 'Silver', emoji: '🥈', min: 75, color: '#a9b4c4', glow: 'rgba(203,213,225,.5)', confetti: ['#e2e8f0', '#94a3b8', '#D9A99B', '#E8DCCB', '#B85C38'],
       msg: 'Three quarters done. The finish line is in sight.' },
  3: { name: 'Gold', emoji: '🥇', min: 90, color: '#facc15', glow: 'rgba(250,204,21,.6)', confetti: ['#facc15', '#fde047', '#e0a526', '#D9A99B', '#B85C38', '#E8DCCB'],
       msg: 'Outstanding. You are almost perfect at this one.' },
};
export const tierOf = (pct) => (pct >= 90 ? 3 : pct >= 75 ? 2 : pct >= 50 ? 1 : 0);

export const TEMPLATES = [
  { title: 'Ace my exams', cat: 'School', timeframe: 'MONTHLY', priority: 'HIGH', tasks: ['Make a study timetable', 'Revise one topic every day', 'Practise past questions', 'Review weak areas'] },
  { title: 'Get fit this month', cat: 'Health', timeframe: 'MONTHLY', priority: 'MEDIUM', tasks: ['Walk 20 minutes every day', 'Workout three times a week', 'Drink enough water', 'Sleep before 10pm'] },
  { title: 'Finish my work project', cat: 'Work', timeframe: 'WEEKLY', priority: 'HIGH', tasks: ['List the deliverables', 'Draft the first version', 'Get feedback', 'Submit the final version'] },
  { title: 'Grow in my faith this month', cat: 'Church', timeframe: 'MONTHLY', priority: 'MEDIUM', tasks: ['Read a chapter every morning', 'Pray for ten minutes a day', 'Join a Bible study group'] },
  { title: 'Get a first class this year', cat: 'School', timeframe: 'YEARLY', priority: 'HIGH', tasks: ['Go to class regularly', 'Submit all assignments on time', 'Study hard before every exam'] },
];

export const RING = 263.9; // circumference of the r=42 progress rings
