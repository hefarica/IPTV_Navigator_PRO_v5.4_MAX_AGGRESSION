<?php
declare(strict_types=1);

$db = new PDO('sqlite:/opt/netshield/data/conviva.db');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

echo "=== TABLES ===\n";
$tables = $db->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
print_r($tables);

echo "\n=== SERVER SIDE QOE METRICS (LAST 20) ===\n";
if (in_array('server_side_qoe_metrics', $tables, true)) {
    $rows = $db->query('SELECT * FROM server_side_qoe_metrics ORDER BY id DESC LIMIT 20')->fetchAll(PDO::FETCH_ASSOC);
    print_r($rows);
} else {
    echo "Table 'server_side_qoe_metrics' does not exist.\n";
}

echo "\n=== CONVIVA EVENTS (LAST 5) ===\n";
if (in_array('conviva_events', $tables, true)) {
    $rows = $db->query('SELECT * FROM conviva_events ORDER BY id DESC LIMIT 5')->fetchAll(PDO::FETCH_ASSOC);
    print_r($rows);
} else {
    echo "Table 'conviva_events' does not exist.\n";
}
