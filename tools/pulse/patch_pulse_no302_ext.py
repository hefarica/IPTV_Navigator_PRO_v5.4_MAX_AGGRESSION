#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pulse — cierre final del "Loaded playlist has unexpected type." (2026-11-05)

DOS HALLAZGOS MEDIDOS:
 A) Las URLs del tipo /cdn/<prov>/<ruta> que genera la lista CDN vienen SIN
    extensión; el proveedor responde 513/461 a la ruta sin extensión y 200 a
    `<ruta>.m3u8`. Solución: al normalizar, añadir `.m3u8` si el path no tiene
    extensión.
 B) El fallback 302 era la causa raíz del error del player: cuando el upstream
    devolvía algo que no era playlist (JSON/HTML/513 vacío), el player seguía el
    302 y parseaba basura => "unexpected type". Se ELIMINA el 302: o se sirve una
    playlist real (media), o un 502 JSON explícito. El player nunca recibe otra
    cosa que no sea un manifest.
"""
import io
import sys

PATH = '/var/www/html/prisma/api/pulse.php'
src = io.open(PATH, encoding='utf-8').read()

# ── A) extensión .m3u8 en la normalización ──────────────────────────────────
old_norm = r'''        if (preg_match('#^/cdn/([A-Za-z0-9.-]+)/(.*)$#', $path, $m)) {
            return 'http://' . $m[1] . '/' . ltrim($m[2], '/');
        }'''
new_norm = r'''        if (preg_match('#^/cdn/([A-Za-z0-9.-]+)/(.*)$#', $path, $m)) {
            $p = ltrim($m[2], '/');
            // MEDIDO: el proveedor responde 513/461 a la ruta SIN extensión y 200
            // a `<ruta>.m3u8`. Se añade la extensión cuando falta.
            if (!preg_match('/\.[A-Za-z0-9]{1,5}$/', $p)) {
                $p .= '.m3u8';
            }
            return 'http://' . $m[1] . '/' . $p;
        }'''
if old_norm in src:
    src = src.replace(old_norm, new_norm)
    print('A) extensión .m3u8 añadida a la normalización')
else:
    print('A) AVISO: bloque de normalización no encontrado')

# ── B) quitar el 302: 502 explícito siempre ─────────────────────────────────
old_302 = r'''                if (!ape_pulse_is_self($uNorm)) {
                    header('X-APE-Pulse: logged;mode=redirect;proxy_fallback=' . $code . ';kind=' . $kind);
                    header('Cache-Control: no-store, no-cache, must-revalidate');
                    header('Location: ' . $uNorm, true, 302);
                    exit;
                }
                header('Content-Type: application/json; charset=utf-8');
                header('X-APE-Pulse: logged;mode=proxy;upstream_not_playlist;kind=' . $kind . ';code=' . $code);
                http_response_code(502);
                echo '{"ok":false,"error":"upstream_not_playlist","kind":"' . $kind . '","code":' . $code . '}';
                exit;'''
new_502 = r'''                // [HARDENING] NUNCA 302: un 302 a un upstream roto hacía que el
                // player parseara JSON/HTML y abortara con "unexpected type".
                // Al player sólo le llega un manifest o un 502 con motivo.
                header('Content-Type: application/json; charset=utf-8');
                header('X-APE-Pulse: logged;mode=proxy;upstream_not_playlist;kind=' . $kind . ';code=' . $code);
                header('Cache-Control: no-store, no-cache, must-revalidate');
                http_response_code(502);
                echo '{"ok":false,"error":"upstream_not_playlist","kind":"' . $kind . '","code":' . $code . '}';
                exit;'''
if old_302 in src:
    src = src.replace(old_302, new_502)
    print('B) 302 eliminado -> 502 explícito')
else:
    print('B) AVISO: bloque 302 no encontrado')

io.open(PATH, 'w', encoding='utf-8').write(src)
print('OK')
