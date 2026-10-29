<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';
require __DIR__ . '/../mailer.php';
require __DIR__ . '/../webpush.php';
require __DIR__ . '/../notify.php';

$pdo = get_db();
$userId = current_user_id($pdo);
$method = require_method('GET', 'POST');

const MAX_DEVICES = 10;

/** A short, friendly name for a device, from its browser's user agent. */
function device_label(string $ua): string
{
    $browser = match (true) {
        str_contains($ua, 'Edg/') => 'Edge', str_contains($ua, 'OPR/') => 'Opera', str_contains($ua, 'Firefox/') => 'Firefox',
        str_contains($ua, 'Chrome/') => 'Chrome', str_contains($ua, 'Safari/') => 'Safari', default => 'Browser',
    };
    $os = match (true) {
        str_contains($ua, 'Windows') => 'Windows', str_contains($ua, 'Android') => 'Android', str_contains($ua, 'iPhone') || str_contains($ua, 'iPad') => 'iPhone/iPad',
        str_contains($ua, 'Mac OS') => 'Mac', str_contains($ua, 'Linux') => 'Linux', default => '',
    };
    return $os ? "{$browser} on {$os}" : $browser;
}

// ---------------------------------------------------------------
// GET /api/push.php : what the Settings page needs to know
// ---------------------------------------------------------------
if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT id, endpoint_hash, user_agent, created_at FROM push_subscriptions WHERE user_id = ? ORDER BY id');
    $stmt->execute([$userId]);
    $beat = @json_decode((string) @file_get_contents(dirname(__DIR__, 2) . '/storage/worker.json'), true);
    $age = is_array($beat) && isset($beat['at']) ? time() - (int) $beat['at'] : null;
    json_response([
        'success'         => true,
        'vapid_public'    => wp_vapid_keys()['public'],      // the key the browser needs to subscribe
        'devices'         => array_map(fn($r) => ['id' => (int) $r['id'], 'label' => $r['user_agent'] ? device_label($r['user_agent']) : 'Device', 'added' => $r['created_at'], 'key' => substr($r['endpoint_hash'], 0, 16)], $stmt->fetchAll()),
        'mail_configured' => mail_is_configured(),
        'worker_running'  => $age !== null && $age <= 90,   // the worker checks every 30 seconds
    ]);
}

// ---------------------------------------------------------------
// POST /api/push.php
//   { action: "subscribe", subscription: { endpoint, keys: { p256dh, auth } } }
//   { action: "unsubscribe", endpoint }
//   { action: "test" }
// ---------------------------------------------------------------
$in = read_json_body();
$action = (string) ($in['action'] ?? '');

if ($action === 'subscribe') {
    $sub = $in['subscription'] ?? null;
    $endpoint = is_array($sub) ? (string) ($sub['endpoint'] ?? '') : '';
    $p256dh = is_array($sub) ? (string) ($sub['keys']['p256dh'] ?? '') : '';
    $auth = is_array($sub) ? (string) ($sub['keys']['auth'] ?? '') : '';

    if (strlen($endpoint) > 1000 || !wp_endpoint_allowed($endpoint)) {
        json_error('That is not a push address from a supported browser.', 422);
    }
    $point = b64u_dec($p256dh);
    if (strlen($point) !== 65 || $point[0] !== "\x04" || strlen(b64u_dec($auth)) !== 16) {
        json_error('The subscription keys are not valid.', 422);
    }

    $hash = hash('sha256', $endpoint);
    $count = $pdo->prepare('SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ? AND endpoint_hash <> ?');
    $count->execute([$userId, $hash]);
    if ((int) $count->fetchColumn() >= MAX_DEVICES) {
        json_error('You already have ' . MAX_DEVICES . ' devices. Remove one first.', 422);
    }
    // The same browser can switch accounts, so a known address simply moves to the signed-in user
    $pdo->prepare(
        'INSERT INTO push_subscriptions (user_id, endpoint_hash, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), endpoint = VALUES(endpoint), p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)'
    )->execute([$userId, $hash, $endpoint, $p256dh, $auth, substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255) ?: null]);
    json_response(['success' => true], 201);
}

if ($action === 'unsubscribe') {
    $endpoint = (string) ($in['endpoint'] ?? '');
    $pdo->prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?')->execute([$userId, hash('sha256', $endpoint)]);
    json_response(['success' => true]);
}

if ($action === 'test') {
    if (!user_subscriptions($pdo, $userId)) {
        json_error('No device has notifications turned on yet.', 422);
    }
    $r = push_to_user($pdo, $userId, [
        'kind' => 'test', 'title' => 'Notifications are working', 'body' => 'You will get reminders here, even when AuraGoal is closed.',
        'tag' => 'test', 'url' => app_url() . '/',
    ]);
    if ($r['sent'] === 0) {
        error_log('[AuraGoal] test push failed: ' . implode(' | ', $r['errors']));
        json_error('The push service did not accept the message. ' . ($r['errors'][0] ?? ''), 502);
    }
    json_response(['success' => true, 'sent' => $r['sent'], 'failed' => $r['failed']]);
}

json_error('Unknown action. Use subscribe, unsubscribe or test.', 422);
