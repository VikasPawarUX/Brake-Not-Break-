<?php
declare(strict_types=1);

function respond(int $status, array $data): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_THROW_ON_ERROR);
}

function rankScores(array $scores, array $entry): array
{
    foreach ($scores as $key => $score) {
        if ($score['id'] === $entry['id']) {
            if ($score['meters'] >= $entry['meters']) {
                return $scores;
            }
            unset($scores[$key]);
            break;
        }
    }

    $scores[] = $entry;
    usort($scores, static fn(array $a, array $b): int =>
        ($b['meters'] <=> $a['meters']) ?: ($a['reachedAt'] <=> $b['reachedAt']) ?: strcmp($a['id'], $b['id']));
    return array_slice($scores, 0, 10);
}

function readScores(PDO $database, bool $lock = false): array
{
    $sql = 'SELECT scores FROM bumper_leaderboard WHERE board_id = 1';
    $json = $database->query($lock ? $sql . ' FOR UPDATE' : $sql)->fetchColumn();
    if ($json === false) {
        throw new RuntimeException('The leaderboard row is missing.');
    }
    return json_decode($json, true, 16, JSON_THROW_ON_ERROR);
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method !== 'GET' && $method !== 'POST') {
    header('Allow: GET, POST');
    respond(405, ['error' => 'Method not allowed.']);
    return;
}

$entry = null;
if ($method === 'POST') {
    $body = file_get_contents('php://input', false, null, 0, 1025);
    if ($body === false || strlen($body) > 1024) {
        respond(413, ['error' => 'Submission too large.']);
        return;
    }
    $input = json_decode($body, true, 8);
    $name = is_string($input['name'] ?? null) ? trim($input['name']) : '';
    $meters = $input['meters'] ?? null;
    $token = $input['token'] ?? null;
    if ((!preg_match('/\A[^\p{Cc}]+\z/u', $name) ||
         (!preg_match('/\AGuest \d{10}\z/u', $name) && preg_match_all('/\X/u', $name) > 15)) ||
        !is_int($meters) || $meters < 0 || $meters > 9007199254740991 ||
        !is_string($token) || !preg_match('/\A[a-f0-9]{32}\z/', $token)) {
        respond(400, ['error' => 'Invalid nickname or score.']);
        return;
    }

    $entry = [
        'id' => hash('sha256', $token),
        'name' => $name,
        'meters' => $meters,
        'reachedAt' => microtime(true),
    ];
}

try {
    // On cPanel, the game goes in public_html/bumper and the config stays in the account home.
    $configPath = getenv('BUMPER_DB_CONFIG') ?: dirname(__DIR__, 2) . '/bumper-db.php';
    if (!is_readable($configPath)) {
        respond(503, ['error' => 'Leaderboard is offline.']);
        return;
    }
    $config = require $configPath;
    $database = new PDO($config['dsn'], $config['user'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    if ($entry === null) {
        $scores = readScores($database);
    } else {
        $database->beginTransaction();
        $previous = readScores($database, true);
        $scores = rankScores($previous, $entry);
        if ($previous !== $scores) {
            $update = $database->prepare('UPDATE bumper_leaderboard SET scores = ? WHERE board_id = 1');
            $update->execute([json_encode($scores, JSON_THROW_ON_ERROR)]);
        }
        $database->commit();
    }

    respond(200, ['scores' => array_map(static fn(array $score): array => [
        'name' => $score['name'],
        'meters' => $score['meters'],
    ], $scores)]);
} catch (Throwable $error) {
    if (isset($database) && $database->inTransaction()) {
        $database->rollBack();
    }
    error_log('Bumper leaderboard request failed (' . get_class($error) . ').');
    respond(503, ['error' => 'Leaderboard is unavailable.']);
}
