<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';
require __DIR__ . '/../mailer.php';
require __DIR__ . '/../webpush.php';
require __DIR__ . '/../notify.php';
require __DIR__ . '/../partners.php';

$pdo = get_db();
$userId = current_user_id($pdo);
$method = require_method('GET', 'POST');

// ---------------------------------------------------------------
// GET  /api/messages.php?p=<partnership id>&after=<message id>
//      The chat with a partner (the latest 200, or only those after `after`), oldest first. Marks them read.
// POST /api/messages.php
//      { p, action: "text",  body }              a message (1 to 1000 characters)
//      { p, action: "cheer", emoji, goal_id }    cheer one of the partner's goals
//      { p, action: "nudge" }                    a friendly push to plan their day (once every 4 hours)
//      multipart: p, action=media, file, caption?  a photo (up to 10 MB) or a video (up to 50 MB), with a caption
// The partner gets a push notification on their devices (at most one every 2 minutes for messages).
// ---------------------------------------------------------------

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
const IMAGE_MAX_SIDE = 1600;         // photos are scaled down to this, which keeps them sharp on any phone
const IMAGE_MAX_PIXELS = 40000000;   // keeps GD within PHP's memory limit
const VIDEO_TYPES = ['video/mp4' => 'mp4', 'video/webm' => 'webm', 'video/quicktime' => 'mov'];

/**
 * Checks an uploaded photo or video and stores it in the partnership's folder. A photo is decoded and saved again as a
 * JPEG (an animated GIF is kept as it is), which drops hidden details such as where it was taken, and turned the right
 * way up. A video is kept as uploaded after its real type is checked.
 *
 * @return array{kind:string, file:string, mime:string, w:?int, h:?int}
 */
function save_chat_media(array $file, int $partnershipId): array
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_INI_SIZE || ($file['error'] ?? 0) === UPLOAD_ERR_FORM_SIZE) {
        json_error('That file is too large. Photos can be up to 10 MB and videos up to 50 MB.', 413);
    }
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
        json_error('The upload did not finish. Please try again.', 400);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $dir = chat_dir($partnershipId);
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        json_error('The file could not be saved on the server.', 500);
    }
    $name = bin2hex(random_bytes(16));

    if (isset(VIDEO_TYPES[$mime])) {
        if ($file['size'] > VIDEO_MAX_BYTES) {
            json_error('That video is too large. Keep it under 50 MB (a short clip).', 413);
        }
        $target = "{$name}." . VIDEO_TYPES[$mime];
        if (!move_uploaded_file($file['tmp_name'], "{$dir}/{$target}")) {
            json_error('The video could not be saved on the server.', 500);
        }
        return ['kind' => 'VIDEO', 'file' => $target, 'mime' => $mime, 'w' => null, 'h' => null];
    }

    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true)) {
        json_error('Send a photo (JPG, PNG, WebP or GIF) or a video (MP4, WebM or MOV).', 415);
    }
    if ($file['size'] > IMAGE_MAX_BYTES) {
        json_error('That photo is too large. Choose one under 10 MB.', 413);
    }
    $info = @getimagesize($file['tmp_name']);
    if (!$info || $info[0] < 1 || $info[1] < 1 || $info[0] * $info[1] > IMAGE_MAX_PIXELS) {
        json_error('That photo could not be read, or it has too many pixels.', 422);
    }
    if ($mime === 'image/gif') {   // re-encoding would lose the animation
        $target = "{$name}.gif";
        if (!move_uploaded_file($file['tmp_name'], "{$dir}/{$target}")) {
            json_error('The photo could not be saved on the server.', 500);
        }
        return ['kind' => 'IMAGE', 'file' => $target, 'mime' => 'image/gif', 'w' => min(65535, $info[0]), 'h' => min(65535, $info[1])];
    }

    $src = @imagecreatefromstring((string) file_get_contents($file['tmp_name']));
    if (!$src) {
        json_error('That photo could not be read.', 422);
    }
    // Phones store photos sideways and say which way is up; apply that before the details are dropped
    $orientation = $mime === 'image/jpeg' && function_exists('exif_read_data') ? (int) (@exif_read_data($file['tmp_name'])['Orientation'] ?? 1) : 1;
    $src = match ($orientation) {
        3 => imagerotate($src, 180, 0),
        6 => imagerotate($src, -90, 0),
        8 => imagerotate($src, 90, 0),
        default => $src,
    };
    $w = imagesx($src);
    $h = imagesy($src);
    $scale = min(1, IMAGE_MAX_SIDE / max($w, $h));
    $nw = max(1, (int) round($w * $scale));
    $nh = max(1, (int) round($h * $scale));
    $dst = imagecreatetruecolor($nw, $nh);
    imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 252, 249));   // transparent parts become the card colour
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    $target = "{$name}.jpg";
    if (!imagejpeg($dst, "{$dir}/{$target}", 85)) {
        json_error('The photo could not be saved on the server.', 500);
    }
    return ['kind' => 'IMAGE', 'file' => $target, 'mime' => 'image/jpeg', 'w' => $nw, 'h' => $nh];
}

function message_rows(PDO $pdo, int $partnershipId, int $after): array
{
    $sql = 'SELECT m.id, m.sender_id, m.kind, m.body, m.ref_goal_id, g.title AS goal_title, m.media_mime, m.media_w, m.media_h, UNIX_TIMESTAMP(m.created_at) AS ts
            FROM partner_messages m LEFT JOIN goals g ON g.id = m.ref_goal_id
            WHERE m.partnership_id = ?' . ($after > 0 ? ' AND m.id > ?' : '') . ' ORDER BY m.id DESC LIMIT 200';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($after > 0 ? [$partnershipId, $after] : [$partnershipId]);
    return array_reverse(array_map(fn($m) => [
        'id' => (int) $m['id'], 'sender_id' => (int) $m['sender_id'], 'kind' => $m['kind'], 'body' => $m['body'],
        'goal_id' => $m['ref_goal_id'] !== null ? (int) $m['ref_goal_id'] : null, 'goal_title' => $m['goal_title'],
        'at' => gmdate('Y-m-d\TH:i:s\Z', (int) $m['ts']),
        // A photo or video is fetched through chat_media.php, which checks the viewer is one of the two partners
        'media' => $m['media_mime'] !== null ? [
            'url' => 'chat_media.php?id=' . $m['id'], 'mime' => $m['media_mime'],
            'w' => $m['media_w'] !== null ? (int) $m['media_w'] : null, 'h' => $m['media_h'] !== null ? (int) $m['media_h'] : null,
        ] : null,
    ], $stmt->fetchAll()));
}

function mark_read(PDO $pdo, array $p, array $rows): void
{
    if (!$rows) {
        return;
    }
    $col = $p['me_inviter'] ? 'inviter_read_id' : 'invitee_read_id';
    $pdo->prepare("UPDATE partnerships SET {$col} = GREATEST({$col}, ?) WHERE id = ?")->execute([end($rows)['id'], $p['id']]);
}

if ($method === 'GET') {
    $p = accepted_partnership($pdo, $userId, $_GET['p'] ?? null);
    $after = max(0, (int) ($_GET['after'] ?? 0));
    $rows = message_rows($pdo, (int) $p['id'], $after);
    mark_read($pdo, $p, $rows);
    json_response(['success' => true, 'messages' => $rows, 'chat_streak' => chat_streak($pdo, (int) $p['id'], $userId)]);
}

// A photo or video comes as a multipart form; everything else as JSON
$multipart = str_starts_with(strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? '')), 'multipart/form-data');
$in = $multipart ? $_POST : read_json_body();
$p = accepted_partnership($pdo, $userId, $in['p'] ?? null);
$action = (string) ($in['action'] ?? '');
$me = partner_profile($pdo, $userId);

// At most 30 things a minute from one person
$stmt = $pdo->prepare('SELECT COUNT(*) FROM partner_messages WHERE sender_id = ? AND created_at > NOW() - INTERVAL 1 MINUTE');
$stmt->execute([$userId]);
if ((int) $stmt->fetchColumn() >= 30) {
    json_error('Slow down a little, then try again.', 429);
}

$insert = $pdo->prepare('INSERT INTO partner_messages (partnership_id, sender_id, kind, body, ref_goal_id) VALUES (?, ?, ?, ?, ?)');
$push = null;   // [title, body] for the partner's devices

if ($action === 'text') {
    $body = trim((string) ($in['body'] ?? ''));
    if ($body === '' || mb_strlen($body) > 1000) {
        json_error('A message is 1 to 1000 characters.', 422);
    }
    $insert->execute([$p['id'], $userId, 'TEXT', $body, null]);
    // One chat push every 2 minutes is plenty; the rest are waiting in the chat
    $claim = $pdo->prepare("INSERT IGNORE INTO notification_log (user_id, kind, ref_id, stamp) VALUES (?, 'chat', ?, ?)");
    $claim->execute([$p['partner_id'], $p['id'], (string) intdiv(time(), 120)]);
    if ($claim->rowCount() === 1) {
        $push = [$me['display_name'], mb_strimwidth($body, 0, 120, '…')];
    }
} elseif ($action === 'cheer') {
    $emoji = (string) ($in['emoji'] ?? '');
    if (!in_array($emoji, CHEER_EMOJI, true)) {
        json_error('Pick one of the cheers.', 422);
    }
    $goalId = filter_var($in['goal_id'] ?? null, FILTER_VALIDATE_INT);
    $stmt = $pdo->prepare('SELECT title, category_id, is_private FROM goals WHERE id = ? AND user_id = ?');
    $stmt->execute([$goalId === false ? 0 : $goalId, $p['partner_id']]);
    $goal = $stmt->fetch();
    if (!$goal || !goal_is_shared($goal, shared_with_partner($pdo, (int) $p['id'], $p['partner_id']))) {
        json_error('That goal is not shared with you.', 404);
    }
    $title = $goal['title'];
    $insert->execute([$p['id'], $userId, 'CHEER', $emoji, $goalId]);
    $push = ["{$me['display_name']} cheered you on {$emoji}", "For “{$title}”. Keep going!"];
} elseif ($action === 'media') {
    $caption = trim((string) ($in['caption'] ?? ''));
    if (mb_strlen($caption) > 1000) {
        json_error('A caption is 1000 characters or fewer.', 422);
    }
    // At most 40 photos and videos a day from one person, so the server's disk is not filled by accident
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM partner_messages WHERE sender_id = ? AND kind IN ('IMAGE', 'VIDEO') AND created_at > NOW() - INTERVAL 1 DAY");
    $stmt->execute([$userId]);
    if ((int) $stmt->fetchColumn() >= 40) {
        json_error('That is a lot of photos and videos today. Try again tomorrow.', 429);
    }
    $media = save_chat_media($_FILES['file'] ?? [], (int) $p['id']);
    $pdo->prepare('INSERT INTO partner_messages (partnership_id, sender_id, kind, body, media_file, media_mime, media_w, media_h) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$p['id'], $userId, $media['kind'], $caption, $media['file'], $media['mime'], $media['w'], $media['h']]);
    $push = [$me['display_name'], ($media['kind'] === 'VIDEO' ? '🎬 Sent a video' : '📷 Sent a photo') . ($caption !== '' ? ': ' . mb_strimwidth($caption, 0, 100, '…') : '')];
} elseif ($action === 'nudge') {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM partner_messages WHERE partnership_id = ? AND sender_id = ? AND kind = 'NUDGE' AND created_at > NOW() - INTERVAL 4 HOUR");
    $stmt->execute([$p['id'], $userId]);
    if ((int) $stmt->fetchColumn() > 0) {
        json_error('You nudged them already. You can nudge again in a few hours.', 429);
    }
    $insert->execute([$p['id'], $userId, 'NUDGE', 'Nudge! Time to plan your day and get going.', null]);
    $push = ["{$me['display_name']} nudged you 👋", 'Time to plan your day and get going.'];
} else {
    json_error('Unknown action. Use text, cheer, media or nudge.', 422);
}

$rows = message_rows($pdo, (int) $p['id'], max(0, (int) ($in['after'] ?? 0)));
mark_read($pdo, $p, $rows);

if ($push) {
    try {
        push_to_user($pdo, $p['partner_id'], ['kind' => 'chat', 'title' => $push[0], 'body' => $push[1], 'tag' => 'chat-' . $p['id'], 'url' => app_url() . '/#partners']);
    } catch (Throwable $e) {
        error_log('[AuraGoal] partner push failed: ' . $e->getMessage());   // the message is saved either way
    }
}
json_response(['success' => true, 'messages' => $rows, 'chat_streak' => chat_streak($pdo, (int) $p['id'], $userId)], 201);
