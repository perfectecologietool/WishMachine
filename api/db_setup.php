<?php
/**
 * api/db_setup.php - Initializes the MySQL database and the model_options table.
 */
require_once __DIR__ . '/config.php';

try {
    // Connect to MySQL server (without selecting a DB first)
    $pdo = new PDO("mysql:host=" . DB_HOST, DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Create Database if not exists
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;");
    echo "Database `" . DB_NAME . "` created or already exists.\n";

    // Reconnect to the specific database
    $pdo->exec("USE `" . DB_NAME . "`;");

    // Create model_options table
    $sql = "CREATE TABLE IF NOT EXISTS `model_options` (
        `model_name` VARCHAR(255) PRIMARY KEY,
        `ctx_num` INT DEFAULT 4096,
        `model_details` JSON,
        `last_updated` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;";
    
    $pdo->exec($sql);
    echo "Table `model_options` created or already exists.\n";

    // (Optional) Create a specific user for the Wish application
    // The user mentioned they don't have a user for this Wish application.
    // However, I can't easily manage GRANTs without knowing the system setup.
    // I'll leave the root/provided user for now.

} catch (PDOException $e) {
    die("Database setup failed: " . $e->getMessage());
}
