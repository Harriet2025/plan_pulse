<?php
declare(strict_types=1);

/**
 * The AuraGoal background worker. It checks every 30 seconds for push reminders that have come due and for
 * morning emails that should go out, so they work even when the website is closed.
 *
 *   npm run worker        keep it running (leave the terminal open)
 *   php worker.php --once run a single check and stop (handy for testing, or from Windows Task Scheduler every minute)
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);   // this file is inside the web root, so make sure it can never be run from a browser
    exit;
}

require __DIR__ . '/db.php';
require __DIR__ . '/mailer.php';
require __DIR__ . '/webpush.php';
require __DIR__ . '/notify.php';

$once = in_array('--once', $argv, true);
$say = fn(string $m) => fwrite(STDOUT, '[' . date('H:i:s') . '] ' . $m . PHP_EOL);

$say('AuraGoal worker running' . ($once ? ' (one check)' : '. Press Ctrl+C to stop.'));
$say('Email: ' . (mail_is_configured() ? 'SMTP is set up, emails will be sent' : 'SMTP is not set up, emails are written to storage/mail.log instead'));

do {
    // A heartbeat the Settings page reads, so it can tell you whether this worker is running
    $dir = dirname(__DIR__) . '/storage';
    if (is_dir($dir) || mkdir($dir, 0755, true)) {
        @file_put_contents($dir . '/worker.json', json_encode(['at' => time(), 'pid' => getmypid()]), LOCK_EX);
    }
    try {
        $s = worker_tick(get_db(), new DateTimeImmutable('now'));
        if ($s['reminders'] || $s['digests'] || $s['failed']) {
            $say("sent {$s['reminders']} reminder(s), {$s['digests']} morning email(s)" . ($s['failed'] ? ", {$s['failed']} failed (see the log above)" : ''));
        }
    } catch (Throwable $e) {
        fwrite(STDERR, '[' . date('H:i:s') . '] worker error: ' . $e->getMessage() . PHP_EOL);
        try { get_db(true); } catch (Throwable) { /* the database is down; try again next time round */ }
    }
    if ($once) {
        break;
    }
    sleep(30);
} while (true);
