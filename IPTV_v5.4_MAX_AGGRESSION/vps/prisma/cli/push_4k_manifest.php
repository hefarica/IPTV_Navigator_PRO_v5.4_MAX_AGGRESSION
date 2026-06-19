<?php
/**
 * push_4k_manifest.php — Plano B (device) del Canonical 4K Manifest.
 *
 * Lee el SSOT vps/ape-uhdx/ape_4k_manifest.json y empuja sus device-settings (los 13 levers VPP
 * REALES) como policy_delta via URL-2 (reusa ape_insert_delta de ape_mesh.php). El ARA on-device los
 * aplica con `settings put` (allowlist + SoC-gate) y PERSISTE (enforcer). Post-proceso real sobre el
 * frame decodificado, cualquier player, SIN transcode, SIN tocar la URL de playback (SHIELDED).
 *
 * Generaliza push_pq_profile.php: la fuente de verdad es el SSOT, NO valores hardcodeados aqui.
 *
 * Uso:  php push_4k_manifest.php [content_type] [device_id] [channel_id]
 *   content_type: max_image (default) | sports | compressed   (otros => max_image)
 *   device_id vacio -> broadcast (todos los ARA)
 *
 * Reversible: si el SSOT tiene "enabled": false => no empuja nada (no-op).
 */
declare(strict_types=1);
require_once __DIR__ . '/../lib/ape_mesh.php';

if (!function_exists('ape_4k_manifest_path')) {
    function ape_4k_manifest_path(): string {
        $env = getenv('APE_4K_MANIFEST');
        if (is_string($env) && $env !== '' && @is_file($env)) { return $env; }
        $live = '/etc/ape-uhdx/ape_4k_manifest.json';
        if (@is_file($live)) { return $live; }
        return __DIR__ . '/../../ape-uhdx/ape_4k_manifest.json'; // repo/dev fallback
    }
}

if (!function_exists('ape_4k_manifest_load')) {
    function ape_4k_manifest_load(): ?array {
        $p = ape_4k_manifest_path();
        $raw = @file_get_contents($p);
        if ($raw === false || $raw === '') { return null; }
        $m = json_decode($raw, true);
        return is_array($m) ? $m : null;
    }
}

$ct      = isset($argv[1]) && $argv[1] !== '' ? preg_replace('/[^a-z_]/', '', strtolower($argv[1])) : 'max_image';
$device  = isset($argv[2]) && $argv[2] !== '' ? preg_replace('/[^0-9A-Za-z_.\-]/', '', $argv[2]) : null;
$channel = isset($argv[3]) && $argv[3] !== '' ? ape_normalize_channel_id($argv[3]) : null;

$m = ape_4k_manifest_load();
if ($m === null) {
    fwrite(STDERR, "ERROR: SSOT no legible en " . ape_4k_manifest_path() . "\n");
    exit(2);
}
if (empty($m['enabled'])) {
    echo "manifest disabled (enabled:false) -> no-op\n";
    exit(0);
}

$cts = isset($m['plane_b_device']['content_types']) && is_array($m['plane_b_device']['content_types'])
    ? $m['plane_b_device']['content_types'] : array();
$settings = isset($cts[$ct]) && is_array($cts[$ct]) ? $cts[$ct]
          : (isset($cts['max_image']) && is_array($cts['max_image']) ? $cts['max_image'] : array());
// Solo claves escalares (truth-guard: el ARA aplica settings put; no estructuras).
$settings = array_filter($settings, function ($v) { return is_int($v) || is_string($v) || is_float($v); });
if (!$settings) {
    fwrite(STDERR, "ERROR: SSOT sin settings escalares para ct='{$ct}'\n");
    exit(3);
}

$ttl = isset($m['ttl_seconds']) ? (int)$m['ttl_seconds'] : 1800;
$payload = array(
    'settings'     => $settings,
    'profile'      => 'APE_4K_MANIFEST_' . strtoupper($ct),
    'content_mode' => isset($m['plane_b_device']['content_mode']) ? (string)$m['plane_b_device']['content_mode'] : 'max_image',
    'soc_gate'     => isset($m['plane_b_device']['soc_gate']) ? (string)$m['plane_b_device']['soc_gate'] : null,
    'edid_gate_min_height' => isset($m['plane_b_device']['edid_gate_min_height']) ? (int)$m['plane_b_device']['edid_gate_min_height'] : 0,
    'declare'      => isset($m['declare']) && is_array($m['declare']) ? $m['declare'] : null,
    'manifest_version' => isset($m['version']) ? (string)$m['version'] : null,
);

$id = ape_insert_delta($device, $channel, 'device-setting', $payload,
    array('source' => '4k-manifest', 'ttl_seconds' => $ttl, 'priority' => 80));

echo "pushed 4K manifest ct='{$ct}' -> policy_delta id={$id} (" . count($settings) . " levers, device="
    . ($device ?: 'broadcast') . ", channel=" . ($channel ?: 'any') . ", v=" . ($payload['manifest_version'] ?: '?') . ")\n";
