<?php
/**
 * index.php — Unified PHP Router
 * 
 * Replaces the Go proxy server. Serves static files AND proxies Ollama API
 * endpoints with bearer token authentication.
 * 
 * Usage: php -S localhost:8000 index.php
 */

// ===== Configuration =====
define('OLLAMA_SERVER_URL', 'https://www.ollama.com');
define('BEARER_TOKEN', 'Bearer 09bcc71ac2ee449f9e0545259f7f2c90.cKc7ayF9G3-Ka9qPIHR7ZdMQ');
define('UI_FILE', 'WishMachine.html');
define('STATIC_DIR', __DIR__);
// The parent directory contains legacy scripts referenced as /quipu-data-models.js etc.
define('LEGACY_STATIC_DIR', dirname(__DIR__));

// ===== CORS Headers (applied to all responses) =====
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ===== Routing =====
$requestUri = $_SERVER['REQUEST_URI'];
$path = parse_url($requestUri, PHP_URL_PATH);

// --- API Routes ---

// /api/tags — GET proxy to Ollama with Server-Side Rich Caching
if ($path === '/api/tags') {
    handleTagsWithRichCache();
    exit;
}

// /api/show — POST proxy to Ollama
if ($path === '/api/show') {
    proxyToOllama('/api/show', 'POST');
    exit;
}

// /api/chat — POST proxy to Ollama (streaming)
if ($path === '/api/chat') {
    proxyToOllamaStream('/api/chat');
    exit;
}

// /api/ollama — POST proxy to Ollama /api/chat (legacy route used by coreOllamaRequestTC)
if ($path === '/api/ollama') {
    proxyToOllamaStream('/api/chat');
    exit;
}

// /api/server.php — Decomp-Recomp pipeline
if ($path === '/api/server.php') {
    require __DIR__ . '/api/server.php';
    exit;
}

// /api/quipu/knots — GET knots for a Quipu (for Knot Reader refresh)
if ($path === '/api/quipu/knots') {
    handleQuipuKnotsRequest();
    exit;
}

// /saveHistory — POST (legacy endpoint)
if ($path === '/saveHistory') {
    handleSaveHistory();
    exit;
}

// --- Static File Serving ---

// Debug endpoint (temporary)
if ($path === '/debug.php') {
    require __DIR__ . '/debug.php';
    exit;
}

// Root path serves UXtool.html
if ($path === '/' || $path === '') {
    serveFile(STATIC_DIR . '/' . UI_FILE);
    exit;
}

// Prevent directory traversal
if (strpos($path, '..') !== false) {
    http_response_code(400);
    echo 'Invalid Path';
    exit;
}

// Try serving from src/ directory first, then from parent (legacy scripts)
$srcFile = STATIC_DIR . $path;
$legacyFile = LEGACY_STATIC_DIR . $path;

if (is_file($srcFile)) {
    // Let PHP built-in server handle the file serving for proper MIME types
    return false; // Tells the built-in server to serve the file directly
} elseif (is_file($legacyFile)) {
    serveFile($legacyFile);
    exit;
} else {
    http_response_code(404);
    echo "File not found: $path";
    exit;
}

// ========================================
// ===== Helper Functions =====
// ========================================

/**
 * Serves a static file with the correct MIME type.
 */
function serveFile($filepath) {
    if (!is_file($filepath)) {
        http_response_code(404);
        echo 'Not Found';
        return;
    }

    $ext = strtolower(pathinfo($filepath, PATHINFO_EXTENSION));
    $mimeTypes = [
        'html' => 'text/html',
        'js'   => 'application/javascript',
        'css'  => 'text/css',
        'json' => 'application/json',
        'png'  => 'image/png',
        'jpg'  => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'svg'  => 'image/svg+xml',
        'ico'  => 'image/x-icon',
        'woff' => 'font/woff',
        'woff2'=> 'font/woff2',
        'ttf'  => 'font/ttf',
        'txt'  => 'text/plain',
        'md'   => 'text/plain',
        'exe'  => 'application/octet-stream',
    ];

    $mime = $mimeTypes[$ext] ?? 'application/octet-stream';
    header("Content-Type: $mime");
    readfile($filepath);
}

/**
 * Proxies a non-streaming request to the Ollama server with bearer token.
 * Uses file_get_contents with stream contexts (no cURL dependency).
 */
function proxyToOllama($apiPath, $method = 'GET') {
    $targetUrl = OLLAMA_SERVER_URL . $apiPath;
    
    $httpOpts = [
        'http' => [
            'header'  => "Authorization: " . BEARER_TOKEN . "\r\n" .
                         "Content-Type: application/json\r\n",
            'ignore_errors' => true,
            'timeout' => 120,
        ],
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
        ]
    ];

    if ($method === 'POST') {
        $body = file_get_contents('php://input');
        $httpOpts['http']['method'] = 'POST';
        $httpOpts['http']['content'] = $body;
    }

    $context = stream_context_create($httpOpts);
    $response = @file_get_contents($targetUrl, false, $context);
    
    // Extract HTTP status code from response headers
    $httpCode = 200;
    $responseHeaders = isset($http_response_header) ? $http_response_header : [];
    if (is_array($responseHeaders) && !empty($responseHeaders)) {
        if (preg_match('#HTTP/\d+\.?\d*\s+(\d+)#', $responseHeaders[0] ?? '', $matches)) {
            $httpCode = intval($matches[1]);
        }
    }

    if ($response === false) {
        $error = error_get_last();
        $errMsg = $error ? $error['message'] : 'Unknown error';
        http_response_code(502);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Ollama unreachable: ' . $errMsg]);
        return;
    }

    header('Content-Type: application/json');
    http_response_code($httpCode);
    echo $response;
}

/**
 * Proxies a streaming POST request to Ollama and flushes chunks in real-time.
 * Uses fopen with stream contexts (no cURL dependency).
 * This is critical for /api/chat where the frontend reads a ReadableStream.
 */
function proxyToOllamaStream($apiPath) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Only POST allowed']);
        return;
    }

    $targetUrl = OLLAMA_SERVER_URL . $apiPath;
    $body = file_get_contents('php://input');

    $parsedUrl = parse_url(OLLAMA_SERVER_URL);
    $host = $parsedUrl['host'] ?? 'www.ollama.com';

    $httpOpts = [
        'http' => [
            'method'  => 'POST',
            'header'  => "Authorization: " . BEARER_TOKEN . "\r\n" .
                         "Content-Type: application/json\r\n" .
                         "Accept: application/json\r\n" .
                         "Host: " . $host . "\r\n",
            'content' => $body,
            'timeout' => 6000, // Long timeout for LLM responses
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
        ]
    ];

    $context = stream_context_create($httpOpts);

    // Set response headers before streaming
    header('Content-Type: application/json');
    header('Cache-Control: no-cache');

    // Disable output buffering for real-time streaming
    while (ob_get_level()) {
        ob_end_flush();
    }

    // Open the remote URL as a stream
    $stream = @fopen($targetUrl, 'r', false, $context);

    if ($stream === false) {
        $error = error_get_last();
        $errMsg = $error ? $error['message'] : 'Unknown error';
        error_log("Ollama streaming proxy error: $errMsg");
        http_response_code(502);
        echo json_encode(['error' => 'Ollama unreachable: ' . $errMsg]);
        return;
    }

    // Extract HTTP status from response headers
    $responseHeaders = http_get_last_response_headers();
    if (is_array($responseHeaders) && !empty($responseHeaders)) {
        if (preg_match('#HTTP/\d+\.?\d*\s+(\d+)#', $responseHeaders[0] ?? '', $matches)) {
            http_response_code(intval($matches[1]));
        }
    }

    // Stream data to the client in chunks, flushing after each read
    while (!feof($stream)) {
        $chunk = fread($stream, 8192);
        if ($chunk !== false && strlen($chunk) > 0) {
            echo $chunk;
            if (ob_get_level()) ob_flush();
            flush();
        }
    }

    fclose($stream);
}

/**
 * Handles the /api/quipu/knots endpoint.
 * Returns all knots for a given Quipu after a pipeline run.
 */
function handleQuipuKnotsRequest() {
    header('Content-Type: application/json');

    // This endpoint expects state to be passed in via POST body
    // (since PHP is stateless, the client sends the pipeline result back)
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        require_once __DIR__ . '/api/DataModels.php';
        
        $input = json_decode(file_get_contents('php://input'), true);
        $registryData = $input['registry'] ?? null;
        $quipuRegId = $input['quipuRegId'] ?? null;

        if (!$registryData || $quipuRegId === null) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing registry or quipuRegId']);
            return;
        }

        // Hydrate the registry from the client-side data
        Registry::$KnotArray = [];
        Registry::$StrandArray = [];
        Registry::$QuipuArray = [];
        Registry::$TwoLayerArray = [];
        Registry::$ThreeCellArray = [];

        // Re-build from the debug_registry that server.php returns
        $knots = [];
        $quipu = $registryData['quipus'][$quipuRegId] ?? null;

        if ($quipu) {
            foreach ($quipu->strands ?? [] as $strandInfo) {
                $strand = $registryData['strands'][$strandInfo['strandRegId']] ?? null;
                if ($strand) {
                    foreach ($strand->knots ?? [] as $knotRegId) {
                        $knot = $registryData['knots'][$knotRegId] ?? null;
                        if ($knot) {
                            $tc = $registryData['tc'][$knot->TC] ?? null;
                            $prompt = $tc ? ($registryData['layer'][$tc->prompt] ?? null) : null;
                            $response = $tc ? ($registryData['layer'][$tc->response] ?? null) : null;
                            $knots[] = [
                                'RegId' => $knotRegId,
                                'knotType' => $knot->knotType ?? '',
                                'executionStatus' => $knot->executionStatus ?? 'PENDING',
                                'strandIndex' => $knot->strandIndex ?? 0,
                                'parentStrandId' => $knot->parentStrandId ?? null,
                                'prompt' => $prompt ? ['role' => $prompt->role, 'content' => $prompt->content] : null,
                                'response' => $response ? ['role' => $response->role, 'content' => $response->content] : null,
                            ];
                        }
                    }
                }
            }
        }

        echo json_encode(['status' => 'success', 'knots' => $knots]);
        return;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Only POST allowed']);
}

/**
 * Handles saving conversation history to a file (legacy endpoint).
 */
function handleSaveHistory() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo 'Method not allowed';
        return;
    }

    $historyJSON = file_get_contents('php://input');
    if (empty($historyJSON)) {
        http_response_code(400);
        echo 'Empty body';
        return;
    }

    $saveDir = LEGACY_STATIC_DIR . '/conversation_history';
    if (!is_dir($saveDir)) {
        mkdir($saveDir, 0755, true);
    }

    $filename = 'history_dump_' . time() . '.json';
    $filepath = $saveDir . '/' . $filename;

    if (file_put_contents($filepath, $historyJSON) !== false) {
        http_response_code(200);
        echo "Conversation history saved successfully to $filename";
    } else {
        http_response_code(500);
        echo "Failed to save history";
    }
}

/**
 * Fetches /api/tags, iteratively fetches /api/show for context limits,
 * caches the augmented response server-side, and serves it.
 */
function handleTagsWithRichCache() {
    $cacheFile = __DIR__ . '/models_cache.json';
    $cacheExpiry = 6 * 3600; // 6 hours

    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheExpiry) {
        header('Content-Type: application/json');
        readfile($cacheFile);
        return;
    }

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
        http_response_code(500);
        echo json_encode(['error' => 'Failed to fetch tags from Ollama proxy']);
        return;
    }

    $tagsData = json_decode($response, true);
    if (isset($tagsData['models']) && is_array($tagsData['models'])) {
        foreach ($tagsData['models'] as &$model) {
            $showUrl = OLLAMA_SERVER_URL . '/api/show';
            $showOpts = [
                'http' => [
                    'method' => 'POST',
                    'header' => "Content-Type: application/json\r\nAuthorization: " . BEARER_TOKEN . "\r\n",
                    'content' => json_encode(['model' => $model['name']])
                ]
            ];
            $showCtx = stream_context_create($showOpts);
            $showResp = @file_get_contents($showUrl, false, $showCtx);
            $model['ctx_num'] = 4096; 
            if ($showResp !== false) {
                $showData = json_decode($showResp, true);
                if (isset($showData['model_info'])) {
                    foreach ($showData['model_info'] as $k => $v) {
                        if (str_ends_with($k, '.context_length')) {
                            $model['ctx_num'] = $v;
                            break;
                        }
                    }
                }
            }
        }
    }

    $finalJson = json_encode($tagsData);
    file_put_contents($cacheFile, $finalJson);
    header('Content-Type: application/json');
    echo $finalJson;
}

if (!function_exists('str_ends_with')) {
    function str_ends_with($haystack, $needle) {
        $length = strlen($needle);
        return $length === 0 || (substr($haystack, -$length) === $needle);
    }
}
?>
