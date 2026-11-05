#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
url2-cartridge.php — sanea el #EXTHTTP del cartucho (skill EXTHTTP traps, 14).

HALLAZGO MEDIDO (2026-11-05): el cartucho emitía un #EXTHTTP de 7.399 B con 200
headers, de los cuales ~180 eran:
  - X-APE-*, X-Cortex-*, X-LCEVC-*, X-AI-SR-*, X-Dolby-Vision-*, X-HDR10-Plus-*,
    X-CMAF-*, X-FMP4-*, X-VVC-*, X-EVC-*, X-PEVCE-*  → fingerprint de motor (T11)
  - X-Device-Capabilities / X-Device-Id / X-Player-Type → fingerprint de device
  - declaraciones FALSAS de capacidad enviadas al proveedor (LCEVC enabled, DV
    RPU present, HDR 5000 nits, 12-bit) → violan los truth-guards del repo.

ARREGLO: al ensamblar la salida, cada línea #EXTHTTP: se reconstruye desde una
allowlist mínima y neutral (CAPA A de la doctrina: ~<1 KB), con JSON estricto.
Si el JSON original no parsea, la línea se ELIMINA (nunca se emite JSON roto).
"""
import io
import sys

PATH = '/var/www/html/prisma/api/url2-cartridge.php'
src = io.open(PATH, encoding='utf-8').read()

if 'ape_cartridge_exthttp_safe' in src:
    print('YA PARCHEADO')
    sys.exit(0)

HELPER = r'''
/**
 * [EXTHTTP-TRAPS 2026-11-05] Reconstruye el #EXTHTTP del cartucho desde una
 * allowlist mínima y neutral. Motivo medido: el bloque traía 200 headers con
 * fingerprints de motor (X-APE-*, X-Cortex-*, X-LCEVC-*, X-AI-SR-*, "omega" en
 * X-Request-Id) y declaraciones falsas de capacidad (LCEVC/DV/HDR 5000 nits) que
 * viajan al CDN del proveedor: riesgo de 403/429 por WAF y violación de los
 * truth-guards del repo. Aquí sólo quedan headers HTTP reales y coherentes.
 *
 * Nunca emite JSON inválido: si el original no parsea, devuelve '' y la línea se
 * descarta (el player usará sus defaults, que es lo correcto).
 */
function ape_cartridge_exthttp_safe(string $line): string
{
    $raw = substr($line, strlen('#EXTHTTP:'));
    $obj = json_decode($raw, true);
    if (!is_array($obj)) { return ''; }

    // Sólo headers HTTP funcionales y neutros (sin identidad de motor/device).
    $keep = [
        'user-agent', 'accept', 'accept-language', 'accept-encoding',
        'cache-control', 'pragma', 'referer', 'origin', 'dnt', 'sec-gpc',
        'connection',
    ];
    $out = [];
    foreach ($obj as $k => $v) {
        if (!is_string($k) || !is_string($v)) { continue; }
        $kl = strtolower($k);
        if (!in_array($kl, $keep, true)) { continue; }
        if ($v === '' || preg_match('/[\r\n]/', $v)) { continue; }
        if (preg_match('/OMEGA|CRYSTAL|APE_|X-CORTEX|LCEVC|AI-SR/i', $v)) { continue; }
        if (($kl === 'referer' || $kl === 'origin')
            && preg_match('/iptv-ape|duckdns|178\.156|hetzner/i', $v)) {
            // SPOF (T14): nunca el dominio del VPS como Referer/Origin.
            $v = ($kl === 'referer') ? 'https://www.fastly.com/' : 'https://www.fastly.com';
        }
        if ($kl === 'user-agent' && strpos($v, '%20') !== false) {
            $v = str_replace('%20', ' ', $v); // T2: UA no es URL
        }
        $out[$k] = $v;
    }
    if (!$out) { return ''; }
    $json = json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($json) || strlen($json) > 2048) { return ''; } // CAPA A: <2 KB
    return '#EXTHTTP:' . $json;
}
'''

# 1) insertar helper justo antes del ensamblado final (ob_start está antes)
anchor = 'ob_start();'
idx = src.find(anchor)
if idx < 0:
    print('NO ob_start')
    sys.exit(1)
src = src[:idx] + HELPER + "\n" + src[idx:]

# 2) sustituir la emisión de la línea dentro del loop
old = "    $outLines[] = $ln;\n}"
new = ("    if (strncmp($ln, '#EXTHTTP:', 9) === 0) {\n"
       "        $safe = ape_cartridge_exthttp_safe($ln);\n"
       "        if ($safe !== '') { $outLines[] = $safe; }\n"
       "        continue;\n"
       "    }\n"
       "    $outLines[] = $ln;\n}")
if old not in src:
    print('NO MATCH loop')
    sys.exit(1)
src = src.replace(old, new, 1)

io.open(PATH, 'w', encoding='utf-8').write(src)
print('PARCHEADO OK')
