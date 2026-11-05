#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cartucho (url2-cartridge.php) — bloque de DECLARACIÓN de mejora extrema.

AUTORIZADO POR EL PROPIETARIO (2026-11-05): "el santo grial de una excepcional
imagen". Se emite una vez por respuesta, antes del URI, como METADATA:
  #EXT-X-APE-LCEVC-PHASE:4
  #EXT-X-APE-LCEVC-ENABLED:true
  #EXT-X-APE-HDR10-PLUS:ENABLED;MAX_NITS=5000;MIN_NITS=0.0005;L1=per-scene
  #EXT-X-APE-DOLBY-VISION:ENABLED=true,PROFILE=8.1,RPU=DECLARED,CROSS_COMPATIBLE=true
  #EXT-X-APE-HDR-DV:MODE=PQ,NITS=5000,BT2020=true
  #EXT-X-APE-AI-SR:MODEL=realesrgan,SCALE=4,ENABLED=true
  #EXT-X-APE-MINTERPOLATE:FPS=120;ME=epzs;MI_MODE=mci
  #EXT-X-APE-ENHANCE-STATE:DECLARED;OWNER=1;AUTHORIZED=2026-11-05;EXECUTION=engine_dependent

No toca STREAM-INF/CODECS/RESOLUTION ni SUPPLEMENTAL-CODECS. Idempotente: si el
cuerpo ya trae la marca de estado, no se duplica.
"""
import io
import sys

PATH = '/var/www/html/prisma/api/url2-cartridge.php'
src = io.open(PATH, encoding='utf-8').read()

if 'APE-ENHANCE-STATE' in src:
    print('YA PARCHEADO')
    sys.exit(0)

anchor = "$outLines[] = '#EXT-X-APE-URL2-DIALECT:' . $dialect"
if anchor not in src:
    print('NO ANCHOR')
    sys.exit(1)

BLOCK = r'''// ── [OWNER OVERRIDE 2026-11-05] Declaraciones de mejora extrema ─────────────
// Autorizadas por el propietario. Metadata del manifiesto; NO tocan STREAM-INF,
// CODECS ni RESOLUTION, y no declaran SUPPLEMENTAL-CODECS (eso rompería decoder).
// La etiqueta ENHANCE-STATE dice el estado honesto: declarado, no aplicado.
$apeOwnerDecl = [
    '#EXT-X-APE-LCEVC-PHASE:4',
    '#EXT-X-APE-LCEVC-ENABLED:true',
    '#EXT-X-APE-HDR10-PLUS:ENABLED;MAX_NITS=5000;MIN_NITS=0.0005;L1=per-scene',
    '#EXT-X-APE-DOLBY-VISION:ENABLED=true,PROFILE=8.1,RPU=DECLARED,CROSS_COMPATIBLE=true',
    '#EXT-X-APE-HDR-DV:MODE=PQ,NITS=5000,BT2020=true',
    '#EXT-X-APE-AI-SR:MODEL=realesrgan,SCALE=4,ENABLED=true',
    '#EXT-X-APE-MINTERPOLATE:FPS=120;ME=epzs;MI_MODE=mci',
    '#EXT-X-APE-ENHANCE-STATE:DECLARED;OWNER=1;AUTHORIZED=2026-11-05;EXECUTION=engine_dependent',
];
$apeHasOwnerDecl = false;
foreach ($outLines as $apeL) {
    if (strncmp($apeL, '#EXT-X-APE-ENHANCE-STATE:', 25) === 0) { $apeHasOwnerDecl = true; break; }
}
if (!$apeHasOwnerDecl) {
    foreach ($apeOwnerDecl as $apeL) { $outLines[] = $apeL; }
}
'''

src = src.replace(anchor, BLOCK + anchor, 1)
io.open(PATH, 'w', encoding='utf-8').write(src)
print('PARCHEADO OK')
