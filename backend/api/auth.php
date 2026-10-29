<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';

$pdo = get_db();
$method = require_method('GET', 'POST');

function sign_in(int $userId): void
{
    session_regenerate_id(true);   // new session id on every login prevents session fixation
    $_SESSION['uid'] = $userId;
}

// ---------------------------------------------------------------
// GET /api/auth.php : who is signed in? (always 200)
// ---------------------------------------------------------------
if ($method === 'GET') {
    start_session();
    $uid = $_SESSION['uid'] ?? null;
    session_write_close();

    if (is_int($uid) && ($u = fetch_user_payload($pdo, $uid))) {
        json_response(['success' => true, 'authenticated' => true, 'user' => $u]);
    }
    json_response(['success' => true, 'authenticated' => false]);
}

// ---------------------------------------------------------------
// POST /api/auth.php   Body: { action: "signup" | "login" | "logout", ... }
// ---------------------------------------------------------------
$in = read_json_body();
$action = (string) ($in['action'] ?? '');

if ($action === 'logout') {
    start_session();
    $_SESSION = [];
    $p = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'],
        'httponly' => true, 'samesite' => 'Lax',
    ]);
    session_destroy();
    json_response(['success' => true, 'authenticated' => false]);
}

// ---------------------------------------------------------------
// Forgotten password, step 1:  { action: "forgot", email }
// Always answers the same way, so nobody can use it to find out which emails have accounts.
// ---------------------------------------------------------------
const RESET_MINUTES = 60;          // how long a reset link works
const RESET_MAX_PER_HOUR = 3;      // reset emails per account per hour

if ($action === 'forgot') {
    require __DIR__ . '/../mailer.php';
    $to = strtolower(trim((string) ($in['email'] ?? '')));
    $reply = ['success' => true, 'message' => 'If an account uses that email, a reset link is on its way. It works for ' . RESET_MINUTES . ' minutes.'];

    $user = null;
    if (filter_var($to, FILTER_VALIDATE_EMAIL)) {
        $stmt = $pdo->prepare('SELECT id, display_name FROM users WHERE email = ?');
        $stmt->execute([$to]);
        $user = $stmt->fetch();
    }
    if (!$user) {
        usleep(random_int(400000, 1100000));   // roughly the time a real send takes, so timing gives nothing away
        json_response($reply);
    }

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM password_resets WHERE user_id = ? AND created_at > NOW() - INTERVAL 1 HOUR');
    $stmt->execute([$user['id']]);
    if ((int) $stmt->fetchColumn() >= RESET_MAX_PER_HOUR) {
        json_response($reply);                 // silently stop, so the inbox cannot be flooded
    }

    // The link carries a random token; only its hash is stored, so a copy of the database cannot be used to reset anyone
    // Older links are retired by marking them used (not deleted), so the hourly limit above keeps counting them
    $token = bin2hex(random_bytes(32));
    $pdo->exec('DELETE FROM password_resets WHERE created_at < NOW() - INTERVAL 1 DAY');
    $pdo->prepare('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL')->execute([$user['id']]);
    $pdo->prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, NOW() + INTERVAL ' . RESET_MINUTES . ' MINUTE)')
        ->execute([$user['id'], hash('sha256', $token)]);

    $base = rtrim((string) (app_config()['app_url'] ?? 'http://localhost:5173'), '/');
    [$text, $html] = reset_email((string) $user['display_name'], $base . '/#reset=' . $token, RESET_MINUTES);   // "#" keeps the token out of server logs
    send_mail($to, 'Reset your AuraGoal password', $text, $html);
    json_response($reply);
}

// ---------------------------------------------------------------
// Forgotten password, step 2:  { action: "reset", token, password }
// ---------------------------------------------------------------
if ($action === 'reset') {
    $token = (string) ($in['token'] ?? '');
    $new = (string) ($in['password'] ?? '');
    $invalid = 'This reset link is invalid or has expired. Ask for a new one.';
    if (!preg_match('/^[0-9a-f]{64}$/', $token)) {
        json_error($invalid, 400);
    }
    if (strlen($new) < 8 || strlen($new) > 72) {
        json_error('Your password must be 8 to 72 characters.', 422);
    }

    $pdo->beginTransaction();
    $stmt = $pdo->prepare('SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() FOR UPDATE');
    $stmt->execute([hash('sha256', $token)]);
    $row = $stmt->fetch();
    if (!$row) {
        $pdo->rollBack();
        usleep(400000);
        json_error($invalid, 400);
    }
    $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $row['user_id']]);
    $pdo->prepare('UPDATE password_resets SET used_at = NOW() WHERE id = ?')->execute([$row['id']]);
    $pdo->prepare('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL')->execute([$row['user_id']]);   // any other pending links die too
    $pdo->commit();

    json_response(['success' => true, 'message' => 'Your password is changed. Sign in with the new one.']);
}

$email = strtolower(trim((string) ($in['email'] ?? '')));
$password = (string) ($in['password'] ?? '');

if ($action === 'signup') {
    $name = trim((string) ($in['display_name'] ?? ''));
    if ($name === '' || mb_strlen($name) > 100) {
        json_error('Enter a name of 1 to 100 characters.', 422);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 255) {
        json_error('Enter a valid email address.', 422);
    }
    // bcrypt only uses the first 72 bytes, so longer passwords are rejected instead of silently cut
    if (strlen($password) < 8 || strlen($password) > 72) {
        json_error('Your password must be 8 to 72 characters.', 422);
    }

    $stmt = $pdo->prepare('SELECT 1 FROM users WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetchColumn()) {
        json_error('An account with that email already exists. Try signing in.', 409);
    }

    try {
        $pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
            ->execute([$email, password_hash($password, PASSWORD_DEFAULT), $name]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {   // lost a race with another signup for the same email
            json_error('An account with that email already exists. Try signing in.', 409);
        }
        throw $e;
    }
    $id = (int) $pdo->lastInsertId();

    start_session();
    sign_in($id);
    json_response(['success' => true, 'authenticated' => true, 'user' => fetch_user_payload($pdo, $id)], 201);
}

if ($action === 'login') {
    $stmt = $pdo->prepare('SELECT id, password_hash FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $u = $stmt->fetch();

    // Verify against a dummy hash when the email is unknown so both cases take similar time
    $hash = $u ? $u['password_hash'] : '$2y$12$vqbuBuC6toPYsxi3QW4ch.5TO5zqK2G6qwWwAMN4ntIrf7kuIuAem';
    $ok = password_verify($password, $hash) && $u;

    if (!$ok) {
        usleep(400000);   // slows down password guessing
        json_error('Incorrect email or password.', 401);
    }

    if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
        $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($password, PASSWORD_DEFAULT), $u['id']]);
    }

    start_session();
    sign_in((int) $u['id']);
    json_response(['success' => true, 'authenticated' => true, 'user' => fetch_user_payload($pdo, (int) $u['id'])]);
}

json_error('Unknown action. Use signup, login, logout, forgot or reset.', 422);
