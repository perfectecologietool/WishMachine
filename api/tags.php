<?php
/**
 * api/tags.php — Proxies GET requests to https://www.ollama.com/api/tags
 * Fetches /api/show for context limits natively, caches the augmented response in MySQL.
 */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/config.php';

try {
    $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

$cacheExpiryHours = 6;

// 1. Check if we have valid cache for ALL models
// For simplicity, we'll check if any model was updated in the last 6 hours.
// If not, we refresh.
$stmt = $pdo->query("SELECT COUNT(*) FROM `model_options` WHERE last_updated > DATE_SUB(NOW(), INTERVAL $cacheExpiryHours HOUR)");
$cacheValidCount = $stmt->fetchColumn();

if ($cacheValidCount > 0) {
    // Return cached data
    $stmt = $pdo->query("SELECT * FROM `model_options` ORDER BY model_name ASC");
    $models = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $details = json_decode($row['model_details'], true);
        $details['ctx_num'] = $row['ctx_num'];
        $models[] = $details;
    }
    echo json_encode(['models' => $models]);
    exit;
}

// 2. Cache is invalid or missing, fetch from Ollama
$targetUrl = OLLAMA_SERVER_URL . '/api/tags';
$httpOpts = [
    'http' => [
        'method' => 'GET',
        'header' => "Content-Type: application/json\r\nAuthorization: " . BEARER_TOKEN . "\r\n"
    ]
];
$ctx = stream_context_create($httpOpts);
$response = @file_get_contents($targetUrl, false, $ctx);

if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Failed to fetch tags from Ollama proxy']);
    exit;
}

if (!function_exists('str_ends_with')) {
    function str_ends_with($haystack, $needle) {
        $length = strlen($needle);
        return $length === 0 || (substr($haystack, -$length) === $needle);
    }
}

$tagsData = json_decode($response, true);
$finalModels = [];

if (isset($tagsData['models']) && is_array($tagsData['models'])) {
    foreach ($tagsData['models'] as $model) {
        $modelName = $model['name'];
        $showUrl = OLLAMA_SERVER_URL . '/api/show';
        $showOpts = [
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\nAuthorization: " . BEARER_TOKEN . "\r\n",
                'content' => json_encode(['model' => $modelName])
            ]
        ];
        $showCtx = stream_context_create($showOpts);
        $showResp = @file_get_contents($showUrl, false, $showCtx);
        
        $ctxNum = 4096; 
        if ($showResp !== false) {
            $showData = json_decode($showResp, true);
            if (isset($showData['model_info'])) {
                foreach ($showData['model_info'] as $k => $v) {
                    if (str_ends_with($k, '.context_length')) {
                        $ctxNum = $v;
                        break;
                    }
                }
            }
        }
        
        // Update model in MySQL
        $upsertStmt = $pdo->prepare("INSERT INTO `model_options` (model_name, ctx_num, model_details) 
            VALUES (:name, :ctx, :details) 
            ON DUPLICATE KEY UPDATE ctx_num = :ctx, model_details = :details, last_updated = CURRENT_TIMESTAMP");
        
        $upsertStmt->execute([
            ':name' => $modelName,
            ':ctx' => $ctxNum,
            ':details' => json_encode($model)
        ]);

        $model['ctx_num'] = $ctxNum;
        $finalModels[] = $model;
    }
}

echo json_encode(['models' => $finalModels]);
