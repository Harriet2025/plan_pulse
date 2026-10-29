<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';
require_once __DIR__ . '/lib.php';

$pdo = get_db();
$userId = current_user_id($pdo);
require_method('POST');
$in = read_json_body();

// ---------------------------------------------------------------
// POST /api/reschedule.php   Body: { actions: [ ... up to 100 ... ] }
// Powers the "Catch up" page: move things that slipped, let them go, and undo all of it. Every action is checked
// against the signed-in user, and the whole batch is applied together or not at all.
//
//   { kind: "plan", id, op: "move",    to: "YYYY-MM-DD" }                a one-off day plan to another day
//   { kind: "plan", id, op: "skip" | "unskip" }                          let a missed day plan go, or bring it back
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

    if ($kind === 'plan') {
        // A one-off day plan: move it to another day (it keeps its time), or skip it (let it go), or bring it back
        $stmt = $pdo->prepare("SELECT plan_date FROM day_plans WHERE id = ? AND user_id = ? AND repeat_rule = 'NONE'");
        $stmt->execute([$id, $userId]);
        $day = $stmt->fetchColumn();
        if ($day === false) {
            json_error('Plan not found.', 404);
        }
        if ($op === 'move') {
            $to = checked_date($a['to'] ?? null, 'date', 'Y-m-d');
            if ($to === null) {
                json_error('A plan needs a day to move to.', 422);
            }
            $pdo->prepare('UPDATE day_plans SET plan_date = ? WHERE id = ?')->execute([$to, $id]);
            $pdo->prepare('DELETE FROM day_plan_marks WHERE day_plan_id = ?')->execute([$id]);   // a fresh, undone day
        } elseif ($op === 'skip') {
            $pdo->prepare("INSERT INTO day_plan_marks (day_plan_id, on_date, state) VALUES (?, ?, 'SKIPPED') ON DUPLICATE KEY UPDATE state = 'SKIPPED'")->execute([$id, $day]);
        } elseif ($op === 'unskip') {
            $pdo->prepare("DELETE FROM day_plan_marks WHERE day_plan_id = ? AND state = 'SKIPPED'")->execute([$id]);
        } else {
            json_error('A plan can be moved, skipped or unskipped.', 422);
        }
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
        json_error('Unknown action. Use plan/move, plan/skip, plan/unskip, goal/move, goal/archive or goal/restore.', 422);
    }
}
$pdo->commit();

json_response(['success' => true, 'applied' => count($actions)]);
