<?php
// api.php
// Wrapper for calling Ollama endpoints from PHP.
// Proxies directly to ollama.com with bearer token authentication.

define('OLLAMA_BEARER_TOKEN', 'Bearer 09bcc71ac2ee449f9e0545259f7f2c90.cKc7ayF9G3-Ka9qPIHR7ZdMQ');

class OllamaAPI {
    private static $serverURL = "https://www.ollama.com";

    public static function setServerURL($url) {
        self::$serverURL = $url;
    }

    public static function getAvailableModels() {
        $endpoint = self::$serverURL . "/api/tags";
        $context  = stream_context_create(['http' => [
            'header'  => "Authorization: " . OLLAMA_BEARER_TOKEN . "\r\n",
            'ignore_errors' => true, 
            'timeout' => 15
        ], 'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
        ]]);
        $response = @file_get_contents($endpoint, false, $context);
        if ($response) {
            $data = json_decode($response, true);
            if (isset($data['models'])) {
                $models = [];
                foreach ($data['models'] as $m) {
                    $models[] = $m['name'];
                }
                return $models;
            }
        }
        return [];
    }

    /**
     * Executes a chat completion request against Ollama.
     */
    public static function chat($model, $messages, $options = [], $format = null) {
        $endpoint = self::$serverURL . "/api/chat";
        
        $data = [
            "model" => $model,
            "messages" => $messages,
            "stream" => false
        ];
        
        if (!empty($options)) {
            $data["options"] = $options;
        }

        if ($format === "json") {
            $data["format"] = "json";
        }

        $httpOptions = [
            'http' => [
                'header'  => "Content-Type: application/json\r\n" .
                             "Authorization: " . OLLAMA_BEARER_TOKEN . "\r\n",
                'method'  => 'POST',
                'content' => json_encode($data),
                'timeout' => 6000,
                'ignore_errors' => true 
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
            ]
        ];

        $context  = stream_context_create($httpOptions);
        
        // suppress warnings in case of connection refused
        $response = @file_get_contents($endpoint, false, $context);
        
        if ($response === false) {
            $error = error_get_last();
            $errMsg = $error ? $error['message'] : "Unknown network error";
            throw new Exception("HTTP Request failed: " . $errMsg);
        }

        $httpCode = 0;
        $headers = function_exists('http_get_last_response_headers') ? http_get_last_response_headers() : [];
        if (is_array($headers)) {
            if (preg_match('#HTTP/\d+\.\d+ (\d+)#', $headers[0] ?? "", $matches)) {
                $httpCode = intval($matches[1]);
            }
        }

        if ($httpCode >= 400 && $httpCode < 600) {
            error_log("Ollama Warning HTTP $httpCode");
        }

        return json_decode($response, true);
    }
}
