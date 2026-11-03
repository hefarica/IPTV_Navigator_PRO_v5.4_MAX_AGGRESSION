# t35 · Cierre del harness de fixtures (403 private_range_blocked) + re-medición

**Tarea:** `t35` · **attempt:** `859191c8-29f8-4cd4-a3f9-112c0f2e5995` · **Autor:** `s6-nginx-lua` (S6)
**STAMP:** `20261028T094903Z` · **Fecha:** 2026-10-28T04:49-05:00 · **HEAD:** `2f8861c`
**Vía elegida:** **(c) — arreglo SOLO del arnés**, sin tocar nginx, sin tocar el gateway, sin tocar la allowlist.
**Despliegue:** **ninguno**. `nginx -t` remoto = **exit 0**; `NRestarts = 0`; `MainPID 3801145` (nunca se recargó).

---

## 1 · Por qué (c) y no (a) ni (b) — decidido por medición

El guard SSRF de `ape_gateway.lua` bloquea rangos privados; la captura pedía `/cdn/127.0.0.1:8088/__fixture_master4k.m3u8` ⇒ 403. Tres medidas decidieron la vía:

| # | Medición (read-only, en el VPS) | Resultado | Consecuencia |
|---|---|---|---|
| M1 | `curl 'http://127.0.0.1:8088/cdn/127.0.0.1:8088/__fixture_master4k.m3u8'` | **403** `{"error":"private_range_blocked"}` | confirma el diagnóstico de t31; el guard está sano |
| M2 | `curl 'http://<IP-PÚBLICA>:8088/__fixture_master4k.m3u8'` (directo) | **200** | el VPS se alcanza a sí mismo por su IP pública (`ss -ltn` → `0.0.0.0:8088`) |
| M3 | `curl 'http://127.0.0.1:8088/cdn/<IP-PÚBLICA>:8088/__fixture_master4k.m3u8'` | **200** | **una IP pública literal pasa el guard** (no es rango privado) y `/cdn/` ejerce el pipeline real |
| M4 | desde la estación: `curl http://178.156.147.234:8088/…` | **000** | **:8088 no es alcanzable desde Internet** ⇒ no se abre nada nuevo |

**Decisión:** cambiar el **host que el arnés le pasa a `/cdn/`** a la IP pública del propio VPS (hairpin), descubierta en runtime. Ventajas frente a (a)/(b):
- **(a)** exigía añadir `location __fixture*` en el 443 + entrada en `/etc/nginx/ape-hosts-allow.txt` ⇒ **2 ficheros desplegados + reload** y una dependencia de DNS que hoy no existe en la allowlist.
- **(b)** exigía tocar `_vps_stage/lua/ape_gateway.lua` (fuera del alcance declarado de t35) y redesplegar el módulo que sirve producción: mayor radio de impacto para el mismo resultado.
- **(c)** no cambia **ni un byte** de nginx ni del gateway: el guard queda **idéntico**, y el arnés pasa a usar la misma regla que ya usan los proveedores (IP literal pública permitida).

## 2 · Diff aplicado (3 cambios, todos en `_vps_stage/edge/uhd/**`)

| Fichero | Antes → Después (sha256 12) | Cambio |
|---|---|---|
| `capture_uhd.mjs` | `94a5d195a052` → **`ee2a85203e3c`** (400 L) | (i) `--cdn-host` + descubrimiento de la IP pública en el VPS; (ii) los 2 `curl` de `SRV_*` usan `$CDN_HOST:8088`; (iii) `--promote` para `latest.json` |
| `uhd_doctrine_guard.mjs` | `b18d4781637a` → **`6d3fdf21df74`** (474 L) | (iv) **S7 deja de ser un sabotaje falso** (ver §3) |
| `cases/latest.json` | `b86a4bce7de9` → **`b86a4bce7de9`** | restaurado byte-exacto (ver §3) |

Núcleo del cambio en el arnés:

```diff
-echo "SRV_HDR_B64|${f.id}|$(curl ... 'http://127.0.0.1:8088/cdn/127.0.0.1:8088${f.fixture}' ...)"
-echo "SRV_B64|${f.id}|$(curl ... 'http://127.0.0.1:8088/cdn/127.0.0.1:8088${f.fixture}' ...)"
+CDN_HOST='${CDN_HOST}'                       # vacío ⇒ se descubre con `ip -4 -o addr show scope global`
+if [ -z "$CDN_HOST" ]; then CDN_HOST=$(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1 | head -n1); fi
+if [ -z "$CDN_HOST" ]; then echo "FATAL|cdn_host_vacio"; exit 3; fi   # falla ruidoso, nunca cuerpo vacío
+echo "META|cdn_host=$CDN_HOST"
+echo "META|cdn_mode=hairpin_public_ip:8088"
+echo "SRV_HDR_B64|${f.id}|$(curl ... "http://127.0.0.1:8088/cdn/$CDN_HOST:8088${f.fixture}" ...)"
+echo "SRV_B64|${f.id}|$(curl ... "http://127.0.0.1:8088/cdn/$CDN_HOST:8088${f.fixture}" ...)"
```

Sin IP hardcodeada (doctrina no-hardcode): se descubre en el VPS; `--cdn-host <ip>` permite forzarla para reproducir.

## 3 · Efecto colateral que YO causé, y cómo lo cerré (declarado, no oculto)

La primera corrida de la captura **promovió `latest.json`** (`b86a4bce7de9` → `00bb5e23cb57`) porque `capture_uhd.mjs:363` lo escribía incondicionalmente. Consecuencia: el `--selftest` bajó a **7/8** con `S7_8k_con_L153 … NO DETECTADO`.

Causa raíz (no era mi cambio de host): **S7 nunca fue un sabotaje**. Era

```js
p.served_body.replace("hvc1.2.4.L153.B0", "hvc1.2.4.L153.B0")   // no-op
```

que sólo «acertaba» mientras la captura base fuese la **pre-fix** (que ya declaraba `7680x4320` por el bug E5-F4). Al promoverse una captura post-fix, el control se apagaba en silencio. Tres arreglos:

1. `latest.json` **restaurado byte-exacto** desde `cases/20261026T204116Z.json` (`b86a4bce7de9`): el registro E5/t31 queda intacto.
2. `--promote` en el arnés: una captura **nuevo ya no pisa** el insumo por defecto del guard. Promoverlo es decisión explícita de quien certifica.
3. **S7 ahora sí sabotea**: `replace(/RESOLUTION=\d+x\d+/, "RESOLUTION=7680x4320")` ⇒ fuerza 8K sobre un cuerpo con L153 y exige que UHD-09 muerda, **con cualquier captura base**.

**Prueba de que el arreglo no es cosmético:** `--selftest --cases <captura-post>` → **8/8 exit 0** (S7 muerde sobre una captura que **no** tiene 8K).

## 4 · Comandos y exits reales

| Comando | Exit | Salida |
|---|---|---|
| `node _vps_stage/edge/uhd/capture_uhd.mjs --label t35-post --public-probes` | **0** | `pares=4 filas_lua=20 sondas=2` · `cdn_host=178.156.147.234` · `cdn_mode=hairpin_public_ip:8088` |
| `node …/uhd_doctrine_guard.mjs --cases …/cases/20261028T094903Z.json` | **0** | `VEREDICTO: PASS_WITH_DECLARED_RISK blocker=0 high=3 info=1` · **UHD-09 ok en los 4 pares** |
| `node …/uhd_doctrine_guard.mjs --selftest` | **0** | `SELFTEST: PASS (8/8)` |
| `node …/uhd_doctrine_guard.mjs --selftest --cases <post>` | **0** | `PASS (8/8)` — S7 independiente de la base |
| `node …/uhd_doctrine_guard.mjs` (default = `latest.json` pre-fix) | **1** | `FAIL blocker=1 high=2` — **esperado**: ese fichero ES el registro pre-fix de E5/t31 |
| `ssh … 'cd /etc/nginx/lua && lua5.1 -'` (4 casos L153/L183) | **0** | tabla de §5.3 |
| `ssh … 'nginx -t'` | **0** | `syntax is ok` / `test is successful` · `NRestarts=0`, `MainPID 3801145` |

## 5 · Re-medición

### 5.1 ¿El camino 4K cambió? (byte a byte, normalizando origen y marcador)

| Fixture | `X-APE-UHD` pre → post | Bytes | Normalizado |
|---|---|---|---|
| `master_1080_avc` | `4k:1` → `4k:1` | 454 → 488 | **IDÉNTICO** |
| `media_hybrid_stream_inf` | `4k:1` → `4k:1` | 352 → 397 | **IDÉNTICO** |
| `media_ll_parts` | `off` → `off` | 616 → 658 | **IDÉNTICO** |
| `master_4k_hevc` | **`8k:1` → `4k:1`** | 483 → 517 | difiere **sólo** en `RESOLUTION` (el fix) |

Las diferencias de bytes son de dos clases, ambas esperadas: (1) el **origen rebasado** (`127.0.0.1:8088` → `178.156.147.234:8088`) porque el fixture ahora se pide por la IP pública — artefacto del *camino de medida*, no del producto; (2) el **marcador** gana `src=`/`can8k=` (diseño de t29). Normalizando ambas cosas, **el camino 4K es byte-idéntico**.

El único cambio real de contenido, en `master_4k_hevc`:

```
pre : #EXT-X-STREAM-INF:BANDWIDTH=28000000,AVERAGE-BANDWIDTH=22000000,RESOLUTION=7680x4320,FRAME-RATE=60.000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ
post: #EXT-X-STREAM-INF:BANDWIDTH=28000000,AVERAGE-BANDWIDTH=22000000,RESOLUTION=3840x2160,FRAME-RATE=60.000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2",VIDEO-RANGE=PQ
```

`BANDWIDTH`, `AVERAGE-BANDWIDTH`, `FRAME-RATE`, `CODECS` y `VIDEO-RANGE=PQ`: **intactos**. Sólo cambia `RESOLUTION`.

### 5.2 Marcadores en el cable (post)

| Fixture | `#EXT-X-APE-UPSCALE` |
|---|---|
| `master_1080_avc` | `declared=3840x2160;codec=truthful;mode=4k;src=1920x1080;can8k=0` |
| `master_4k_hevc` | `declared=3840x2160;codec=truthful;mode=4k;src=3840x2160;can8k=0` |
| `media_hybrid_stream_inf` | `declared=3840x2160;codec=truthful;mode=4k;src=1280x720;can8k=0` |

### 5.3 Las 4 transiciones pedidas (módulo **desplegado**, `lua5.1` por stdin, read-only)

| Caso (fuente) | `allow_8k=1` | mode | can8k | RESOLUTION top | Marcador |
|---|---|---|---|---|---|
| **4K L153** | 1 | `4k` | false | `3840x2160` | `…;src=3840x2160;can8k=0` |
| **4K L183** | 1 | **`8k`** | **true** | `7680x4320` | `declared=7680x4320;codec=truthful;mode=8k;src=3840x2160;can8k=1` |
| **8K L153** | 1 | `4k` | false | `3840x2160` | `…;can8k=0` |
| **8K L183** | 1 | **`8k`** | **true** | `7680x4320` | `…;src=7680x4320;can8k=1` |

En la matriz del arnés (`declare_auto` **sin** `allow_8k`, i.e. default `uhd8k=0`): `M2_master4k` → `4k`, `M3_8k_L153` → `4k`, `M4_8k_L183` → `4k`, `M7_media` → `mode=nil` (no toca media playlists). Coherente con A LOCKED.

## 6 · El guard SSRF sigue cerrado (sondas públicas desde la estación)

| Sonda | Antes (t31) | Ahora | Lectura |
|---|---|---|---|
| `https://<público>/cdn/127.0.0.1:8088/__fixture_master4k.m3u8` | 403 | **403** (`text/html`) | un cliente público **no** puede SSRFear a loopback |
| `https://<público>/cdn/127.0.0.1:8088/nope.ts` | 403 | **403** | idem (antes de t29 devolvía el 404 del gateway) |

Y desde loopback el mismo intento devuelve el JSON del guard: `{"error":"private_range_blocked",…}`. **No se relajó ninguna regla**: el cambio es del cliente que pide, no del servidor que decide.

## 7 · Rollback (documentado, no ejecutado)

| Pieza | Cómo se revierte |
|---|---|
| `capture_uhd.mjs` | `git checkout -- _vps_stage/edge/uhd/capture_uhd.mjs` (o borrar las 3 adiciones marcadas `[t35]`); la vía antigua vuelve a dar 403 |
| `uhd_doctrine_guard.mjs` | `git checkout -- _vps_stage/edge/uhd/uhd_doctrine_guard.mjs` — **ojo**: volvería el S7 no-op (control falso) |
| `cases/latest.json` | copiar de nuevo `cases/20261026T204116Z.json` (idéntico, `b86a4bce7de9`) |
| nginx / gateway / allowlist | **nada que revertir**: no se tocaron |

## 8 · Límites y hallazgos para la puerta (NOT_RUN / abiertos)

1. **No hay ningún NOT_RUN que afecte a los gates**: las 4 transiciones, la captura y el selftest se ejecutaron de verdad. Lo único no medido es el **comportamiento en un decoder real** (sigue fuera del VPS, por diseño).
2. **`UHD-04` (high) ahora reporta «marca sin cambio» en `master_4k_hevc`**: el marcador dice `declared=3840x2160` cuando la fuente **ya era** 4K. Es cosmético pero conviene decidir si el marcador debe emitirse cuando no hay cambio de resolución.
3. **`UHD-10/11` (high, latente) siguen rojos**: la matriz llama `declare(8K)` por fuera del gateway; `declare()` no tiene guarda propia. Es la contraparte de t32 (allí se cerró la **rama del gateway**). Si se quiere cerrar también la función, es otra tarea.
4. **`M5_ascendente` sigue declarando `3840x2160` en DOS variantes** (E5-F7 abierto): `max_resolution` decide la guarda, pero `declare` actúa sólo sobre la primera variante del documento.
5. `nginx -T` sha pasó de `ddf6a267…` (captura 2026-10-26) a `255425a9…`: es el **deploy de t31**, no este trabajo — t35 no cambió ni un byte de `/etc/nginx`.
