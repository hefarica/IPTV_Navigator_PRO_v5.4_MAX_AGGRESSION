<?php
declare(strict_types=1);

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  HLS Content Steering Server v1.0 (Feature 3, 2026-05-20)                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Serves a valid HLS Content Steering manifest (Apple HLS / RFC 8216-bis
 * §4.4.6.6). Replaces the broken `pool://failover` / non-existent
 * `steer.ape.net` SERVER-URI that made hls.js throw `TypeError: Invalid URL`
 * and silently disable steering.
 *
 * ═══ ARCHITECTURAL NOTE (honest) ═══
 *   Our lists are single-variant per channel (Anti-509: one URL per #EXTINF),
 *   single Xtream upstream. Content Steering's full value (switching between
 *   multiple CDNs/pathways per channel) does NOT apply yet — there is only one
 *   pathway in practice. This endpoint exists to:
 *     1. Make the EXT-X-CONTENT-STEERING tag VALID (no more hls.js URIError).
 *     2. Be ready for a future multi-CDN setup (just add pathways here).
 *   It is fail-safe: if a player can't load it, it falls back to the STREAM-INF
 *   default pathway (no playback break). Autopista-compliant: read-only, no state.
 *
 * RESPONSE (application/vnd.apple.steeringlist):
 *   { "VERSION":1, "TTL":300, "RELOAD-URI":"<self>", "PATHWAY-PRIORITY":["omega","standard"] }
 *
 * @package vps\prisma\api
 * @version 1.0.0
 */

header('Content-Type: application/vnd.apple.steeringlist; charset=utf-8');
header('Cache-Control: max-age=300, public');
header('X-APE-Steering-Version: 1.0.0');

// Self URI for RELOAD-URI (player re-fetches every TTL → enables future dynamic priority).
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host   = $_SERVER['HTTP_HOST'] ?? 'iptv-ape.duckdns.org';
$self   = $scheme . '://' . $host . ($_SERVER['SCRIPT_NAME'] ?? '/prisma/api/content-steering.php');

// Pathway priority. Today a single effective pathway ("omega"); "standard" is a
// documented fallback slot. A future multi-CDN deploy can reorder these by health
// (e.g. read ngx.shared upstream_state via a sidecar) — for now static + TTL reload.
$pathwayPriority = ['omega', 'standard'];

// Optional per-request override for testing: ?prefer=standard
$prefer = isset($_GET['prefer']) ? preg_replace('/[^a-z0-9_-]/i', '', (string)$_GET['prefer']) : '';
if ($prefer !== '' && in_array($prefer, $pathwayPriority, true)) {
    // Move preferred pathway to the front
    $pathwayPriority = array_values(array_unique(array_merge([$prefer], $pathwayPriority)));
}

echo json_encode([
    'VERSION'          => 1,
    'TTL'              => 300,
    'RELOAD-URI'       => $self,
    'PATHWAY-PRIORITY' => $pathwayPriority,
], JSON_UNESCAPED_SLASHES);
