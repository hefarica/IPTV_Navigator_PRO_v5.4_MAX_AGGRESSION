<?php
// ══════════════════════════════════════════════════════════════════════════
// APE — LAB METADATA LIBRARY (por lista, dinámico, sin valores fijos)
//
// El generador emite #EXT-X-APE-LAB-METADATA:<base64 JSON>.
// ape-canon-producer.js lo guarda en:
//   /dev/shm/ape_canon/_lab_meta/<list_id>.json
// Este endpoint lo expone a VPS / ARA / Prisma / Lua / cualquier consumidor.
//
// GET  ?list_id=<16hex>
//      &profile=P0
//      &field=X-APE-BITRATE          (opcional: un header)
//      &section=settings|headerOverrides|vlcopt|kodiprop|hlsjs|
//               prefetch_config|optimized_knobs|bounds|actor_injections
// Devuelve el objeto completo o el campo solicitado. NO inventa defaults.
// ══════════════════════════════════════════════════════════════════════════
declare(strict_types=1);
@set_time_limit(3);
header('Cache-Control: no-store');
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$CANONDIR = '/dev/shm/ape_canon';
$list_id = strtolower((string)($_GET['list_id'] ?? ''));
$profile = strtoupper((string)($_GET['profile'] ?? ''));
$field   = (string)($_GET['field'] ?? '');
$section = (string)($_GET['section'] ?? '');

if (!preg_match('/^[a-f0-9]{16}$/', $list_id)) {
    http_response_code(400);
    echo json_encode(['error' => 'list_id inválido (16 hex)']);
    exit;
}
$file = $CANONDIR . '/_lab_meta/' . $list_id . '.json';
$raw = is_file($file) ? @file_get_contents($file) : false;
if ($raw === false) {
    http_response_code(404);
    echo json_encode(['error' => 'metadata no encontrada', 'list_id' => $list_id]);
    exit;
}
$meta = json_decode($raw, true);
if (!is_array($meta)) {
    http_response_code(500);
    echo json_encode(['error' => 'metadata corrupta']);
    exit;
}
if ($profile !== '' && isset($meta['profile']) && strtoupper((string)$meta['profile']) !== $profile) {
    http_response_code(404);
    echo json_encode(['error' => 'perfil no coincide', 'list_profile' => $meta['profile']]);
    exit;
}

$fields = $meta['fields'] ?? [];
$flatCount = 0;
if (is_array($fields)) {
    foreach ($fields as $secName => $value) {
        if (is_array($value)) {
            // Un objeto por sección cuenta sus claves; una lista cuenta sus items.
            $flatCount += (array_is_list($value) ? count($value) : count(array_keys($value)));
        } else {
            $flatCount++;
        }
    }
}
$out = [
    'list_id' => $meta['list_id'] ?? $list_id,
    'profile' => $meta['profile'] ?? null,
    'generated_at' => $meta['generated_at'] ?? null,
    'schema' => $meta['schema'] ?? null,
    'field_count' => $flatCount,
    'section_count' => is_array($fields) ? count($fields) : 0,
    'sections' => is_array($fields) ? array_keys($fields) : []
];

if ($section !== '') {
    $out['section'] = $section;
    $out['value'] = $fields[$section] ?? null;
} elseif ($field !== '') {
    $out['field'] = $field;
    $out['value'] = null;
    // headerOverrides primero, luego cualquier sección que contenga la clave.
    if (isset($fields['headerOverrides'][$field])) {
        $out['value'] = $fields['headerOverrides'][$field];
        $out['source'] = 'headerOverrides';
    } else {
        foreach ($fields as $sec => $obj) {
            if (is_array($obj) && array_key_exists($field, $obj)) {
                $out['value'] = $obj[$field];
                $out['source'] = $sec;
                break;
            }
        }
    }
} else {
    $out['fields'] = $fields;
}

echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
