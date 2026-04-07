<?php
/**
 * api/show.php — Proxies POST requests to https://www.ollama.com/api/show
 * Injects Authorization bearer token.
 */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Only POST allowed']);
    exit;
}

define('OLLAMA_SHOW_URL', 'https://www.ollama.com/api/show');
define('BEARER_TOKEN', 'Bearer 09bcc71ac2ee449f9e0545259f7f2c90.cKc7ayF9G3-Ka9qPIHR7ZdMQ');

$body = file_get_contents('php://input');

$ctx = stream_context_create([
    'http' => [
        'method'  => 'POST',
        'header'  => "Authorization: " . BEARER_TOKEN . "\r\n" .
                     "Content-Type: application/json\r\n",
        'content' => $body,
        'ignore_errors' => true,
        'timeout' => 30,
    ],
    'ssl' => [
        'verify_peer' => false,
        'verify_peer_name' => false,
    ]
]);

$response = @file_get_contents(OLLAMA_SHOW_URL, false, $ctx);

// Extract HTTP status
$httpCode = 200;
if (isset($http_response_header) && is_array($http_response_header)) {
    if (preg_match('#HTTP/\d+\.?\d*\s+(\d+)#', $http_response_header[0] ?? '', $m)) {
        $httpCode = intval($m[1]);
    }
}

if ($response === false) {
    $err = error_get_last();
    http_response_code(502);
    echo json_encode(['error' => 'Ollama unreachable: ' . ($err['message'] ?? 'unknown')]);
    exit;
}

http_response_code($httpCode);
echo $response;
