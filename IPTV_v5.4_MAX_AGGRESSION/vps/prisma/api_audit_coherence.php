<?php
/**
 * /api/audit/lab-coherence — devuelve diff JS↔LAB↔Backend por perfil.
 *
 * Stage 2 del plan 2026-04-30-iptv-lista-coherence-fix.
 * Deploy: NO se hace en este plan (doctrina iptv-vps-touch-nothing).
 * Fuente vive en source-tree para rev-review previo.
 *
 * Lee:
 *   - LAB_CALIBRATED.json (Stage 1.6 bulletproof embed) — ./../downloads/
 *   - ape-profiles-config.js parseado para sacar settings.{hdr_canonical,nits_target}
 *   - prisma_state.json del backend
 * Devuelve:
 *   - status: ok|drift
 *   - drifts[]: cada uno con {layer_a, layer_b, profile, key, value_a, value_b}
 *
 * Cron job sugerido (Stage 2): horario, alerta si drift > 0.
 */

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$labPath = __DIR__ . '/../../downloads/LAB_CALIBRATED.json';
$jsPath  = __DIR__ . '/../../frontend/js/ape-v9/ape-profiles-config.js';
$bePath  = __DIR__ . '/prisma_state.json';

function loadJson(string $p): array {
    if (!file_exists($p)) return [];
    $c = file_get_contents($p);
    if ($c === false) return [];
    $j = json_decode($c, true);
    return is_array($j) ? $j : [];
}

/**
 * Extrae el valor del field dentro del objeto settings de un perfil JS.
 *
 * Busca el patrón:
 *   "P0": { ... "settings": { ... "<fieldKey>": "<value>" ... } ... }
 *
 * No intenta parsear el JS completo (es un IIFE con código + datos mezclados).
 * En su lugar acota el dominio de búsqueda al bloque del perfil (entre el
 * primer `"P0":` y el siguiente `"P1":` o EOF) y luego al substring `"settings": {`
 * dentro de ese bloque, antes de aplicar el regex final.
 */
function extractJsField(string $jsContent, string $profileKey, string $fieldKey): ?string {
    $profileToken = '"' . $profileKey . '"';
    $idxProfile = strpos($jsContent, $profileToken);
    if ($idxProfile === false) return null;

    // Acota al bloque del perfil (hasta próximo "P{N+1}":)
    $nextProfileNum = ((int)substr($profileKey, 1)) + 1;
    $nextProfileToken = '"P' . $nextProfileNum . '"';
    $idxNext = strpos($jsContent, $nextProfileToken, $idxProfile);
    $blockEnd = $idxNext !== false ? $idxNext : strlen($jsContent);
    $block = substr($jsContent, $idxProfile, $blockEnd - $idxProfile);

    // Buscar settings: { ... }
    $idxSettings = strpos($block, '"settings"');
    if ($idxSettings === false) return null;
    $settingsBlock = substr($block, $idxSettings, 8000); // settings dict máx 8KB

    $pattern = '/"' . preg_quote($fieldKey, '/') . '"\s*:\s*"?([^,"\}]*)"?/';
    if (preg_match($pattern, $settingsBlock, $m)) return trim($m[1]);
    return null;
}

$lab = loadJson($labPath);
$be = loadJson($bePath);
$jsRaw = @file_get_contents($jsPath) ?: '';

$drifts = [];
$checkedProfiles = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
$checkedKeys = ['hdr_canonical', 'nits_target', 'codec', 'resolution'];

foreach ($checkedProfiles as $p) {
    foreach ($checkedKeys as $k) {
        $vJs  = extractJsField($jsRaw, $p, $k);
        $vLab = $lab['profiles'][$p][$k] ?? ($lab['profiles'][$p]['settings'][$k] ?? null);
        $vBe  = $be['profiles'][$p][$k] ?? null;

        if ($vJs !== null && $vLab !== null && $vJs !== (string)$vLab) {
            $drifts[] = [
                'layer_a' => 'JS',
                'layer_b' => 'LAB',
                'profile' => $p,
                'key' => $k,
                'value_a' => $vJs,
                'value_b' => (string)$vLab,
            ];
        }
        if ($vLab !== null && $vBe !== null && (string)$vLab !== (string)$vBe) {
            $drifts[] = [
                'layer_a' => 'LAB',
                'layer_b' => 'BE',
                'profile' => $p,
                'key' => $k,
                'value_a' => (string)$vLab,
                'value_b' => (string)$vBe,
            ];
        }
    }
}

echo json_encode([
    'status' => count($drifts) === 0 ? 'ok' : 'drift',
    'timestamp' => date('c'),
    'drift_count' => count($drifts),
    'profiles_checked' => $checkedProfiles,
    'keys_checked' => $checkedKeys,
    'drifts' => $drifts,
    'sources' => [
        'lab_path' => $labPath,
        'lab_exists' => file_exists($labPath),
        'js_path' => $jsPath,
        'js_exists' => file_exists($jsPath),
        'be_path' => $bePath,
        'be_exists' => file_exists($bePath),
    ],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
