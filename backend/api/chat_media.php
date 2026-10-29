<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';
require __DIR__ . '/../partners.php';

$pdo = get_db();
$userId = current_user_id($pdo);
require_method('GET');

// ---------------------------------------------------------------
// GET /api/chat_media.php?id=<message id>
// A photo or video from a partner chat. Only the two partners can load it. Videos support byte ranges, which browsers
// need to play and seek them.
// ---------------------------------------------------------------
$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
$stmt = $pdo->prepare(
    "SELECT m.partnership_id, m.media_file, m.media_mime FROM partner_messages m JOIN partnerships p ON p.id = m.partnership_id
     WHERE m.id = ? AND m.media_file IS NOT NULL AND p.status = 'ACCEPTED' AND (p.inviter_id = ? OR p.invitee_id = ?)"
);
$stmt->execute([$id === false ? 0 : $id, $userId, $userId]);
$m = $stmt->fetch();
// The file name is ours (random hex plus an extension), never the uploader's, but check it anyway
if (!$m || !preg_match('/^[0-9a-f]{32}\.(jpg|gif|mp4|webm|mov)$/', (string) $m['media_file'])) {
    json_error('Not found.', 404);
}
$path = chat_dir((int) $m['partnership_id']) . '/' . $m['media_file'];
if (!is_file($path)) {
    json_error('Not found.', 404);
}

$size = filesize($path);
$start = 0;
$end = $size - 1;
if (isset($_SERVER['HTTP_RANGE']) && preg_match('/^bytes=(\d*)-(\d*)$/', (string) $_SERVER['HTTP_RANGE'], $r)) {
    if ($r[1] === '' && $r[2] !== '') {          // the last N bytes
        $start = max(0, $size - (int) $r[2]);
    } else {
        $start = (int) $r[1];
        $end = $r[2] !== '' ? min((int) $r[2], $size - 1) : $end;
    }
    if ($start > $end || $start >= $size) {
        header("Content-Range: bytes */{$size}");
        http_response_code(416);
        exit;
    }
    http_response_code(206);
    header("Content-Range: bytes {$start}-{$end}/{$size}");
}

header('Content-Type: ' . $m['media_mime']);
header('Content-Length: ' . ($end - $start + 1));
header('Accept-Ranges: bytes');
header('X-Content-Type-Options: nosniff');
header('Content-Disposition: inline');
header('Cache-Control: private, max-age=31536000, immutable');   // a message's file never changes

$fp = fopen($path, 'rb');
fseek($fp, $start);
$left = $end - $start + 1;
while ($left > 0 && !feof($fp)) {
    $chunk = fread($fp, (int) min(65536, $left));
    echo $chunk;
    $left -= strlen($chunk);
}
fclose($fp);
