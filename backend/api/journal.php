<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';
require_once __DIR__ . '/lib.php';

$pdo = get_db();
$userId = current_user_id($pdo);
require_method('POST');
$in = read_json_body();

// ---------------------------------------------------------------
// POST /api/journal.php   The private journal. Nothing here is ever shown to partners.
//   { action: "save", id?, kind: NOTE|REVIEW|GOAL, date?, period?, period_key?, goal_id?, title?, body?, answers?, mood? }
//       Creates an entry, or updates it when `id` is given. A goal has one reflection and a period one review:
//       saving another updates that one.
//   { action: "delete", id }
// ---------------------------------------------------------------
const PROMPT_KEYS = ['went', 'ups', 'downs', 'how', 'lessons', 'wins', 'challenges', 'next'];

function day_or_fail(mixed $v, string $field): string
{
    $s = (string) $v;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) || !checkdate((int) substr($s, 5, 2), (int) substr($s, 8, 2), (int) substr($s, 0, 4)) || $s < '2000-01-01' || $s > '2100-12-31') {
        json_error("Invalid {$field}.", 422);
    }
    return $s;
}

$action = (string) ($in['action'] ?? '');

if ($action === 'delete') {
    $id = filter_var($in['id'] ?? null, FILTER_VALIDATE_INT);
    $stmt = $pdo->prepare('DELETE FROM journal_entries WHERE id = ? AND user_id = ?');
    $stmt->execute([$id === false ? 0 : $id, $userId]);
    if ($stmt->rowCount() !== 1) {
        json_error('Entry not found.', 404);
    }
    json_response(['success' => true]);
}

if ($action !== 'save') {
    json_error('Unknown action. Use save or delete.', 422);
}

$kind = strtoupper((string) ($in['kind'] ?? 'NOTE'));
if (!in_array($kind, ['NOTE', 'REVIEW', 'GOAL'], true)) {
    json_error('kind must be NOTE, REVIEW or GOAL.', 422);
}
$tz = $pdo->prepare('SELECT timezone FROM users WHERE id = ?');
$tz->execute([$userId]);
$today = streak_today((string) $tz->fetchColumn())->format('Y-m-d');
$date = isset($in['date']) && $in['date'] !== '' ? day_or_fail($in['date'], 'date') : $today;

$title = trim((string) ($in['title'] ?? ''));
if (mb_strlen($title) > 150) {
    json_error('A title is 150 characters or fewer.', 422);
}
$body = trim((string) ($in['body'] ?? ''));
if (mb_strlen($body) > 20000) {
    json_error('An entry is 20 000 characters or fewer.', 422);
}
$answers = [];
foreach ((array) ($in['answers'] ?? []) as $k => $v) {
    $v = trim((string) $v);
    if (!in_array($k, PROMPT_KEYS, true) || $v === '') {
        continue;
    }
    if (mb_strlen($v) > 5000) {
        json_error('Each answer is 5000 characters or fewer.', 422);
    }
    $answers[$k] = $v;
}
$mood = $in['mood'] ?? null;
if ($mood !== null && $mood !== '') {
    $mood = filter_var($mood, FILTER_VALIDATE_INT);
    if ($mood === false || $mood < 1 || $mood > 5) {
        json_error('Mood is 1 to 5.', 422);
    }
} else {
    $mood = null;
}
if ($body === '' && !$answers && $title === '') {
    json_error('Write something first.', 422);
}

$period = null;
$periodKey = null;
$goalId = null;
if ($kind === 'REVIEW') {
    $period = strtoupper((string) ($in['period'] ?? ''));
    if (!in_array($period, HORIZONS, true)) {
        json_error('A review is for a WEEKLY, MONTHLY or YEARLY period.', 422);
    }
    $periodKey = day_or_fail($in['period_key'] ?? '', 'period');
} elseif ($kind === 'GOAL') {
    $goalId = filter_var($in['goal_id'] ?? null, FILTER_VALIDATE_INT);
    $stmt = $pdo->prepare('SELECT 1 FROM goals WHERE id = ? AND user_id = ?');
    $stmt->execute([$goalId === false ? 0 : $goalId, $userId]);
    if (!$stmt->fetchColumn()) {
        json_error('Goal not found.', 404);
    }
}

// Which entry to update: the one named, or the existing reflection for this goal / period
$id = filter_var($in['id'] ?? null, FILTER_VALIDATE_INT) ?: null;
if (!$id && $kind !== 'NOTE') {
    $stmt = $kind === 'GOAL'
        ? $pdo->prepare("SELECT id FROM journal_entries WHERE user_id = ? AND kind = 'GOAL' AND goal_id = ?")
        : $pdo->prepare("SELECT id FROM journal_entries WHERE user_id = ? AND kind = 'REVIEW' AND period = ? AND period_key = ?");
    $stmt->execute($kind === 'GOAL' ? [$userId, $goalId] : [$userId, $period, $periodKey]);
    $id = $stmt->fetchColumn() ?: null;
}
$json = $answers ? json_encode($answers, JSON_UNESCAPED_UNICODE) : null;

if ($id) {
    $stmt = $pdo->prepare('UPDATE journal_entries SET kind = ?, entry_date = ?, period = ?, period_key = ?, goal_id = ?, title = ?, body = ?, answers = ?, mood = ? WHERE id = ? AND user_id = ?');
    $stmt->execute([$kind, $date, $period, $periodKey, $goalId, $title ?: null, $body ?: null, $json, $mood, $id, $userId]);
    $exists = $pdo->prepare('SELECT 1 FROM journal_entries WHERE id = ? AND user_id = ?');
    $exists->execute([$id, $userId]);
    if (!$exists->fetchColumn()) {
        json_error('Entry not found.', 404);
    }
} else {
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM journal_entries WHERE user_id = ?');
    $stmt->execute([$userId]);
    if ((int) $stmt->fetchColumn() >= 10000) {
        json_error('Your journal is full (10 000 entries).', 422);
    }
    $pdo->prepare('INSERT INTO journal_entries (user_id, kind, entry_date, period, period_key, goal_id, title, body, answers, mood) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$userId, $kind, $date, $period, $periodKey, $goalId, $title ?: null, $body ?: null, $json, $mood]);
    $id = (int) $pdo->lastInsertId();
}
json_response(['success' => true, 'entry' => fetch_journal($pdo, $userId, (int) $id)[0]], 201);
