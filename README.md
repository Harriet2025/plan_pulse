# AuraGoal

Goal tracker with sub-task checklists, badges and confetti, history and analytics, and per-user accounts.

**Stack:** React 18, Vite, Tailwind CSS 3, Framer Motion, Lucide React on the front end. Supabase on the back end: Postgres, Auth, Storage and one Edge Function.

## One-time setup

1. `npm install`
2. Create `.env.local` (git-ignored) with your project's `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Only ever the browser-safe key: never put the service role key in a `NEXT_PUBLIC_` variable.
3. For a new Supabase project, run `supabase/schema.sql`, then `supabase/jobs.sql`, then `supabase/weekly_planning.sql`, then `supabase/partner_sharing.sql` in the SQL Editor, and deploy `supabase/functions/notify` with **Verify JWT off** (the function checks each request itself). `jobs.sql` has the project's address in its cron job, so change that for a different project.

## Run it

```
npm run dev      # the app on http://localhost:5173
```

There is no server of your own to run: the app talks straight to Supabase.

## Putting it online (Vercel)

The site is plain files after `npm run build`, so any static host works. On Vercel:

1. Import this GitHub repo. It detects Vite by itself.
2. Under **Settings → Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, for every environment, then redeploy. They are read when the site is built.
3. In Supabase, **Authentication → URL Configuration**: set **Site URL** to the site's address and add it under **Redirect URLs**.
4. Tell the Edge Function the address, for the links in its emails: `update public.server_settings set value = to_jsonb('https://your-site'::text) where key = 'app_url';`

`vercel.json` sets the caching: fingerprinted files for a year, and `sw.js` and the pages checked every time, so a new version reaches phones on their next visit.

## Installable app (PWA) and offline

AuraGoal is a Progressive Web App: on a phone, tablet or computer it can be installed and opened from the home screen, full screen, like an app (Chrome / Edge / Android: the **Install** button in Settings or the browser's install icon; iPhone and iPad: Safari's Share button, then **Add to Home Screen**).

- `public/manifest.webmanifest`: name, colours, and the icons in `public/icons/` (192, 512, a maskable 512, and an Apple touch icon).
- `public/sw.js`, the service worker:
  - **Cached:** the app's own files (built code and styles under `/assets/`, icons, the manifest, fonts and `offline.html`).
  - **Never cached:** anything from Supabase (accounts, sign-in, goals, plans, messages, photos), so no personal data is stored on the device and nothing old is shown as current. Without a connection those calls fail and the app says so.
  - **Opening offline:** pages are fetched fresh; with no connection, `public/offline.html` is shown.
  - **Updates:** a new version is offered with an **Update** message, never forced mid-use.
  - **Push:** the service worker also shows push reminders, only on devices where the user turned notifications on.
- **In the app:**
  - **Losing the connection:** a strip says you are offline, when the screen was last updated, and that changes can't be saved yet.
  - **Coming back:** when the connection returns, or the app is reopened after a while, the data is fetched fresh.
- **Testing locally:** the service worker only caches the built app, so test with `npm run build` then `npx vite preview` (http://localhost:4173). Installing needs HTTPS or localhost, which Vercel provides.

## Forgotten passwords and email

Two things send email, and each needs setting up once. Both can use the same Gmail address and App password (turn on 2-step verification, then create one under Google Account → Security → App passwords).

- **Sign-up confirmations and password resets** come from Supabase Auth. Its built-in sender only reaches your own team's addresses, so real users need **Authentication → SMTP Settings**: host `smtp.gmail.com`, port `465`.
- **Partner invites and the morning email** come from the `notify` Edge Function. Add the secrets `SMTP_USER` and `SMTP_PASS` under **Edge Functions → Secrets** (optional: `SMTP_HOST`, `SMTP_FROM`). It sends over TLS on port 465, because Edge Functions cannot use port 587.

So a reset link works on any device, change Supabase's **Reset password** email template (Authentication → Email Templates) to link to `{{ .SiteURL }}/#reset={{ .TokenHash }}`.

## Goals, periods and plans

**Goals are for a week, a month or a year** (`goals.timeframe`), and each period can have as many as you like. A goal's period is the one that contains its finish-by date: weeks run Monday to Sunday, and a goal set without a date finishes at the end of the current period. Each goal has **plans**, the steps that reach it (`sub_plans`), which you tick off; the goal is complete when every plan is done. For example, *Get a first class* (this year): go to class regularly, submit all assignments, study hard. Or *Buy a tripod stand* (this month): save 10% of my income, take a small loan.

**A day has no goals; it is a list of plans** (`day_plans`), separate from the goals. A day plan can have a time (`start_time` and `duration_min`, so "Create content 2:00–4:00pm" is 14:00 for 120 minutes) or be for any time that day, and it can **repeat**: every day, on chosen weekdays (Mon / Wed / Fri 8–10am), or every month. Each day of it is ticked off on its own (`day_plan_marks`), and one day of a repeating plan can be skipped without touching the rest. Typing `Create content 2pm-4pm` fills in the time for you. A timed plan's start is its reminder.

Categories are areas of life only: School, Work, Church, Personal, Health, Family, Finance, Others.

The **Planner** page has Day, Week, Month and Year tabs with ‹ › to move between periods:

- **Day:** your day hour by hour (overlaps sit side by side), the plans for any time that day, and how full the day is. Tap an empty hour to add a plan then, tap a plan to change it, tick it when it is done.
- **Week:** the seven days with how full each one is (tap one to open it), and the week's goals with their plans.
- **Month / Year:** the period's goals, plus the smaller goals inside it, so you can see what builds towards the big one.

## Deleting and reviewing

- **Delete** a goal's plan with the 🗑 next to it, or a whole goal with **Delete goal** on its card (or from History). Both ask for a second tap, and deleting is for good.
- **Review** any day, week, month or year from the Planner (**Review this week**, also for past periods): everything planned in it (that period's goals with their plans, plus each day's plans up to today) with a tick box on each, so you can mark what you really completed, and your score. When a week, month or year ends, the dashboard offers to review it.

## Editing, your own categories, reflections and the journal

- **Edit** a goal (title, category, priority, period, finish-by date, quote, who can see it) with the ✏️ on its card; rename a plan with the ✏️ next to it. A goal's plans are always in view on its card, each with a box to tick.
- **Your own categories:** add named categories with a colour ("Content creation", "Side hustle") from the category picker (**+ New category…**) or the Categories page, where you can also rename, recolour or delete them (their goals move to Others). They are yours alone (`categories.user_id`); a partner sees a category's name only on a goal you shared with them.
- **Goal reflections:** when a goal is completed, a reflection opens (after any badge): how it went, the ups, the downs, how you achieved it, the lessons learnt, and a mood. Open it again from the goal card or History.
- **Journal:** private notes with an optional mood, plus a reflection for each week, month and year (wins, challenges, lessons, next focus). Browse them by week, month or year on the **Journal** page; a period's review in the Planner shows its journal too. Partners never see the journal (`journal_entries`, `api/journal.php`).

## Quick add

Type a day plan the way you would say it, on the dashboard's Today card or in the Planner: *gym tomorrow 6-7am*, *church every Sunday 9am*, *call mum Friday 30 min*, *study weekdays 7pm for 2h until 20 Dec*. Before anything is saved it shows what it understood (the name, the day, the time or length, and how it repeats). It reads days (today, tomorrow, Friday, next Tuesday, 12 Nov, the 15th, in 3 days), times (6-7am, from 9 to 10:30, at 3, noon), lengths (30 min, 2h) and repeats (every day, weekdays, every Mon and Wed, Wednesdays and Saturdays, monthly). Words in quotes always stay in the name, and so do names like *Sunday school*. Everything is read on the device (`src/lib/quickadd.js`), so it is instant and free. The full **Add a plan** form understands the same words.

## Plan your week

A short guided session (`src/components/WeeklyPlan.jsx`): **look back** at last week and bring what slipped into the new week or let it go; pick up to **3 focus goals**; **give their plans a day**, spread to the days with the most free time; and see **the week** at a glance before saving. It saves all together (`plan_week()` in `supabase/weekly_planning.sql`). A plan scheduled this way stays linked to the goal's step, so ticking either one ticks the other. On your planning day (Sunday unless you change it in Settings → Your day), and early in a week you have not planned, the dashboard invites you to start; it is also on the Planner's Week tab. The week's focus goals show on the dashboard with their progress.

## What should I do now?

The **What should I do now?** button (on the dashboard, and the compass in the top bar) recommends one next task. It works out how long you have before your next timed plan today (or you pick 15m to 2h), lets you say how much energy you have, and scores today's day plans and your goals' plans by deadline, priority, whether they fit the time, energy, and quick wins (the last plan of a goal). It shows the reasons ("Goal is due tomorrow", "Fits your 25m"); you can **Start this task** (a focus timer that stays on screen, survives a reload and ticks the task off when you finish), **Skip** it, or **Choose something else**. When a goal's plan has no length yet it asks once, and remembers (`sub_plans.estimate_min`). The rules are in `src/lib/next.js`.

## Accountability partners

The **Partners** page lets you invite up to 5 people by email. They get an email with a link (`/#invite=<their email>`) that opens AuraGoal on Create account, or Sign in if they already have one, with their email filled in; once signed in they land on Partners with the invite, and accepting opens that partner on the Sharing tab. The inviter gets an email (and a push) when it is accepted, with a link to choose what to share. Without email set up, the inviter is told to pass the word on themselves. A waiting invite has **Email again** (at most once an hour), and an email that failed to send can always be tried again. The invite box never reveals who has an account (and inviting someone who already invited you just accepts theirs). Partners can:

- **See only the goals the other chose to share.** Every goal is private to you. You give a partner one goal at a time: on the goal's card (**Share**), when you set or edit a goal (**Who can see it**), or on that partner's **Sharing** tab, which lists all your goals to tick. They see that goal and its plans, and can cheer it. Day plans are private too, unless you tick **My day plans** for that partner; then you can still hide a single day plan with **Hide this one** (`goal_shares` and `share_goal()` in `supabase/partner_sharing.sql`).
- **Chat**, and share **photos** (up to 10 MB; saved again as a JPEG at most 1600 px wide, which drops hidden details such as where it was taken) and **videos** (up to 50 MB, MP4, WebM or MOV). Files live in `storage/chat/` and only the two partners can open them; removing a partner deletes them. Every day you both send something grows your **chat streak**. Days count in UTC, so both partners always see the same number. A new message also sends a push notification (at most one every 2 minutes).
- **Cheer** a goal with 🔥 👏 💪 ❤️ 🎉 ⭐, and **nudge** a quiet partner to plan their day (once every 4 hours; it arrives as a notification).
- Race on a **weekly scoreboard** of plans done (a goal's plans ticked plus day plans done, Monday to Sunday).

Only accepted partners can read a chat, see shared goals or load each other's photo. The rules live in the database (`supabase/schema.sql`): partners never read each other's tables, only what functions such as `partner_view()` and `get_messages()` return.

## Calendar

The **Calendar** page shows goals on the day they end and day plans on every day they happen. Pick a day to see its agenda or open it in the Planner. Archived goals are not shown.

## Catch up, rest days and streak freezes

**Catch up** (sidebar) gathers everything that slipped: goals past their end date and one-off day plans from an earlier day that were not done (a missed day of a repeating plan does not count). Each can be done, moved (tomorrow, the weekend, next week, or any date; a goal moves to "this" or "next" week, month or year instead), or let go, one tap at a time. "Move everything" and "Spread them out" (two a day, skipping rest days) handle the lot at once, and every change has an **Undo**. Nothing that is only late *today* appears here.

**Rest days and freezes** (Settings): pick up to 3 weekdays that never break your streak. Finishing a plan on one still counts. Every 7 days in a row earns a **freeze** (hold up to 2); a freeze automatically covers one missed work day. If a streak does end, the app shows your best streak and starts fresh instead of a silent zero. The rules live in `backend/streak.php`.

## Reminders when AuraGoal is closed

- **Push notifications:** Settings → Notifications → **Turn on** on each device. When a day plan's start time arrives (every day a repeating one happens), the `notify` Edge Function sends it through the browser's push service. A reminder does not pop up while AuraGoal is open and in front of you, since the plan is already on screen.
- **Morning email:** an opt-in summary of the day (its plans, goals ending today, what slipped, how full the day is, the streak) at the time you choose. It needs email set up (see above).
- **Time zones:** each browser tells the server its time zone, and reminders, the morning email and streak days all use the user's own clock.

A `pg_cron` job (`auragoal-worker`, in `supabase/jobs.sql`) calls the function every minute. Settings → Notifications shows whether it is running.

## Realistic day

Give day plans a time or a length, and set how much time you really have in Settings → **Your day**. A day holds the day plans still to do on it, repeating ones included; rest days count as zero. The dashboard's **Today** card, the Planner and the calendar warn when a day is too full, and **Lighten today** suggests one-off plans to move (as little as possible, each to the first work day with room). Repeating plans are habits, so they stay put. **Spread them out** on Catch up fills days up to your capacity.

## Where things live

| Path | Purpose |
| --- | --- |
| `src/lib/supabase.js` | The connection to Supabase |
| `src/api/index.js` | The only file that talks to the backend: tables, database functions, storage and the Edge Function |
| `src/context/AppContext.jsx` | App state and every action (sign in, tick a task, create a goal, rewards queue, notifications) |
| `src/components/` | UI: `Dashboard`, `PlannerView`, `GoalCard`, `HistoryView`, `CategoriesView`, `TopBar`, `Sidebar`, `NewGoalModal`, `RewardModal`, `AuthScreen` and friends |
| `src/lib/` | `constants.js` (categories, tiers, quotes), `utils.js` (dates, progress, analytics), `sound.js` (Web Audio sounds) |
| `supabase/schema.sql` | Tables, access rules (row level security), streak, badge and partner rules, and the storage buckets |
| `supabase/jobs.sql` | Server-only settings, and the every-minute job |
| `supabase/weekly_planning.sql` | The weekly planning ritual: planning day, focus goals, and day plans linked to a goal's plans |
| `supabase/partner_sharing.sql` | Every goal private until shared: which partner sees which goal (`goal_shares`) |
| `supabase/functions/notify/` | The Edge Function: email, Web Push, reminders and the morning email |
| `public/sw.js` | The service worker: offline page, and showing push notifications |
| `legacy/index.old.html` | The previous single-file front end. Safe to delete. |

History, analytics and notifications are worked out in the browser from the snapshot, so they have no server code of their own.

## Notes

- The browser talks to the database directly, so the database enforces everything: each table has row level security, streaks and badges only change through functions that work them out from the data, and the browser's numbers are never trusted.
- Keep **Confirm email** on in Supabase Auth: partner invites are matched by email address, so an unconfirmed address must not be able to claim one.
- Photos and chat files are in private buckets, opened with short-lived links.
