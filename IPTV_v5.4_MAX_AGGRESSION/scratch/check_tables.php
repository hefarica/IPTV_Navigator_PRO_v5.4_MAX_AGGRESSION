<?php
declare(strict_types=1);

$dbFile = "/opt/netshield/data/conviva.db";
if (!file_exists($dbFile)) {
    echo "Database file does not exist.\n";
    exit(1);
}

$db = new SQLite3($dbFile);

echo "=== TABLES ===\n";
$res = $db->query("SELECT name FROM sqlite_master WHERE type='table'");
while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
    $table = $row['name'];
    echo "Table: $table\n";
    
    // Schema of the table
    $schemaRes = $db->query("SELECT sql FROM sqlite_master WHERE type='table' AND name='$table'");
    if ($schema = $schemaRes->fetchArray(SQLITE3_ASSOC)) {
        echo "Schema:\n" . $schema['sql'] . "\n";
    }
    
    // Count of rows
    $countRes = $db->querySingle("SELECT COUNT(*) FROM $table");
    echo "Row Count: $countRes\n";
    
    // Last 5 rows
    echo "Last 5 rows:\n";
    $rowsRes = $db->query("SELECT * FROM $table ORDER BY id DESC LIMIT 5");
    while ($r = $rowsRes->fetchArray(SQLITE3_ASSOC)) {
        print_r($r);
    }
    echo "\n";
}
echo "=== END TABLES ===\n";
