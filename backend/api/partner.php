<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';
require_once __DIR__ . '/lib.php';
require __DIR__ . '/../partners.php';

$pdo = get_db();
$userId = current_user_id($pdo);
require_method('GET');

// ---------------------------------------------------------------
// GET /api/partner.php?id=<partnership id>
// What a partner shares: their goals (active ones, and ones finished in the last two weeks) with each goal's plans,
// their plans for today (in their own time zone), and this week's scoreboard. Only the categories they chose to share
// with you (and their day plans only if they chose to), and never anything they marked private.
// ---------------------------------------------------------------
$p = accepted_partnership($pdo, $userId, $_GET['id'] ?? null);
$partnerId = $p['partner_id'];
$profile = partner_profile($pdo, $partnerId);
$shares = shared_with_partner($pdo, (int) $p['id'], $partnerId);

$goals = [];
foreach (fetch_goals($pdo, $partnerId, 'ALL') as $g) {
    if (!goal_is_shared($g, $shares) || $g['status'] === 'ARCHIVED') {
        continue;
    }
    if ($g['status'] === 'COMPLETED' && strtotime((string) $g['completed_at']) < time() - 14 * 86400) {
        continue;
    }
    $goals[] = [
        'id' => $g['id'], 'title' => $g['title'], 'category_id' => $g['category_id'], 'priority' => $g['priority'],
        'timeframe' => $g['timeframe'], 'due_date' => $g['due_date'], 'status' => $g['status'], 'completed_at' => $g['completed_at'],
        'plans' => array_map(fn($s) => ['text' => $s['task_description'], 'done' => $s['is_completed']], $g['sub_plans']),
    ];
}

// Their today, on their clock
$stmt = $pdo->prepare('SELECT timezone FROM users WHERE id = ?');
$stmt->execute([$partnerId]);
$theirToday = streak_today((string) $stmt->fetchColumn())->format('Y-m-d');
$today = [];
foreach (in_array(SHARE_DAY_PLANS, $shares, true) ? fetch_day_plans($pdo, $partnerId) : [] as $d) {
    $row = ['plan_date' => $d['date'], 'repeat_rule' => $d['repeat'], 'repeat_days' => streak_mask_from_days($d['days']), 'repeat_until' => $d['until']];
    $mark = ((array) $d['marks'])[$theirToday] ?? null;
    if ($d['private'] || $mark === 'SKIPPED' || !day_plan_occurs($row, $theirToday)) {
        continue;
    }
    $today[] = ['title' => $d['title'], 'start' => $d['start'], 'minutes' => $d['minutes'], 'repeat' => $d['repeat'], 'done' => $mark === 'DONE'];
}
usort($today, fn($a, $b) => strcmp($a['start'] ?? '99', $b['start'] ?? '99'));

json_response([
    'success'   => true,
    'partner'   => $profile,
    'shares'    => $shares,          // what they share with you: category ids, 0 = day plans
    'date'      => $theirToday,
    'goals'     => $goals,
    'today'     => $today,
    'scoreboard' => ['me' => plans_done_this_week($pdo, $userId), 'them' => plans_done_this_week($pdo, $partnerId)],
]);
