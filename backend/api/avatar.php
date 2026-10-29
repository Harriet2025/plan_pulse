<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';

$pdo = get_db();
$userId = current_user_id($pdo);
$method = require_method('GET', 'POST', 'DELETE');

// Photos live outside the web root (backend/ is the document root), so they can only be read through this script
// by the signed-in owner. Each one is re-encoded as a 256x256 JPEG, so whatever was uploaded is never served back as-is.
const AVATAR_SIZE = 256;
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_MAX_PIXELS = 16000000;   // keeps GD within PHP's memory limit
$dir = dirname(__DIR__, 2) . '/storage/avatars';
$path = $dir . '/' . $userId . '.jpg';

// ---------------------------------------------------------------
// GET /api/avatar.php : the signed-in user's photo
// ---------------------------------------------------------------
if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT avatar_updated_at IS NOT NULL FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    if (!$stmt->fetchColumn() || !is_file($path)) {
        json_error('No profile photo.', 404);
    }
    header('Content-Type: image/jpeg');
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: private, max-age=31536000, immutable');   // safe: the URL carries a version that changes with the photo
    readfile($path);
    exit;
}

// ---------------------------------------------------------------
// DELETE /api/avatar.php : remove the photo
// ---------------------------------------------------------------
if ($method === 'DELETE') {
    if (is_file($path)) {
        unlink($path);
    }
    $pdo->prepare('UPDATE users SET avatar_updated_at = NULL WHERE id = ?')->execute([$userId]);
    json_response(['success' => true, 'user' => fetch_user_payload($pdo, $userId)]);
}

// ---------------------------------------------------------------
// POST /api/avatar.php : multipart upload, field name "avatar"
// ---------------------------------------------------------------
$file = $_FILES['avatar'] ?? null;
if (!$file || !is_array($file)) {
    json_error('Choose an image to upload.', 422);
}
if ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE || $file['size'] > AVATAR_MAX_BYTES) {
    json_error('That image is too large. Choose one under 5 MB.', 413);
}
if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
    json_error('The upload did not finish. Please try again.', 400);
}

$mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
    json_error('Use a JPG, PNG or WebP image.', 415);
}
$info = @getimagesize($file['tmp_name']);
if (!$info || $info[0] < 32 || $info[1] < 32) {
    json_error('That image is too small or could not be read.', 422);
}
if ($info[0] * $info[1] > AVATAR_MAX_PIXELS) {
    json_error('That image has too many pixels. Choose a smaller one.', 413);
}

$src = @imagecreatefromstring((string) file_get_contents($file['tmp_name']));
if (!$src) {
    json_error('That image could not be read.', 422);
}

// Centre-crop to a square, shrink to AVATAR_SIZE, and flatten any transparency onto the card colour
$w = imagesx($src);
$h = imagesy($src);
$side = min($w, $h);
$dst = imagecreatetruecolor(AVATAR_SIZE, AVATAR_SIZE);
imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 252, 249));
imagecopyresampled($dst, $src, 0, 0, intdiv($w - $side, 2), intdiv($h - $side, 2), AVATAR_SIZE, AVATAR_SIZE, $side, $side);

if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
    error_log('[AuraGoal] cannot create ' . $dir);
    json_error('The photo could not be saved on the server.', 500);
}
$tmp = $path . '.tmp';
if (!imagejpeg($dst, $tmp, 88) || !rename($tmp, $path)) {
    @unlink($tmp);
    error_log('[AuraGoal] cannot write ' . $path);
    json_error('The photo could not be saved on the server.', 500);
}

$pdo->prepare('UPDATE users SET avatar_updated_at = NOW() WHERE id = ?')->execute([$userId]);
json_response(['success' => true, 'user' => fetch_user_payload($pdo, $userId)]);
