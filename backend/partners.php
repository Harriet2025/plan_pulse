<?php
declare(strict_types=1);

/**
 * Accountability partners: who is whose partner, the chat streak and the weekly scoreboard.
 * Used by api/partners.php, api/partner.php, api/messages.php and api/avatar.php. Expects db.php to be loaded.
 *
 * An invite is made to an email address and waits until someone with that address accepts it, so inviting never
 * reveals whether an address has an account. Days for the chat streak and the scoreboard are counted in UTC, so both
 * partners always see the same numbers.
 */

const MAX_PARTNERS = 5;
const CHEER_EMOJI = ['🔥', '👏', '💪', '❤️', '🎉', '⭐'];
const SHARE_DAY_PLANS = 0;     // partner_shares.category_id for "my day plans"
const OTHERS_CATEGORY = 9;     // a goal without a category counts as Others when deciding what is shared

/** What `$ownerId` shares with the other side of a partnership: category ids, plus 0 for day plans. Nothing by default. */
function shared_with_partner(PDO $pdo, int $partnershipId, int $ownerId): array
{
    $stmt = $pdo->prepare('SELECT category_id FROM partner_shares WHERE partnership_id = ? AND owner_id = ? ORDER BY category_id');
    $stmt->execute([$partnershipId, $ownerId]);
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

/** Whether a goal (with its category_id and is_private) is visible to the partner under these shares. */
function goal_is_shared(array $goal, array $shares): bool
{
    return !$goal['is_private'] && in_array((int) ($goal['category_id'] ?? OTHERS_CATEGORY), $shares, true);
}

/** Where a partnership's chat photos and videos are kept: outside the web root, served only by api/chat_media.php. */
function chat_dir(int $partnershipId): string
{
    return dirname(__DIR__) . '/storage/chat/' . $partnershipId;
}

/** Deletes a partnership's chat files (the rows go with the partnership itself). */
function delete_chat_files(int $partnershipId): void
{
    $dir = chat_dir($partnershipId);
    foreach (glob($dir . '/*') ?: [] as $file) {
        @unlink($file);
    }
    @rmdir($dir);
}

function user_email(PDO $pdo, int $userId): string
{
    $stmt = $pdo->prepare('SELECT email FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    return strtolower((string) $stmt->fetchColumn());
}

/**
 * Every partnership the user is part of: invites they sent, invites sent to their email, and accepted partners.
 * @return list<array<string,mixed>> rows of partnerships plus `mine_out` (true when the user sent it)
 */
function user_partnerships(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare(
        'SELECT p.*, (p.inviter_id = ?) AS mine_out FROM partnerships p
         WHERE p.inviter_id = ? OR p.invitee_id = ? OR (p.invitee_id IS NULL AND p.invitee_email = ?)
         ORDER BY p.status = \'ACCEPTED\' DESC, p.id'
    );
    $stmt->execute([$userId, $userId, $userId, user_email($pdo, $userId)]);
    return $stmt->fetchAll();
}

/** The accepted partnership with this id that the user is part of, or a 404. Returns the row plus `partner_id`. */
function accepted_partnership(PDO $pdo, int $userId, mixed $id): array
{
    $id = filter_var($id, FILTER_VALIDATE_INT);
    $stmt = $pdo->prepare("SELECT * FROM partnerships WHERE id = ? AND status = 'ACCEPTED' AND (inviter_id = ? OR invitee_id = ?)");
    $stmt->execute([$id === false ? 0 : $id, $userId, $userId]);
    $p = $stmt->fetch();
    if (!$p) {
        json_error('Partner not found.', 404);
    }
    $p['partner_id'] = (int) $p['inviter_id'] === $userId ? (int) $p['invitee_id'] : (int) $p['inviter_id'];
    $p['me_inviter'] = (int) $p['inviter_id'] === $userId;
    return $p;
}

/** Whether two users are accepted partners. */
function are_partners(PDO $pdo, int $a, int $b): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM partnerships WHERE status = 'ACCEPTED' AND ((inviter_id = ? AND invitee_id = ?) OR (inviter_id = ? AND invitee_id = ?))");
    $stmt->execute([$a, $b, $b, $a]);
    return (bool) $stmt->fetchColumn();
}

function accepted_count(PDO $pdo, int $userId): int
{
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM partnerships WHERE status = 'ACCEPTED' AND (inviter_id = ? OR invitee_id = ?)");
    $stmt->execute([$userId, $userId]);
    return (int) $stmt->fetchColumn();
}

/** What partners may know about a user: name, photo version and streak. Never the email of an accepted partner's own account settings. */
function partner_profile(PDO $pdo, int $userId): array
{
    $u = fetch_user_payload($pdo, $userId);
    return [
        'id' => $u['id'], 'display_name' => $u['display_name'], 'avatar_v' => $u['avatar_v'],
        'streak_count' => $u['streak_count'], 'best_streak' => $u['best_streak'], 'streak_active_today' => $u['streak_active_today'],
    ];
}

/**
 * The chat streak: how many days in a row (UTC) both partners sent something (a message, photo, video or cheer).
 * It is still alive when the last such day was yesterday, so today can keep it going.
 *
 * @return array{count:int, me_today:bool, them_today:bool, best:int}
 */
function chat_streak(PDO $pdo, int $partnershipId, int $me): array
{
    $stmt = $pdo->prepare(
        "SELECT DATE(CONVERT_TZ(created_at, @@session.time_zone, '+00:00')) AS d, sender_id FROM partner_messages
         WHERE partnership_id = ? AND kind IN ('TEXT', 'CHEER', 'IMAGE', 'VIDEO') AND created_at >= NOW() - INTERVAL 400 DAY
         GROUP BY d, sender_id"
    );
    $stmt->execute([$partnershipId]);
    $senders = [];
    foreach ($stmt->fetchAll() as $r) {
        $senders[$r['d']][(int) $r['sender_id']] = true;
    }
    $both = array_keys(array_filter($senders, fn($s) => count($s) >= 2));
    rsort($both);
    $today = gmdate('Y-m-d');
    $set = array_flip($both);

    // Current run: from today (or yesterday when today is not done yet) backwards
    $day = new DateTimeImmutable($today, new DateTimeZone('UTC'));
    if (!isset($set[$today])) {
        $day = $day->modify('-1 day');
    }
    $count = 0;
    while (isset($set[$day->format('Y-m-d')])) {
        $count++;
        $day = $day->modify('-1 day');
    }
    // Longest run in the window
    $best = 0;
    $run = 0;
    $prev = null;
    foreach (array_reverse($both) as $d) {
        $run = $prev !== null && (new DateTimeImmutable($prev))->modify('+1 day')->format('Y-m-d') === $d ? $run + 1 : 1;
        $best = max($best, $run);
        $prev = $d;
    }
    $todaySenders = $senders[$today] ?? [];
    return [
        'count' => $count,
        'best' => $best,
        'me_today' => isset($todaySenders[$me]),
        'them_today' => count($todaySenders) - (isset($todaySenders[$me]) ? 1 : 0) > 0,
    ];
}

/** Plans finished this week (Monday to Sunday, UTC): a goal's plans ticked, plus days of day plans done. */
function plans_done_this_week(PDO $pdo, int $userId): int
{
    $monday = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->modify('monday this week')->format('Y-m-d');
    $sunday = (new DateTimeImmutable($monday))->modify('+6 days')->format('Y-m-d');
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM sub_plans sp JOIN goals g ON g.id = sp.goal_id
         WHERE g.user_id = ? AND sp.is_completed = 1 AND sp.completed_at >= ? AND sp.completed_at < ? + INTERVAL 1 DAY'
    );
    $stmt->execute([$userId, $monday, $sunday]);
    $goalPlans = (int) $stmt->fetchColumn();
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM day_plan_marks m JOIN day_plans dp ON dp.id = m.day_plan_id
         WHERE dp.user_id = ? AND m.state = 'DONE' AND m.on_date BETWEEN ? AND ?"
    );
    $stmt->execute([$userId, $monday, $sunday]);
    return $goalPlans + (int) $stmt->fetchColumn();
}
