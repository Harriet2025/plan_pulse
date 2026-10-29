<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';
require __DIR__ . '/lib.php';

$pdo = get_db();
$userId = current_user_id($pdo);
require_method('POST');
$in = read_json_body();

// ---------------------------------------------------------------
// POST /api/reschedule.php   Body: { actions: [ ... up to 100 ... ] }
// Powers the "Catch up" page: move things that slipped, let them go, and undo all of it. Every action is checked
// against the signed-in user, and the whole batch is applied together or not at all.
//
//   { kind: "task", id, op: "move",    to: "YYYY-MM-DDTHH:mm" | null }   new reminder time (null clears it)
//   { kind: "goal", id, op: "move",    to: "YYYY-MM-DD" | null }         new due date (null clears it)
//   { kind: "goal", id, op: "archive" }                                  let the goal go (it stays in History)
//   { kind: "goal", id, op: "restore" }                                  bring an archived goal back
// ---------------------------------------------------------------
$actions = $in['actions'] ?? null;
if (!is_array($actions) || !$actions || count($actions) > 100) {
    json_error('Send between 1 and 100 actions.', 422);
}

/** Dates are parsed leniently by PHP, so keep them in a sane range before they reach the database. */
function checked_date(mixed $to, string $field, string $format): ?string
{
    if ($to === null || $to === '') {
        return null;
    }
    $value = parse_datetime_or_fail((string) $to, $field, $format);
    $year = (int) substr((string) $value, 0, 4);
    if ($year < 2000 || $year > 2100) {
        json_error("Invalid {$field}.", 422);
    }
    return $value;
}

function owns_goal(PDO $pdo, int $goalId, int $userId): ?string
{
    $stmt = $pdo->prepare('SELECT status FROM goals WHERE id = ? AND user_id = ?');
    $stmt->execute([$goalId, $userId]);
    $status = $stmt->fetchColumn();
    return $status === false ? null : (string) $status;
}

$pdo->beginTransaction();
foreach ($actions as $a) {
    if (!is_array($a)) {
        json_error('Every action needs a kind, an op and an id.', 422);
    }
    $kind = $a['kind'] ?? '';
    $op = $a['op'] ?? '';
    $id = filter_var($a['id'] ?? null, FILTER_VALIDATE_INT);
    if ($id === false || $id === null) {
        json_error('Every action needs a kind, an op and an id.', 422);
    }

    if ($kind === 'task' && $op === 'move') {
        $stmt = $pdo->prepare('SELECT 1 FROM sub_plans sp JOIN goals g ON g.id = sp.goal_id WHERE sp.id = ? AND g.user_id = ?');
        $stmt->execute([$id, $userId]);
        if (!$stmt->fetchColumn()) {
            json_error('Task not found.', 404);
        }
        $pdo->prepare('UPDATE sub_plans SET remind_at = ? WHERE id = ?')
            ->execute([checked_date($a['to'] ?? null, 'reminder time', 'Y-m-d H:i:s'), $id]);
    } elseif ($kind === 'goal' && $op === 'move') {
        if (owns_goal($pdo, $id, $userId) === null) {
            json_error('Goal not found.', 404);
        }
        $pdo->prepare('UPDATE goals SET due_date = ? WHERE id = ?')
            ->execute([checked_date($a['to'] ?? null, 'due date', 'Y-m-d'), $id]);
    } elseif ($kind === 'goal' && $op === 'archive') {
        if (owns_goal($pdo, $id, $userId) === null) {
            json_error('Goal not found.', 404);
        }
        $pdo->prepare("UPDATE goals SET status = 'ARCHIVED' WHERE id = ?")->execute([$id]);
    } elseif ($kind === 'goal' && $op === 'restore') {
        if (owns_goal($pdo, $id, $userId) === null) {
            json_error('Goal not found.', 404);
        }
        $pdo->prepare("UPDATE goals SET status = 'ACTIVE' WHERE id = ? AND status = 'ARCHIVED'")->execute([$id]);
        sync_goal_completion($pdo, $id, goal_progress($pdo, $id));   // back to COMPLETED if every task was already done
    } else {
        json_error('Unknown action. Use task/move, goal/move, goal/archive or goal/restore.', 422);
    }
}
$pdo->commit();

json_response(['success' => true, 'applied' => count($actions)]);
