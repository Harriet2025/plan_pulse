<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';
require __DIR__ . '/../mailer.php';
require __DIR__ . '/../webpush.php';
require __DIR__ . '/../notify.php';

$pdo = get_db();
$userId = current_user_id($pdo);
require_method('POST');

// ---------------------------------------------------------------
// POST /api/digest.php : email me today's summary right now (the "Send me a preview" button)
// At most one a minute, so the button cannot be used to flood an inbox.
// ---------------------------------------------------------------
$claim = $pdo->prepare("INSERT IGNORE INTO notification_log (user_id, kind, ref_id, stamp) VALUES (?, 'preview', 0, ?)");
$claim->execute([$userId, date('Y-m-d H:i')]);
if ($claim->rowCount() !== 1) {
    json_error('A preview was just sent. Wait a minute and try again.', 429);
}

if (send_digest($pdo, $userId, true) !== 'sent') {
    json_error('The email could not be sent. Check the SMTP settings in backend/config.local.php.', 502);
}
json_response(['success' => true, 'delivered' => mail_is_configured() ? 'email' : 'log']);
