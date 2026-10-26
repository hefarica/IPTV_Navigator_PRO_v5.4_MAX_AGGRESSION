# VERIFY_OUTPUT_T23 — Salidas crudas (T23: B-10b + gate honesto)

Task: t23 · Attempt: 1f7b3c26-a7e9-444d-9a13-dbb23eb325b5
Capturado: 2026-10-25T23:41:53-05:00
Metodo: cada bloque es la salida literal del comando. Los EXIT son $LASTEXITCODE reales, tomados SIN pipe.

---

## V0 · Entorno

```
$ C:\Users\HFRC\AppData\Local\DSH_HERRAMIENTAS\rea-engines\php-8.3\php.exe --version
PHP 8.3.36 (cli) (built: Oct 20 2026 04:18:57) (NTS Visual C++ 2019 x64)
Copyright (c) The PHP Group
Zend Engine v4.3.36, Copyright (c) Zend Technologies
```

## V1 · php -l (VERIFY #1)

```
$ C:\Users\HFRC\AppData\Local\DSH_HERRAMIENTAS\rea-engines\php-8.3\php.exe -l IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
No syntax errors detected in IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
EXIT=0
```

## V2 · Prueba de emision ampliada (VERIFY #2)

```
$ C:\Users\HFRC\AppData\Local\DSH_HERRAMIENTAS\rea-engines\php-8.3\php.exe audit/alignment/2026-10-25/60-remediacion/tools/tools_t11_emission_proof.php
== Archivo bajo prueba ==
  path  : IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
  bytes : 40501
  sha256: c2332fbd80131029102af4d36e456951ca8bdcf7e310dc099c86eea15175458b

PASS  B-11 · serve_cmaf_m3u8_fallback localizada
PASS  B-11 · sin echo de EXT-X-MAP en el fallback (código, no comentarios)
PASS  B-11 · sin mapa apuntando a .m3u8
PASS  B-11 · EXT-X-MAP legítimo (.m4s) de serve_hls_fmp4_ignition intacto
PASS  B-10 · ningún literal hev1.* en el código del fallback (STREAM-INF HLS)
PASS  B-10 · CODECS usa hvc1.2.4.L153.B0
PASS  no-regresión · generate_dash_mpd (DASH) conserva hev1
PASS  B-10b · el archivo NO contiene el default `?? 120`
PASS  B-10b · clamp por nivel presente ($fpsCap + min(...))

== Bloque de emisión extraído del archivo (verbatim) ==
  | // EXT-X-STREAM-INF con los parámetros de calidad del perfil
  |     $bw         = $cfg['max_bw']   ?? 15150000;
  |     $avgBw      = $cfg['bitrate']  ?? 10100;
  |     $avgBwBps   = $avgBw * 1000;
  |     $resolution = $cfg['res']      ?? '1920x1080';
  |     // [T11/B-10] GOLDEN RULE: la familia hvc1 va SOLO en #EXT-X-STREAM-INF:CODECS=.
  |     // La familia hev1 queda reservada a KODIPROP/EXTVLCOPT (runtime). Cruzarlas rompe Tizen/webOS.
  |     $codecs     = ($cfg['codec_primary'] === 'HEVC' || $cfg['codec_primary'] === 'hevc')
  |                     ? 'hvc1.2.4.L153.B0,mp4a.40.2'
  |                     : 'avc1.640028,mp4a.40.2';
  |     // [T23/B-10b · D-58] FRAME-RATE clampado a la capacidad REAL del nivel declarado.
  |     // High@L4.0 (avc1.640028) a 1080p ya toca su techo con 30 fps; declarar 120 lo excede ~4x.
  |     // Techo por nivel: HEVC Main10 L153/L123 => 60 · resto => 30. Un fps explícito del perfil
  |     // se respeta, pero NUNCA por encima de ese techo: el nivel manda, no el default.
  |     $fpsCap     = preg_match('/^hvc1\.2\.4\.L(?:153|123)\./i', $codecs) ? 60 : 30;
  |     $fps        = max(1, min((int)($cfg['fps'] ?? $fpsCap), $fpsCap));
  | 
  |     echo "#EXT-X-STREAM-INF:BANDWIDTH={$bw},AVERAGE-BANDWIDTH={$avgBwBps},"
  |        . "RESOLUTION={$resolution},FRAME-RATE={$fps},CODECS=\"{$codecs}\"\n";

== Salida real por caso ==
  [SIN cfg (codec_primary indefinido -> AVC)]
    Warning: Undefined array key "codec_primary" in C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\audit\alignment\2026-10-25\60-remediacion\tools\tools_t11_emission_proof.php(125) : eval()'d code on line 9

Warning: Undefined array key "codec_primary" in C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\audit\alignment\2026-10-25\60-remediacion\tools\tools_t11_emission_proof.php(125) : eval()'d code on line 9
#EXT-X-STREAM-INF:BANDWIDTH=15150000,AVERAGE-BANDWIDTH=10100000,RESOLUTION=1920x1080,FRAME-RATE=30,CODECS="avc1.640028,mp4a.40.2"
  [HEVC · sin cfg fps (default -> techo 60)]
    #EXT-X-STREAM-INF:BANDWIDTH=12000000,AVERAGE-BANDWIDTH=9000000,RESOLUTION=1920x1080,FRAME-RATE=60,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"
  [HEVC · 3840x2160 · fps=60 explícito]
    #EXT-X-STREAM-INF:BANDWIDTH=15150000,AVERAGE-BANDWIDTH=10100000,RESOLUTION=3840x2160,FRAME-RATE=60,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"
  [HEVC · 1920x1080 · fps=120 (clampea)]
    #EXT-X-STREAM-INF:BANDWIDTH=12000000,AVERAGE-BANDWIDTH=9000000,RESOLUTION=1920x1080,FRAME-RATE=60,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"
  [HEVC · 1920x1080 · fps=30 (respeta)]
    #EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500000,RESOLUTION=1920x1080,FRAME-RATE=30,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"
  [AVC  · 1920x1080 · sin fps (techo 30)]
    #EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500000,RESOLUTION=1920x1080,FRAME-RATE=30,CODECS="avc1.640028,mp4a.40.2"
  [AVC  · 1920x1080 · fps=120 (clampea)]
    #EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500000,RESOLUTION=1920x1080,FRAME-RATE=30,CODECS="avc1.640028,mp4a.40.2"

== Aserciones sobre la salida emitida ==
PASS  sin hev1 en la línea STREAM-INF · SIN cfg (codec_primary indefinido -> AVC)  [Warning: Undefined array key "codec_primary" in C:\Users\H…]
PASS  familia esperada (AVC) en CODECS · SIN cfg (codec_primary indefinido -> AVC)  [video=avc1.640028]
PASS  CODECS parseable como RFC 6381 · SIN cfg (codec_primary indefinido -> AVC)  [avc1.640028]
PASS  B-10b · FRAME-RATE == 30 · SIN cfg (codec_primary indefinido -> AVC)  [fps=30]
PASS  B-10b · FRAME-RATE <= techo del nivel (30) · SIN cfg (codec_primary indefinido -> AVC)  [fps=30 cap=30]
PASS  coherencia RESOLUTION declarada · SIN cfg (codec_primary indefinido -> AVC)  [res=1920x1080]
PASS  sin hev1 en la línea STREAM-INF · HEVC · sin cfg fps (default -> techo 60)  [#EXT-X-STREAM-INF:BANDWIDTH=12000000,AVERAGE-BANDWIDTH=900…]
PASS  familia esperada (HEVC) en CODECS · HEVC · sin cfg fps (default -> techo 60)  [video=hvc1.2.4.L153.B0]
PASS  CODECS parseable como RFC 6381 · HEVC · sin cfg fps (default -> techo 60)  [hvc1.2.4.L153.B0]
PASS  B-10b · FRAME-RATE == 60 · HEVC · sin cfg fps (default -> techo 60)  [fps=60]
PASS  B-10b · FRAME-RATE <= techo del nivel (60) · HEVC · sin cfg fps (default -> techo 60)  [fps=60 cap=60]
PASS  coherencia RESOLUTION declarada · HEVC · sin cfg fps (default -> techo 60)  [res=1920x1080]
PASS  sin hev1 en la línea STREAM-INF · HEVC · 3840x2160 · fps=60 explícito  [#EXT-X-STREAM-INF:BANDWIDTH=15150000,AVERAGE-BANDWIDTH=101…]
PASS  familia esperada (HEVC) en CODECS · HEVC · 3840x2160 · fps=60 explícito  [video=hvc1.2.4.L153.B0]
PASS  CODECS parseable como RFC 6381 · HEVC · 3840x2160 · fps=60 explícito  [hvc1.2.4.L153.B0]
PASS  B-10b · FRAME-RATE == 60 · HEVC · 3840x2160 · fps=60 explícito  [fps=60]
PASS  B-10b · FRAME-RATE <= techo del nivel (60) · HEVC · 3840x2160 · fps=60 explícito  [fps=60 cap=60]
PASS  coherencia RESOLUTION declarada · HEVC · 3840x2160 · fps=60 explícito  [res=3840x2160]
PASS  sin hev1 en la línea STREAM-INF · HEVC · 1920x1080 · fps=120 (clampea)  [#EXT-X-STREAM-INF:BANDWIDTH=12000000,AVERAGE-BANDWIDTH=900…]
PASS  familia esperada (HEVC) en CODECS · HEVC · 1920x1080 · fps=120 (clampea)  [video=hvc1.2.4.L153.B0]
PASS  CODECS parseable como RFC 6381 · HEVC · 1920x1080 · fps=120 (clampea)  [hvc1.2.4.L153.B0]
PASS  B-10b · FRAME-RATE == 60 · HEVC · 1920x1080 · fps=120 (clampea)  [fps=60]
PASS  B-10b · FRAME-RATE <= techo del nivel (60) · HEVC · 1920x1080 · fps=120 (clampea)  [fps=60 cap=60]
PASS  coherencia RESOLUTION declarada · HEVC · 1920x1080 · fps=120 (clampea)  [res=1920x1080]
PASS  sin hev1 en la línea STREAM-INF · HEVC · 1920x1080 · fps=30 (respeta)  [#EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500…]
PASS  familia esperada (HEVC) en CODECS · HEVC · 1920x1080 · fps=30 (respeta)  [video=hvc1.2.4.L153.B0]
PASS  CODECS parseable como RFC 6381 · HEVC · 1920x1080 · fps=30 (respeta)  [hvc1.2.4.L153.B0]
PASS  B-10b · FRAME-RATE == 30 · HEVC · 1920x1080 · fps=30 (respeta)  [fps=30]
PASS  B-10b · FRAME-RATE <= techo del nivel (60) · HEVC · 1920x1080 · fps=30 (respeta)  [fps=30 cap=60]
PASS  coherencia RESOLUTION declarada · HEVC · 1920x1080 · fps=30 (respeta)  [res=1920x1080]
PASS  sin hev1 en la línea STREAM-INF · AVC  · 1920x1080 · sin fps (techo 30)  [#EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500…]
PASS  familia esperada (AVC) en CODECS · AVC  · 1920x1080 · sin fps (techo 30)  [video=avc1.640028]
PASS  CODECS parseable como RFC 6381 · AVC  · 1920x1080 · sin fps (techo 30)  [avc1.640028]
PASS  B-10b · FRAME-RATE == 30 · AVC  · 1920x1080 · sin fps (techo 30)  [fps=30]
PASS  B-10b · FRAME-RATE <= techo del nivel (30) · AVC  · 1920x1080 · sin fps (techo 30)  [fps=30 cap=30]
PASS  coherencia RESOLUTION declarada · AVC  · 1920x1080 · sin fps (techo 30)  [res=1920x1080]
PASS  sin hev1 en la línea STREAM-INF · AVC  · 1920x1080 · fps=120 (clampea)  [#EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500…]
PASS  familia esperada (AVC) en CODECS · AVC  · 1920x1080 · fps=120 (clampea)  [video=avc1.640028]
PASS  CODECS parseable como RFC 6381 · AVC  · 1920x1080 · fps=120 (clampea)  [avc1.640028]
PASS  B-10b · FRAME-RATE == 30 · AVC  · 1920x1080 · fps=120 (clampea)  [fps=30]
PASS  B-10b · FRAME-RATE <= techo del nivel (30) · AVC  · 1920x1080 · fps=120 (clampea)  [fps=30 cap=30]
PASS  coherencia RESOLUTION declarada · AVC  · 1920x1080 · fps=120 (clampea)  [res=1920x1080]

== Gate honesto multilínea (STREAM-INF + 3 líneas siguientes) ==
PASS  multilínea · 0 ventanas STREAM-INF(+3) con hev1  [ventanas_con_hev1=0]

== Resultado ==
PASS=52  FAIL=0
TODAS LAS ASERCIONES PASAN
EXIT=0
```

## V3 · `?? 120` (VERIFY #3)

```
$ Select-String -Path IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php -Pattern '\?\?\s*120' | Measure-Object | Select-Object -ExpandProperty Count
0
```

## V4 · git diff --numstat (VERIFY #4)

```
$ git diff --numstat -- IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
16	8	IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php

  (16 insertions / 8 deletions = acumulado B-10 + B-11 + B-10b desde HEAD)
```

## V5 · Asercion multilinea del contrato (VERIFY #5)

```
$ (Select-String -Path IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php -Pattern 'EXT-X-STREAM-INF' -Context 0,3 | Where-Object { $_.Context.PostContext -match 'hev1\.' }).Count
0
```

Este es el gate HONESTO: ventana de STREAM-INF + 3 lineas siguientes. El gate de T11
(`EXT-X-STREAM-INF.*hev1\.` en una sola linea) era vacuous: devolvia 0 incluso con el bug
porque STREAM-INF y CODECS viven en lineas distintas y `.` no cruza el salto.

## V6 · Ventanas STREAM-INF y sus 3 lineas siguientes (evidencia cruda)

```
L732: // EXT-X-STREAM-INF con los parámetros de calidad del perfil
      + $bw         = $cfg['max_bw']   ?? 15150000;
      + $avgBw      = $cfg['bitrate']  ?? 10100;
      + $avgBwBps   = $avgBw * 1000;
L737: // [T11/B-10] GOLDEN RULE: la familia hvc1 va SOLO en #EXT-X-STREAM-INF:CODECS=.
      + // La familia hev1 queda reservada a KODIPROP/EXTVLCOPT (runtime). Cruzarlas rompe Tizen/webOS.
      + $codecs     = ($cfg['codec_primary'] === 'HEVC' || $cfg['codec_primary'] === 'hevc')
      + ? 'hvc1.2.4.L153.B0,mp4a.40.2'
L749: echo "#EXT-X-STREAM-INF:BANDWIDTH={$bw},AVERAGE-BANDWIDTH={$avgBwBps},"
      + . "RESOLUTION={$resolution},FRAME-RATE={$fps},CODECS=\"{$codecs}\"\n";
      + 
      + // ── URL final: .m3u8 directo del proveedor ──
```

## V7 · Estado final del archivo

```
bytes  = 40501
lines  = 756
mtime  = 2026-10-25T23:40:43.243
sha256 = C2332FBD80131029102AF4D36E456951CA8BDCF7E310DC099C86EEA15175458B
```

## V8 · Sin commit

```
$ git log -1 --format="%h %s"
ffb01e6 security(containment): untrack wrangler R2 state blobs (creds expuestas)

$ git diff --cached --name-only
(vacio: nada staged)
```

## V9 · No-intervencion en archivos prohibidos

```
m3u8-typed-arrays-ultimate.js      748672 B  2026-10-25T23:11:04  6881CB9D0D9E4C4FDAC801405532DC3265D0F51E4BAD2C392C2854FCDE5C8CB4
resolve_quality_unified.php        348758 B  2026-10-25T21:35:16  20AC4B2631C1E877A3DE92B4E479B6C2EFA171AD1A317869F9343A99C3C5F2B5
fanout_concurrency.sh               99666 B  2026-10-25T22:32:40  B558B1CDFF883579041391830318D424FC8D8D07323EF7A5167374055B7399FC
```

## V10 · contracts/verify_contracts.mjs — BLOCKED_BY_OWNER (no es fallo de T23)

```
$ node contracts/verify_contracts.mjs
== VERIFICACIÓN DE CONTRATOS ==
  PASS  schema crystal-contracts/v1
  PASS  master sha256 e2bb8e69a31d0f68…
  PASS  artefacto _vps_stage/media/ape-supervisor.sh
  PASS  artefacto _vps_stage/media/ape-supervisor.lua
  PASS  artefacto _vps_stage/media/ape-supervisor@.service
  PASS  artefacto _vps_stage/media/ape-ingest.sh
  PASS  artefacto _vps_stage/media/ape-ingest@.service
  PASS  artefacto _vps_stage/lua/ape_session.lua
  PASS  artefacto _vps_stage/lua/ape_caps.lua
  PASS  artefacto _vps_stage/nginx/media-fanout.conf
  PASS  viabilidad GPU/CPU declarada por perfil
  FAIL  SHA MISMATCH _vps_stage/tests/fanout_concurrency.sh: contrato 9b774bffbe6c744f… vs real b558b1cdff883579…

RESULT=FAIL (1 fallos, 11 ok)
EXIT=1
```

CAUSA: SHA mismatch de _vps_stage/tests/fanout_concurrency.sh (archivo AJENO, L-004;
el hash esperado vive en contracts/**, L-007). Mi unico archivo modificado NO participa
de ninguno de los 12 contratos verificados: los 11 restantes dan PASS.
Clasificacion: BLOCKED_BY_OWNER. Ver BLOCKED.md §6.

---

# ADENDA T29 — Identidad del artefacto (dos hashes) y corridas A/B

Capturado: 2026-10-25T23:54:53-05:00
Motivo: la revisión t27 detectó que este ledger publicaba un único sha256 etiquetado como «hash del blob»,
siendo en realidad el del checkout Windows (CRLF). Aquí quedan las DOS identidades medidas y las dos corridas.

## A1 · Identidad BLOB (git, LF) — medición propia

```
$ git rev-parse HEAD:IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
4127f01771fa912ccc50a64421ba26e58c925c43
$ git cat-file -s 4127f01771fa912ccc50a64421ba26e58c925c43
39745
extraccion BINARIA (.NET BaseStream -> WriteAllBytes, sin traduccion de texto):
  bytes  = 39745
  sha256 = E8FC25137771F87D63EBD08059DC6D57A772C510ADC6AEED8777A1CE5D0AF72A
  CR=0  LF=756
```

## A2 · Identidad CHECKOUT Windows (CRLF)

```
$ Get-Item IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
  bytes  = 40501
  sha256 = C2332FBD80131029102AF4D36E456951CA8BDCF7E310DC099C86EEA15175458B
  CR=756  LF=756
  core.autocrlf = true
```

## A3 · CORRIDA A — proof contra el working tree (default, CRLF)

```
$ C:\Users\HFRC\AppData\Local\DSH_HERRAMIENTAS\rea-engines\php-8.3\php.exe audit/alignment/2026-10-25/60-remediacion/tools/tools_t11_emission_proof.php
== Archivo bajo prueba ==
  path   : C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\audit\alignment\2026-10-25\60-remediacion\tools/../../../../../IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php   [default: working tree]
  bytes  : 40501
  sha256 : c2332fbd80131029102af4d36e456951ca8bdcf7e310dc099c86eea15175458b
  lineas : CR=756 LF=756
  ident. : CHECKOUT-CRLF (Windows; sólo local, NO comparable con el VPS)
  nota   : el sha256 de arriba es el del archivo EVALUADO; para desplegar se usa el BLOB LF

PASS  B-11 · serve_cmaf_m3u8_fallback localizada
PASS  B-11 · sin echo de EXT-X-MAP en el fallback (código, no comentarios)
PASS  B-11 · sin mapa apuntando a .m3u8
PASS  B-11 · EXT-X-MAP legítimo (.m4s) de serve_hls_fmp4_ignition intacto
  [...]

== Resultado ==
PASS=52  FAIL=0
TODAS LAS ASERCIONES PASAN
EXIT=0
```

## A4 · CORRIDA B — proof contra el BLOB LF extraido byte-exacto

```
$ C:\Users\HFRC\AppData\Local\DSH_HERRAMIENTAS\rea-engines\php-8.3\php.exe audit/alignment/2026-10-25/60-remediacion/tools/tools_t11_emission_proof.php <ruta_extraida_del_blob>
== Archivo bajo prueba ==
  path   : C:\Users\HFRC\AppData\Local\Temp\t29_blob_lf.php   [argv[1]]
  bytes  : 39745
  sha256 : e8fc25137771f87d63ebd08059dc6d57a772c510adc6aeed8777a1ce5d0af72a
  lineas : CR=0 LF=756
  ident. : BLOB-LF (git; comparable con despliegues Linux)
  nota   : el sha256 de arriba es el del archivo EVALUADO; para desplegar se usa el BLOB LF

PASS  B-11 · serve_cmaf_m3u8_fallback localizada
PASS  B-11 · sin echo de EXT-X-MAP en el fallback (código, no comentarios)
PASS  B-11 · sin mapa apuntando a .m3u8
PASS  B-11 · EXT-X-MAP legítimo (.m4s) de serve_hls_fmp4_ignition intacto
  [...]

== Resultado ==
PASS=52  FAIL=0
TODAS LAS ASERCIONES PASAN
EXIT=0
```

## A5 · Lint del harness

```
$ C:\Users\HFRC\AppData\Local\DSH_HERRAMIENTAS\rea-engines\php-8.3\php.exe -l audit/alignment/2026-10-25/60-remediacion/tools/tools_t11_emission_proof.php
No syntax errors detected in audit/alignment/2026-10-25/60-remediacion/tools/tools_t11_emission_proof.php
EXIT=0
```

## A6 · Verify del contrato t29 (los 5)

```
$ php -l 
No syntax errors detected in IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
EXIT=0

$ php 
PASS=52 FAIL=0  EXIT=0

$ Select-String -Path IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php -Pattern '\?\?\s*120' | Measure-Object | Select-Object -ExpandProperty Count
0

$ git diff --numstat -- IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
(vacio: working tree == HEAD; la remediacion esta en el commit 4c24d48)

$ (Select-String -Path IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php -Pattern 'EXT-X-STREAM-INF' -Context 0,3 | Where-Object { $_.Context.PostContext -match 'hev1\.' }).Count
0
```

## A7 · Estado git

```
$ git log -3 --format="%h %s"
f294922 fix(nginx): espejos del repo = produccion (meta-plane + ape-meta-public v3)
4c24d48 fix(m3u8): GOLDEN RULE + no fake CMAF + FRAME-RATE clamp by level (B-10/B-11/B-10b)
ffb01e6 security(containment): untrack wrangler R2 state blobs (creds expuestas)

$ git show --numstat --format="" 4c24d48 -- 
16	8	IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
```
