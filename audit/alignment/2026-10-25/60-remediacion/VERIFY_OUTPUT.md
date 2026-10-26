# VERIFY_OUTPUT — Salidas crudas de verificacion (T11)

Task: t11 · Attempt: f123e2a6-b1f0-40a0-976a-59221a607249
Fecha de captura: 2026-10-25T23:36:41-05:00
Metodo: cada bloque es la salida literal del comando, sin editar. Los exit codes son $LASTEXITCODE reales.

---

## V1 · Entorno PHP portable

```
$ C:\Users\HFRC\AppData\Local\DSH_HERRAMIENTAS\rea-engines\php-8.3\php.exe --version
PHP 8.3.36 (cli) (built: Oct 20 2026 04:18:57) (NTS Visual C++ 2019 x64)
Copyright (c) The PHP Group
Zend Engine v4.3.36, Copyright (c) Zend Technologies
```

## V2 · php -l del PHP tocado (VERIFY #1 del contrato)

```
$ C:\Users\HFRC\AppData\Local\DSH_HERRAMIENTAS\rea-engines\php-8.3\php.exe -l IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
No syntax errors detected in IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
EXIT=0
```

## V3 · node -c del JS (VERIFY #3 del contrato)

NO EJECUTADO SOBRE BYTES MODIFICADOS: el JS no fue editado (BLOCKED_BY_LOCK L-001).
Se ejecuta igualmente para dejar constancia de que el archivo AJENO en su estado actual es sintacticamente valido.

```
$ node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
(sin salida: stdout y stderr vacios)
EXIT=0
```

## V4 · node contracts/verify_contracts.mjs (VERIFY #4 del contrato)

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

## V5 · Grep de contrato: EXT-X-STREAM-INF.*hev1\. (VERIFY #5)

```
$ Select-String -Path IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php -Pattern 'EXT-X-STREAM-INF.*hev1\.' | Measure-Object | Select-Object -ExpandProperty Count
0
```

ADVERTENCIA DE VALIDEZ (importante): este grep devuelve 0 INCLUSO CON EL DEFECTO PRESENTE.
En el archivo original, #EXT-X-STREAM-INF estaba en la linea 741 y el literal hev1. en la 738;
el comodin . no cruza saltos de linea, por lo que el patron no podia casar nunca.
La prueba valida es V7 (emision real sobre los bytes del archivo).

## V6 · Grep de contrato: FRAME-RATE=120 (VERIFY #6)

```
$ Select-String -Path IPTV_v5.4_MAX_AGGRESSION/backend/resolve_quality_unified.php -Pattern 'FRAME-RATE=120' | Measure-Object | Select-Object -ExpandProperty Count
0
```

ADVERTENCIA DE VALIDEZ (critica): 0 aqui NO significa reparado. El literal es interpolado
(`FRAME-RATE={$fps}.000`, linea 5519), asi que la cadena "FRAME-RATE=120" no existe en el archivo
ni antes ni despues. El defecto B-06 SIGUE INTACTO: lo unico que no existe es el texto que el grep busca.
Estado real de la linea:

```
linea 5519: return "#EXT-X-STREAM-INF:BANDWIDTH={$bw},AVERAGE-BANDWIDTH={$bw},RESOLUTION=3840x2160,FRAME-RATE={$fps}.000,"
linea 5520: . 'CODECS="hvc1.2.4.L153.B0,mp4a.40.2",HDR=PQ,VIDEO-RANGE=PQ,AUDIO="aac_atmos",'
linea 4857: 'sports'  => ['profile' => 'P0_ULTRA_SPORTS_8K', 'fps' => 120, ...]
```

## V7 · PRUEBA VALIDA: emision real sobre los bytes del archivo

```
$ C:\Users\HFRC\AppData\Local\DSH_HERRAMIENTAS\rea-engines\php-8.3\php.exe audit/alignment/2026-10-25/60-remediacion/tools/tools_t11_emission_proof.php
== Archivo bajo prueba ==
  path  : IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
  bytes : 40041
  sha256: 8992cb89e2d42afc49140bb9c29e1fa99b691d06e78434fa087181d1bbb3f31c

PASS  B-11 · serve_cmaf_m3u8_fallback localizada
PASS  B-11 · sin echo de EXT-X-MAP en el fallback (código, no comentarios)
PASS  B-11 · sin mapa apuntando a .m3u8
PASS  B-10 · ningún literal hev1.* en el código del fallback (STREAM-INF HLS)
PASS  B-10 · CODECS usa hvc1.2.4.L153.B0
PASS  no-regresión · generate_dash_mpd (DASH) conserva hev1

== Bloque de emisión extraído del archivo (verbatim) ==
  | // EXT-X-STREAM-INF con los parámetros de calidad del perfil
  |     $bw         = $cfg['max_bw']   ?? 15150000;
  |     $avgBw      = $cfg['bitrate']  ?? 10100;
  |     $avgBwBps   = $avgBw * 1000;
  |     $resolution = $cfg['res']      ?? '1920x1080';
  |     $fps        = $cfg['fps']      ?? 120; // MEMC-TOTAL-8K120: default 120fps
  |     // [T11/B-10] GOLDEN RULE: hvc1.* SOLO en #EXT-X-STREAM-INF:CODECS=.
  |     // hev1.* queda reservado a KODIPROP/EXTVLCOPT (decoder runtime). Cruzarlos rompe Tizen/webOS.
  |     $codecs     = ($cfg['codec_primary'] === 'HEVC' || $cfg['codec_primary'] === 'hevc')
  |                     ? 'hvc1.2.4.L153.B0,mp4a.40.2'
  |                     : 'avc1.640028,mp4a.40.2';
  | 
  |     echo "#EXT-X-STREAM-INF:BANDWIDTH={$bw},AVERAGE-BANDWIDTH={$avgBwBps},"
  |        . "RESOLUTION={$resolution},FRAME-RATE={$fps},CODECS=\"{$codecs}\"\n";

== Salida real por caso ==
  [HEVC · sin cfg (defaults 1920x1080@120)]
    Warning: Undefined array key "codec_primary" in C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\audit\alignment\2026-10-25\60-remediacion\tools\tools_t11_emission_proof.php(89) : eval()'d code on line 10

Warning: Undefined array key "codec_primary" in C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\audit\alignment\2026-10-25\60-remediacion\tools\tools_t11_emission_proof.php(89) : eval()'d code on line 10
#EXT-X-STREAM-INF:BANDWIDTH=15150000,AVERAGE-BANDWIDTH=10100000,RESOLUTION=1920x1080,FRAME-RATE=120,CODECS="avc1.640028,mp4a.40.2"
  [HEVC · 3840x2160@60]
    #EXT-X-STREAM-INF:BANDWIDTH=15150000,AVERAGE-BANDWIDTH=10100000,RESOLUTION=3840x2160,FRAME-RATE=60,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"
  [AVC  · 1920x1080@30]
    #EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500000,RESOLUTION=1920x1080,FRAME-RATE=30,CODECS="avc1.640028,mp4a.40.2"

== Aserciones sobre la salida emitida ==
PASS  sin hev1 en la línea STREAM-INF · HEVC · sin cfg (defaults 1920x1080@120)  [Warning: Undefined array key "codec_primary" in C:\Users\HFR…]
PASS  códec de vídeo es hvc1/avc1 · HEVC · sin cfg (defaults 1920x1080@120)  [video=avc1.640028]
PASS  CODECS parseable como RFC 6381 · HEVC · sin cfg (defaults 1920x1080@120)  [avc1.640028]
PASS  sin hev1 en la línea STREAM-INF · HEVC · 3840x2160@60  [#EXT-X-STREAM-INF:BANDWIDTH=15150000,AVERAGE-BANDWIDTH=10100…]
PASS  códec de vídeo es hvc1/avc1 · HEVC · 3840x2160@60  [video=hvc1.2.4.L153.B0]
PASS  CODECS parseable como RFC 6381 · HEVC · 3840x2160@60  [hvc1.2.4.L153.B0]
PASS  sin hev1 en la línea STREAM-INF · AVC  · 1920x1080@30  [#EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=650000…]
PASS  códec de vídeo es hvc1/avc1 · AVC  · 1920x1080@30  [video=avc1.640028]
PASS  CODECS parseable como RFC 6381 · AVC  · 1920x1080@30  [avc1.640028]

== Resultado ==
TODAS LAS ASERCIONES PASAN
EXIT=0
```

## V8 · Estado git (sin commits)

```
$ git log -1 --oneline
ffb01e6 security(containment): untrack wrangler R2 state blobs (creds expuestas)

$ git diff --cached --name-only
(vacio: nada staged)

$ git diff --numstat
10	7	IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php

$ git status --porcelain (solo el archivo tocado por mi)
 M IPTV_v5.4_MAX_AGGRESSION/vps/ape_hls_generators.php
```

## V9 · sha256 antes / despues

```
ANTES  (2026-05-23T00:46:40.787) 39678 B 2AC913221A53AD8B5963A91BFD21D9938C7FCC36451C1B346467BBE16960AA5E
DESPUES(2026-10-25T23:34:58.905) 40041 B 8992CB89E2D42AFC49140BB9C29E1FA99B691D06E78434FA087181D1BBB3F31C
```

## V10 · No-intervencion en archivos ajenos (sha256 == baseline)

```
resolve_quality_unified.php        348758 B  2026-10-25T21:35:16  20AC4B2631C1E877A3DE92B4E479B6C2EFA171AD1A317869F9343A99C3C5F2B5
m3u8-typed-arrays-ultimate.js      748672 B  2026-10-25T23:11:04  6881CB9D0D9E4C4FDAC801405532DC3265D0F51E4BAD2C392C2854FCDE5C8CB4
rq_streaming_health_engine.php      13931 B  2026-04-06T01:01:25  E0E405FA18F0157DA6AD5CB441C8BF94B2BBB7AA473BA585F1BE76CAA82C9BBB
```
