<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';
require __DIR__ . '/../partners.php';

$pdo = get_db();
$userId = current_user_id($pdo);
$method = require_method('GET', 'POST');

// ---------------------------------------------------------------
// GET /api/partners.php
// The user's partners (with unread messages, the last message and the chat streak), invites they received, and
// invites they sent that are still waiting.
//
// POST /api/partners.php
//   { action: "invite",  email }    invite someone (they accept it when they sign in with that email)
//   { action: "accept",  id }       accept an invite sent to you
//   { action: "decline", id }       decline it, or cancel one you sent
//   { action: "remove",  id }       stop being partners (the chat is deleted for both)
//   { action: "share",   id, categories: [ids], day_plans: bool }   what this partner may see of yours
// ---------------------------------------------------------------

function partners_payload(PDO $pdo, int $userId): array
{
    $out = ['partners' => [], 'incoming' => [], 'outgoing' => []];
    foreach (user_partnerships($pdo, $userId) as $p) {
        $mineOut = (bool) $p['mine_out'];
        if ($p['status'] === 'PENDING') {
            if ($mineOut) {
                $out['outgoing'][] = ['id' => (int) $p['id'], 'email' => $p['invitee_email'], 'sent_at' => $p['created_at']];
            } else {
                $from = partner_profile($pdo, (int) $p['inviter_id']);
                $out['incoming'][] = ['id' => (int) $p['id'], 'from' => $from + ['email' => user_email($pdo, (int) $p['inviter_id'])], 'sent_at' => $p['created_at']];
            }
            continue;
        }
        $partnerId = $mineOut ? (int) $p['invitee_id'] : (int) $p['inviter_id'];
        $readId = (int) ($mineOut ? $p['inviter_read_id'] : $p['invitee_read_id']);
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM partner_messages WHERE partnership_id = ? AND sender_id <> ? AND id > ?');
        $stmt->execute([$p['id'], $userId, $readId]);
        $unread = (int) $stmt->fetchColumn();
        $stmt = $pdo->prepare('SELECT id, sender_id, kind, body, UNIX_TIMESTAMP(created_at) AS ts FROM partner_messages WHERE partnership_id = ? ORDER BY id DESC LIMIT 1');
        $stmt->execute([$p['id']]);
        $last = $stmt->fetch() ?: null;
        $out['partners'][] = [
            'id'          => (int) $p['id'],
            'partner'     => partner_profile($pdo, $partnerId),
            'since'       => $p['accepted_at'],
            'unread'      => $unread,
            'last'        => $last ? ['id' => (int) $last['id'], 'mine' => (int) $last['sender_id'] === $userId, 'kind' => $last['kind'], 'body' => mb_strimwidth((string) $last['body'], 0, 80, '…'), 'at' => gmdate('Y-m-d\TH:i:s\Z', (int) $last['ts'])] : null,
            'chat_streak' => chat_streak($pdo, (int) $p['id'], $userId),
            'my_shares'   => shared_with_partner($pdo, (int) $p['id'], $userId),     // category ids, 0 = day plans
            'their_shares' => shared_with_partner($pdo, (int) $p['id'], $partnerId),
        ];
    }
    return $out;
}

if ($method === 'GET') {
    json_response(['success' => true] + partners_payload($pdo, $userId));
}

$in = read_json_body();
$action = (string) ($in['action'] ?? '');

if ($action === 'invite') {
    $email = strtolower(trim((string) ($in['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 255) {
        json_error('Enter a valid email address.', 422);
    }
    if ($email === user_email($pdo, $userId)) {
        json_error('That is your own email. Invite someone else.', 422);
    }
    // At most 20 invites a day, so the invite box cannot be used to spam
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM partnerships WHERE inviter_id = ? AND created_at > NOW() - INTERVAL 1 DAY');
    $stmt->execute([$userId]);
    if ((int) $stmt->fetchColumn() >= 20) {
        json_error('You have sent a lot of invites today. Try again tomorrow.', 429);
    }
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM partnerships WHERE (inviter_id = ? OR invitee_id = ?) AND status = 'ACCEPTED'");
    $stmt->execute([$userId, $userId]);
    $pending = $pdo->prepare("SELECT COUNT(*) FROM partnerships WHERE inviter_id = ? AND status = 'PENDING'");
    $pending->execute([$userId]);
    if ((int) $stmt->fetchColumn() + (int) $pending->fetchColumn() >= MAX_PARTNERS) {
        json_error('You can have up to ' . MAX_PARTNERS . ' partners, counting invites still waiting. Cancel one first.', 422);
    }

    // If that person already invited you, inviting them back simply accepts their invite
    $stmt = $pdo->prepare(
        "SELECT p.id FROM partnerships p JOIN users u ON u.id = p.inviter_id
         WHERE LOWER(u.email) = ? AND p.status = 'PENDING' AND (p.invitee_id = ? OR (p.invitee_id IS NULL AND p.invitee_email = ?))"
    );
    $stmt->execute([$email, $userId, user_email($pdo, $userId)]);
    if ($theirs = $stmt->fetchColumn()) {
        $pdo->prepare("UPDATE partnerships SET status = 'ACCEPTED', invitee_id = ?, accepted_at = NOW() WHERE id = ?")->execute([$userId, $theirs]);
        json_response(['success' => true, 'message' => 'They had already invited you, so you are now partners.'] + partners_payload($pdo, $userId));
    }
    // Already partners, or already invited
    $stmt = $pdo->prepare(
        "SELECT 1 FROM partnerships p LEFT JOIN users u ON u.id = p.inviter_id
         WHERE (p.inviter_id = ? AND p.invitee_email = ?) OR (p.status = 'ACCEPTED' AND p.invitee_id = ? AND LOWER(u.email) = ?)"
    );
    $stmt->execute([$userId, $email, $userId, $email]);
    if ($stmt->fetchColumn()) {
        json_error('You have already invited this person, or you are partners already.', 409);
    }
    $pdo->prepare('INSERT INTO partnerships (inviter_id, invitee_email) VALUES (?, ?)')->execute([$userId, $email]);
    json_response(['success' => true, 'message' => 'Invite sent. When they sign in to AuraGoal with that email, they can accept it.'] + partners_payload($pdo, $userId), 201);
}

$id = filter_var($in['id'] ?? null, FILTER_VALIDATE_INT);
$mine = null;
foreach (user_partnerships($pdo, $userId) as $p) {
    if ((int) $p['id'] === $id) {
        $mine = $p;
    }
}
if (!$mine) {
    json_error('Invite or partner not found.', 404);
}

if ($action === 'accept') {
    if ($mine['status'] !== 'PENDING' || $mine['mine_out']) {
        json_error('Only an invite sent to you can be accepted.', 422);
    }
    if (accepted_count($pdo, $userId) >= MAX_PARTNERS || accepted_count($pdo, (int) $mine['inviter_id']) >= MAX_PARTNERS) {
        json_error('One of you already has ' . MAX_PARTNERS . ' partners.', 422);
    }
    if (are_partners($pdo, $userId, (int) $mine['inviter_id'])) {
        $pdo->prepare('DELETE FROM partnerships WHERE id = ?')->execute([$id]);
        json_error('You are already partners.', 409);
    }
    $pdo->prepare("UPDATE partnerships SET status = 'ACCEPTED', invitee_id = ?, accepted_at = NOW() WHERE id = ?")->execute([$userId, $id]);
    json_response(['success' => true, 'message' => 'You are now accountability partners.'] + partners_payload($pdo, $userId));
}

if ($action === 'share') {
    if ($mine['status'] !== 'ACCEPTED') {
        json_error('You can choose what to share once they accept.', 422);
    }
    $ids = array_values(array_unique(array_map('intval', (array) ($in['categories'] ?? []))));
    if ($ids) {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM categories WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') AND (user_id IS NULL OR user_id = ?)');
        $stmt->execute([...$ids, $userId]);
        if ((int) $stmt->fetchColumn() !== count($ids)) {
            json_error('Unknown category.', 422);
        }
    }
    if (!empty($in['day_plans'])) {
        $ids[] = SHARE_DAY_PLANS;
    }
    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM partner_shares WHERE partnership_id = ? AND owner_id = ?')->execute([$id, $userId]);
    $ins = $pdo->prepare('INSERT INTO partner_shares (partnership_id, owner_id, category_id) VALUES (?, ?, ?)');
    foreach ($ids as $c) {
        $ins->execute([$id, $userId, $c]);
    }
    $pdo->commit();
    json_response(['success' => true, 'message' => 'Saved what they can see.'] + partners_payload($pdo, $userId));
}

if ($action === 'decline' || $action === 'remove') {
    $pdo->prepare('DELETE FROM partnerships WHERE id = ?')->execute([$id]);
    delete_chat_files((int) $id);
    json_response(['success' => true] + partners_payload($pdo, $userId));
}

json_error('Unknown action. Use invite, accept, decline, remove or share.', 422);
