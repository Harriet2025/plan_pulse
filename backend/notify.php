<?php
declare(strict_types=1);

/**
 * Notifications that work when the website is closed: the morning email and push reminders.
 * Used by backend/worker.php (which runs in the background) and by the settings page (preview and test buttons).
 * Expects db.php, mailer.php and webpush.php to be loaded already.
 */

const REMINDER_WINDOW_MINUTES = 15;   // a reminder missed by more than this is not pushed late, it shows up in Catch up instead
const DIGEST_GRACE_HOURS = 3;         // a "morning" email is not sent hours after its time (for example after the worker was off)

function fmt_minutes(int $m): string
{
    if ($m < 60) {
        return "{$m}m";
    }
    return intdiv($m, 60) . 'h' . ($m % 60 ? ' ' . ($m % 60) . 'm' : '');
}

function app_url(): string
{
    return rtrim((string) (app_config()['app_url'] ?? 'http://localhost:5173'), '/');
}

function mail_is_configured(): bool
{
    $s = app_config()['smtp'] ?? null;
    return !empty($s['host']) && !empty($s['from']);
}

/** The contact address that goes into push messages, so a push service can reach the operator if something is wrong. */
function push_subject(): string
{
    $c = app_config();
    $s = (string) ($c['vapid_subject'] ?? ($c['smtp']['from'] ?? 'admin@example.com'));
    return str_starts_with($s, 'mailto:') || str_starts_with($s, 'https://') ? $s : 'mailto:' . $s;
}

/**
 * The tasks that belong to a day: those with a reminder that day, plus tasks with no reminder whose goal is due that day
 * (they have to be done by then). Mirrors plannedFor() in src/lib/utils.js, so keep the two in step.
 *
 * @return array{tasks:list<array<string,mixed>>,planned:int,unestimated:int}
 */
function plan_for_day(PDO $pdo, int $userId, string $date): array
{
    $stmt = $pdo->prepare(
        "SELECT sp.id, sp.task_description, sp.remind_at, sp.estimate_min, g.id AS goal_id, g.title AS goal_title, g.priority
         FROM sub_plans sp JOIN goals g ON g.id = sp.goal_id
         WHERE g.user_id = ? AND g.status = 'ACTIVE' AND sp.is_completed = 0
           AND (DATE(sp.remind_at) = ? OR (sp.remind_at IS NULL AND g.due_date = ?))
         ORDER BY sp.remind_at IS NULL, sp.remind_at, sp.id"
    );
    $stmt->execute([$userId, $date, $date]);
    $tasks = $stmt->fetchAll();
    $planned = 0;
    $unestimated = 0;
    foreach ($tasks as $t) {
        $t['estimate_min'] === null ? $unestimated++ : $planned += (int) $t['estimate_min'];
    }
    return ['tasks' => $tasks, 'planned' => $planned, 'unestimated' => $unestimated];
}

/** ok (comfortable), tight (nearly full), over (more than fits), or rest (things planned on a day off). */
function load_state(int $planned, int $capacity): string
{
    if ($capacity <= 0) {
        return $planned > 0 ? 'rest' : 'ok';
    }
    $ratio = $planned / $capacity;
    return $ratio > 1.0 ? 'over' : ($ratio > 0.75 ? 'tight' : 'ok');
}

/** Goals past their due date plus unfinished tasks whose reminder day has passed: the same rule as the Catch up page. */
function slipped_count(PDO $pdo, int $userId, string $today): int
{
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM goals WHERE user_id = ? AND status = 'ACTIVE' AND due_date < ?");
    $stmt->execute([$userId, $today]);
    $goals = (int) $stmt->fetchColumn();
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM sub_plans sp JOIN goals g ON g.id = sp.goal_id
         WHERE g.user_id = ? AND g.status = 'ACTIVE' AND sp.is_completed = 0 AND DATE(sp.remind_at) < ?"
    );
    $stmt->execute([$userId, $today]);
    return $goals + (int) $stmt->fetchColumn();
}

/**
 * The morning email for one user.
 *
 * @return array{subject:string,text:string,html:string,empty:bool,to:string}|null
 */
function build_digest(PDO $pdo, int $userId, ?DateTimeImmutable $now = null): ?array
{
    $stmt = $pdo->prepare('SELECT email, display_name, streak_count, best_streak, streak_freezes, rest_days, daily_capacity_min, last_active_date, timezone FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $u = $stmt->fetch();
    if (!$u) {
        return null;
    }
    $now = ($now ?? new DateTimeImmutable('now'))->setTimezone(user_tz($u['timezone']));   // "today" is the user's today

    $today = $now->setTime(0, 0);
    $date = $today->format('Y-m-d');
    $plan = plan_for_day($pdo, $userId, $date);
    $restToday = streak_is_rest_day((int) $u['rest_days'], $today);
    $capacity = $restToday ? 0 : (int) $u['daily_capacity_min'];
    $state = load_state($plan['planned'], $capacity);

    $stmt = $pdo->prepare("SELECT title FROM goals WHERE user_id = ? AND status = 'ACTIVE' AND due_date = ? ORDER BY id");
    $stmt->execute([$userId, $date]);
    $goalsDue = $stmt->fetchAll(PDO::FETCH_COLUMN);
    $slipped = slipped_count($pdo, $userId, $date);
    $streak = streak_view($u, $today);
    $n = count($plan['tasks']);
    $empty = $n === 0 && !$goalsDue && $slipped === 0;

    $load = match (true) {
        $plan['planned'] === 0 => null,
        $state === 'over' => 'That is about ' . fmt_minutes($plan['planned'] - $capacity) . ' more than your ' . fmt_minutes($capacity) . ' day. Consider moving something to a lighter day.',
        $state === 'tight' => 'That is a full day. Leave a little slack for the unexpected.',
        $state === 'rest' => 'Today is a rest day. Move these if you would rather rest.',
        default => 'That fits comfortably in your ' . fmt_minutes($capacity) . ' day.',
    };
    $streakLine = match (true) {
        $restToday => 'Today is a rest day, so your streak is safe.' . ($streak['count'] > 0 ? " ({$streak['count']} days)" : ''),
        $streak['active_today'] => "You have already kept your {$streak['count']}-day streak today.",
        $streak['protected'] => "A streak freeze is covering you. Finish one task today to keep your {$streak['count']}-day streak.",
        $streak['count'] > 0 => "Finish one task today to keep your {$streak['count']}-day streak.",
        (int) $u['best_streak'] > 0 => "Start a new streak today. Your best is {$u['best_streak']} days.",
        default => 'Finish a task today to start a streak.',
    };

    $first = trim(explode(' ', trim((string) $u['display_name']))[0]);
    $subject = match (true) {
        $n > 0 => "Today: {$n} " . ($n === 1 ? 'task' : 'tasks') . ($plan['planned'] ? ', about ' . fmt_minutes($plan['planned']) : ''),
        (bool) $goalsDue => 'Today: ' . count($goalsDue) . (count($goalsDue) === 1 ? ' goal is' : ' goals are') . ' due',
        default => 'Your AuraGoal morning',
    };

    // Plain text
    $line = fn(array $t) => '  - ' . ($t['remind_at'] ? substr((string) $t['remind_at'], 11, 5) . '  ' : '') . $t['task_description']
        . ($t['estimate_min'] !== null ? ' (' . fmt_minutes((int) $t['estimate_min']) . ')' : '') . '  [' . $t['goal_title'] . ']';
    $text = "Good morning, {$first}.\n\n";
    if ($n) {
        $text .= "TODAY\n" . implode("\n", array_map($line, $plan['tasks'])) . "\n";
        if ($load) {
            $text .= "\nAbout " . fmt_minutes($plan['planned']) . " planned" . ($plan['unestimated'] ? " (+{$plan['unestimated']} without an estimate)" : '') . ". {$load}\n";
        }
        $text .= "\n";
    }
    if ($goalsDue) {
        $text .= "DUE TODAY\n" . implode("\n", array_map(fn($g) => "  - {$g}", $goalsDue)) . "\n\n";
    }
    if ($slipped) {
        $text .= "{$slipped} " . ($slipped === 1 ? 'thing slipped' : 'things slipped') . " past its date. Sort " . ($slipped === 1 ? 'it' : 'them') . ' out on the Catch up page: ' . app_url() . "\n\n";
    }
    if ($empty) {
        $text .= "Nothing is planned for today. A good day to set a goal or give a task a reminder.\n\n";
    }
    $text .= $streakLine . "\n\nOpen AuraGoal: " . app_url() . "\n\nYou can turn this email off in Settings, under Notifications.";

    // HTML
    $e = fn(string $s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $rows = '';
    foreach ($plan['tasks'] as $t) {
        $rows .= '<tr><td style="padding:6px 10px 6px 0;color:#76685F;white-space:nowrap;vertical-align:top">' . ($t['remind_at'] ? $e(substr((string) $t['remind_at'], 11, 5)) : '') . '</td>'
            . '<td style="padding:6px 0"><b>' . $e((string) $t['task_description']) . '</b>'
            . ($t['estimate_min'] !== null ? ' <span style="color:#76685F">' . $e(fmt_minutes((int) $t['estimate_min'])) . '</span>' : '')
            . '<br><span style="color:#76685F;font-size:13px">' . $e((string) $t['goal_title']) . '</span></td></tr>';
    }
    $section = fn(string $title, string $body) => '<h3 style="margin:22px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#76685F">' . $title . '</h3>' . $body;
    $html = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#352D29;line-height:1.5">'
        . '<h2 style="color:#B85C38;margin:0 0 4px">AuraGoal</h2><p style="margin:0 0 4px">Good morning, ' . $e($first) . '.</p>'
        . ($n ? $section('Today', "<table style=\"border-collapse:collapse;font-size:15px\">{$rows}</table>")
            . ($load ? '<p style="margin:10px 0 0;padding:10px 12px;border-radius:10px;background:#F4EDE2">About <b>' . $e(fmt_minutes($plan['planned'])) . '</b> planned'
                . ($plan['unestimated'] ? ' (+' . $plan['unestimated'] . ' without an estimate)' : '') . '. ' . $e($load) . '</p>' : '') : '')
        . ($goalsDue ? $section('Due today', '<ul style="margin:0;padding-left:18px">' . implode('', array_map(fn($g) => '<li>' . $e((string) $g) . '</li>', $goalsDue)) . '</ul>') : '')
        . ($slipped ? '<p style="margin:18px 0 0;padding:10px 12px;border-radius:10px;background:#F7E8E3">' . $slipped . ($slipped === 1 ? ' thing slipped' : ' things slipped') . ' past its date. That happens. <a style="color:#9A4929" href="' . $e(app_url()) . '">Sort ' . ($slipped === 1 ? 'it' : 'them') . ' out</a>.</p>' : '')
        . ($empty ? '<p>Nothing is planned for today. A good day to set a goal or give a task a reminder.</p>' : '')
        . '<p style="margin:18px 0 0">' . $e($streakLine) . '</p>'
        . '<p style="margin:20px 0"><a href="' . $e(app_url()) . '" style="display:inline-block;background:#B85C38;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:bold">Open AuraGoal</a></p>'
        . '<p style="font-size:12px;color:#76685F">You can turn this email off in Settings, under Notifications.</p></div>';

    return ['subject' => $subject, 'text' => $text, 'html' => $html, 'empty' => $empty, 'to' => (string) $u['email']];
}

/** Sends the morning email. Returns 'sent', 'skipped' (nothing to say, unless forced) or 'failed'. */
function send_digest(PDO $pdo, int $userId, bool $force = false): string
{
    $d = build_digest($pdo, $userId);
    if (!$d || ($d['empty'] && !$force)) {
        return 'skipped';
    }
    return send_mail($d['to'], $d['subject'], $d['text'], $d['html']) ? 'sent' : 'failed';
}

// ---------------------------------------------------------------
// Push
// ---------------------------------------------------------------

/** @return list<array{id:int,endpoint:string,p256dh:string,auth:string}> */
function user_subscriptions(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?');
    $stmt->execute([$userId]);
    return $stmt->fetchAll();
}

/**
 * Sends one notification to every device of a user. Devices that report the subscription is gone are forgotten.
 * @return array{sent:int,failed:int,errors:list<string>}
 */
function push_to_user(PDO $pdo, int $userId, array $payload, ?string $override = null): array
{
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $out = ['sent' => 0, 'failed' => 0, 'errors' => []];
    foreach (user_subscriptions($pdo, $userId) as $sub) {
        $r = wp_send($sub, $json, push_subject(), 3600, $override);
        if ($r['ok']) {
            $out['sent']++;
            continue;
        }
        $out['failed']++;
        $out['errors'][] = $r['error'] ?? 'unknown error';
        if ($r['gone']) {
            $pdo->prepare('DELETE FROM push_subscriptions WHERE id = ?')->execute([$sub['id']]);
        }
    }
    return $out;
}

// ---------------------------------------------------------------
// The worker's job, once per tick
// ---------------------------------------------------------------

/** @return array{reminders:int,digests:int,failed:int} what was sent during this tick */
function worker_tick(PDO $pdo, DateTimeImmutable $now, ?string $pushOverride = null): array
{
    $stats = ['reminders' => 0, 'digests' => 0, 'failed' => 0];
    // Reminder times are stored as the user's wall-clock time (what they picked in their browser), so each user's
    // "now" is worked out in their own time zone before comparing.
    $stamp = fn(DateTimeImmutable $d) => $d->format('Y-m-d H:i:s');

    // 1. Task reminders that came due in the last few minutes, for users with a subscribed device
    $users = $pdo->query('SELECT DISTINCT u.id, u.timezone FROM users u JOIN push_subscriptions ps ON ps.user_id = u.id')->fetchAll();
    $find = $pdo->prepare(
        "SELECT sp.id, sp.task_description, sp.remind_at, sp.estimate_min, g.title AS goal_title
         FROM sub_plans sp JOIN goals g ON g.id = sp.goal_id
         WHERE g.user_id = ? AND g.status = 'ACTIVE' AND sp.is_completed = 0 AND sp.remind_at <= ? AND sp.remind_at > ?
         ORDER BY sp.remind_at"
    );
    $claim = $pdo->prepare("INSERT IGNORE INTO notification_log (user_id, kind, ref_id, stamp) VALUES (?, 'task', ?, ?)");
    $due = [];
    foreach ($users as $u) {
        $local = $now->setTimezone(user_tz($u['timezone']));
        $find->execute([$u['id'], $stamp($local), $stamp($local->modify('-' . REMINDER_WINDOW_MINUTES . ' minutes'))]);
        foreach ($find->fetchAll() as $t) {
            $due[] = $t + ['user_id' => $u['id']];
        }
    }
    foreach ($due as $t) {
        $claim->execute([$t['user_id'], $t['id'], $t['remind_at']]);
        if ($claim->rowCount() !== 1) {
            continue;   // already sent
        }
        $r = push_to_user($pdo, (int) $t['user_id'], [
            'kind' => 'task', 'title' => mb_strimwidth((string) $t['task_description'], 0, 90, '…'),
            'body' => $t['goal_title'] . ($t['estimate_min'] !== null ? ' · about ' . fmt_minutes((int) $t['estimate_min']) : ''),
            'tag' => 'task-' . $t['id'], 'url' => app_url() . '/',
        ], $pushOverride);
        $stats['reminders'] += $r['sent'];
        $stats['failed'] += $r['failed'];
    }

    // 2. Morning emails whose time has come (and is not hours old)
    $users = $pdo->query('SELECT id, digest_time, timezone FROM users WHERE digest_enabled = 1')->fetchAll();
    $claim = $pdo->prepare("INSERT IGNORE INTO notification_log (user_id, kind, ref_id, stamp) VALUES (?, 'digest', 0, ?)");
    foreach ($users as $u) {
        $local = $now->setTimezone(user_tz($u['timezone']));   // 07:30 means 07:30 where the user is
        [$h, $m] = array_map('intval', explode(':', (string) $u['digest_time']));
        $slot = $local->setTime($h, $m);
        if ($local < $slot || $local >= $slot->modify('+' . DIGEST_GRACE_HOURS . ' hours')) {
            continue;
        }
        $claim->execute([$u['id'], $local->format('Y-m-d')]);
        if ($claim->rowCount() !== 1) {
            continue;   // today's is already done
        }
        $result = send_digest($pdo, (int) $u['id']);
        $result === 'sent' ? $stats['digests']++ : ($result === 'failed' ? $stats['failed']++ : null);
    }

    // 3. Forget old log rows once an hour
    if ($now->format('i') === '00') {
        $pdo->prepare("DELETE FROM notification_log WHERE created_at < ? ")->execute([$stamp($now->modify('-7 days'))]);
    }
    return $stats;
}
