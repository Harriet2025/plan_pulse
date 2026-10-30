<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';
require_once __DIR__ . '/lib.php';

$pdo = get_db();
$userId = current_user_id($pdo);
$method = require_method('PATCH', 'POST', 'DELETE');
$in = read_json_body();

// ---------------------------------------------------------------
// DELETE /api/sub_plans.php   Body: { id }
// Removes one plan from its goal. The goal's progress (and COMPLETED status) is worked out again.
// ---------------------------------------------------------------
if ($method === 'DELETE') {
    $id = filter_var($in['id'] ?? null, FILTER_VALIDATE_INT);
    $stmt = $pdo->prepare('SELECT sp.goal_id FROM sub_plans sp JOIN goals g ON g.id = sp.goal_id WHERE sp.id = ? AND g.user_id = ?');
    $stmt->execute([$id === false ? 0 : $id, $userId]);
    $goalId = $stmt->fetchColumn();
    if ($goalId === false) {
        json_error('Plan not found.', 404);
    }
    $pdo->prepare('DELETE FROM sub_plans WHERE id = ?')->execute([$id]);
    $progress = goal_progress($pdo, (int) $goalId);
    json_response(['success' => true, 'goal_id' => (int) $goalId, 'goal_status' => sync_goal_completion($pdo, (int) $goalId, $progress), 'progress' => $progress]);
}

/** @param ?array $streak the result of touch_streak(), or null when this request did not finish a task */
function sub_plan_payload(PDO $pdo, int $subPlanId, int $goalId, ?array $streak = null): array
{
    $stmt = $pdo->prepare('SELECT id, task_description, is_completed, remind_at, estimate_min FROM sub_plans WHERE id = ?');
    $stmt->execute([$subPlanId]);
    $s = $stmt->fetch();
    // A goal moves to COMPLETED at 100% and back to ACTIVE if a task is unchecked or added
    $goalStatus = sync_goal_completion($pdo, $goalId, goal_progress($pdo, $goalId));
    return [
        'success'      => true,
        'goal_id'      => $goalId,
        'goal_status'  => $goalStatus,
        'streak_count' => $streak['streak'] ?? null,
        // New streak state plus what happened (freeze_used, freeze_earned, reset), so the app can say so
        'streak'       => $streak ? ['count' => $streak['streak'], 'best' => $streak['best'], 'freezes' => $streak['freezes'], 'events' => $streak['events']] : null,
        'sub_plan' => [
            'id'               => (int) $s['id'],
            'task_description' => $s['task_description'],
            'is_completed'     => (bool) $s['is_completed'],
            'remind_at'        => $s['remind_at'],
            'estimate_min'     => $s['estimate_min'] !== null ? (int) $s['estimate_min'] : null,
        ],
        'progress' => goal_progress($pdo, $goalId),
    ];
}

// ---------------------------------------------------------------
// PATCH /api/sub_plans.php   Body: { id, is_completed?: 0|1|true|false, remind_at?: datetime|null }
// ---------------------------------------------------------------
if ($method === 'PATCH') {
    $id = filter_var($in['id'] ?? null, FILTER_VALIDATE_INT);
    $hasCompleted = array_key_exists('is_completed', $in);
    $hasRemind = array_key_exists('remind_at', $in);
    $hasEstimate = array_key_exists('estimate_min', $in);
    $hasText = array_key_exists('task_description', $in);
    $completed = $hasCompleted
        ? filter_var($in['is_completed'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)
        : null;
    if ($id === false || $id === null || (!$hasCompleted && !$hasRemind && !$hasEstimate && !$hasText) || ($hasCompleted && $completed === null)) {
        json_error('id and is_completed (0 or 1), remind_at and/or estimate_min are required.', 422);
    }
    $estimate = $hasEstimate ? parse_estimate($in['estimate_min']) : null;
    // remind_at: a date/time to set a reminder, or null / "" to clear it
    $remindAt = $hasRemind
        ? parse_datetime_or_fail($in['remind_at'] === null ? null : (string) $in['remind_at'], 'reminder time', 'Y-m-d H:i:s')
        : null;

    // Only touch tasks that belong to a goal owned by the current user
    $stmt = $pdo->prepare(
        'SELECT sp.goal_id FROM sub_plans sp JOIN goals g ON g.id = sp.goal_id WHERE sp.id = ? AND g.user_id = ?'
    );
    $stmt->execute([$id, $userId]);
    $goalId = $stmt->fetchColumn();
    if ($goalId === false) {
        json_error('Task not found.', 404);
    }

    if ($hasCompleted) {
        // completed_at feeds the partners' weekly scoreboard; re-ticking a done plan keeps its first time
        $pdo->prepare('UPDATE sub_plans SET is_completed = ?, completed_at = IF(?, COALESCE(completed_at, NOW()), NULL) WHERE id = ?')
            ->execute([$completed ? 1 : 0, $completed ? 1 : 0, $id]);
    }
    if ($hasRemind) {
        $pdo->prepare('UPDATE sub_plans SET remind_at = ? WHERE id = ?')->execute([$remindAt, $id]);
    }
    if ($hasEstimate) {
        $pdo->prepare('UPDATE sub_plans SET estimate_min = ? WHERE id = ?')->execute([$estimate, $id]);
    }
    if ($hasText) {   // renaming a plan
        $text = trim((string) $in['task_description']);
        if ($text === '' || mb_strlen($text) > 500) {
            json_error('A plan is 1 to 500 characters.', 422);
        }
        $pdo->prepare('UPDATE sub_plans SET task_description = ? WHERE id = ?')->execute([$text, $id]);
    }
    $streak = $completed ? touch_streak($pdo, $userId) : null;   // finishing a task counts as an active day
    json_response(sub_plan_payload($pdo, $id, (int) $goalId, $streak));
}

// ---------------------------------------------------------------
// POST /api/sub_plans.php   Body: { goal_id, task_description, remind_at? }
// ---------------------------------------------------------------
$goalId = filter_var($in['goal_id'] ?? null, FILTER_VALIDATE_INT);
$text = trim((string) ($in['task_description'] ?? ''));
if ($goalId === false || $goalId === null || $text === '' || mb_strlen($text) > 500) {
    json_error('goal_id and a task_description of 1 to 500 characters are required.', 422);
}
$remindAt = parse_datetime_or_fail(isset($in['remind_at']) ? (string) $in['remind_at'] : null, 'reminder time', 'Y-m-d H:i:s');
$estimate = parse_estimate($in['estimate_min'] ?? null);

$stmt = $pdo->prepare('SELECT 1 FROM goals WHERE id = ? AND user_id = ?');
$stmt->execute([$goalId, $userId]);
if (!$stmt->fetchColumn()) {
    json_error('Goal not found.', 404);
}

$pdo->prepare('INSERT INTO sub_plans (goal_id, task_description, remind_at, estimate_min) VALUES (?, ?, ?, ?)')
    ->execute([$goalId, $text, $remindAt, $estimate]);
json_response(sub_plan_payload($pdo, (int) $pdo->lastInsertId(), $goalId), 201);
