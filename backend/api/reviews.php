<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';
require __DIR__ . '/lib.php';

$pdo = get_db();
$userId = current_user_id($pdo);
require_method('POST');
$in = read_json_body();

// ---------------------------------------------------------------
// POST /api/reviews.php   Body: { goal_id }
// Records a badge review when the goal reaches a higher tier than it has earned before.
// The percentage and tier are computed from the database; the client's numbers are never trusted.
// ---------------------------------------------------------------
$goalId = filter_var($in['goal_id'] ?? null, FILTER_VALIDATE_INT);
if ($goalId === false || $goalId === null) {
    json_error('goal_id is required.', 422);
}

$pdo->beginTransaction();

// Lock the goal row so two quick requests cannot both award the same badge
$stmt = $pdo->prepare('SELECT id FROM goals WHERE id = ? AND user_id = ? FOR UPDATE');
$stmt->execute([$goalId, $userId]);
if (!$stmt->fetchColumn()) {
    $pdo->rollBack();
    json_error('Goal not found.', 404);
}

$progress = goal_progress($pdo, $goalId);
$tier = tier_for_percentage($progress['percentage']);
$rank = TIER_RANK[$tier];

$stmt = $pdo->prepare('SELECT reward_badge_tier FROM reviews WHERE goal_id = ?');
$stmt->execute([$goalId]);
$bestRank = 0;
foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $t) {
    $bestRank = max($bestRank, TIER_RANK[$t] ?? 0);
}

if ($rank === 0 || $rank <= $bestRank) {
    $pdo->commit();
    json_response([
        'success'  => true,
        'created'  => false,
        'reason'   => $rank === 0 ? 'below_threshold' : 'already_earned',
        'progress' => $progress,
    ]);
}

$pdo->prepare('INSERT INTO reviews (goal_id, completion_percentage, reward_badge_tier) VALUES (?, ?, ?)')
    ->execute([$goalId, $progress['percentage'], $tier]);
$reviewId = (int) $pdo->lastInsertId();
$pdo->commit();

$stmt = $pdo->prepare('SELECT reviewed_at FROM reviews WHERE id = ?');
$stmt->execute([$reviewId]);

json_response([
    'success'  => true,
    'created'  => true,
    'review'   => [
        'id'                    => $reviewId,
        'goal_id'               => $goalId,
        'completion_percentage' => $progress['percentage'],
        'reward_badge_tier'     => $tier,
        'reward_rank'           => $rank,
        'reviewed_at'           => $stmt->fetchColumn(),
    ],
    'progress' => $progress,
], 201);
