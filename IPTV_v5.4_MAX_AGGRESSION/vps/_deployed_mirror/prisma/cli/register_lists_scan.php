<?php
/**
 * register_lists_scan.php — Populate F1.0
 * Escanea /var/www/lists y matricula cada lista en registered_lists (idempotente).
 * Uso: php register_lists_scan.php   (correr en el VPS; o vía cron tras upload)
 */
require __DIR__ . '/../lib/list_registry.php';

$res = lr_scan_all();
$db  = lr_db();
$total = (int)$db->query("SELECT COUNT(*) FROM registered_lists")->fetchColumn();
$active = (int)$db->query("SELECT COUNT(*) FROM registered_lists WHERE status='active'")->fetchColumn();

echo json_encode(array(
    'ok'               => true,
    'scanned'          => count($res),
    'total_registered' => $total,
    'active'           => $active,
    'db'               => lr_db_path(),
    'items'            => $res,
), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), "\n";
