<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';
require __DIR__ . '/lib.php';

$pdo = get_db();
$userId = current_user_id($pdo);
$method = require_method('POST', 'PATCH');

// ---------------------------------------------------------------
// PATCH /api/goals.php   Body: { id, status: "ARCHIVED" | "ACTIVE" }
// Archives a goal, or restores an archived one (back to COMPLETED if every task was done).
// ---------------------------------------------------------------
if ($method === 'PATCH') {
    $in = read_json_body();
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

$timeframe = strtoupper((string) ($in['timeframe'] ?? 'DAILY'));
if (!in_array($timeframe, ['DAILY', 'WEEKLY', 'MONTHLY', 'SEMESTER', 'YEARLY'], true)) {
    json_error('Timeframe must be DAILY, WEEKLY, MONTHLY, SEMESTER or YEARLY.', 422);
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

$dueDate = parse_datetime_or_fail(isset($in['due_date']) ? (string) $in['due_date'] : null, 'due date', 'Y-m-d');

$quote = isset($in['quote']) ? trim((string) $in['quote']) : '';
if (mb_strlen($quote) > 500) {
    json_error('Quote must be 500 characters or fewer.', 422);
}

$tasks = [];   // each: [text, estimate in minutes or null]
foreach ((array) ($in['sub_plans'] ?? []) as $item) {
    $text = trim((string) (is_array($item) ? ($item['task_description'] ?? '') : $item));
    if ($text === '') {
        continue;
    }
    if (mb_strlen($text) > 500) {
        json_error('Each task must be 500 characters or fewer.', 422);
    }
    $tasks[] = [$text, parse_estimate(is_array($item) ? ($item['estimate_min'] ?? null) : null)];
}
if (count($tasks) > 50) {
    json_error('A goal can have at most 50 tasks.', 422);
}

$pdo->beginTransaction();
$stmt = $pdo->prepare(
    'INSERT INTO goals (user_id, title, category_id, priority, timeframe, due_date, quote)
     VALUES (?, ?, ?, ?, ?, ?, ?)'
);
$stmt->execute([$userId, $title, $categoryId, $priority, $timeframe, $dueDate, $quote !== '' ? $quote : null]);
$goalId = (int) $pdo->lastInsertId();

$ins = $pdo->prepare('INSERT INTO sub_plans (goal_id, task_description, estimate_min) VALUES (?, ?, ?)');
foreach ($tasks as [$text, $estimate]) {
    $ins->execute([$goalId, $text, $estimate]);
}
$pdo->commit();

json_response(['success' => true, 'goal' => fetch_goals($pdo, $userId, 'ALL', $goalId)[0]], 201);
