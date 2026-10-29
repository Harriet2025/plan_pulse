<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';
require __DIR__ . '/lib.php';

$pdo = get_db();
$userId = current_user_id($pdo);
require_method('GET');

// ---------------------------------------------------------------
// GET /api/snapshot.php
// Everything the app needs in one request: the profile, every goal (any status) with its tasks,
// and every badge earned. Reminders, analytics and history are worked out in the browser from this.
// ---------------------------------------------------------------
$stmt = $pdo->prepare(
    "SELECT r.id, r.goal_id, g.title AS goal_title, r.completion_percentage, r.reward_badge_tier, r.reviewed_at
     FROM reviews r JOIN goals g ON g.id = r.goal_id
     WHERE g.user_id = ? AND r.reward_badge_tier <> 'NONE'
     ORDER BY r.id DESC"
);
$stmt->execute([$userId]);
$reviews = array_map(fn($r) => [
    'id'          => (int) $r['id'],
    'goal_id'     => (int) $r['goal_id'],
    'goal_title'  => $r['goal_title'],
    'tier'        => min(3, TIER_RANK[$r['reward_badge_tier']] ?? 0),
    'pct'         => (float) $r['completion_percentage'],
    'reviewed_at' => $r['reviewed_at'],
], $stmt->fetchAll());

json_response([
    'success' => true,
    'user'    => fetch_user_payload($pdo, $userId),
    'goals'   => fetch_goals($pdo, $userId, 'ALL'),
    'reviews' => $reviews,
]);
