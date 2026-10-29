<?php
declare(strict_types=1);

// Shared helpers for the AuraGoal API endpoints. Include after ../db.php.

const TIER_RANK = ['NONE' => 0, 'BRONZE' => 1, 'SILVER' => 2, 'GOLD' => 3, 'PLATINUM' => 4];

function tier_for_percentage(float $pct): string
{
    if ($pct >= 90) return 'GOLD';
    if ($pct >= 75) return 'SILVER';
    if ($pct >= 50) return 'BRONZE';
    return 'NONE';
}

/** @return array{percentage:int, completed:int, total:int} */
function goal_progress(PDO $pdo, int $goalId): array
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) AS total, COALESCE(SUM(is_completed), 0) AS done FROM sub_plans WHERE goal_id = ?'
    );
    $stmt->execute([$goalId]);
    $row = $stmt->fetch();
    $total = (int) $row['total'];
    $done = (int) $row['done'];
    return [
        'percentage' => $total > 0 ? (int) round(100 * $done / $total) : 0,
        'completed'  => $done,
        'total'      => $total,
    ];
}

/**
 * Moves a goal between ACTIVE and COMPLETED when its progress reaches or leaves 100%.
 * Archived goals are left alone. Returns the goal's resulting status.
 */
function sync_goal_completion(PDO $pdo, int $goalId, array $progress): string
{
    $stmt = $pdo->prepare('SELECT status FROM goals WHERE id = ?');
    $stmt->execute([$goalId]);
    $status = (string) $stmt->fetchColumn();

    if ($status === 'ACTIVE' && $progress['total'] > 0 && $progress['percentage'] === 100) {
        $pdo->prepare("UPDATE goals SET status = 'COMPLETED', completed_at = NOW() WHERE id = ?")->execute([$goalId]);
        return 'COMPLETED';
    }
    if ($status === 'COMPLETED' && $progress['percentage'] < 100) {
        $pdo->prepare("UPDATE goals SET status = 'ACTIVE', completed_at = NULL WHERE id = ?")->execute([$goalId]);
        return 'ACTIVE';
    }
    return $status;
}

// Streak rules (rest days, freezes) live in ../streak.php; touch_streak() is defined there.

/**
 * Goals for a user, each with its sub-plans and best badge tier.
 * $status: ACTIVE | COMPLETED | ARCHIVED | HISTORY | ALL
 */
function fetch_goals(PDO $pdo, int $userId, string $status = 'ACTIVE', ?int $goalId = null): array
{
    $sql = 'SELECT g.id, g.title, g.category_id, g.priority, g.timeframe, g.due_date, g.quote, g.is_private, g.status,
                   g.completed_at, g.created_at, g.updated_at
            FROM goals g
            WHERE g.user_id = ?';
    $params = [$userId];
    if ($status === 'HISTORY') {
        $sql .= " AND g.status IN ('COMPLETED', 'ARCHIVED')";
    } elseif ($status !== 'ALL') {
        $sql .= ' AND g.status = ?';
        $params[] = $status;
    }
    if ($goalId !== null) {
        $sql .= ' AND g.id = ?';
        $params[] = $goalId;
    }
    $sql .= ' ORDER BY g.created_at DESC, g.id DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $goals = $stmt->fetchAll();
    if (!$goals) {
        return [];
    }

    $ids = array_map(fn($g) => (int) $g['id'], $goals);
    $in = implode(',', array_fill(0, count($ids), '?'));

    $subs = [];
    $stmt = $pdo->prepare("SELECT id, goal_id, task_description, is_completed, remind_at, estimate_min
                           FROM sub_plans WHERE goal_id IN ($in) ORDER BY id");
    $stmt->execute($ids);
    foreach ($stmt->fetchAll() as $s) {
        $subs[(int) $s['goal_id']][] = [
            'id'               => (int) $s['id'],
            'task_description' => $s['task_description'],
            'is_completed'     => (bool) $s['is_completed'],
            'remind_at'        => $s['remind_at'],
            'estimate_min'     => $s['estimate_min'] !== null ? (int) $s['estimate_min'] : null,
        ];
    }

    $best = [];
    $stmt = $pdo->prepare("SELECT goal_id, reward_badge_tier FROM reviews WHERE goal_id IN ($in)");
    $stmt->execute($ids);
    foreach ($stmt->fetchAll() as $r) {
        $gid = (int) $r['goal_id'];
        $rank = TIER_RANK[$r['reward_badge_tier']] ?? 0;
        if ($rank > ($best[$gid] ?? 0)) {
            $best[$gid] = $rank;
        }
    }

    return array_map(function ($g) use ($subs, $best) {
        $id = (int) $g['id'];
        return [
            'id'             => $id,
            'title'          => $g['title'],
            'category_id'    => $g['category_id'] !== null ? (int) $g['category_id'] : null,
            'priority'       => $g['priority'],
            'timeframe'      => $g['timeframe'],
            'due_date'       => $g['due_date'],
            'quote'          => $g['quote'],
            'is_private'     => (bool) $g['is_private'],
            'status'         => $g['status'],
            'completed_at'   => $g['completed_at'],
            'created_at'     => $g['created_at'],
            'updated_at'     => $g['updated_at'],
            'best_tier_rank' => $best[$id] ?? 0,
            'sub_plans'      => $subs[$id] ?? [],
        ];
    }, $goals);
}

/** What a goal can be for. A day has no goals, only its own plans (day_plans). */
const HORIZONS = ['WEEKLY', 'MONTHLY', 'YEARLY'];

/** The last day of the week (Monday to Sunday) / month / year that contains $day, as Y-m-d. */
function period_end(string $horizon, DateTimeImmutable $day): string
{
    return match ($horizon) {
        'WEEKLY'  => $day->modify('+' . (7 - (int) $day->format('N')) . ' days')->format('Y-m-d'),
        'MONTHLY' => $day->format('Y-m-t'),
        'YEARLY'  => $day->format('Y') . '-12-31',
    };
}

// ---- Day plans --------------------------------------------------------------------------------------------------

const REPEATS = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'];

/**
 * Whether a day plan happens on $day (Y-m-d). Repeating plans run from plan_date to repeat_until; weekly ones on the
 * weekdays in repeat_days; monthly ones on plan_date's day of the month (or the month's last day when it is shorter).
 * Mirrors occursOn() in src/lib/utils.js, so keep the two in step.
 */
function day_plan_occurs(array $p, string $day): bool
{
    $first = (string) $p['plan_date'];
    if ($day < $first || ($p['repeat_until'] !== null && $day > (string) $p['repeat_until'])) {
        return false;
    }
    $d = new DateTimeImmutable($day);
    return match ($p['repeat_rule']) {
        'NONE'    => $day === $first,
        'DAILY'   => true,
        'WEEKLY'  => ((int) $p['repeat_days'] & (1 << ((int) $d->format('N') - 1))) !== 0,
        'MONTHLY' => (int) $d->format('j') === min((int) substr($first, 8, 2), (int) $d->format('t')),
        default   => false,
    };
}

/** A user's day plans with their marks (done / skipped days), as the API sends them. */
function fetch_day_plans(PDO $pdo, int $userId, ?int $planId = null): array
{
    $sql = 'SELECT id, title, plan_date, start_time, duration_min, repeat_rule, repeat_days, repeat_until, is_private FROM day_plans WHERE user_id = ?';
    $params = [$userId];
    if ($planId !== null) {
        $sql .= ' AND id = ?';
        $params[] = $planId;
    }
    $stmt = $pdo->prepare($sql . ' ORDER BY plan_date, start_time IS NULL, start_time, id');
    $stmt->execute($params);
    $plans = $stmt->fetchAll();
    if (!$plans) {
        return [];
    }
    $ids = array_map(fn($p) => (int) $p['id'], $plans);
    $marks = [];
    $stmt = $pdo->prepare('SELECT day_plan_id, on_date, state FROM day_plan_marks WHERE day_plan_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
    $stmt->execute($ids);
    foreach ($stmt->fetchAll() as $m) {
        $marks[(int) $m['day_plan_id']][$m['on_date']] = $m['state'];
    }
    return array_map(fn($p) => [
        'id'           => (int) $p['id'],
        'title'        => $p['title'],
        'date'         => $p['plan_date'],
        'start'        => $p['start_time'] !== null ? substr((string) $p['start_time'], 0, 5) : null,
        'minutes'      => $p['duration_min'] !== null ? (int) $p['duration_min'] : null,
        'repeat'       => $p['repeat_rule'],
        'days'         => streak_days_from_mask((int) $p['repeat_days']),   // ISO weekdays, 1 = Monday
        'until'        => $p['repeat_until'],
        'private'      => (bool) $p['is_private'],                         // hidden from partners
        'marks'        => (object) ($marks[(int) $p['id']] ?? []),           // { 'Y-m-d': 'DONE' | 'SKIPPED' }
    ], $plans);
}

/** A task's time estimate in minutes: null (or empty) clears it, otherwise 5 to 720. Calls json_error when invalid. */
function parse_estimate(mixed $value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }
    $n = filter_var($value, FILTER_VALIDATE_INT);
    if ($n === false || $n < 5 || $n > 720) {
        json_error('A time estimate must be between 5 minutes and 12 hours.', 422);
    }
    return $n;
}

/** Parse a user-supplied date/datetime; returns null when empty, calls json_error when invalid. */
function parse_datetime_or_fail(?string $value, string $field, string $format): ?string
{
    if ($value === null || trim($value) === '') {
        return null;
    }
    try {
        $dt = new DateTimeImmutable($value);
    } catch (Exception $e) {
        json_error("Invalid {$field}.", 422);
    }
    return $dt->format($format);
}
