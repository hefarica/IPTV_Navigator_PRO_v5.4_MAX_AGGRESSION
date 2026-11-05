#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pulse proxy — hardening anti-error (stale-while-error + retry + single-flight).

CONTEXTO MEDIDO (2026-11-05): el proveedor devolvió **HTTP 513** (su límite) para
un canal 4K mientras el player reintentaba. La cadena era:
  player -> /pulse/<id>?u=https://iptv-ape.duckdns.org/cdn/<host>/<ruta>
         -> /cdn/... devolvía JSON de error
         -> pulse hacía 302 a esa misma URL
         -> el player recibía JSON como "playlist" => "Loaded playlist has unexpected type."

Ya normalizamos /cdn/ -> proveedor y nunca se sirve un no-playlist. Ahora, además:
  1) retry una vez (250 ms) si el upstream devuelve 5xx/0/513,
  2) cache "last-good" 60 s: si el proveedor falla, se sirve la última playlist
     buena (200, header stale=1) en vez de un error al player,
  3) single-flight por canal (lock APCu 3 s) para no duplicar conexiones
     simultáneas al proveedor (la causa del 509/513),
  4) si no hay last-good y el upstream es un host de proveedor, 302 como última
     opción; si es nuestro dominio, 502 explícito (nunca bucle).
"""
import io
import sys

PATH = '/var/www/html/prisma/api/pulse.php'

NEW = r'''if ($mode === 'proxy') {
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
start = src.find("if ($mode === 'proxy') {")
if start < 0:
    print('NO PROXY BLOCK')
    sys.exit(1)
depth = 0
i = src.find('{', start)
end = -1
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
    print('NO CIERRE')
    sys.exit(1)
src = src[:start] + NEW + src[end:]
io.open(PATH, 'w', encoding='utf-8').write(src)
print('HARDENED OK: %d B -> %d B' % (end - start, len(NEW)))
