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
// SOLO VLC y Kodi han demostrado aceptar el master. MEDIDO 2026-11-05: OTT
// Navigator añade " ExoPlayer" a su UA ("OTT Navigator/1.7.0.0 ... ExoPlayer")
// y su parser aborta igual con "Loaded playlist has unexpected type." al recibir
// el cartucho (master). Por eso la allowlist se reduce a VLC/Kodi/LibreELEC:
// el resto recibe SIEMPRE media playlist por proxy. `m=` ya no puede forzar
// cartridge en un cliente no verificado.
$uaPulse = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
// ── Política de modo (medida, no heurística de TV) ────────────────────────────
// El master-con-cartucho SOLO se sirve a clientes que han demostrado aceptarlo:
// VLC/LibVLC, Kodi/LibreELEC, ExoPlayer, OTT Navigator, TiviMate, Smarters.
// A TODOS los demás se les da 302 a la URL verbatim del proveedor (media
// playlist real). Motivo medido 2026-11-05: el player real del operador es un
// Fire TV (UA "Xtream-Codes/2.5 IPTV" y "Dalvik/2.1.0 ... AFTWMST22"): recibe
// 200 con el cartucho (gzip ~15,9 KB) y aborta con "Loaded playlist has
// unexpected type." porque espera media playlist. La compatibilidad manda.
$cartridgeCapable = (bool)preg_match('/(^|\s|\/)(VLC|LibVLC|Kodi|LibreELEC)(\s|\/|$)/i', $uaPulse);
$defaultMode = $cartridgeCapable ? 'cartridge' : 'proxy';
$mode = strtolower((string)($_GET['m'] ?? $defaultMode));
if (!in_array($mode, ['redirect', 'cartridge', 'proxy'], true)) { $mode = $defaultMode; }
// Forzado a redirect si el cliente no está en la allowlist, aunque pida cartridge.
$forcedStrict = ($mode === 'cartridge' && !$cartridgeCapable);
if ($forcedStrict) { $mode = 'proxy'; }

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


// ── [ROOT-FIX 2026-11-05] Barandilla del modo proxy ─────────────────────────
// "Loaded playlist has unexpected type." venía de servir al player (a) un master
// del proveedor, o (b) un 302 hacia una URL rota. Estas funciones lo cierran.

/** ¿La URL apunta a nuestro propio host (evita fetch recursivo)? */
function ape_pulse_is_self(string $u): bool
{
    $host = strtolower((string) parse_url($u, PHP_URL_HOST));
    return $host === 'iptv-ape.duckdns.org' || $host === 'localhost' || $host === '127.0.0.1';
}

/**
 * Normaliza el upstream:
 *   https://iptv-ape.duckdns.org/cdn/<proveedor>/<resto>  ->  http://<proveedor>/<resto>
 * Devuelve '' si la URL es inservible (self sin patrón /cdn/, vacía, esquema raro).
 */
function ape_pulse_norm_upstream(string $u): string
{
    $u = trim($u);
    if ($u === '' || !preg_match('#^https?://#i', $u)) { return ''; }
    if (ape_pulse_is_self($u)) {
        $path = (string) parse_url($u, PHP_URL_PATH);
        if (preg_match('#^/cdn/([A-Za-z0-9.-]+)/(.*)$#', $path, $m)) {
            $p = ltrim($m[2], '/');
            // MEDIDO: el proveedor responde 513/461 a la ruta SIN extensión y 200
            // a `<ruta>.m3u8`. Se añade la extensión cuando falta.
            if (!preg_match('/\.[A-Za-z0-9]{1,5}$/', $p)) {
                $p .= '.m3u8';
            }
            return 'http://' . $m[1] . '/' . $p;
        }
        return ''; // self sin patrón conocido: no se persigue (evita bucles)
    }
    return $u;
}

/** Absolutiza las URIs de una playlist (segmentos y variantes) contra su URL efectiva. */
function ape_pulse_absolutize(string $raw, string $eff): string
{
    $pu = parse_url($eff);
    $origin = (($pu['scheme'] ?? 'http') . '://' . ($pu['host'] ?? ''));
    if (!empty($pu['port'])) { $origin .= ':' . $pu['port']; }
    $dir = rtrim(dirname($pu['path'] ?? '/'), '/');
    $lines = preg_split('/\r?\n/', $raw);
    $n = count($lines);
    for ($i = 0; $i < $n; $i++) {
        $t = trim($lines[$i]);
        if ($t === '' || $t[0] === '#' || preg_match('#^[a-z][a-z0-9+.-]*://#i', $t) || strpos($t, 'data:') === 0) {
            continue;
        }
        $lines[$i] = ($t[0] === '/') ? $origin . $t : $origin . $dir . '/' . $t;
    }
    return implode("\n", $lines) . "\n";
}

/** Clasifica el cuerpo: 'media' | 'master' | 'noplaylist'. */
function ape_pulse_kind(string $body): string
{
    if ($body === '' || stripos($body, '#EXTM3U') === false) { return 'noplaylist'; }
    if (preg_match('/#EXT-X-STREAM-INF\s*:/i', $body)) { return 'master'; }
    if (preg_match('/^#EXTINF\s*:/im', $body)) { return 'media'; }
    // #EXTM3U con #EXT-X-MAP / segmentos pero sin EXTINF (fMP4): tratarlo como media.
    if (preg_match('/\.(m4s|mp4|ts|aac)(\?|$)/im', $body)) { return 'media'; }
    return 'noplaylist';
}

/** Elige la variante con mayor área (RESOLUTION) y, en empate, mayor BANDWIDTH. */
function ape_pulse_pick_variant(string $master, string $masterUrl): string
{
    $lines = preg_split('/\r?\n/', $master);
    $pu = parse_url($masterUrl);
    $origin = (($pu['scheme'] ?? 'http') . '://' . ($pu['host'] ?? ''));
    if (!empty($pu['port'])) { $origin .= ':' . $pu['port']; }
    $dir = rtrim(dirname($pu['path'] ?? '/'), '/');
    $best = '';
    $bestScore = -1;
    $n = count($lines);
    for ($i = 0; $i < $n; $i++) {
        $t = trim($lines[$i]);
        if (stripos($t, '#EXT-X-STREAM-INF:') !== 0) { continue; }
        $bw = 0;
        if (preg_match('/BANDWIDTH=(\d+)/i', $t, $m)) { $bw = (int) $m[1]; }
        $area = 0;
        if (preg_match('/RESOLUTION=(\d+)x(\d+)/i', $t, $m)) { $area = (int) $m[1] * (int) $m[2]; }
        $uri = '';
        for ($j = $i + 1; $j < $n; $j++) {
            $c = trim($lines[$j]);
            if ($c === '' || $c[0] === '#') { continue; }
            $uri = $c;
            break;
        }
        if ($uri === '') { continue; }
        if (stripos($uri, '#EXT-X-I-FRAME') !== false) { continue; }
        $score = $area > 0 ? $area : $bw;
        if ($score > $bestScore) {
            $bestScore = $score;
            $best = ($uri[0] === '/') ? $origin . $uri : (preg_match('#^https?://#i', $uri) ? $uri : $origin . $dir . '/' . $uri);
        }
    }
    return $best;
}

/** Fetch de una playlist con el UA del player. Devuelve [body, code, effective]. */
function ape_pulse_fetch(string $u, string $ua): array
{
    $ch = curl_init($u);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 4,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_TIMEOUT        => 6,
        CURLOPT_ENCODING       => '',
        CURLOPT_USERAGENT      => $ua !== '' ? $ua : 'IPTVSmartersPro',
        CURLOPT_HTTPHEADER     => ['Accept: */*'],
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
    ]);
    $body = (string) curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $eff  = (string) curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    curl_close($ch);
    return [$body, $code, $eff];
}

// ── 4c · Modo PROXY: la media playlist la sirve el VPS (una sola conexión) ────
// MOTIVO MEDIDO (2026-11-05): en modo redirect, el player del operador (Fire TV)
// abre DOS peticiones simultáneas del mismo manifest en cada recarga; el
// proveedor limita a 1 conexión por cuenta → HTTP 509 intermitente. Además el
// token del 302 caduca y a los ~15 s el canal caía.
// Aquí el VPS pide la playlist al proveedor (siguiendo 302), la devuelve tal cual
// con las URIs de segmento ABSOLUTAS (el vídeo NO pasa por el VPS) y la cachea 2 s
// en APCu: dos recargas simultáneas = UNA sola conexión al proveedor. Cada
// recarga obtiene token fresco. Si el proveedor falla, se cae a 302 (el player
// habla directo, como antes).
if ($mode === 'proxy') {
    // [ROOT-FIX 2026-11-05] Normalizar primero: /cdn/<prov>/<ruta> -> proveedor.
    $uNorm = ape_pulse_norm_upstream($u);
    if ($uNorm === '') {
        header('Content-Type: application/json; charset=utf-8');
        header('X-APE-Pulse: logged;mode=proxy;upstream=self_or_invalid');
        http_response_code(502);
        echo '{"ok":false,"error":"upstream_self_reference","hint":"url /cdn/<host>/<path> no normalizable"}';
        exit;
    }
    $h = sha1($uNorm);
    $plKey   = 'ape_pulse_pl_' . $h;      // 2 s  : recargas simultáneas (anti-509)
    $goodKey = 'ape_pulse_good_' . $h;    // 60 s : última playlist válida (stale)
    $lockKey = 'ape_pulse_lock_' . $h;    // 3 s  : single-flight

    // 1) cache corta
    $cached = function_exists('apcu_fetch') ? apcu_fetch($plKey) : false;
    $body = is_array($cached) && !empty($cached['body']) ? (string) $cached['body'] : '';
    $kind = is_array($cached) && !empty($cached['kind']) ? (string) $cached['kind'] : 'media';
    $fromCache = ($body !== '');

    if (!$fromCache) {
        // 2) single-flight: si otro worker ya está pidiendo este canal, esperar su cache
        $gotLock = true;
        if (function_exists('apcu_add')) {
            $gotLock = (bool) apcu_add($lockKey, 1, 3);
        }
        if (!$gotLock) {
            for ($w = 0; $w < 12; $w++) {
                usleep(150000);
                $c2 = function_exists('apcu_fetch') ? apcu_fetch($plKey) : false;
                if (is_array($c2) && !empty($c2['body'])) {
                    $body = (string) $c2['body'];
                    $kind = (string) ($c2['kind'] ?? 'media');
                    $fromCache = true;
                    break;
                }
            }
        }
        if (!$fromCache) {
            list($raw, $code, $eff) = ape_pulse_fetch($uNorm, $uaPulse);
            // 3) retry único para 5xx / 513 / 0
            if (($code === 0 || $code >= 500 || $code === 513)) {
                usleep(250000);
                list($raw, $code, $eff) = ape_pulse_fetch($uNorm, $uaPulse);
            }
            $kind = ape_pulse_kind($raw);
            $ok = ($code === 200 && $kind !== 'noplaylist');
            if ($ok && $kind === 'master') {
                $variant = ape_pulse_pick_variant($raw, $eff);
                if ($variant !== '') {
                    list($mraw, $mcode, $meff) = ape_pulse_fetch($variant, $uaPulse);
                    if ($mcode === 200 && ape_pulse_kind($mraw) === 'media') {
                        $body = ape_pulse_absolutize($mraw, $meff);
                        $kind = 'media';
                    } else {
                        $ok = false;
                        $code = $mcode;
                    }
                } else {
                    $ok = false;
                    $code = 502;
                }
            } elseif ($ok) {
                $body = ape_pulse_absolutize($raw, $eff);
            }

            if ($ok) {
                if (function_exists('apcu_store')) {
                    apcu_store($plKey, ['body' => $body, 'kind' => $kind], 2);
                    apcu_store($goodKey, ['body' => $body], 60);
                }
            } else {
                // 4) stale-while-error: última playlist buena (60 s) antes que un error
                $good = function_exists('apcu_fetch') ? apcu_fetch($goodKey) : false;
                if (is_array($good) && !empty($good['body'])) {
                    header('Content-Type: application/x-mpegURL');
                    header('Cache-Control: no-cache, no-store, must-revalidate');
                    header('X-APE-Pulse: logged;mode=proxy;stale=1;upstream_code=' . $code
                        . ';zapping=' . ($zap ? '1' : '0'));
                    echo (string) $good['body'];
                    exit;
                }
                // [HARDENING] NUNCA 302: un 302 a un upstream roto hacía que el
                // player parseara JSON/HTML y abortara con "unexpected type".
                // Al player sólo le llega un manifest o un 502 con motivo.
                header('Content-Type: application/json; charset=utf-8');
                header('X-APE-Pulse: logged;mode=proxy;upstream_not_playlist;kind=' . $kind . ';code=' . $code);
                header('Cache-Control: no-store, no-cache, must-revalidate');
                http_response_code(502);
                echo '{"ok":false,"error":"upstream_not_playlist","kind":"' . $kind . '","code":' . $code . '}';
                exit;
            }
        }
    }
    header('Content-Type: application/x-mpegURL');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('X-APE-Pulse: logged;mode=proxy;zapping=' . ($zap ? '1' : '0')
        . ';cache=' . ($fromCache ? 'hit' : 'miss') . ';kind=' . $kind);
    echo $body;
    exit;
}

// ── 5 · Responder ─────────────────────────────────────────────────────────────
if ($mode === 'redirect') {
    header('X-APE-Pulse: logged;mode=redirect;zapping=' . ($zap ? '1' : '0')
        . (!empty($forcedStrict) ? ';forced=ua-not-capable' : ''));
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Location: ' . $u, true, 302);
    exit;
}

// cartridge: reutiliza EXACTAMENTE el mismo generador que /url2/ (sin duplicar 904 líneas)
// POLIMORFISMO: el mismo canal se entrega con el vocabulario de CADA player.
//   VLC             -> vlc     (EXTVLCOPT + cadena de filtros NATIVA de VLC)
//   Kodi/LibreELEC  -> kodi    (KODIPROP / inputstream.adaptive)
//   ExoPlayer/OTT/TiviMate/Smarters -> android (solo #EXT-X-* + #EXTHTTP)
//   resto           -> full    (compatibilidad total)
// Determinista por UA: mismo cliente => mismo dialecto (idempotente).
$dialect = 'full';
if (preg_match('/(VLC|LibVLC)/i', $uaPulse)) {
    $dialect = 'vlc';
} elseif (preg_match('/(Kodi|LibreELEC)/i', $uaPulse)) {
    $dialect = 'kodi';
} elseif (preg_match('/(ExoPlayer)/i', $uaPulse)) {
    $dialect = 'exo';   // ExoPlayer/Media3: CMaf/HLS estandar + sin ruido VLC/Kodi
} elseif (preg_match('/(OTT\s*Navigator|TiviMate|IPTVSmarters|Smarters|Perfect\s*Player)/i', $uaPulse)) {
    $dialect = 'android';
}
$_GET['dialect'] = $dialect;
$_GET['u']    = $u;
$_GET['p']    = strtoupper((string)($_GET['p'] ?? 'P3'));
$_GET['mode'] = 'master';
if (!isset($_GET['n']) || $_GET['n'] === '') { $_GET['n'] = $id; }
if (!isset($_GET['c'])) { $_GET['c'] = $id; }
if (!isset($_GET['id']) || $_GET['id'] === '') { $_GET['id'] = $id; }
header('X-APE-Pulse: logged;mode=cartridge;dialect=' . $dialect . ';zapping=' . ($zap ? '1' : '0') . ';canary=' . ($canaryId !== '' ? '1' : '0'));
require __DIR__ . '/url2-cartridge.php';







