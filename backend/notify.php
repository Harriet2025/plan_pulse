<?php
declare(strict_types=1);

/**
 * Notifications that work when the website is closed: the morning email and push reminders.
 * Used by backend/worker.php (which runs in the background) and by the settings page (preview and test buttons).
 * Expects db.php, mailer.php and webpush.php to be loaded already.
 */

require_once __DIR__ . '/api/lib.php';   // day_plan_occurs()

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
    return smtp_ready(app_config()['smtp'] ?? null);
}

/** The contact address that goes into push messages, so a push service can reach the operator if something is wrong. */
function push_subject(): string
{
    $c = app_config();
    $s = (string) ($c['vapid_subject'] ?? ($c['smtp']['from'] ?? 'admin@example.com'));
    return str_starts_with($s, 'mailto:') || str_starts_with($s, 'https://') ? $s : 'mailto:' . $s;
}

/**
 * A user's day plans that happen on $date and are not done or skipped yet, timed ones first in time order.
 * Mirrors dayLoad() in src/lib/utils.js, so keep the two in step.
 *
 * @return array{tasks:list<array{id:int,title:string,start:?string,minutes:?int}>,planned:int,unestimated:int}
 */
function plan_for_day(PDO $pdo, int $userId, string $date): array
{
    $stmt = $pdo->prepare(
        "SELECT dp.id, dp.title, dp.plan_date, dp.start_time, dp.duration_min, dp.repeat_rule, dp.repeat_days, dp.repeat_until
         FROM day_plans dp LEFT JOIN day_plan_marks m ON m.day_plan_id = dp.id AND m.on_date = ?
         WHERE dp.user_id = ? AND dp.plan_date <= ? AND m.state IS NULL
         ORDER BY dp.start_time IS NULL, dp.start_time, dp.id"
    );
    $stmt->execute([$date, $userId, $date]);
    $tasks = [];
    $planned = 0;
    $unestimated = 0;
    foreach ($stmt->fetchAll() as $p) {
        if (!day_plan_occurs($p, $date)) {
            continue;
        }
        $minutes = $p['duration_min'] !== null ? (int) $p['duration_min'] : null;
        $minutes === null ? $unestimated++ : $planned += $minutes;
        $tasks[] = ['id' => (int) $p['id'], 'title' => (string) $p['title'], 'start' => $p['start_time'] !== null ? substr((string) $p['start_time'], 0, 5) : null, 'minutes' => $minutes];
    }
    return ['tasks' => $tasks, 'planned' => $planned, 'unestimated' => $unestimated];
}

/** "14:00–16:00", or "14:00" without a length. */
function plan_span(?string $start, ?int $minutes): string
{
    if ($start === null) {
        return '';
    }
    if ($minutes === null) {
        return $start;
    }
    $end = (new DateTimeImmutable("2000-01-01 {$start}"))->modify("+{$minutes} minutes")->format('H:i');
    return "{$start}–{$end}";
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

/**
 * Goals past their due date plus one-off day plans from an earlier day that were not done: the same rule as the
 * Catch up page. A missed day of a repeating plan does not count, the next one is already coming.
 */
function slipped_count(PDO $pdo, int $userId, string $today): int
{
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM goals WHERE user_id = ? AND status = 'ACTIVE' AND due_date < ?");
    $stmt->execute([$userId, $today]);
    $goals = (int) $stmt->fetchColumn();
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM day_plans dp LEFT JOIN day_plan_marks m ON m.day_plan_id = dp.id AND m.on_date = dp.plan_date
         WHERE dp.user_id = ? AND dp.repeat_rule = 'NONE' AND dp.plan_date < ? AND m.state IS NULL"
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
        $streak['protected'] => "A streak freeze is covering you. Finish one plan today to keep your {$streak['count']}-day streak.",
        $streak['count'] > 0 => "Finish one plan today to keep your {$streak['count']}-day streak.",
        (int) $u['best_streak'] > 0 => "Start a new streak today. Your best is {$u['best_streak']} days.",
        default => 'Finish a plan today to start a streak.',
    };

    $first = trim(explode(' ', trim((string) $u['display_name']))[0]);
    $subject = match (true) {
        $n > 0 => "Today: {$n} " . ($n === 1 ? 'plan' : 'plans') . ($plan['planned'] ? ', about ' . fmt_minutes($plan['planned']) : ''),
        (bool) $goalsDue => 'Today: ' . count($goalsDue) . (count($goalsDue) === 1 ? ' goal ends' : ' goals end'),
        default => 'Your AuraGoal morning',
    };

    // Plain text
    $line = fn(array $t) => '  - ' . ($t['start'] !== null ? plan_span($t['start'], $t['minutes']) . '  ' : '') . $t['title']
        . ($t['start'] === null && $t['minutes'] !== null ? ' (' . fmt_minutes($t['minutes']) . ')' : '');
    $text = "Good morning, {$first}.\n\n";
    if ($n) {
        $text .= "TODAY\n" . implode("\n", array_map($line, $plan['tasks'])) . "\n";
        if ($load) {
            $text .= "\nAbout " . fmt_minutes($plan['planned']) . " planned" . ($plan['unestimated'] ? " (+{$plan['unestimated']} without an estimate)" : '') . ". {$load}\n";
        }
        $text .= "\n";
    }
    if ($goalsDue) {
        $text .= "GOALS ENDING TODAY\n" . implode("\n", array_map(fn($g) => "  - {$g}", $goalsDue)) . "\n\n";
    }
    if ($slipped) {
        $text .= "{$slipped} " . ($slipped === 1 ? 'thing slipped' : 'things slipped') . " past its date. Sort " . ($slipped === 1 ? 'it' : 'them') . ' out on the Catch up page: ' . app_url() . "\n\n";
    }
    if ($empty) {
        $text .= "Nothing is planned for today yet. Add a few plans for your day in the Planner.\n\n";
    }
    $text .= $streakLine . "\n\nOpen AuraGoal: " . app_url() . "\n\nYou can turn this email off in Settings, under Notifications.";

    // HTML
    $e = fn(string $s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $rows = '';
    foreach ($plan['tasks'] as $t) {
        $rows .= '<tr><td style="padding:6px 10px 6px 0;color:#76685F;white-space:nowrap;vertical-align:top">' . ($t['start'] !== null ? $e(plan_span($t['start'], $t['minutes'])) : 'Any time') . '</td>'
            . '<td style="padding:6px 0"><b>' . $e($t['title']) . '</b>'
            . ($t['start'] === null && $t['minutes'] !== null ? ' <span style="color:#76685F">' . $e(fmt_minutes($t['minutes'])) . '</span>' : '')
            . '</td></tr>';
    }
    $section = fn(string $title, string $body) => '<h3 style="margin:22px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#76685F">' . $title . '</h3>' . $body;
    $html = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#352D29;line-height:1.5">'
        . '<h2 style="color:#B85C38;margin:0 0 4px">AuraGoal</h2><p style="margin:0 0 4px">Good morning, ' . $e($first) . '.</p>'
        . ($n ? $section('Today', "<table style=\"border-collapse:collapse;font-size:15px\">{$rows}</table>")
            . ($load ? '<p style="margin:10px 0 0;padding:10px 12px;border-radius:10px;background:#F4EDE2">About <b>' . $e(fmt_minutes($plan['planned'])) . '</b> planned'
                . ($plan['unestimated'] ? ' (+' . $plan['unestimated'] . ' without an estimate)' : '') . '. ' . $e($load) . '</p>' : '') : '')
        . ($goalsDue ? $section('Goals ending today', '<ul style="margin:0;padding-left:18px">' . implode('', array_map(fn($g) => '<li>' . $e((string) $g) . '</li>', $goalsDue)) . '</ul>') : '')
        . ($slipped ? '<p style="margin:18px 0 0;padding:10px 12px;border-radius:10px;background:#F7E8E3">' . $slipped . ($slipped === 1 ? ' thing slipped' : ' things slipped') . ' past its date. That happens. <a style="color:#9A4929" href="' . $e(app_url()) . '">Sort ' . ($slipped === 1 ? 'it' : 'them') . ' out</a>.</p>' : '')
        . ($empty ? '<p>Nothing is planned for today yet. Add a few plans for your day in the Planner.</p>' : '')
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

    // 1. Day plans whose start time came in the last few minutes, for users with a subscribed device.
    //    A repeating plan reminds on every day it happens; the log keys each one by plan and day.
    $users = $pdo->query('SELECT DISTINCT u.id, u.timezone FROM users u JOIN push_subscriptions ps ON ps.user_id = u.id')->fetchAll();
    $claim = $pdo->prepare("INSERT IGNORE INTO notification_log (user_id, kind, ref_id, stamp) VALUES (?, 'plan', ?, ?)");
    $due = [];
    foreach ($users as $u) {
        $local = $now->setTimezone(user_tz($u['timezone']));
        $from = $local->modify('-' . REMINDER_WINDOW_MINUTES . ' minutes');
        // The window can start before midnight, so look at yesterday too
        foreach (array_unique([$from->format('Y-m-d'), $local->format('Y-m-d')]) as $day) {
            foreach (plan_for_day($pdo, (int) $u['id'], $day)['tasks'] as $t) {
                if ($t['start'] === null) {
                    continue;
                }
                $at = new DateTimeImmutable("{$day} {$t['start']}:00", $local->getTimezone());
                if ($at <= $local && $at > $from) {
                    $due[] = $t + ['user_id' => (int) $u['id'], 'stamp' => "{$day} {$t['start']}:00"];
                }
            }
        }
    }
    foreach ($due as $t) {
        $claim->execute([$t['user_id'], $t['id'], $t['stamp']]);
        if ($claim->rowCount() !== 1) {
            continue;   // already sent
        }
        $r = push_to_user($pdo, $t['user_id'], [
            'kind' => 'plan', 'title' => mb_strimwidth($t['title'], 0, 90, '…'),
            'body' => ($t['minutes'] !== null ? plan_span($t['start'], $t['minutes']) : 'Now') . ' · AuraGoal',
            'tag' => 'plan-' . $t['id'], 'url' => app_url() . '/',
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
