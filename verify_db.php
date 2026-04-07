<?php
require_once __DIR__ . '/api/config.php';

try {
    $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $stmt = $pdo->query("SELECT model_name, ctx_num FROM `model_options` ORDER BY model_name ASC");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($rows)) {
        echo "No models found in the database.\n";
    } else {
        echo "Models in database:\n";
        foreach ($rows as $row) {
            echo "- " . $row['model_name'] . " (Context: " . $row['ctx_num'] . ")\n";
        }
    }
} catch (PDOException $e) {
    echo "Database error: " . $e->getMessage() . "\n";
}
