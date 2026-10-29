<?php
declare(strict_types=1);

/**
 * AuraGoal database bootstrap: config, JSON helpers, sessions, CORS and the PDO connection.
 * Every endpoint starts with:  require __DIR__ . '/../db.php';
 *
 * Database settings come from backend/config.local.php (see config.local.example.php),
 * then the AURAGOAL_DB_* environment variables, then the XAMPP defaults below.
 */

require_once __DIR__ . '/streak.php';

// ---------------------------------------------------------------
// Config
// ---------------------------------------------------------------
const DB_HOST_DEFAULT = '127.0.0.1';
const DB_PORT_DEFAULT = '3306';
const DB_NAME_DEFAULT = 'auragoal';
const DB_USER_DEFAULT = 'root';
const DB_PASS_DEFAULT = '';

// Origins allowed to call the API directly from a browser. Through the Vite dev proxy requests are same-origin.
const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
];

// Set to true only while developing; never expose exception details in production.
const APP_DEBUG = false;

// ---------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------
function json_response($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}

function json_error(string $message, int $status = 400, array $extra = []): void
{
    json_response(['success' => false, 'error' => $message] + $extra, $status);
}

// ---------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------
function require_method(string ...$allowed): string
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, $allowed, true)) {
        header('Allow: ' . implode(', ', $allowed) . ', OPTIONS');
        json_error('Method not allowed.', 405);
    }
    return $method;
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_error('Request body must be valid JSON.', 400);
    }
    return $data;
}

// ---------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------
const SESSION_LIFETIME = 60 * 60 * 24 * 30; // stay signed in for 30 days

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', (string) SESSION_LIFETIME);
    session_name('auragoal_sid');
    session_set_cookie_params([
        'lifetime' => SESSION_LIFETIME,
        'path'     => '/',
        'secure'   => $secure,     // set automatically when served over HTTPS
        'httponly' => true,        // not readable from JavaScript
        'samesite' => 'Lax',
    ]);
    session_start();
}

/**
 * The signed-in user's id, or a 401 JSON response. The session is released right away
 * so slow requests do not block each other on the session file lock.
 */
function current_user_id(PDO $pdo): int
{
    start_session();
    $uid = $_SESSION['uid'] ?? null;
    session_write_close();

    if (is_int($uid)) {
        $stmt = $pdo->prepare('SELECT 1 FROM users WHERE id = ?');
        $stmt->execute([$uid]);
        if ($stmt->fetchColumn()) {
            return $uid;
        }
    }
    json_error('Please sign in to continue.', 401, ['auth_required' => true]);
}

// ---------------------------------------------------------------
// Users
// ---------------------------------------------------------------

/**
 * The user's public profile, or null. `avatar_v` is a version number (unix time of the last photo change,
 * or null when there is no photo); the browser adds it to the image URL so a new photo is never served from cache.
 */
function fetch_user_payload(PDO $pdo, int $userId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, email, display_name, streak_count, best_streak, streak_freezes, rest_days, last_active_date,
                daily_capacity_min, digest_enabled, digest_time, timezone, UNIX_TIMESTAMP(avatar_updated_at) AS avatar_v
         FROM users WHERE id = ?'
    );
    $stmt->execute([$userId]);
    $u = $stmt->fetch();
    if (!$u) {
        return null;
    }
    $streak = streak_view($u, streak_today($u['timezone']));
    return [
        'id'                  => (int) $u['id'],
        'email'               => $u['email'],
        'display_name'        => $u['display_name'],
        'avatar_v'            => $u['avatar_v'] !== null ? (int) $u['avatar_v'] : null,
        // Streak: streak_count is what is alive right now (0 once it can no longer be saved)
        'streak_count'        => $streak['count'],
        'best_streak'         => max((int) $u['best_streak'], $streak['count']),
        'streak_freezes'      => (int) $u['streak_freezes'],
        'rest_days'           => streak_days_from_mask((int) $u['rest_days']),   // ISO weekdays, 1 = Monday ... 7 = Sunday
        'last_active'         => $u['last_active_date'],
        'streak_active_today' => $streak['active_today'],
        'streak_protected'    => $streak['protected'],
        'rest_today'          => $streak['rest_today'],
        // Planning and notifications
        'daily_capacity_min'  => (int) $u['daily_capacity_min'],
        'digest_enabled'      => (bool) $u['digest_enabled'],
        'digest_time'         => $u['digest_time'],
        'timezone'            => $u['timezone'],
    ];
}

// ---------------------------------------------------------------
// CORS
// ---------------------------------------------------------------
function send_cors_headers(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    if ($origin !== '' && in_array($origin, ALLOWED_ORIGINS, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Credentials: true');
    }

    header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 600');
    header('X-Content-Type-Options: nosniff');

    // Answer preflight requests immediately.
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

// ---------------------------------------------------------------
// Local settings (backend/config.local.php): database login, app_url and smtp (see config.local.example.php)
// ---------------------------------------------------------------
function app_config(): array
{
    static $cfg = null;
    if ($cfg === null) {
        $cfg = is_file(__DIR__ . '/config.local.php') ? (array) require __DIR__ . '/config.local.php' : [];
    }
    return $cfg;
}

// ---------------------------------------------------------------
// Database
// ---------------------------------------------------------------
function get_db(bool $fresh = false): PDO   // $fresh: drop the old connection (the long-running worker reconnects after an error)
{
    static $pdo = null;
    if ($pdo instanceof PDO && !$fresh) {
        return $pdo;
    }

    // config.local.php returns ['host','port','name','user','pass', ...] and keeps your password out of the code.
    $local = app_config();

    $host = $local['host'] ?? (getenv('AURAGOAL_DB_HOST') ?: DB_HOST_DEFAULT);
    $port = $local['port'] ?? (getenv('AURAGOAL_DB_PORT') ?: DB_PORT_DEFAULT);
    $name = $local['name'] ?? (getenv('AURAGOAL_DB_NAME') ?: DB_NAME_DEFAULT);
    $user = $local['user'] ?? (getenv('AURAGOAL_DB_USER') ?: DB_USER_DEFAULT);
    $envPass = getenv('AURAGOAL_DB_PASS');
    $pass = $local['pass'] ?? (($envPass === false) ? DB_PASS_DEFAULT : $envPass);

    $pdo = new PDO("mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,   // real prepared statements
        PDO::ATTR_STRINGIFY_FETCHES  => false,
    ]);

    return $pdo;
}

// ---------------------------------------------------------------
// Bootstrap (runs on include)
// ---------------------------------------------------------------
send_cors_headers();

set_exception_handler(function (Throwable $e): void {
    error_log('[AuraGoal] ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());

    $extra = APP_DEBUG ? ['debug' => $e->getMessage()] : [];
    if ($e instanceof PDOException) {
        json_error('Database error. Check the MySQL settings in backend/config.local.php.', 500, $extra);
    }
    json_error('Internal server error.', 500, $extra);
});

// Verify the connection up front so every endpoint fails fast with clean JSON.
get_db();
