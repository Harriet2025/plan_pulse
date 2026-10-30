<?php
declare(strict_types=1);

/**
 * Sends email for AuraGoal (password-reset links and partner invites).
 *
 *   send_mail($to, $subject, $plainText, $html): bool
 *
 * With an 'smtp' block in backend/config.local.php the message goes out through that mail server.
 * Without one (the default on a fresh machine) nothing is sent: the message is appended to storage/mail.log
 * and to the PHP server's console, so you can copy the link while developing. See config.local.example.php.
 */

/** Appends a message to the local outbox log instead of sending it. Always succeeds unless the disk is unwritable. */
function mail_to_outbox(string $to, string $subject, string $text): bool
{
    $dir = dirname(__DIR__) . '/storage';
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        return false;
    }
    $entry = "=== " . date('Y-m-d H:i:s') . " | To: {$to} | Subject: {$subject}\n{$text}\n\n";
    error_log('[AuraGoal mail not sent, SMTP is not configured] ' . str_replace("\n", ' ', "To: {$to} | {$subject}"));
    return file_put_contents($dir . '/mail.log', $entry, FILE_APPEND | LOCK_EX) !== false;
}

/** Reads one SMTP reply (which may span several lines) and returns [code, fullText]. */
function smtp_read($fp): array
{
    $text = '';
    while (($line = fgets($fp, 1024)) !== false) {
        $text .= $line;
        if (strlen($line) < 4 || $line[3] === ' ') {   // "250 ..." is the last line, "250-..." means more follow
            return [(int) substr($line, 0, 3), $text];
        }
    }
    throw new RuntimeException('SMTP connection closed or timed out');
}

/** Sends one command and checks the reply code. */
function smtp_cmd($fp, ?string $command, array $okCodes): string
{
    if ($command !== null) {
        fwrite($fp, $command . "\r\n");
    }
    [$code, $text] = smtp_read($fp);
    if (!in_array($code, $okCodes, true)) {
        throw new RuntimeException('SMTP error ' . $code . ' after ' . ($command === null ? 'connect' : strtok($command, ' ')) . ': ' . trim($text));
    }
    return $text;
}

/** @param array{host:string,port?:int,secure?:string,user?:string,pass?:string,from:string,from_name?:string} $cfg */
function smtp_send(array $cfg, string $to, string $subject, string $text, string $html): void
{
    $secure = $cfg['secure'] ?? 'tls';                 // tls = STARTTLS (587), ssl = implicit TLS (465), none = plain (testing only)
    $port = (int) ($cfg['port'] ?? ($secure === 'ssl' ? 465 : 587));
    $from = (string) $cfg['from'];
    if (!filter_var($to, FILTER_VALIDATE_EMAIL) || !filter_var($from, FILTER_VALIDATE_EMAIL)) {
        throw new InvalidArgumentException('Invalid email address');
    }
    if (preg_match('/[\r\n]/', $subject . ($cfg['from_name'] ?? ''))) {
        throw new InvalidArgumentException('Header injection attempt');
    }

    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
    $fp = @stream_socket_client(($secure === 'ssl' ? 'ssl://' : 'tcp://') . $cfg['host'] . ':' . $port, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) {
        throw new RuntimeException("Cannot connect to {$cfg['host']}:{$port} ({$errstr})");
    }
    stream_set_timeout($fp, 20);

    try {
        smtp_cmd($fp, null, [220]);
        smtp_cmd($fp, 'EHLO localhost', [250]);
        if ($secure === 'tls') {
            smtp_cmd($fp, 'STARTTLS', [220]);
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('Could not start TLS');
            }
            smtp_cmd($fp, 'EHLO localhost', [250]);
        }
        if (!empty($cfg['user'])) {
            smtp_cmd($fp, 'AUTH LOGIN', [334]);
            smtp_cmd($fp, base64_encode((string) $cfg['user']), [334]);
            smtp_cmd($fp, base64_encode((string) ($cfg['pass'] ?? '')), [235]);
        }
        smtp_cmd($fp, "MAIL FROM:<{$from}>", [250]);
        smtp_cmd($fp, "RCPT TO:<{$to}>", [250, 251]);
        smtp_cmd($fp, 'DATA', [354]);

        $boundary = 'ag_' . bin2hex(random_bytes(12));
        $domain = substr(strrchr($from, '@'), 1);
        $fromName = (string) ($cfg['from_name'] ?? 'AuraGoal');
        $headers = [
            'From: ' . mb_encode_mimeheader($fromName, 'UTF-8', 'B', "\r\n") . " <{$from}>",
            "To: <{$to}>",
            'Subject: ' . mb_encode_mimeheader($subject, 'UTF-8', 'B', "\r\n"),
            'Date: ' . date('r'),
            'Message-ID: <' . bin2hex(random_bytes(12)) . "@{$domain}>",
            'MIME-Version: 1.0',
            "Content-Type: multipart/alternative; boundary=\"{$boundary}\"",
        ];
        $crlf = fn(string $s) => str_replace("\n", "\r\n", str_replace(["\r\n", "\r"], "\n", $s));   // SMTP wants CRLF line endings
        $part = fn(string $type, string $body) =>
            "--{$boundary}\r\nContent-Type: {$type}; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n"
            . quoted_printable_encode($crlf($body)) . "\r\n";
        $message = implode("\r\n", $headers) . "\r\n\r\n"
            . $part('text/plain', $text) . $part('text/html', $html) . "--{$boundary}--\r\n";

        // Dot-stuffing: a line that starts with "." must be doubled so it is not read as the end of the message
        $message = preg_replace('/^\./m', '..', $message);
        fwrite($fp, $message . ".\r\n");
        smtp_cmd($fp, null, [250]);
        smtp_cmd($fp, 'QUIT', [221]);
    } finally {
        fclose($fp);
    }
}

/** SMTP is usable once it has a host and a sender, plus a password when it logs in with a user. */
function smtp_ready(?array $smtp): bool
{
    return !empty($smtp['host']) && !empty($smtp['from']) && (empty($smtp['user']) || !empty($smtp['pass']));
}

function send_mail(string $to, string $subject, string $text, string $html, ?array $smtp = null): bool
{
    $smtp = $smtp ?? (app_config()['smtp'] ?? null);
    if (!smtp_ready($smtp)) {
        return mail_to_outbox($to, $subject, $text);
    }
    try {
        smtp_send($smtp, $to, $subject, $text, $html);
        return true;
    } catch (Throwable $e) {
        error_log('[AuraGoal] Could not send mail: ' . $e->getMessage());
        return false;
    }
}

/** The text and HTML of the password-reset email. */
function reset_email(string $name, string $link, int $minutes): array
{
    $text = "Hi {$name},\n\n"
        . "Someone asked to reset the password for your AuraGoal account. To choose a new one, open this link:\n\n{$link}\n\n"
        . "It works once and expires in {$minutes} minutes. If you did not ask for this, you can ignore this email; your password has not changed.\n\n"
        . "AuraGoal";
    $n = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
    $l = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');
    $html = '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#352D29">'
        . "<h2 style=\"color:#B85C38;margin:0 0 16px\">AuraGoal</h2><p>Hi {$n},</p>"
        . '<p>Someone asked to reset the password for your account. Choose a new one here:</p>'
        . "<p><a href=\"{$l}\" style=\"display:inline-block;background:#B85C38;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold\">Reset my password</a></p>"
        . "<p style=\"font-size:13px;color:#76685F\">The link works once and expires in {$minutes} minutes. If you did not ask for this, ignore this email; your password has not changed.</p></div>";
    return [$text, $html];
}

/** A short email with one button: [text, html]. $lines are plain paragraphs before the button. */
function button_email(string $name, array $lines, string $button, string $link, string $footer): array
{
    $text = "Hi {$name},\n\n" . implode("\n\n", $lines) . "\n\n{$button}: {$link}\n\n{$footer}\n\nAuraGoal";
    $e = fn(string $s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $html = '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#352D29">'
        . '<h2 style="color:#B85C38;margin:0 0 16px">AuraGoal</h2><p>Hi ' . $e($name) . ',</p>'
        . implode('', array_map(fn($l) => '<p>' . $e($l) . '</p>', $lines))
        . '<p><a href="' . $e($link) . '" style="display:inline-block;background:#B85C38;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">' . $e($button) . '</a></p>'
        . '<p style="font-size:13px;color:#76685F">' . $e($footer) . '</p></div>';
    return [$text, $html];
}

/** The partner invite: $hasAccount picks "sign in" or "create an account" with the invited address. */
function invite_email(string $from, string $to, bool $hasAccount, string $link): array
{
    return button_email('there', [
        "{$from} invited you to be their accountability partner on AuraGoal. Partners see the goals and plans they choose to share, chat, cheer each other on and keep a chat streak going.",
        $hasAccount ? "Sign in with {$to} to accept." : "Create a free account with {$to} to accept. It takes a minute.",
    ], $hasAccount ? 'Accept the invite' : 'Join and accept', $link, "If you don't know {$from}, ignore this email; nothing happens unless you accept.");
}

/** Tells the inviter their invite was accepted, so they can choose what to share. */
function accepted_email(string $name, string $partner, string $link): array
{
    return button_email($name, [
        "{$partner} accepted your invite. You are accountability partners now.",
        "Choose which of your categories {$partner} can see; they see nothing of yours until you do.",
    ], 'Choose what to share', $link, 'You can change what you share, or remove a partner, at any time in Partners.');
}
