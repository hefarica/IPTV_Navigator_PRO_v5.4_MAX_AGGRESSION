<?php
/**
 * ⛔ LEGACY RESOLVER (DEPRECATED)
 * 
 * Regla SSOT: resolve_quality_unified.php monopoliza todo el enrutamiento.
 * Este archivo ha sido vaciado por la directriz 'ssot_resolve_quality_unified' 
 * para prevenir fugas M3U8 e inconsistencias de código Legacy.
 * Todo el tráfico se redirigirá con un HTTP 301 Permanent Redirect conservando los queries.
 */

$queryString = $_SERVER['QUERY_STRING'] ?? '';
$target = "resolve_quality_unified.php" . ($queryString ? '?' . $queryString : '');

header("HTTP/1.1 301 Moved Permanently");
header("Location: " . $target);
exit;
?>
