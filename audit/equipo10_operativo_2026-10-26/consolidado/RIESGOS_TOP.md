# RIESGOS TOP 10 — consolidado del Council (t11 / i3)

**Snapshot:** `git HEAD e38a89b` · **Coordenada de cada riesgo declarada en la columna `blob`** · **Autor del consolidado:** `s5-qoe-qos` (no-autor en 7 de 8 informes).
**Regla aplicada:** riesgo **medido** = hay una medición reproducible con `archivo:línea` sobre un blob identificado. **Hipótesis** = el efecto no fue medido (requiere dispositivo, bitstream, host o despliegue). Nunca se presenta una hipótesis como medición.
**Deduplicación:** un mismo defecto reportado por 2-3 especialistas aparece **una vez**, con las dimensiones de origen.

---

## 1. Top 10

| # | Riesgo | Sev | Dim | Evidencia (`archivo:línea`) | blob | ¿Medido? | Mitigación | Dueño propuesto |
|---|---|---|---|---|---|---|---|---|
| **R-01** | **Credenciales reales de proveedor e infraestructura versionadas en git** — 3 `PrivateKey` + 1 `PresharedKey` WireGuard + 1 basic-auth de chisel + **2.574** URLs Xtream con `user:pass` | **CRITICAL** | S10 | `backend/wg-surfshark.conf:8` · `backend/wg-surfshark-br.conf:8` · `net-shield/backups/…/wg0.conf.BASELINE:2,31` · `ape-uhdx-chisel.service:6` · `frontend/channels_map.json` (2.574) — §6, §8 | HEAD tree | **SÍ** (clasificación por longitud/charset, valores `***`) | Rotar las 4 claves + el `--auth`; purgar del índice; `*.conf` y `channels_map.json` a `.gitignore` (hoy `ignora_*.conf=False`, C16) | `s7-sre-secops` + propietario |
| **R-02** | **Auth fail-open en el endpoint de control** (`prisma-control.php`): sin `/dev/shm/prisma_key.txt` ⇒ `return true`; cualquier `Authorization: Bearer …` ⇒ `true` sin validar; CORS `*` | **CRITICAL** | S10 | `vps/prisma/api/prisma-control.php:32-39,43-51` — §7 fila 1 | HEAD tree | **SÍ** (lectura estática del gate) · **exposición = hipótesis** (no se probó contra el host) | Clave ausente ⇒ `503`, nunca `200`; validar Bearer con `ape_jwt_auth.php`; CORS acotado | `s7-sre-secops` |
| **R-03** | **Cifras QoE fabricadas en artefactos emitidos**: `MOS=4.8`, `PSNR=42`, `SSIM=0.99`, `VSTQ/VSMQ=50`, `REBUFFER=0`, `STARTUP=0`, TR 101 290 en cero + `X-Metrics-Endpoint` hacia dominio ajeno (`qos.edge-cdn.net`) | **CRITICAL** | S5 | HEAD `c1277bdf`: `:5949-5950,8624-8641,8918-8919,9248-9251,5754` — S5 §6.1 (9 filas) | HEAD `c1277bdf` | **SÍ** (constantes en el emisor; el nombre de la función dice `demo`) | Borrar los valores no medidos o renombrar a `-TARGET`/`-POLICY` (patrón que el repo ya usa bien con `X-QoE-Target-MOS`) | `s5-qoe-qos` — **validación: capitán** |
| **R-04** | **El `qoe_score` que mueve el lazo de decisión es un stub de 5 constantes** (90/70/50/40/25/75 por tipo de evento) y `ape_mesh` lo consume como «QoE REAL» → `riskScore = 100 − qoe_score` | **CRITICAL** | S5 | `vps/prisma/lib/conviva_qoe_server.php:168,210-236` · `vps/prisma/lib/ape_mesh.php:113-115,181` | HEAD tree | **SÍ** (código) · **impacto = hipótesis** (lazo inerte hoy: 0 filas) | Cerrar el stub o desacoplar `riskScore`; prohibir que una constante alimente un actuador | `s5-qoe-qos` — **validación: capitán** |
| **R-05** | **Valores tóxicos vivos en la tabla de defaults** (`Range`, `If-None-Match`, `If-Modified-Since`, `TE`, `Priority`, `Upgrade-Insecure-Requests`) que se usan como *fallback de valor* si un perfil vuelve a listar el header; `DNT` marcado tóxico pero emitido en 27 sitios | **HIGH** | S10 + S9 | `ape-profiles-config.js:4017,4018,4023,4024,4025,4040` (C12) · `:4406,5558,5564` · 72 emisiones vivas (C11) · 84 sitios en `APE_ALL_PROFILES_OPTIMIZED.json` | HEAD tree | **SÍ** (harness C11/C12/C13 + S9-11 + S10 §9) | Vaciar `DEFAULT_HEADER_VALUES`; test que falle si la lista emitida contiene cualquiera de los 7 (incluido `DNT` o sacarlo del mapa `TOXIC`) | `s9-player-compat` + `s7-sre-secops` |
| **R-06** | **F1 declara HEVC Main10 sin codec del probe**: `codec = probeData.videoCodec \|\| 'hvc1.2.4.L150.B0'` ⇒ un canal AVC con bitrate medido sale con `CODECS="hvc1…"` (clase FZ-01) | **HIGH** | S3 | `frontend/js/ape-v9/ape-fallback-resolver.js:238` (conf. `:93-102`) — S3 §S3.4 riesgo 1 | HEAD `228b8693` == WT `2275dc5f` (`git diff --numstat` 0/0 ⇒ byte-idénticos) | **SÍ** el defecto de código · **hipótesis** el init HEVC fallido (sin dispositivo/bitstream) | Quitar el default; sin `videoCodec` bajar a F3/F4 o no emitir `CODECS=` | `s3-codec-hdr` |
| **R-07** | **Catálogo M3U Plus con tags de Master y de Media mezclados** (`#EXT-X-SESSION-DATA`, `#EXT-X-TARGETDURATION:2`, `#EXT-X-PART-INF`, `#EXT-X-SERVER-CONTROL`) + `#EXT-X-VERSION:9` y `EXTINF:-1`: RFC 8216 §4.3.2 obliga al cliente a **fallar** la playlist entera | **HIGH** | S1 + S9 | HEAD `c1277bdf`: `:2646,2875-2883,2623,2675` (S1 F10/F11/F12, S9-05) | HEAD `c1277bdf` | **SÍ** (emisor + artefacto) · **hipótesis** qué player rechaza (sin ejecución en dispositivo) | Sacar los tags de media/master del catálogo; `VERSION:9→7`; dejar solo `#EXT-X-APE-*` | `s1-hls-architect` |
| **R-08** | **LL-HLS declarado sin implementación**: `CAN-BLOCK-RELOAD=YES` en la lista servida, `_HLS_msn`/`_HLS_part` con **1** ocurrencia en CODE (el bundle cliente hls.js) y `PART-HOLD-BACK` = 1×`PART-TARGET` (el repo mismo exige ≥3×) | **HIGH** | S2 | `_raw_census_vigente.txt:97,99` (censo de tercero) · `vps/nginx/lua/ape_rebase_lib.lua:76-87` · `backend/cmaf_engine/modules/manifest_repair_engine.php:390-410` (F03/F07/F08/F21) | HEAD tree + censo ajeno | **SÍ** la declaración · **hipótesis** el daño (requiere origen LL-HLS vivo) | Retirar `CAN-BLOCK-RELOAD` de todo artefacto sin handler; unificar `PART-HOLD-BACK` a 3× | `s2-llhls-cmaf` |
| **R-09** | **LEVER B apagado por hardcode**: `local CHINA_BOX_FAKE_4K = true` ⇒ el guard nunca aplica y `rewrite_variant_to_4k` declara `hvc1.2.4.L153.B0` + `RESOLUTION=3840x2160` sobre bytes AVC en P2–P5 | **HIGH** | S4 | `vps/nginx/lua/combined_body_filter.lua:335,337-343` · `vps/nginx/lua/ape_virtual_4k.lua:14-26` — S4.3 | HEAD tree | **SÍ** en el repo · **estado en producción = NOT_RUN** (`/shield/` responde 404; pipeline Crystal aspiracional) | Acta del propietario sobre `CHINA_BOX_FAKE_4K` o corregir `CLAUDE.md`; una sola fuente de verdad | `s3-codec-hdr` + propietario |
| **R-10** | **Operación 365 días sin red de seguridad**: 0 canales de alerta, 0 renovación TLS versionada, 0 liveness de watchdogs, 4 auto-restarters sin límite (uno reinicia nginx con config inválida por precedencia `A && B \|\| C`), auto-bucle `netshield-watchdog` ~125 s | **HIGH** (repo) / **BLOCKED** (operación) | S7 | `vps/sentinel/ape-sentinel-vps.sh:96-102,130-133,69-90` · `netshield-watchdog.service:7,9,11,12` · `_vps_stage/watchdog/ape-meta-watchdog.sh:35-45` — §3/§4/§5 | HEAD tree | **SÍ** (estático, cadencias por constantes del propio código) · **ejecución = NOT_RUN** | `StartLimit*` a `[Unit]`; `sd_notify` o quitar `WatchdogSec`; 1 canal `OnFailure=`; `certbot renew` versionado; `flock`+`trap`; `nginx -t` con `if` real | `s7-sre-secops` |

---

## 2. Fuera del top-10 pero CRITICAL **si se despliega** (hoy no desplegado ⇒ no es riesgo vivo)

| Riesgo | Sev | Dim | Evidencia | Por qué no entra al top-10 |
|---|---|---|---|---|
| `wg0.conf` del repo **no es desplegable** (2 directivas `PostUp`/`PostDown` concatenadas en una línea; 2.818 B vs 1.824 B del VPS medido) → `wg-quick up wg0` fallaría | CRITICAL | S8 | `net-shield/wireguard/AUDIT_2026-04-21/wg0.conf:24,33` (S8-09) | El archivo **no es el desplegado**; el riesgo se materializa solo al desplegar desde el repo |
| **MTU anidado sin margen**: `.conf` reales 1.380 (wg0) + 1.280 (wg-surfshark) ⇒ 1.440 > 1.280 = PMTU black hole; el hook `1340/1420` no tiene unidad que lo instale | CRITICAL | S8 | `vps/network/wg-mtu-tuning.if-up:7-9` (S8-07) | Requiere que el túnel SurfShark exista: **no consta desplegado** (S8-15) |
| **«3 túneles» no es el estado medido**: `wg show all dump` solo lista `wg0`; egreso directo `via 172.31.1.1 dev eth0` | CRITICAL | S8 | `state-snapshot.txt:9,17-23,29-31,91-100` (S8-15) | Es una corrección de doctrina, no un riesgo operativo nuevo |
| **VPS PHP emite `#EXTM3U` después de `#EXTVLCOPT`/`#KODIPROP`** y sirve un **MPD como HLS** con `Content-Type` de HLS | HIGH | S9 | `vps/ape_hls_generators.php:585-592,706-721,508-524` (S9-06/S9-07) | `vps/**` es repo aspiracional: `NOT_DEPLOYED` |
| **Zonas `limit_conn`/`limit_req` colgantes** (`xtream_slot`, `hard_cap`) ⇒ el SSOT no pasaría `nginx -t` aislado | HIGH (reproducibilidad) | S6 | `shield-location.conf:41,44` vs `conf.d/prisma-public-api-zone.conf:18` | Defecto de reproducibilidad del repo, no de producción |

---

## 3. Riesgos DESCARTADOS o REBAJADOS por medición (para no inflar)

| Afirmación previa | Medición que la rebaja | Fuente |
|---|---|---|
| «El repo **no** es la fuente de lo desplegado: 2 de 3 fases divergen 3,66×/1,64×» | **HEAD es byte-idéntico a producción** en `ape_header.lua` (2.210 B, `a15e1fe3…`) y `ape_uri_rebase.lua` (6.043 B, `1d456a46…`). La divergencia es del **WT** (8.088 / 9.930 B) | CONSOLIDADO H02-H03 (sha256 de blobs congelados vs `VPS_REALITY_MEASURED:80-81`) |
| «`ape-container=fmp4-cmaf`/CMAF falsos» | **0 emisiones** del atributo: no hay mentira CMAF *porque no hay declaración* | S2 F12 (regla cierta, letra muerta) |
| «Bucle de nginx cada 20 min reintroducido por el repo» | El bucle **no está en el repo** (0 archivos `cache-health-monitor`); hay 4 mecanismos equivalentes sin backoff | S7 §4 |
| «Telemetría Conviva activa alimentando el LAB» | Ningún productor QoE desplegado; `conviva.db` medido = 0 B/0 tablas **y** el path medido ≠ path del productor | S5 §1/S5-14 |

---

## 4. Regla de lectura

1. **Severidad ≠ probabilidad.** R-01/R-02 son CRITICAL de *contenido*: el material está en git hoy, la explotabilidad no se probó (prohibido atacar).
2. **S5 tiene autoría conflictiva.** R-03 y R-04 los firma el autor del capítulo: valen como **declaración pendiente de validación** del capitán o de `t12`, no como veredicto del Council.
3. **Ningún riesgo de este documento se apoya en el WT vivo** (`11.594 L`, `c1301f1f`, mutando): donde el informe citaba el WT, se indica en la columna `blob`.
4. **Cuenta de severidades** (solo dimensiones donde el autor la declara: S5, S8, S9): **CRITICAL 5 · HIGH 22 · MEDIUM 18 · LOW 4 · INFO 2 = 51**.
