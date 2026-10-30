# AuraGoal

Goal tracker with sub-task checklists, badges and confetti, history and analytics, and per-user accounts.

**Stack:** React 18, Vite, Tailwind CSS 3, Framer Motion, Lucide React on the front end. PHP 8 + MySQL on the back end.

## One-time setup (XAMPP)

1. Open the XAMPP control panel and start **MySQL** (and Apache if you want phpMyAdmin).
2. **Create the database.** Open http://localhost/phpmyadmin, choose **Import**, and import `schema.sql`. This creates the `auragoal` database, its tables and the 8 default categories. (It drops and recreates the tables, so only do this on a fresh install.)
3. **Tell the backend your MySQL login.** Copy `backend/config.local.example.php` to `backend/config.local.php` and set `user` and `pass`. That file is git-ignored.
4. `npm install`

## Run it

Three terminals, all in this folder (leave them open):

```
npm run api      # PHP server on http://127.0.0.1:8000
npm run dev      # React app on  http://localhost:5173
npm run worker   # sends push reminders and the morning email, even when the site is closed
```

The worker is only needed for notifications that arrive while AuraGoal is closed. Everything else works without it, and Settings → Notifications shows whether it is running.

Open **http://localhost:5173**. Vite forwards `/api/*` to the PHP server, so the browser only sees one origin and the login cookie works without CORS.

`npm run api` uses XAMPP's PHP at `C:\xampp\php\php.exe`. The `php` on your PATH (`C:\php`) is misconfigured: its `php.ini` points at extension files that do not exist, so it cannot load `pdo_mysql`.

## Putting it online (Vercel + Railway)

The React front end is on **Vercel**; the PHP API, MySQL, stored files and the reminder worker run on **Railway** from the `Dockerfile` in this folder. Vercel forwards `/api/*` to Railway (`vercel.json`), so the browser sees one website and logins work everywhere.

On Railway: deploy this GitHub repo (it builds the `Dockerfile`), add a **MySQL** database, add a **volume** mounted at `/app/storage` (photos, videos, sessions, push keys), and set these variables on the app service: `MYSQLHOST`, `MYSQLPORT`, `MYSQLDATABASE`, `MYSQLUSER`, `MYSQLPASSWORD` (as references to the MySQL service), `APP_URL` (the Vercel address) and, for email, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. On first start `backend/install.php` creates the tables in the empty database. Without a `config.local.php`, all settings come from these variables (`env_config()` in `backend/db.php`).

## Forgotten passwords and email

"Forgot password?" on the sign-in screen emails a one-time link that lasts 60 minutes (at most 3 per account per hour). Only a hash of the link's token is stored.

**Until you set up email, nothing is sent.** Each message is written to `storage/mail.log` (and to the `npm run api` terminal) instead. Open that file, copy the link, and paste it in your browser to test the flow.

To send real emails, add an `smtp` block to `backend/config.local.php` (the example file shows one for Gmail: turn on 2-step verification, create an App password, and use it as `pass`). Set `app_url` to the address the website runs at, because that is where the link points.

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

- **Edit** a goal (title, category, priority, period, finish-by date, quote, Private) with the ✏️ on its card; rename a plan with the ✏️ next to it. A goal's plans are always in view on its card, each with a box to tick.
- **Your own categories:** add named categories with a colour ("Content creation", "Side hustle") from the category picker (**+ New category…**) or the Categories page, where you can also rename, recolour or delete them (their goals move to Others). They are yours alone (`categories.user_id`), and can be shared with a partner like any other.
- **Goal reflections:** when a goal is completed, a reflection opens (after any badge): how it went, the ups, the downs, how you achieved it, the lessons learnt, and a mood. Open it again from the goal card or History.
- **Journal:** private notes with an optional mood, plus a reflection for each week, month and year (wins, challenges, lessons, next focus). Browse them by week, month or year on the **Journal** page; a period's review in the Planner shows its journal too. Partners never see the journal (`journal_entries`, `api/journal.php`).

## Accountability partners

The **Partners** page lets you invite up to 5 people by email. An invite waits until someone signs in with that email and accepts it, so the invite box never reveals who has an account (and inviting someone who already invited you just accepts theirs). Partners can:

- **See only what the other chose to share.** Under **Sharing**, each person picks, per partner, which categories (School, Work, Finance…) that partner can see, and whether they see their day plans. Nothing is shared until you choose. A goal or day plan marked **Private** stays hidden even inside a shared category.
- **Chat**, and share **photos** (up to 10 MB; saved again as a JPEG at most 1600 px wide, which drops hidden details such as where it was taken) and **videos** (up to 50 MB, MP4, WebM or MOV). Files live in `storage/chat/` and only the two partners can open them; removing a partner deletes them. Every day you both send something grows your **chat streak**. Days count in UTC, so both partners always see the same number. A new message also sends a push notification (at most one every 2 minutes).
- **Cheer** a goal with 🔥 👏 💪 ❤️ 🎉 ⭐, and **nudge** a quiet partner to plan their day (once every 4 hours; it arrives as a notification).
- Race on a **weekly scoreboard** of plans done (a goal's plans ticked plus day plans done, Monday to Sunday).

Only accepted partners can read a chat, see shared goals or load each other's photo; everything else gets a 404. The rules live in `backend/partners.php`, with the endpoints `api/partners.php` (list, invite, accept, decline, remove), `api/partner.php` (what a partner shares) and `api/messages.php` (chat, cheers, nudges).

## Calendar

The **Calendar** page shows goals on the day they end and day plans on every day they happen. Pick a day to see its agenda or open it in the Planner. Archived goals are not shown.

## Catch up, rest days and streak freezes

**Catch up** (sidebar) gathers everything that slipped: goals past their end date and one-off day plans from an earlier day that were not done (a missed day of a repeating plan does not count). Each can be done, moved (tomorrow, the weekend, next week, or any date; a goal moves to "this" or "next" week, month or year instead), or let go, one tap at a time. "Move everything" and "Spread them out" (two a day, skipping rest days) handle the lot at once, and every change has an **Undo**. Nothing that is only late *today* appears here.

**Rest days and freezes** (Settings): pick up to 3 weekdays that never break your streak. Finishing a plan on one still counts. Every 7 days in a row earns a **freeze** (hold up to 2); a freeze automatically covers one missed work day. If a streak does end, the app shows your best streak and starts fresh instead of a silent zero. The rules live in `backend/streak.php`.

## Reminders when AuraGoal is closed

- **Push notifications:** Settings → Notifications → **Turn on** on each device. When a day plan's start time arrives (every day a repeating one happens), the worker sends it through the browser's push service (Chrome, Edge, Firefox). Messages are encrypted for that one device (RFC 8291) and signed with this app's key in `storage/vapid.json` (created on first use; keep it, and keep it private). Only real push services are accepted as destinations. A reminder more than 15 minutes old is not pushed late; it shows up in Catch up instead.
- **Morning email:** an opt-in summary of the day (its plans, goals ending today, what slipped, how full the day is, the streak) at the time you choose. Until SMTP is set up in `backend/config.local.php` it is written to `storage/mail.log` instead.
- **Time zones:** each browser tells the server its time zone, and reminders, the morning email and streak days all use the user's own clock, whatever zone the server is in.

To keep the worker running without a terminal, schedule `C:\xampp\php\php.exe backend\worker.php --once` to run every minute in Windows Task Scheduler.

## Realistic day

Give day plans a time or a length, and set how much time you really have in Settings → **Your day**. A day holds the day plans still to do on it, repeating ones included; rest days count as zero. The dashboard's **Today** card, the Planner and the calendar warn when a day is too full, and **Lighten today** suggests one-off plans to move (as little as possible, each to the first work day with room). Repeating plans are habits, so they stay put. **Spread them out** on Catch up fills days up to your capacity.

## Where things live

| Path | Purpose |
| --- | --- |
| `src/api/index.js` | The only file that talks to the backend (`fetch` calls to `/api/*.php`) |
| `src/context/AppContext.jsx` | App state and every action (sign in, tick a task, create a goal, rewards queue, notifications) |
| `src/components/` | UI: `Dashboard`, `PlannerView`, `GoalCard`, `HistoryView`, `CategoriesView`, `TopBar`, `Sidebar`, `NewGoalModal`, `RewardModal`, `AuthScreen` and friends |
| `src/lib/` | `constants.js` (categories, tiers, quotes), `utils.js` (dates, progress, analytics), `sound.js` (Web Audio sounds) |
| `backend/db.php` | PDO connection, CORS, JSON helpers, PHP sessions |
| `backend/api/auth.php` | `GET` session check, `POST` signup / login / logout / forgot / reset |
| `backend/mailer.php` | Sends the password-reset email through SMTP, or writes it to `storage/mail.log` when no SMTP is set up |
| `backend/api/snapshot.php` | `GET` the profile, every goal with its tasks, and every badge, in one request |
| `backend/api/goals.php` | `POST` new goal, `PATCH` archive / restore |
| `backend/api/sub_plans.php` | `PATCH` tick a task or set a reminder, `POST` add a task |
| `backend/api/reviews.php` | `POST` record a badge when a goal reaches 50 / 75 / 90% |
| `backend/api/profile.php` | `PATCH` change name, email, password (email and password changes need the current password) or rest days |
| `backend/api/reschedule.php` | `POST` a batch of moves / let-gos for the Catch up page, all or nothing |
| `backend/streak.php` | Streak rules: rest days, freezes, best streak, each user's time zone |
| `backend/api/push.php` | `GET` notification settings, `POST` subscribe / unsubscribe / test a device |
| `backend/api/digest.php` | `POST` email me today's summary now (at most once a minute) |
| `backend/webpush.php` | Web Push encryption and signing |
| `backend/notify.php` | The morning email and the worker's checks |
| `backend/worker.php` | The background worker (`npm run worker`); refuses to run from a browser |
| `public/sw.js` | The service worker that shows push notifications |
| `backend/api/avatar.php` | `GET` your photo, `POST` upload one (re-encoded as a 256x256 JPEG), `DELETE` remove it |
| `storage/avatars/` | Uploaded photos, one per user. Outside the web root and git-ignored; only `avatar.php` can serve them. |
| `schema.sql`, `migrations/` | MySQL schema. `migrations/002_stage6.sql` only upgrades a database made from the original Stage 1 schema. `migrations/003_profile_avatar.sql` adds the profile-photo column `migrations/004_password_resets.sql` adds the reset-link table, `005` adds rest days and freezes, `006` adds estimates, capacity, the morning email and push tables, `007` adds each user's time zone, `009` adds day plans (a day's plans with times and repeats) and makes goals week / month / year only, `010` adds accountability partners, their chat and the Private switch, `011` adds per-partner sharing by category and photos / videos in the chat, `012` adds personal categories and the journal, and `008` turns the Daily / Weekly / Monthly / Yearly categories into horizons (Semester becomes Month) and adds Health, Family and Finance, for a database created before those features (fresh installs already have all of them). |
| `legacy/index.old.html` | The previous single-file front end. Safe to delete. |

History, analytics and notifications are worked out in the browser from the snapshot, so they have no endpoints of their own.

## Notes

- Sessions last 30 days. The cookie is `HttpOnly` and `SameSite=Lax`, and gets `Secure` automatically over HTTPS.
- Badge rules (Bronze 50%, Silver 75%, Gold 90%) are decided on the server from the database; the browser's numbers are never trusted.
- Before putting this on the internet: serve it over HTTPS, keep `APP_DEBUG` false, trim `ALLOWED_ORIGINS` in `backend/db.php` to your real domain, add login rate limiting, and use a dedicated MySQL user instead of `root`.
