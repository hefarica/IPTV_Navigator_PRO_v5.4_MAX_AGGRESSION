<?php
/**
 * channel-pq-bulk.php — Phase G. Devuelve el mapa {channel_id: "SDR"} de los canales blacklisted
 * (pantallazo negro con PQ). El generador lo pre-carga en window.APE_PQ_PROFILE y emite
 * VIDEO-RANGE=SDR (en vez de PQ) para esos canales. Read-only, silent-fail. Espejo de
 * channel-hdcp-bulk.php. Sin esto el generador asume PQ incondicional (default).
 */
require_once __DIR__ . '/../lib/ape_mesh.php';
header('Content-Type: application/json');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');

$map = function_exists('ape_pq_blacklist_map') ? ape_pq_blacklist_map() : array();
echo json_encode($map);
