#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Parche de RAÍZ para /prisma/api/pulse.php — modo proxy.

PROBLEMA MEDIDO (2026-11-05): el player del operador recibe
  "Loaded playlist has unexpected type."
porque en ciertos canales el modo proxy:
  a) recibe del proveedor un MASTER playlist (#EXT-X-STREAM-INF) y lo sirve tal
     cual a un cliente que espera MEDIA playlist, o
  b) falla el fetch (p.ej. URLs del tipo /cdn/<host>/<path> que apuntan a nuestro
     propio dominio) y hace 302 hacia esa misma URL rota, y el player acaba
     siguiendo cadenas 302 hasta un HTML/cosa que no es playlist.

ARREGLO (fail-closed + normalización):
  1) Normaliza el upstream: /cdn/<proveedor>/<resto> -> http://<proveedor>/<resto>.
     Nunca se hace fetch recursivo a nuestro propio dominio.
  2) Clasifica la respuesta: media (#EXTINF), master (#EXT-X-STREAM-INF) o
     NO-playlist (ni #EXTM3U). Si es master, resuelve la MEJOR variante y sirve
     su media playlist (el player nunca ve un master en modo proxy).
  3) Si no es playlist -> 502 JSON {"ok":false,"error":"upstream_not_playlist"}.
     Nunca más un 302 a una URL rota que confunde al player.
  4) El 302 de fallback sólo se permite a un host de proveedor, jamás a nuestro
     propio dominio.
  5) Cache APCu 2 s igual que antes (dos recargas = una conexión al proveedor).
"""
import io
import re
import sys

PATH = '/var/www/html/prisma/api/pulse.php'

HELPERS = r'''
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
            return 'http://' . $m[1] . '/' . ltrim($m[2], '/');
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
'''

NEW_PROXY = r'''if ($mode === 'proxy') {
    // [ROOT-FIX 2026-11-05] Normalizar primero: las URLs /cdn/<prov>/<ruta> se
    // convierten al proveedor real; nunca se hace fetch recursivo a nosotros.
    $uNorm = ape_pulse_norm_upstream($u);
    if ($uNorm === '') {
        header('Content-Type: application/json; charset=utf-8');
        header('X-APE-Pulse: logged;mode=proxy;upstream=self_or_invalid');
        http_response_code(502);
        echo '{"ok":false,"error":"upstream_self_reference","hint":"url /cdn/<host>/<path> no normalizable"}';
        exit;
    }
    $plKey = 'ape_pulse_pl_' . sha1($uNorm);
    $cached = function_exists('apcu_fetch') ? apcu_fetch($plKey) : false;
    $body = is_array($cached) && !empty($cached['body']) ? (string) $cached['body'] : '';
    $kind = is_array($cached) && !empty($cached['kind']) ? (string) $cached['kind'] : 'media';
    $fromCache = ($body !== '');
    if (!$fromCache) {
        list($raw, $code, $eff) = ape_pulse_fetch($uNorm, $uaPulse);
        $kind = ape_pulse_kind($raw);
        if ($code !== 200 || $kind === 'noplaylist') {
            // Fallback SOLO si el destino es un host de proveedor. Si es nuestro
            // dominio, un 302 sería un bucle: mejor 502 explícito.
            if (!ape_pulse_is_self($uNorm)) {
                header('X-APE-Pulse: logged;mode=redirect;proxy_fallback=' . $code . ';kind=' . $kind);
                header('Cache-Control: no-store, no-cache, must-revalidate');
                header('Location: ' . $uNorm, true, 302);
                exit;
            }
            header('Content-Type: application/json; charset=utf-8');
            header('X-APE-Pulse: logged;mode=proxy;upstream_not_playlist;kind=' . $kind . ';code=' . $code);
            http_response_code(502);
            echo '{"ok":false,"error":"upstream_not_playlist","kind":"' . $kind . '","code":' . $code . '}';
            exit;
        }
        if ($kind === 'master') {
            // El player no capaz NUNCA debe ver un master: se resuelve la mejor
            // variante y se sirve su media playlist (absoluta).
            $variant = ape_pulse_pick_variant($raw, $eff);
            if ($variant === '') {
                header('Content-Type: application/json; charset=utf-8');
                header('X-APE-Pulse: logged;mode=proxy;master_without_variant');
                http_response_code(502);
                echo '{"ok":false,"error":"master_without_variant"}';
                exit;
            }
            list($mraw, $mcode, $meff) = ape_pulse_fetch($variant, $uaPulse);
            if ($mcode !== 200 || ape_pulse_kind($mraw) !== 'media') {
                header('Content-Type: application/json; charset=utf-8');
                header('X-APE-Pulse: logged;mode=proxy;variant_not_media;code=' . $mcode);
                http_response_code(502);
                echo '{"ok":false,"error":"variant_not_media","code":' . $mcode . '}';
                exit;
            }
            $body = ape_pulse_absolutize($mraw, $meff);
            $kind = 'media';
        } else {
            $body = ape_pulse_absolutize($raw, $eff);
        }
        if (function_exists('apcu_store')) {
            apcu_store($plKey, ['body' => $body, 'kind' => $kind], 2);
        }
    }
    header('Content-Type: application/x-mpegURL');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('X-APE-Pulse: logged;mode=proxy;zapping=' . ($zap ? '1' : '0')
        . ';cache=' . ($fromCache ? 'hit' : 'miss') . ';kind=' . $kind);
    echo $body;
    exit;
}'''

src = io.open(PATH, encoding='utf-8').read()

if 'ape_pulse_norm_upstream' in src:
    print('YA PARCHEADO: no se toca')
    sys.exit(0)

# 1) insertar helpers antes del bloque "// ── 4c · Modo PROXY"
marker = "// ── 4c · Modo PROXY"
idx = src.find(marker)
if idx < 0:
    print('NO SE ENCONTRÓ EL MARCADOR 4c')
    sys.exit(1)
src = src[:idx] + HELPERS + "\n" + src[idx:]

# 2) reemplazar el bloque proxy
start = src.find("if ($mode === 'proxy') {")
if start < 0:
    print('NO SE ENCONTRÓ EL BLOQUE PROXY')
    sys.exit(1)
# localizar el cierre: contar llaves desde start
depth = 0
end = -1
i = src.find('{', start)
while i < len(src):
    c = src[i]
    if c == '{':
        depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0:
            end = i + 1
            break
    i += 1
if end < 0:
    print('BLOQUE PROXY SIN CIERRE')
    sys.exit(1)

src = src[:start] + NEW_PROXY + src[end:]
io.open(PATH, 'w', encoding='utf-8').write(src)
print('PARCHEADO OK: %d B -> %d B' % (end - start, len(NEW_PROXY)))
