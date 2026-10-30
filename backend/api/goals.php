<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';
require_once __DIR__ . '/lib.php';

$pdo = get_db();
$userId = current_user_id($pdo);
$method = require_method('POST', 'PATCH', 'DELETE');

// ---------------------------------------------------------------
// DELETE /api/goals.php   Body: { id }
// Deletes a goal for good, with its plans and badges. (Archive keeps it in History instead.)
// ---------------------------------------------------------------
if ($method === 'DELETE') {
    $in = read_json_body();
    $id = filter_var($in['id'] ?? null, FILTER_VALIDATE_INT);
    $stmt = $pdo->prepare('DELETE FROM goals WHERE id = ? AND user_id = ?');
    $stmt->execute([$id === false ? 0 : $id, $userId]);
    if ($stmt->rowCount() !== 1) {
        json_error('Goal not found.', 404);
    }
    json_response(['success' => true]);
}

// ---------------------------------------------------------------
// PATCH /api/goals.php   Body: { id, status: "ARCHIVED" | "ACTIVE" }  or  { id, is_private: true | false }
// Archives a goal, or restores an archived one (back to COMPLETED if every task was done), or hides it from partners.
// ---------------------------------------------------------------
if ($method === 'PATCH') {
    $in = read_json_body();
    if (array_key_exists('is_private', $in)) {
        $id = filter_var($in['id'] ?? null, FILTER_VALIDATE_INT);
        $stmt = $pdo->prepare('UPDATE goals SET is_private = ? WHERE id = ? AND user_id = ?');
        $stmt->execute([$in['is_private'] ? 1 : 0, $id === false ? 0 : $id, $userId]);
        $goal = fetch_goals($pdo, $userId, 'ALL', $id === false ? 0 : $id)[0] ?? null;
        if (!$goal) {
            json_error('Goal not found.', 404);
        }
        json_response(['success' => true, 'goal' => $goal]);
    }
    $id = filter_var($in['id'] ?? null, FILTER_VALIDATE_INT);
    $want = strtoupper((string) ($in['status'] ?? ''));
    if ($id === false || $id === null || !in_array($want, ['ARCHIVED', 'ACTIVE'], true)) {
        json_error('id and a status of ARCHIVED or ACTIVE are required.', 422);
    }

    $stmt = $pdo->prepare('SELECT status FROM goals WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $userId]);
    $current = $stmt->fetchColumn();
    if ($current === false) {
        json_error('Goal not found.', 404);
    }

    if ($want === 'ARCHIVED') {
        $pdo->prepare("UPDATE goals SET status = 'ARCHIVED' WHERE id = ?")->execute([$id]);
    } elseif ($current === 'ARCHIVED') {
        $pdo->prepare("UPDATE goals SET status = 'ACTIVE' WHERE id = ?")->execute([$id]);
        sync_goal_completion($pdo, $id, goal_progress($pdo, $id));
    }
    json_response(['success' => true, 'goal' => fetch_goals($pdo, $userId, 'ALL', $id)[0]]);
}

// ---------------------------------------------------------------
// POST /api/goals.php
// Body: { title, category_id?, priority?, timeframe?, due_date?, quote?, sub_plans?: [string] }
// ---------------------------------------------------------------
$in = read_json_body();

$title = trim((string) ($in['title'] ?? ''));
if ($title === '' || mb_strlen($title) > 255) {
    json_error('Title is required and must be 255 characters or fewer.', 422);
}

$priority = strtoupper((string) ($in['priority'] ?? 'MEDIUM'));
if (!in_array($priority, ['HIGH', 'MEDIUM', 'LOW'], true)) {
    json_error('Priority must be HIGH, MEDIUM or LOW.', 422);
}

// The horizon: a goal for a week, a month or a year (a day has plans, not goals)
$timeframe = strtoupper((string) ($in['timeframe'] ?? 'WEEKLY'));
if (!in_array($timeframe, HORIZONS, true)) {
    json_error('A goal is for a week, a month or a year (WEEKLY, MONTHLY or YEARLY). Plans for a single day go on the day itself.', 422);
}

$categoryId = null;
if (isset($in['category_id']) && $in['category_id'] !== '') {
    $categoryId = filter_var($in['category_id'], FILTER_VALIDATE_INT);
    if ($categoryId === false) {
        json_error('Invalid category.', 422);
    }
    $stmt = $pdo->prepare('SELECT 1 FROM categories WHERE id = ?');
    $stmt->execute([$categoryId]);
    if (!$stmt->fetchColumn()) {
        json_error('Category not found.', 422);
    }
}

// The due date places the goal in its period. Without one it is the end of the current period, on the user's clock.
$dueDate = parse_datetime_or_fail(isset($in['due_date']) ? (string) $in['due_date'] : null, 'due date', 'Y-m-d');
if ($dueDate === null) {
    $tz = $pdo->prepare('SELECT timezone FROM users WHERE id = ?');
    $tz->execute([$userId]);
    $dueDate = period_end($timeframe, streak_today((string) $tz->fetchColumn()));
}

$quote = isset($in['quote']) ? trim((string) $in['quote']) : '';
if (mb_strlen($quote) > 500) {
    json_error('Quote must be 500 characters or fewer.', 422);
}

// The goal's plans: a checklist of the steps that reach it (times belong to day plans, not here)
$tasks = [];
foreach ((array) ($in['sub_plans'] ?? []) as $item) {
    $text = trim((string) (is_array($item) ? ($item['task_description'] ?? '') : $item));
    if ($text === '') {
        continue;
    }
    if (mb_strlen($text) > 500) {
        json_error('Each plan must be 500 characters or fewer.', 422);
    }
    $tasks[] = $text;
}
if (count($tasks) > 50) {
    json_error('A goal can have at most 50 plans.', 422);
}

$pdo->beginTransaction();
$stmt = $pdo->prepare(
    'INSERT INTO goals (user_id, title, category_id, priority, timeframe, due_date, quote, is_private)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
$stmt->execute([$userId, $title, $categoryId, $priority, $timeframe, $dueDate, $quote !== '' ? $quote : null, empty($in['is_private']) ? 0 : 1]);
$goalId = (int) $pdo->lastInsertId();

$ins = $pdo->prepare('INSERT INTO sub_plans (goal_id, task_description) VALUES (?, ?)');
foreach ($tasks as $text) {
    $ins->execute([$goalId, $text]);
}
$pdo->commit();

json_response(['success' => true, 'goal' => fetch_goals($pdo, $userId, 'ALL', $goalId)[0]], 201);
