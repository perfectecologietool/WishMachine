# Migration of Model Caching to MySQL

This plan outlines the steps to replace the current file-based caching in [api/tags.php](file:///c:/Users/user/Documents/WDL_2026March23/api/tags.php) with a MySQL database. This will provide a more robust and scalable solution for storing model options and metadata.

## User Review Required

> [!IMPORTANT]
> I need to know the MySQL connection details (Host, User, Password, and Database Name). If they aren't provided, I will use placeholders that you can update.
> I will assume the name of the database is `wish_db` and the table as `model_options`.

## Proposed Changes

### Database Initialization

#### [NEW] [db_setup.php](file:///c:/Users/user/Documents/WDL_2026March23/api/db_setup.php)
Create a new script to initialize the MySQL database and the required table.

- **Table**: `model_options`
  - `model_name` (VARCHAR, PRIMARY KEY)
  - `ctx_num` (INT)
  - `model_details` (JSON) - To store the full model object from Ollama tags.
  - `last_updated` (TIMESTAMP)

### API Updates

#### [MODIFY] [tags.php](file:///c:/Users/user/Documents/WDL_2026March23/api/tags.php)
Update [api/tags.php](file:///c:/Users/user/Documents/WDL_2026March23/api/tags.php) to:
1. Connect to MySQL.
2. Check if the cache in the `model_options` table is still valid.
3. If invalid or missing, fetch from Ollama, update the table, and return the data.

## Verification Plan

### Automated Tests
- Create a test script `tests/test_db.php` to verify MySQL connectivity and basic CRUD operations.
- Manually trigger [api/tags.php](file:///c:/Users/user/Documents/WDL_2026March23/api/tags.php) and check the MySQL table for populated data.

### Manual Verification
- Verify that the frontend (e.g., `#modelSel` dropdown) is correctly populated with data from the MySQL database.
