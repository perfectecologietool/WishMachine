<?php
/**
 * api/chat.php — Proxies POST requests to https://www.ollama.com/api/chat
 * Injects Authorization bearer token. Streams the response in real-time.
 */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Prevent PHP from timing out during long LLM streaming sessions
set_time_limit(0);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Content-Type: application/json');
    http_response_code(405);
    echo json_encode(['error' => 'Only POST allowed']);
    exit;
}

define('OLLAMA_CHAT_URL', 'https://www.ollama.com/api/chat');

$tokensFile = __DIR__ . '/tokens.php';
$lockFile = __DIR__ . '/tokens.lock';

$fp = fopen($lockFile, 'c+');
if (!$fp) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not create lock file']);
    exit;
}
if (!flock($fp, LOCK_EX)) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not acquire lock']);
    exit;
}

$tokensData = file_exists($tokensFile) ? file_get_contents($tokensFile) : "<?php exit(\"Access Denied\"); ?>\n[]";
$tokensJson = str_replace("<?php exit(\"Access Denied\"); ?>\n", "", $tokensData);
$tokens = json_decode($tokensJson, true) ?: [];

$selectedTokenIndex = -1;
foreach ($tokens as $index => $t) {
    if (isset($t['Is_Used']) && $t['Is_Used'] === false) {
        $selectedTokenIndex = $index;
        break;
    }
}

if ($selectedTokenIndex === -1) {
    flock($fp, LOCK_UN);
    fclose($fp);
    http_response_code(202); 
    echo json_encode(['error' => 'No tokens available in the pool. Retry later.']);
    exit;
}

$activeToken = $tokens[$selectedTokenIndex]['token'];
$tokens[$selectedTokenIndex]['Is_Used'] = true;
file_put_contents($tokensFile, "<?php exit(\"Access Denied\"); ?>\n" . json_encode($tokens, JSON_PRETTY_PRINT));
flock($fp, LOCK_UN);
fclose($fp);

// Setup shutdown function to guarantee the token is returned when the script ends
function releaseToken($tokenStr) {
    global $tokensFile, $lockFile;
    $f = @fopen($lockFile, 'c+');
    if ($f && flock($f, LOCK_EX)) {
        $tsData = file_exists($tokensFile) ? file_get_contents($tokensFile) : "<?php exit(\"Access Denied\"); ?>\n[]";
        $tsJson = str_replace("<?php exit(\"Access Denied\"); ?>\n", "", $tsData);
        $ts = json_decode($tsJson, true) ?: [];
        foreach ($ts as $idx => $t) {
            if ($t['token'] === $tokenStr) {
                $ts[$idx]['Is_Used'] = false;
                break;
            }
        }
        file_put_contents($tokensFile, "<?php exit(\"Access Denied\"); ?>\n" . json_encode($ts, JSON_PRETTY_PRINT));
        flock($f, LOCK_UN);
        fclose($f);
    }
}
register_shutdown_function('releaseToken', $activeToken);


$body = file_get_contents('php://input');

$ctx = stream_context_create([
    'http' => [
        'method'  => 'POST',
        'header'  => "Authorization: " . $activeToken . "\r\n" .
                     "Content-Type: application/json\r\n" .
                     "Accept: application/json\r\n",
        'content' => $body,
        'timeout' => 6000, // Long timeout for LLM responses
        'ignore_errors' => true,
    ],
    'ssl' => [
        'verify_peer' => false,
        'verify_peer_name' => false,
    ]
]);

// Set response headers before streaming
header('Content-Type: application/json');
header('Cache-Control: no-cache');

// Disable output buffering for real-time streaming
while (ob_get_level()) {
    ob_end_flush();
}

// Open the remote URL as a stream
$stream = @fopen(OLLAMA_CHAT_URL, 'r', false, $ctx);

if ($stream === false) {
    $err = error_get_last();
    http_response_code(502);
    echo json_encode(['error' => 'Ollama unreachable: ' . ($err['message'] ?? 'unknown')]);
    exit;
}

// Extract HTTP status from response headers
if (isset($http_response_header) && is_array($http_response_header)) {
    if (preg_match('#HTTP/\d+\.?\d*\s+(\d+)#', $http_response_header[0] ?? '', $m)) {
        http_response_code(intval($m[1]));
    }
}

// Stream data to the client in chunks
while (!feof($stream)) {
    $chunk = fread($stream, 8192);
    if ($chunk !== false && strlen($chunk) > 0) {
        echo $chunk;
        if (ob_get_level()) ob_flush();
        flush();
    }
}

fclose($stream);
