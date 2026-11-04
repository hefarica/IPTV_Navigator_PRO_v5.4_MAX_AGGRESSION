#!/usr/bin/env node
/**
 * Genera url2-cartridge.php a partir del cartucho REAL por perfil (blocks.json).
 * No hand-typea directivas: sólo parametriza lo que cambia por canal.
 *
 * Uso: node build_php.js <blocks.json> <salida.php>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const [, , srcPath, outPath] = process.argv;
if (!srcPath || !outPath) { console.error('uso: node build_php.js <blocks.json> <salida.php>'); process.exit(2); }
const blocks = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
const PROFILES = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];

// Tokens del fixture -> placeholders. Orden importa (lo más específico primero).
const SUBST = [
  ['http://line.tivi-ott.net/', '{{BASE}}/'],
  ['line.tivi-ott.net', '{{HOST}}'],
  ['"1001_', '"{{ID}}_'],
  ['"1001"', '"{{ID}}"'],
  ['CANAL', '{{NAME}}'],
  ['GRP', '{{GROUP}}'],
  ['[Line]', '[{{SERVER}}]'],
  ['tvg-logo=""', 'tvg-logo="{{LOGO}}"'],
  ['DEV_7', '{{DEV}}'],
];

function param(line) {
  let out = line;
  for (const [from, to] of SUBST) out = out.split(from).join(to);
  // Tokens de sesión/dispositivo: cada bloque trae los suyos (aleatorios del build),
  // así que se generalizan para rotarlos por request en el endpoint.
  out = out.replace(/DEV_[0-9A-Za-z]{3,}/g, '{{DEV}}');
  out = out.replace(/SES_[0-9A-Za-z]{3,}/g, '{{SES}}');
  out = out.replace(/REQ_[0-9A-Za-z]{3,}/g, '{{REQ}}');
  return out;
}

function phpStr(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

let php = '';
php += `<?php
/**
 * url2-cartridge.php — URL-2 "TODO EMBEBIDO EN UNA URL". Plano A (player).
 *
 * QUÉ HACE
 *   Devuelve una playlist de UN canal que lleva el CARTUCHO COMPLETO por perfil
 *   (904 directivas reales: #EXTVLCOPT, #EXTHTTP JSON, #KODIPROP, #EXT-X-CMAF-*,
 *   #EXT-X-APE-*, #EXTATTRFROMURL, #EXT-X-STREAM-INF 4K/HEVC/PQ) y termina en la
 *   URL de playback VERBATIM que llega en ?u= (ley SHIELDED: jamás se reescribe).
 *
 * POR QUÉ ES LA SEGUNDA VÍA (sin ADB, sin instalar nada)
 *   El player carga ESTA url como si fuese el canal. No hay APK, ni daemon, ni
 *   permiso, ni ADB: el cartucho viaja dentro de la lista y lo parsea el propio
 *   reproductor. Lo que cada player APLICA está declarado abajo (honestidad).
 *
 * HONESTIDAD (quién aplica qué)
 *   - OTT/TiviMate/ExoPlayer : #EXT-X-STREAM-INF (codec/res/HDR) + #EXTHTTP.
 *   - VLC                    : #EXTVLCOPT (caché, UA, filtros, adaptive).
 *   - Kodi/InputStreamAdapt. : #KODIPROP.
 *   - #EXT-X-APE-*           : daemon/hardware consciente; el resto IGNORA (RFC 8216 §4.2).
 *   - AI-SR/MEMC/DNR/NPU     : NO se aplican por la lista; S905X4 no tiene NPU.
 *   - 4K de fuente FHD = upscaling/declaración de display (STABLE-VARIANT-ID lo dice:
 *     _4K-TRUE / _4K-UPSCALING / _4K-FAKE). No es 4K nativo si la fuente no lo es.
 *
 * SEGURIDAD
 *   - ?u= NO se descarga en el servidor: sólo se emite verbatim (no hay SSRF).
 *   - Se rechazan CR/LF/espacios/comillas en ?u= (anti manifiest-injection).
 *   - Sin auth (un player nativo no puede mandar token); sólo lectura, sin estado.
 *
 * USO
 *   GET /url2/<nombre>.m3u8?u=<URL_playback_verbatim>[&p=P3][&n=][&g=][&id=][&logo=][&srv=][&mode=master|m3u]
 *   GET /prisma/api/url2-cartridge.php?...   (misma cosa; la ruta /url2/ existe
 *        porque VLC elige el demux por EXTENSION: con .php => "MOD validation
 *        failed (ext=php)" y no reproduce; con .m3u8 => demux HLS.)
 *   mode=master (defecto): master playlist valido (#EXT-X-STREAM-INF + URI, sin #EXTINF).
 *   mode=m3u: conserva #EXTINF para players que tratan el fichero como lista M3U.
 *   200 playlist · 400 si falta/!valida u
 *
 * Generado desde el generador REAL (m3u8-typed-arrays-ultimate.js) — no se
 * hand-typea ninguna directiva. Regenerar con tools/url2/build_url2_cartridge.js.
 */
declare(strict_types=1);

$CARTRIDGE = [
`;
for (const p of PROFILES) {
  const lines = (blocks[p] && blocks[p].lines) || [];
  php += `  '${p}' => [\n`;
  for (const line of lines) {
    php += `    ${phpStr(param(line))},\n`;
  }
  php += `  ],\n`;
}
php += `];

header('Content-Type: application/vnd.apple.mpegurl; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');

function url2_fail(int $code, string $why): void {
    http_response_code($code);
    header('X-APE-URL2: rejected');
    echo "#EXTM3U\\n## URL-2: " . $why . "\\n";
    exit;
}

// ── ?u = URL de playback VERBATIM (SHIELDED) ───────────────────────────────
$u = isset($_GET['u']) ? (string)$_GET['u'] : '';
if ($u === '') { url2_fail(400, 'falta u'); }
if (strlen($u) > 2000) { url2_fail(400, 'u demasiado larga'); }
if (preg_match('/[\\x00-\\x20\\x7F\\x22\\x27\\x3C\\x3E\\x5C]/', $u)) { url2_fail(400, 'u con caracteres invalidos'); }
if (!preg_match('#^https?://#i', $u)) { url2_fail(400, 'u no es http(s)'); }
$parts = parse_url($u);
if (!is_array($parts) || empty($parts['host'])) { url2_fail(400, 'u sin host'); }
$scheme = strtolower((string)($parts['scheme'] ?? 'http'));
if ($scheme !== 'http' && $scheme !== 'https') { url2_fail(400, 'u esquema no permitido'); }
$host = (string)$parts['host'];
$port = isset($parts['port']) ? (':' . (int)$parts['port']) : '';
$base = $scheme . '://' . $host . $port;

// ── perfil ─────────────────────────────────────────────────────────────────
$p = isset($_GET['p']) ? strtoupper((string)$_GET['p']) : 'P3';
if (!isset($CARTRIDGE[$p])) { $p = 'P3'; }

function url2_clean(string $s, int $max): string {
    $s = preg_replace('/[\\x00-\\x1F\\x7F\\x22\\x5C]/', '', $s) ?? '';
    $s = str_replace([',', '#'], ' ', $s);
    $s = trim($s);
    return function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max);
}

$name  = url2_clean((string)($_GET['n'] ?? 'CANAL'), 60);
if ($name === '') { $name = 'CANAL'; }
$group = url2_clean((string)($_GET['g'] ?? ''), 60);
$logo  = isset($_GET['logo']) ? (string)$_GET['logo'] : '';
if ($logo !== '' && !preg_match('#^https?://#i', $logo)) { $logo = ''; }
if ($logo !== '' && preg_match('/[\\x00-\\x20\\x7F\\x22\\x27\\x3C\\x3E\\x5C]/', $logo)) { $logo = ''; }
$srv   = url2_clean((string)($_GET['srv'] ?? $host), 40);
if ($srv === '') { $srv = $host; }

$idRaw = (string)($_GET['id'] ?? '');
if ($idRaw === '') {
    $pathOnly = (string)($parts['path'] ?? '');
    $leaf = basename($pathOnly);
    $idRaw = preg_replace('/\\.(m3u8|m3u|ts|mp4|mkv)$/i', '', $leaf) ?? '';
}
$id = preg_replace('/[^A-Za-z0-9._-]/', '', $idRaw) ?? '';
if ($id === '') {
    if ($p === 'P3') {
        $id = 'ch' . substr(sha1($u), 0, 8);
    } else {
        $id = 'ch' . substr(sha1($u), 0, 8);
    }
}

$dev = 'DEV_' . bin2hex(random_bytes(5));
$ses = 'SES_' . bin2hex(random_bytes(8));
$req = 'REQ_' . bin2hex(random_bytes(8));

$map = [
    '{{BASE}}'   => $base,
    '{{HOST}}'   => $host . $port,
    '{{ID}}'     => $id,
    '{{NAME}}'   => $name,
    '{{GROUP}}'  => $group,
    '{{LOGO}}'   => $logo,
    '{{SERVER}}' => $srv,
    '{{DEV}}'    => $dev,
];

// [HLS-MASTER] modo=master (defecto): master playlist válido = #EXT-X-STREAM-INF + URI,
// SIN #EXTINF (con #EXTINF el demux HLS de VLC falla). modo=m3u conserva #EXTINF para
// players que tratan el fichero como lista M3U clásica.
$mode = strtolower((string)($_GET['mode'] ?? 'master'));
if ($mode !== 'm3u' && $mode !== 'master') { $mode = 'master'; }
$withExtinf = ($mode === 'm3u');
$lines = $CARTRIDGE[$p];

header('X-APE-URL2: cartridge;profile=' . $p . ';lines=' . count($lines) . ';mode=' . $mode);

echo "#EXTM3U\\n";
echo '#EXT-X-APE-URL2-CARTRIDGE:1;PROFILE=' . $p . ';LINES=' . count($lines) . ';MODE=' . strtoupper($mode) . ";EVERYTHING_IN_URL\\n";
foreach ($lines as $line) {
    if (!$withExtinf && strncmp($line, '#EXTINF:', 8) === 0) { continue; }
    $out = strtr($line, $map);
    if ($out === '') { continue; }
    echo $out . "\\n";
}
echo $u . "\\n";
`;
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, php, 'utf8');
console.log('escrito:', outPath, fs.statSync(outPath).size, 'bytes');


