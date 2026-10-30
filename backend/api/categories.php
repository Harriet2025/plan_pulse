<?php
declare(strict_types=1);

require __DIR__ . '/../db.php';
require_once __DIR__ . '/lib.php';

$pdo = get_db();
$userId = current_user_id($pdo);
$method = require_method('POST', 'PATCH', 'DELETE');
$in = read_json_body();

// ---------------------------------------------------------------
// Personal categories ("Content creation", "Side hustle"...), next to the built-in ones.
//   POST   { name, color }        add one (up to 20)
//   PATCH  { id, name?, color? }  rename or recolour one of yours
//   DELETE { id }                 delete one of yours; its goals move to Others
// Every answer carries the full list: { categories: [{ id, name, color, personal }] }.
// ---------------------------------------------------------------
const OTHERS_ID = 9;

function clean_name(mixed $v): string
{
    $name = trim(preg_replace('/\s+/u', ' ', (string) $v));
    if ($name === '' || mb_strlen($name) > 40) {
        json_error('A category name is 1 to 40 characters.', 422);
    }
    return $name;
}

function clean_color(mixed $v): string
{
    $c = (string) $v;
    if (!preg_match('/^#[0-9A-Fa-f]{6}$/', $c)) {
        json_error('Pick a colour.', 422);
    }
    return strtoupper($c);
}

/** Names must not clash, ignoring case, with a built-in category or another of the user's. */
function name_taken(PDO $pdo, int $userId, string $name, int $exceptId = 0): bool
{
    $stmt = $pdo->prepare('SELECT 1 FROM categories WHERE LOWER(name) = LOWER(?) AND (user_id IS NULL OR user_id = ?) AND id <> ?');
    $stmt->execute([$name, $userId, $exceptId]);
    return (bool) $stmt->fetchColumn();
}

function own_category(PDO $pdo, int $userId, mixed $id): int
{
    $id = filter_var($id, FILTER_VALIDATE_INT);
    $stmt = $pdo->prepare('SELECT id FROM categories WHERE id = ? AND user_id = ?');
    $stmt->execute([$id === false ? 0 : $id, $userId]);
    $found = $stmt->fetchColumn();
    if ($found === false) {
        json_error('Only your own categories can be changed.', 404);
    }
    return (int) $found;
}

if ($method === 'POST') {
    $name = clean_name($in['name'] ?? '');
    $color = clean_color($in['color'] ?? '');
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM categories WHERE user_id = ?');
    $stmt->execute([$userId]);
    if ((int) $stmt->fetchColumn() >= 20) {
        json_error('You can have up to 20 categories of your own.', 422);
    }
    if (name_taken($pdo, $userId, $name)) {
        json_error("You already have a category called \"{$name}\".", 409);
    }
    $pdo->prepare('INSERT INTO categories (user_id, name, color_code) VALUES (?, ?, ?)')->execute([$userId, $name, $color]);
    json_response(['success' => true, 'id' => (int) $pdo->lastInsertId(), 'categories' => fetch_categories($pdo, $userId)], 201);
}

$id = own_category($pdo, $userId, $in['id'] ?? null);

if ($method === 'PATCH') {
    if (array_key_exists('name', $in)) {
        $name = clean_name($in['name']);
        if (name_taken($pdo, $userId, $name, $id)) {
            json_error("You already have a category called \"{$name}\".", 409);
        }
        $pdo->prepare('UPDATE categories SET name = ? WHERE id = ?')->execute([$name, $id]);
    }
    if (array_key_exists('color', $in)) {
        $pdo->prepare('UPDATE categories SET color_code = ? WHERE id = ?')->execute([clean_color($in['color']), $id]);
    }
    json_response(['success' => true, 'categories' => fetch_categories($pdo, $userId)]);
}

// DELETE: its goals go to Others, and partners stop seeing it as a shared category
$pdo->beginTransaction();
$pdo->prepare('UPDATE goals SET category_id = ? WHERE category_id = ? AND user_id = ?')->execute([OTHERS_ID, $id, $userId]);
$pdo->prepare('DELETE FROM partner_shares WHERE category_id = ? AND owner_id = ?')->execute([$id, $userId]);
$pdo->prepare('DELETE FROM categories WHERE id = ?')->execute([$id]);
$pdo->commit();
json_response(['success' => true, 'categories' => fetch_categories($pdo, $userId)]);
