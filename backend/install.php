<?php
declare(strict_types=1);

/**
 * Creates AuraGoal's tables in an empty database (used when the server starts, for example on Railway).
 * Does nothing when the tables are already there, so it is safe to run on every start.
 * Command line only:  php backend/install.php
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/db.php';

// The database may still be starting; wait for it a little
$pdo = null;
for ($try = 1; $try <= 20 && !$pdo; $try++) {
    try {
        $pdo = get_db(true);
    } catch (Throwable $e) {
        fwrite(STDERR, "Waiting for the database ({$try}/20): {$e->getMessage()}\n");
        sleep(3);
    }
}
if (!$pdo) {
    fwrite(STDERR, "The database could not be reached. Check the MYSQL* / AURAGOAL_DB_* settings.\n");
    exit(1);
}

if ($pdo->query("SHOW TABLES LIKE 'users'")->fetchColumn()) {
    echo "AuraGoal tables are already there.\n";
    exit(0);
}

// schema.sql creates and selects its own `auragoal` database; on a host the database is given, so leave those lines out
$sql = (string) file_get_contents(dirname(__DIR__) . '/schema.sql');
$sql = preg_replace('/--.*$/m', '', $sql);
$sql = preg_replace('/^\s*(CREATE DATABASE|USE)\b[^;]*;/mi', '', $sql);
$count = 0;
foreach (array_filter(array_map('trim', explode(';', $sql))) as $statement) {
    $pdo->exec($statement);
    $count++;
}
echo "Created AuraGoal's tables ({$count} statements).\n";
