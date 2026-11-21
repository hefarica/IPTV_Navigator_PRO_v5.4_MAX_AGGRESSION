<?php
/* /var/www/html/prisma/api/qoe-override.php
 * Recibe SOLO del LLM local/panel, autenticado por token, y persiste el
 * override ya validado. Nada de chmod 666 ni escritura ciega: si el token no
 * coincide, 401; si el JSON no trae ch, 400. El rango se aplica al LEER
 * (qoe-controller.php), así que un fichero manipulado no rompe nada. */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$STATE = '/var/www/html/prisma/state';
$OVF   = $STATE . '/llm_overrides.json';
$TOK   = $STATE . '/qoe.token';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['ok'=>false,'err'=>'solo_POST']); exit; }

$token = is_file($TOK) ? trim((string)@file_get_contents($TOK)) : '';
$hdr   = isset($_SERVER['HTTP_X_APE_TOKEN']) ? trim((string)$_SERVER['HTTP_X_APE_TOKEN']) : '';
if ($token === '' || !hash_equals($token, $hdr)) {
    http_response_code(401); echo json_encode(['ok'=>false,'err'=>'token']); exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || strlen($raw) > 16384) { http_response_code(413); echo json_encode(['ok'=>false,'err'=>'body']); exit; }
$j = json_decode($raw, true);
if (!is_array($j) || !isset($j['ch']) || !is_string($j['ch']) || !preg_match('/^[A-Za-z0-9_.-]{1,80}$/', $j['ch'])) {
    http_response_code(400); echo json_encode(['ok'=>false,'err'=>'ch_invalido']); exit;
}
$out = [
  'ch' => $j['ch'],
  'ts' => isset($j['ts']) && is_numeric($j['ts']) ? (int)$j['ts'] : time(),
  'why' => isset($j['why']) && is_string($j['why']) ? substr($j['why'], 0, 200) : '',
  'net' => isset($j['net']) && is_array($j['net']) ? $j['net'] : [],
  'flt' => isset($j['flt']) && is_array($j['flt']) ? $j['flt'] : null,
  'cad' => isset($j['cad']) && is_array($j['cad']) ? $j['cad'] : null
];
$all = [];
$prev = @file_get_contents($OVF);
if ($prev) { $p = json_decode($prev, true); if (is_array($p)) $all = $p; }
$map = (isset($all['channels']) && is_array($all['channels'])) ? $all['channels'] : [];
if (!isset($all['channels']) && isset($all['ch']) && is_string($all['ch'])) { $map[$all['ch']] = $all; }
$map[$out['ch']] = $out;
if (count($map) > 2000) {
    uasort($map, function ($a, $b) { return (int)(isset($b['ts']) ? $b['ts'] : 0) - (int)(isset($a['ts']) ? $a['ts'] : 0); });
    $map = array_slice($map, 0, 2000, true);
}
$payload = json_encode(['v' => 2, 'updated' => time(), 'n' => count($map), 'channels' => $map], JSON_UNESCAPED_SLASHES);
$tmp = $OVF . '.tmp' . getmypid();
if ($payload === false || @file_put_contents($tmp, $payload, LOCK_EX) === false || !@rename($tmp, $OVF)) {
    @unlink($tmp);
    http_response_code(500); echo json_encode(['ok'=>false,'err'=>'escritura']); exit;
}
echo json_encode(['ok'=>true,'ch'=>$out['ch'],'canales'=>count($map),'bytes'=>strlen($payload)]);
