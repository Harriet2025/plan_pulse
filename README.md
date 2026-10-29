# AuraGoal

Goal tracker with sub-task checklists, badges and confetti, history and analytics, and per-user accounts.

**Stack:** React 18, Vite, Tailwind CSS 3, Framer Motion, Lucide React on the front end. PHP 8 + MySQL on the back end.

## One-time setup (XAMPP)

1. Open the XAMPP control panel and start **MySQL** (and Apache if you want phpMyAdmin).
2. **Create the database.** Open http://localhost/phpmyadmin, choose **Import**, and import `schema.sql`. This creates the `auragoal` database, its tables and the 9 default categories. (It drops and recreates the tables, so only do this on a fresh install.)
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

## Forgotten passwords and email

"Forgot password?" on the sign-in screen emails a one-time link that lasts 60 minutes (at most 3 per account per hour). Only a hash of the link's token is stored.

**Until you set up email, nothing is sent.** Each message is written to `storage/mail.log` (and to the `npm run api` terminal) instead. Open that file, copy the link, and paste it in your browser to test the flow.

To send real emails, add an `smtp` block to `backend/config.local.php` (the example file shows one for Gmail: turn on 2-step verification, create an App password, and use it as `pass`). Set `app_url` to the address the website runs at, because that is where the link points.

## Calendar

The **Calendar** page shows goals on their due date and tasks on the day of their reminder (set one with the bell on any task). Pick a day to see its agenda or add a goal due that day. Archived goals are not shown.

## Catch up, rest days and streak freezes

**Catch up** (sidebar) gathers everything that slipped: goals past their due date and unfinished tasks whose reminder day has passed. Each can be finished, moved (tomorrow, the weekend, next week, or any date), or let go, one tap at a time. "Move everything" and "Spread them out" (two a day, skipping rest days) handle the lot at once, and every change has an **Undo**. A task that is only late *today* never appears here.

**Rest days and freezes** (Settings): pick up to 3 weekdays that never break your streak. Finishing a task on one still counts. Every 7 days in a row earns a **freeze** (hold up to 2); a freeze automatically covers one missed work day. If a streak does end, the app shows your best streak and starts fresh instead of a silent zero. The rules live in `backend/streak.php`.

## Reminders when AuraGoal is closed

- **Push notifications:** Settings → Notifications → **Turn on** on each device. When a task's reminder time arrives, the worker sends it through the browser's push service (Chrome, Edge, Firefox). Messages are encrypted for that one device (RFC 8291) and signed with this app's key in `storage/vapid.json` (created on first use; keep it, and keep it private). Only real push services are accepted as destinations. A reminder more than 15 minutes old is not pushed late; it shows up in Catch up instead.
- **Morning email:** an opt-in summary of the day (tasks, what is due, what slipped, how full the day is, the streak) at the time you choose. Until SMTP is set up in `backend/config.local.php` it is written to `storage/mail.log` instead.
- **Time zones:** each browser tells the server its time zone, and reminders, the morning email and streak days all use the user's own clock, whatever zone the server is in.

To keep the worker running without a terminal, schedule `C:\xampp\php\php.exe backend\worker.php --once` to run every minute in Windows Task Scheduler.

## Realistic day

Give tasks a **time estimate** (the clock button on a task, or type `~45m` / `~1h30` after a task when you add it), and set how much time you really have in Settings → **Your day**. A day holds the tasks with a reminder that day plus unreminded tasks of a goal due that day; rest days count as zero. The dashboard's **Today's load** card, the calendar, and the reminder picker all warn when a day is too full, and **Lighten today** suggests what to move: lowest priority first, as little as possible, never past a goal's due date. **Spread them out** on Catch up fills days up to your capacity.

## Where things live

| Path | Purpose |
| --- | --- |
| `src/api/index.js` | The only file that talks to the backend (`fetch` calls to `/api/*.php`) |
| `src/context/AppContext.jsx` | App state and every action (sign in, tick a task, create a goal, rewards queue, notifications) |
| `src/components/` | UI: `Dashboard`, `GoalCard`, `HistoryView`, `CategoriesView`, `TopBar`, `Sidebar`, `NewGoalModal`, `RewardModal`, `AuthScreen` and friends |
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
| `schema.sql`, `migrations/` | MySQL schema. `migrations/002_stage6.sql` only upgrades a database made from the original Stage 1 schema. `migrations/003_profile_avatar.sql` adds the profile-photo column `migrations/004_password_resets.sql` adds the reset-link table, `005` adds rest days and freezes, `006` adds estimates, capacity, the morning email and push tables, and `007` adds each user's time zone, for a database created before those features (fresh installs already have all of them). |
| `legacy/index.old.html` | The previous single-file front end. Safe to delete. |

History, analytics and notifications are worked out in the browser from the snapshot, so they have no endpoints of their own.

## Notes

- Sessions last 30 days. The cookie is `HttpOnly` and `SameSite=Lax`, and gets `Secure` automatically over HTTPS.
- Badge rules (Bronze 50%, Silver 75%, Gold 90%) are decided on the server from the database; the browser's numbers are never trusted.
- Before putting this on the internet: serve it over HTTPS, keep `APP_DEBUG` false, trim `ALLOWED_ORIGINS` in `backend/db.php` to your real domain, add login rate limiting, and use a dedicated MySQL user instead of `root`.
