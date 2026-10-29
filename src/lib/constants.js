import { GraduationCap, Briefcase, Church, Sun, CalendarDays, CalendarRange, CalendarCheck, Heart, Shapes, Folder } from 'lucide-react';

export const CATEGORIES = [
  // Muted, earthy hues so category colours sit comfortably beside the ivory / rust / rose palette.
  // None of them is close to rust (primary) or brick red (danger).
  { id: 1, name: 'School',   color: '#3F6F9B' },
  { id: 2, name: 'Work',     color: '#B38A3A' },
  { id: 3, name: 'Church',   color: '#8A6E9B' },
  { id: 4, name: 'Daily',    color: '#5F8F6B' },
  { id: 5, name: 'Weekly',   color: '#6E86B0' },
  { id: 6, name: 'Monthly',  color: '#B8647D' },
  { id: 7, name: 'Yearly',   color: '#9A7B4F' },
  { id: 8, name: 'Personal', color: '#3F8F83' },
  { id: 9, name: 'Others',   color: '#8A7F76' },
];

export const CAT_ICONS = {
  School: GraduationCap, Work: Briefcase, Church, Daily: Sun, Weekly: CalendarDays,
  Monthly: CalendarRange, Yearly: CalendarCheck, Personal: Heart, Others: Shapes,
};
export const catIcon = (name) => CAT_ICONS[name] || Folder;

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
export const TIMEFRAME = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly', SEMESTER: 'Semester', YEARLY: 'Yearly' };

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
  { title: 'Get fit this month', cat: 'Personal', timeframe: 'MONTHLY', priority: 'MEDIUM', tasks: ['Walk 20 minutes every day', 'Workout three times a week', 'Drink enough water', 'Sleep before 10pm'] },
  { title: 'Finish my work project', cat: 'Work', timeframe: 'WEEKLY', priority: 'HIGH', tasks: ['List the deliverables', 'Draft the first version', 'Get feedback', 'Submit the final version'] },
  { title: 'Daily devotion', cat: 'Church', timeframe: 'DAILY', priority: 'MEDIUM', tasks: ['Read a chapter', 'Pray for ten minutes', 'Write one takeaway'] },
];

export const RING = 263.9; // circumference of the r=42 progress rings
