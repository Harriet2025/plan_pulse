<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';
require_once __DIR__ . '/lib.php';

$pdo = get_db();
$userId = current_user_id($pdo);
require_method('POST');
$in = read_json_body();

// ---------------------------------------------------------------
// POST /api/day_plans.php
// A day's own plans. They do not belong to a goal, can have a time, and can repeat.
//
//   { action: "create", title, date, start?: "HH:MM", minutes?, repeat?: NONE|DAILY|WEEKLY|MONTHLY, days?: [1..7], until?, private? }
//   { action: "update", id, ...any of the create fields }
//   { action: "mark",   id, date, state: "DONE" | "SKIPPED" | null }    done / skip one day (null undoes it)
//   { action: "delete", id }                                             the plan and every day of it
// ---------------------------------------------------------------

/** A day as Y-m-d, kept to a sane range. */
function plan_day(mixed $v, string $field): string
{
    $s = (string) $v;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) || !checkdate((int) substr($s, 5, 2), (int) substr($s, 8, 2), (int) substr($s, 0, 4))) {
        json_error("Invalid {$field}.", 422);
    }
    $year = (int) substr($s, 0, 4);
    if ($year < 2000 || $year > 2100) {
        json_error("Invalid {$field}.", 422);
    }
    return $s;
}

function owned_plan(PDO $pdo, mixed $id, int $userId): array
{
    $id = filter_var($id, FILTER_VALIDATE_INT);
    $stmt = $pdo->prepare('SELECT * FROM day_plans WHERE id = ? AND user_id = ?');
    $stmt->execute([$id === false ? 0 : $id, $userId]);
    $p = $stmt->fetch();
    if (!$p) {
        json_error('Plan not found.', 404);
    }
    return $p;
}

/** Merges the request's fields over $row (the stored plan, or defaults) and checks the result. Returns DB columns. */
function plan_fields(array $in, array $row): array
{
    $out = $row;
    if (array_key_exists('title', $in)) {
        $out['title'] = trim((string) $in['title']);
    }
    if (array_key_exists('date', $in)) {
        $out['plan_date'] = plan_day($in['date'], 'date');
    }
    if (array_key_exists('start', $in)) {
        $s = $in['start'];
        if ($s === null || $s === '') {
            $out['start_time'] = null;
        } elseif (preg_match('/^([01]\d|2[0-3]):([0-5]\d)$/', (string) $s)) {
            $out['start_time'] = "{$s}:00";
        } else {
            json_error('The start time must look like 14:30.', 422);
        }
    }
    if (array_key_exists('minutes', $in)) {
        $out['duration_min'] = parse_estimate($in['minutes']);
    }
    if (array_key_exists('repeat', $in)) {
        $out['repeat_rule'] = strtoupper((string) $in['repeat']);
    }
    if (array_key_exists('days', $in)) {
        $days = array_values(array_unique(array_map('intval', (array) $in['days'])));
        foreach ($days as $d) {
            if ($d < 1 || $d > 7) {
                json_error('Weekdays are 1 (Monday) to 7 (Sunday).', 422);
            }
        }
        $out['repeat_days'] = streak_mask_from_days($days);
    }
    if (array_key_exists('private', $in)) {
        $out['is_private'] = $in['private'] ? 1 : 0;
    }
    if (array_key_exists('until', $in)) {
        $out['repeat_until'] = $in['until'] === null || $in['until'] === '' ? null : plan_day($in['until'], 'end date');
    }

    if ($out['title'] === '' || mb_strlen($out['title']) > 255) {
        json_error('A plan needs a name of 255 characters or fewer.', 422);
    }
    if (!in_array($out['repeat_rule'], REPEATS, true)) {
        json_error('Repeat must be NONE, DAILY, WEEKLY or MONTHLY.', 422);
    }
    if ($out['repeat_rule'] === 'WEEKLY' && (int) $out['repeat_days'] === 0) {
        // No weekdays chosen: the weekday of the first day
        $out['repeat_days'] = 1 << ((int) (new DateTimeImmutable($out['plan_date']))->format('N') - 1);
    }
    if ($out['repeat_rule'] !== 'WEEKLY') {
        $out['repeat_days'] = 0;
    }
    if ($out['repeat_rule'] === 'NONE') {
        $out['repeat_until'] = null;
    } elseif ($out['repeat_until'] !== null && $out['repeat_until'] < $out['plan_date']) {
        json_error('A repeating plan cannot end before it starts.', 422);
    }
    if ($out['start_time'] !== null && $out['duration_min'] !== null) {
        [$h, $m] = array_map('intval', explode(':', $out['start_time']));
        if ($h * 60 + $m + (int) $out['duration_min'] > 24 * 60) {
            json_error('A plan has to end by midnight. Split it into two days.', 422);
        }
    }
    return $out;
}

$action = (string) ($in['action'] ?? '');

if ($action === 'create') {
    if (empty($in['date'])) {
        json_error('Pick the day for this plan.', 422);
    }
    $p = plan_fields($in, [
        'title' => '', 'plan_date' => null, 'start_time' => null, 'duration_min' => null,
        'repeat_rule' => 'NONE', 'repeat_days' => 0, 'repeat_until' => null, 'is_private' => 0,
    ]);
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM day_plans WHERE user_id = ?');
    $stmt->execute([$userId]);
    if ((int) $stmt->fetchColumn() >= 5000) {
        json_error('You have reached the limit of 5000 day plans. Delete some old ones first.', 422);
    }
    $pdo->prepare('INSERT INTO day_plans (user_id, title, plan_date, start_time, duration_min, repeat_rule, repeat_days, repeat_until, is_private) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$userId, $p['title'], $p['plan_date'], $p['start_time'], $p['duration_min'], $p['repeat_rule'], $p['repeat_days'], $p['repeat_until'], $p['is_private']]);
    json_response(['success' => true, 'plan' => fetch_day_plans($pdo, $userId, (int) $pdo->lastInsertId())[0]], 201);
}

if ($action === 'update') {
    $row = owned_plan($pdo, $in['id'] ?? null, $userId);
    $p = plan_fields($in, $row);
    $pdo->prepare('UPDATE day_plans SET title = ?, plan_date = ?, start_time = ?, duration_min = ?, repeat_rule = ?, repeat_days = ?, repeat_until = ?, is_private = ? WHERE id = ?')
        ->execute([$p['title'], $p['plan_date'], $p['start_time'], $p['duration_min'], $p['repeat_rule'], $p['repeat_days'], $p['repeat_until'], $p['is_private'], $row['id']]);
    // A one-off plan that moved to another day takes its done mark with it
    if ($p['repeat_rule'] === 'NONE' && $row['plan_date'] !== $p['plan_date']) {
        $pdo->prepare('DELETE FROM day_plan_marks WHERE day_plan_id = ? AND on_date <> ?')->execute([$row['id'], $row['plan_date']]);
        $pdo->prepare('UPDATE day_plan_marks SET on_date = ? WHERE day_plan_id = ?')->execute([$p['plan_date'], $row['id']]);
    }
    json_response(['success' => true, 'plan' => fetch_day_plans($pdo, $userId, (int) $row['id'])[0]]);
}

if ($action === 'mark') {
    $row = owned_plan($pdo, $in['id'] ?? null, $userId);
    $date = plan_day($in['date'] ?? '', 'date');
    if (!day_plan_occurs($row, $date)) {
        json_error('This plan does not happen on that day.', 422);
    }
    $state = $in['state'] ?? null;
    if ($state === null) {
        $pdo->prepare('DELETE FROM day_plan_marks WHERE day_plan_id = ? AND on_date = ?')->execute([$row['id'], $date]);
    } elseif (in_array($state, ['DONE', 'SKIPPED'], true)) {
        $pdo->prepare('INSERT INTO day_plan_marks (day_plan_id, on_date, state) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE state = VALUES(state), marked_at = CURRENT_TIMESTAMP')
            ->execute([$row['id'], $date, $state]);
    } else {
        json_error('state must be DONE, SKIPPED or null.', 422);
    }
    $streak = $state === 'DONE' ? touch_streak($pdo, $userId) : null;   // finishing a plan counts as an active day
    json_response([
        'success' => true,
        'plan'    => fetch_day_plans($pdo, $userId, (int) $row['id'])[0],
        'streak'  => $streak ? ['count' => $streak['streak'], 'best' => $streak['best'], 'freezes' => $streak['freezes'], 'events' => $streak['events']] : null,
    ]);
}

if ($action === 'delete') {
    $row = owned_plan($pdo, $in['id'] ?? null, $userId);
    $pdo->prepare('DELETE FROM day_plans WHERE id = ?')->execute([$row['id']]);
    json_response(['success' => true]);
}

json_error('Unknown action. Use create, update, mark or delete.', 422);
