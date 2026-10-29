<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';

$pdo = get_db();
$userId = current_user_id($pdo);
require_method('PATCH');
$in = read_json_body();

// ---------------------------------------------------------------
// PATCH /api/profile.php
// Body (every field optional): { display_name, email, new_password, current_password }
// Changing the email or the password needs current_password, so a stolen session cannot take over the account.
// ---------------------------------------------------------------
$stmt = $pdo->prepare('SELECT email, display_name, password_hash FROM users WHERE id = ?');
$stmt->execute([$userId]);
$u = $stmt->fetch();

$set = [];
$params = [];
$needsPassword = false;

if (array_key_exists('display_name', $in)) {
    $name = trim((string) $in['display_name']);
    if ($name === '' || mb_strlen($name) > 100) {
        json_error('Enter a name of 1 to 100 characters.', 422);
    }
    if ($name !== $u['display_name']) {
        $set[] = 'display_name = ?';
        $params[] = $name;
    }
}

if (array_key_exists('email', $in)) {
    $email = strtolower(trim((string) $in['email']));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 255) {
        json_error('Enter a valid email address.', 422);
    }
    if ($email !== $u['email']) {
        $stmt = $pdo->prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?');
        $stmt->execute([$email, $userId]);
        if ($stmt->fetchColumn()) {
            json_error('Another account already uses that email.', 409);
        }
        $set[] = 'email = ?';
        $params[] = $email;
        $needsPassword = true;
    }
}

// Rest days: ISO weekdays (1 = Monday ... 7 = Sunday) that never break the streak. An empty list clears them.
if (array_key_exists('rest_days', $in)) {
    $days = $in['rest_days'];
    if (!is_array($days) || count($days) > STREAK_MAX_REST_DAYS || count($days) !== count(array_unique($days))) {
        json_error('Choose up to ' . STREAK_MAX_REST_DAYS . ' rest days.', 422);
    }
    foreach ($days as $d) {
        if (!is_int($d) || $d < 1 || $d > 7) {
            json_error('Rest days must be weekdays from Monday to Sunday.', 422);
        }
    }
    $set[] = 'rest_days = ?';
    $params[] = streak_mask_from_days($days);
}

// Realistic minutes available on a normal day (the "is today overloaded?" check compares against this)
if (array_key_exists('capacity_min', $in)) {
    $cap = filter_var($in['capacity_min'], FILTER_VALIDATE_INT);
    if ($cap === false || $cap < 30 || $cap > 960) {
        json_error('Daily capacity must be between 30 minutes and 16 hours.', 422);
    }
    $set[] = 'daily_capacity_min = ?';
    $params[] = $cap;
}

// The user's time zone, sent by their browser, so reminders and emails happen on their clock ('' = the server's)
if (array_key_exists('timezone', $in)) {
    $tz = is_string($in['timezone']) ? $in['timezone'] : null;
    if ($tz === null || ($tz !== '' && !in_array($tz, DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC), true))) {
        json_error('Unknown time zone.', 422);
    }
    $set[] = 'timezone = ?';
    $params[] = $tz;
}

// The morning email: on or off, and what time (HH:MM in the user's time zone)
if (array_key_exists('digest_enabled', $in)) {
    $on = filter_var($in['digest_enabled'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
    if ($on === null) {
        json_error('digest_enabled must be true or false.', 422);
    }
    $set[] = 'digest_enabled = ?';
    $params[] = $on ? 1 : 0;
}
if (array_key_exists('digest_time', $in)) {
    if (!is_string($in['digest_time']) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $in['digest_time'])) {
        json_error('Choose a time like 07:30.', 422);
    }
    $set[] = 'digest_time = ?';
    $params[] = $in['digest_time'];
}

$newPassword = (string) ($in['new_password'] ?? '');
if ($newPassword !== '') {
    // bcrypt only uses the first 72 bytes, so longer passwords are rejected instead of silently cut
    if (strlen($newPassword) < 8 || strlen($newPassword) > 72) {
        json_error('Your new password must be 8 to 72 characters.', 422);
    }
    $set[] = 'password_hash = ?';
    $params[] = password_hash($newPassword, PASSWORD_DEFAULT);
    $needsPassword = true;
}

if ($needsPassword) {
    $current = (string) ($in['current_password'] ?? '');
    if ($current === '') {
        json_error('Enter your current password to confirm this change.', 422);
    }
    if (!password_verify($current, $u['password_hash'])) {
        usleep(400000);   // slows down password guessing
        json_error('Your current password is incorrect.', 403);
    }
}

if ($set) {
    try {
        $params[] = $userId;
        $pdo->prepare('UPDATE users SET ' . implode(', ', $set) . ' WHERE id = ?')->execute($params);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {   // lost a race with another account taking the same email
            json_error('Another account already uses that email.', 409);
        }
        throw $e;
    }
}

json_response(['success' => true, 'user' => fetch_user_payload($pdo, $userId)]);
