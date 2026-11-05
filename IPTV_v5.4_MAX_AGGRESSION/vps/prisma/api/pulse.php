<?php
/**
 * pulse.php — URL-2 "pulse": la URL del canal transporta los datos al VPS.
 *
 *   GET /pulse/<id>.m3u8?u=<URL_playback_verbatim>[&m=redirect|cartridge]
 *        [&p=P0..P5][&c=<canal>][&d=<base64url JSON device>][&z=1]
 *        [&n=][&g=][&logo=][&srv=]
 *
 *   Sirve para DOS cosas a la vez:
 *     1) Es la URL del canal (el player la pide como cualquier otra).
 *     2) Es el autobús de datos: device/zapping/canal llegan en el query string.
 *
 * MODOS
 *   m=redirect  (defecto)  -> 302 Location: <u> VERBATIM (shielding: el vídeo va
 *                             directo al proveedor; el VPS sólo registra el pulso).
 *   m=cartridge            -> 200 con el CARTUCHO COMPLETO por perfil (lo genera
 *                             url2-cartridge.php: 904 directivas + STREAM-INF + <u>).
 *
 * IDEMPOTENCIA / STATELESS
 *   Toda la información viaja en la URL: el VPS no recuerda sesiones entre
 *   requests. Los mismos parámetros producen la misma respuesta (el único cambio
 *   es el token de dispositivo, que rota a propósito como anti-fingerprint).
 *
 * SEGURIDAD (lo que NO hace)
 *   - NO descarga ?u= : ni SSRF, ni proxy, ni transcodifica. Sólo 302 o echo.
 *   - NO guarda la URL del canal: el log lleva host + sha256, nunca credenciales.
 *   - Rechaza CR/LF/espacios/comillas y esquemas != http(s)  -> 400.
 *   - Sin auth (un player nativo no puede mandar token); sólo lectura.
 *   - El canary one-shot está APAGADO por defecto (flag file). Si se enciende,
 *     dispara en background, con lock de 300 s por canal, y NUNCA bloquea al player.
 *
 * AUTH INTACTA: este endpoint no toca /sync ni /ara ni /lists.
 */
declare(strict_types=1);

const PULSE_LOG_DIR  = '/var/log/ara';
const PULSE_LOG_FILE = '/var/log/ara/pulses.jsonl';
const PULSE_LOG_MAX  = 32 * 1024 * 1024;   // 32 MiB -> rota a .1
const PULSE_CANARY_FLAG = '/etc/ara/pulse/canary.enabled';
const PULSE_CANARY_DIR  = '/var/lib/ara/canary';
const PULSE_CANARY_LOCK_TTL = 300;

function pulse_fail(int $code, string $why): void
{
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    header('X-APE-Pulse: rejected');
    header('Cache-Control: no-store');
    echo "APE-PULSE: " . $why . "\n";
    exit;
}

function pulse_b64url_decode(string $s): ?string
{
    if ($s === '' || strlen($s) > 1400) return null;
    if (!preg_match('/^[A-Za-z0-9_-]+$/', $s)) return null;
    $pad = strlen($s) % 4;
    if ($pad) { $s .= str_repeat('=', 4 - $pad); }
    $raw = base64_decode(strtr($s, '-_', '+/'), true);
    return ($raw === false) ? null : $raw;
}

function pulse_clean(string $s, int $max): string
{
    $s = preg_replace('/[\x00-\x1F\x7F\x22\x3C\x3E\x5C]/', '', $s) ?? '';
    $s = trim($s);
    return substr($s, 0, $max);
}

// ── 1 · Recibir (el autobús llegó) ────────────────────────────────────────────
$u  = isset($_GET['u']) ? (string)$_GET['u'] : '';
// [ID] Las listas envueltas mandan `id=<canal>`; los tests/curl mandan `c=<canal>`.
// Antes se leía sólo `c`, así que el 100% de los zaps reales (que vienen de una
// lista) caían al hash derivado y NO se podía decir qué canal se estaba zappeando.
$id = isset($_GET['c']) ? (string)$_GET['c'] : '';
if ($id === '' && isset($_GET['id'])) { $id = (string)$_GET['id']; }
// [CHAN] Nombre del canal: las listas envueltas ya lo mandan en `n=`. Sin esto el log
// sólo tenía un id LOCAL de lista y no se podía decir QUÉ canal se estaba zapeando.
$chan = pulse_clean((string)($_GET['n'] ?? ''), 60);
// [LISTA] Nombre de la lista que el player cargo (el envoltorio la manda en l=).
// Sin esto el log decia canal pero no LISTA, y era imposible saber que se reproducia.
$list = pulse_clean((string)($_GET['l'] ?? ''), 64);
$dB = isset($_GET['d']) ? (string)$_GET['d'] : '';
$zap = (isset($_GET['z']) && (string)$_GET['z'] === '1');
// ── Modo: cartridge (master con el cartucho) o redirect (302 al proveedor) ────
// MEDIDO 2026-11-05 en Philips 65PUS9206: al recibir un MASTER playlist
// (STREAM-INF) donde el player espera un MEDIA playlist, aborta con
// "Loaded playlist has unexpected type." (4 reintentos en 15 s, log real).
// VLC, ExoPlayer de Android TV, Kodi y OTT sí aceptan el master y usan el
// cartucho. Por eso el DEFAULT depende del cliente; `m=` explícito manda.
$uaPulse = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
$strictTv = (bool)preg_match('/(SMART-TV|SmartTV|Tizen|WebOS|webOS|Philips|HbbTV|Roku|CrKey|BRAVIA|NetCast|Vizio|Opera TV)/i', $uaPulse);
$defaultMode = $strictTv ? 'redirect' : 'cartridge';
$mode = strtolower((string)($_GET['m'] ?? $defaultMode));
if ($mode !== 'redirect' && $mode !== 'cartridge') { $mode = $defaultMode; }

if ($u === '') { pulse_fail(400, 'falta u'); }
if (strlen($u) > 2000) { pulse_fail(400, 'u demasiado larga'); }
if (preg_match('/[\x00-\x20\x7F\x22\x27\x3C\x3E\x5C]/', $u)) { pulse_fail(400, 'u con caracteres invalidos'); }
if (!preg_match('#^https?://#i', $u)) { pulse_fail(400, 'u no es http(s)'); }
$parts = parse_url($u);
if (!is_array($parts) || empty($parts['host'])) { pulse_fail(400, 'u sin host'); }

$id = preg_replace('/[^A-Za-z0-9._-]/', '', $id) ?? '';
if ($id === '' || strlen($id) > 64) { $id = 'ch' . substr(hash('sha256', $u), 0, 10); }

// ── 2 · Decodificar device (abrir la maleta) ──────────────────────────────────
$device = [];
$devRaw = pulse_b64url_decode($dB);
if ($devRaw !== null && strlen($devRaw) <= 768) {
    $dev = json_decode($devRaw, true);
    if (is_array($dev)) {
        $device = [
            'soc'       => pulse_clean((string)($dev['soc'] ?? ''), 24),
            'max_h'     => (int)($dev['max_h'] ?? 0),
            'buffer_ms' => (int)($dev['buffer_ms'] ?? 0),
            'player'    => pulse_clean((string)($dev['player'] ?? ''), 32),
        ];
    }
}

// ── 3 · Registrar el pulso (redactado: nunca credenciales) ────────────────────
$host = strtolower((string)$parts['host']);
$pulse = [
    'ts'        => round(microtime(true), 3),
    'id'        => $id,
    'chan'      => $chan,
    'list'      => $list,
    'host'      => $host,
    'url_sha'   => substr(hash('sha256', $u), 0, 16),
    'zapping'   => $zap,
    'mode'      => $mode,
    'ip_sha'    => substr(hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? '') . '|ape-pulse'), 0, 12),
    'ua'        => pulse_clean((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 120),
    'device'    => $device,
];
try {
    if (!is_dir(PULSE_LOG_DIR)) { @mkdir(PULSE_LOG_DIR, 0755, true); }
    if (is_file(PULSE_LOG_FILE) && filesize(PULSE_LOG_FILE) > PULSE_LOG_MAX) {
        @rename(PULSE_LOG_FILE, PULSE_LOG_FILE . '.1');
    }
    @file_put_contents(PULSE_LOG_FILE, json_encode($pulse, JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
} catch (Throwable $e) {
    // El pulso NUNCA puede romper la reproducción.
}

// ── 4 · Canary one-shot (APAGADO por defecto; jamás bloquea) ──────────────────
// MEDIDO 2026-11-05: llamar a `ape-canaryctl` directamente desde php-fpm FALLA
// ("/etc/ara/canary/<id>.env: Permission denied") porque php corre como www-data y
// canaryctl escribe en /etc/ara y hace systemctl start. Darle sudo a www-data
// permitiría lanzar ffmpeg contra URLs arbitrarias (SSRF desde root). Por eso el
// endpoint sólo deja un TICKET en la cola y el worker root (ape-pulse-canary.timer)
// valida el host contra allowlist y lanza el canary.
$canaryId = '';
if ($zap && is_file(PULSE_CANARY_FLAG)) {
    $canaryId = substr(hash('sha256', $u), 0, 16);
    $lock = rtrim(PULSE_CANARY_DIR, '/') . '/' . $canaryId . '.lock';
    $fresh = is_file($lock) && (time() - (int)@filemtime($lock)) < PULSE_CANARY_LOCK_TTL;
    $queueDir = rtrim(PULSE_CANARY_DIR, '/') . '/queue';
    if (!$fresh && is_dir($queueDir) && !is_file($queueDir . '/' . $canaryId . '.json')) {
        @touch($lock);
        $ticket = ['id' => $canaryId, 'url' => $u, 'seconds' => 6, 'ts' => time()];
        @file_put_contents(
            $queueDir . '/' . $canaryId . '.json',
            json_encode($ticket, JSON_UNESCAPED_SLASHES),
            LOCK_EX
        );
    }
}

// ── 5 · Responder ─────────────────────────────────────────────────────────────
if ($mode === 'redirect') {
    header('X-APE-Pulse: logged;mode=redirect;zapping=' . ($zap ? '1' : '0'));
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Location: ' . $u, true, 302);
    exit;
}

// cartridge: reutiliza EXACTAMENTE el mismo generador que /url2/ (sin duplicar 904 líneas)
$_GET['u']    = $u;
$_GET['p']    = strtoupper((string)($_GET['p'] ?? 'P3'));
$_GET['mode'] = 'master';
if (!isset($_GET['n']) || $_GET['n'] === '') { $_GET['n'] = $id; }
if (!isset($_GET['c'])) { $_GET['c'] = $id; }
if (!isset($_GET['id']) || $_GET['id'] === '') { $_GET['id'] = $id; }
header('X-APE-Pulse: logged;mode=cartridge;zapping=' . ($zap ? '1' : '0') . ';canary=' . ($canaryId !== '' ? '1' : '0'));
require __DIR__ . '/url2-cartridge.php';



