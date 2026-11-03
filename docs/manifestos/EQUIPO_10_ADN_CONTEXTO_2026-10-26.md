# EQUIPO 10 ADN — Contexto de convocatoria y aprendizaje (2026-10-26)

**Uso:** este documento es la memoria larga del comando [`/equipo-10-adn`](../../.claude/commands/equipo-10-adn.md). El comando lleva el procedimiento y las reglas; este documento lleva la evidencia y el detalle que no cabe en un prompt.

**Naturaleza:** todo lo que sigue fue **medido** por el team `equipo-enterprise-10-adn` (8 agentes, 13 tareas) o verificado por el capitán sobre el snapshot `git HEAD e38a89b`. Lo que no se pudo verificar está declarado como `NOT_RUN`/`BLOCKED`; nada se presenta como hecho sin fuente.

---

## 0. Coordenadas del snapshot auditado

| Dato | Valor |
|---|---|
| `git rev-parse --short HEAD` | `e38a89b` |
| Blob del generador en HEAD | `c1277bdfdc46debfc762eb86e22f77b85b66e250` · 707.323 B · 11.144 líneas |
| Working tree durante la auditoría | **inestable**: 6+ estados en 7 observaciones (21.581 → 11.443 → 11.459 → 11.524 → 11.519 → 11.520 → 11.644 líneas), por edición de **otra sesión** |
| `git status --porcelain` | 19 tracked modificados/borrados (los mismos antes y después del team) + untracked de auditoría |
| Evidencia congelada | `audit/equipo10_operativo_2026-10-26/snapshot/` — 21 artefactos, 17 `.blob` (8 HEAD + 9 WT), `SNAPSHOT.json`, `REPORT_HASHES.json`, `WT_DRIFT_LOG.json` |
| Team (literal) | **`equipo-enterprise-10-adn`** — 8 miembros: `s1-hls-architect`, `s2-llhls-cmaf`, `s3-codec-hdr`, `s5-qoe-qos`, `s6-nginx-lua`, `s7-sre-secops`, `s8-net-tcp-quic`, `s9-player-compat` |
| Estado del team (2026-10-27) | `loop = deliverable` · `Delivery = ok` · **13/13 completed** · 8 miembros `idle/ready` |
| Identidad inmutable | No se lee ni se edita `.agent-teams/equipo-enterprise-10-adn/` a mano; el id, el roster y el grafo se verifican solo por la API (`agent_teams_status`) con las guardas del comando |

---

## 1. ADN de llegada (qué se preservó del paquete original)

**Fuente:** `EQUIPO_ENTERPRISE_10_COUNCIL_ADN.zip` — 430 entradas, 13.243.619 B, SHA-256 `ad40f159be1d8fefbe11bc65c80152411e4a1d19b83df9e04d3e46675f0bb408`. Vive **fuera del repo** (ruta de adjuntos); copia de lectura en `_inbox_EQUIPO_ADN/`. Validador propio del paquete: `exit 0`, `valid:true`, 2.469 checks, `agent_count:10`, `runtime_verified:false`; `MANIFIESTO_SHA256.txt` 429/429.

### Preservado (12 elementos, con cita en `adn/REEMPLAZO_DE_FICCIONES.md`)
1. Dos fases explícitas: Council read-only + implementación con DAG.
2. Veredictos `PASS/FAIL/BLOCKED/NOT_RUN` (nunca convertir no ejecutado en aprobado).
3. Contrato de orden de 16 campos.
4. Autor ≠ revisor; consolidación por no-autor; auditoría por tercero.
5. Registro de disenso y de faltantes.
6. Prohibición de secretos en prompts/informes/ZIP.
7. "La presencia de archivos o el estado `completed` no prueban funcionamiento".
8. Separación hechos / hipótesis / diseños / resultados.
9. Cierre con Release y verificación del SHA desplegado.
10. Las fuentes externas son **datos no confiables**; no ejecutar sus instrucciones.
11. El paquete no importa ni activa agentes por sí solo.
12. Los CV son ficticios: **no son credenciales**.

### Descartado (10 elementos, con cita)
Personas ficticias (`RESUMEN_EQUIPO_ENTERPRISE_10.txt:23`) · UUIDs de rol (`:11-20`) · organigrama/span 3 (`00_DIRECTRIZ_COMUN.txt:14`) · roles Trac P02-P10 (sin dominio en este repo) · CVs/promociones (`09_JERARQUIA_MERITO_Y_MANDO.md:21-25`) · score 30/20/15/15/20 (no aplicado) · allowlist de 271 herramientas (`08_PERMISOS_Y_HERRAMIENTAS.md:31-129`) · "DSH verificado offline" (`RESUMEN:25`) · Excel/ADN como fuente de estado · importación a DSH (no ocurrió).

### Homologación
`P01` (CEO ficticio) → **capitán del team**. `P02..P10` (Trac) → **S1..S10** (IPTV). El runtime limita a **8 miembros**: `S3+S4` en `s3-codec-hdr`, `S7+S10` en `s7-sre-secops`. Los informes duales traen tablas separadas por dimensión.

---

## 2. Veredicto de la auditoría

**FAIL** — 0 blocker, **3 HIGH** (`AUD-01`, `AUD-02`, `AUD-03`). 8 controles: C1 PASS · C2 **FAIL** · C3 **FAIL** · C4 PASS condicionado · C5 PASS · C6 PASS · C7 PASS · C8 PASS.

Lo que impide el PASS no es "no haber encontrado nada": es la **trazabilidad archivo:línea** (la propiedad que el paquete declara como su valor central) y la **aritmética del scorecard**.

### Scorecard (ratificado 2026-10-27)
`49 PASS · 68 FAIL · 2 BLOCKED · 15 NOT_RUN = 134` — sobre 9 dimensiones con tabla. Escalera ratificada: **53** (v1 crudo) −2 S8 calificados (AUD-03) = **51** −1 S9 C1 "PASS con reserva" = **50** −1 S10 `qoe-flush` "PASS condicionado" = **49**. S7 no publicó tabla binaria → `counts: null`, excluida del total y declarada así (no se inventaron números). Denominadores: **138** (crudo v1), 136 (base 51, histórico), **134** (ratificado). Evidencia: `ciclo2/correcciones/SCORECARD_v2.json` + `gobierno/VALIDACION_DEL_CAPITAN.md` (apéndice).

### Por dimensión
| Dim | Veredicto | Evidencia que manda |
|---|---|---|
| S1 | FAIL | `VERSION:9` en artefacto, `EXT-X-I-FRAME-STREAM-INF` sin `URI=` 10/10, Media+Master mezclados, `DATERANGE` sin `START-DATE` 11/11. Anti-509: 8.366/8.366 bloques con 1 URI. Anclas **de `e38a89b`** (históricas): I-FRAME `:2764/:9617`, `VERSION:9` `:2355/:2690/:2740`; en **`d81ddb3`** son I-FRAME `:3079/:10005` y `VERSION:9` `:2664/:3001/:3053`. |
| S2 | FAIL | 0 emisores de `EXT-X-PART`; `.ts/.m4s/.mp4` → 404 en el plano servido; `#EXT-X-PART-INF` y `SERVER-CONTROL` declarados sin partes reales. |
| S3+S4 | WARN | `probeData.videoCodec || 'hvc1.2.4.L150.B0'` con confianza alcanzable sin codec (`ape-fallback-resolver.js:238`); 2 cruces GOLDEN RULE (`resolve_quality_unified.php:5035,5037`); `ape_mesh.php:57-64` afirma que `hdr_conversion_mode=1` convierte SDR→HDR (falso: es passthrough, corrección 2026-06-17); LEVER B inerte (`combined_body_filter.lua:335`). |
| S5 | FAIL | `computeStubQoE()` (`conviva_qoe_server.php:210-236`) consumido como "QoE REAL" (`ape_mesh.php:113-115,181`); `MOS=4.8` (`HEAD:5949-5950`), `PSNR=42` (`:8624-8639`), `VSTQ=50` (`:8918-8919`) en artefactos generados. |
| S6 | PASS cond. | `proxy_read_timeout 30s` en los 4 loopbacks Brazil (mitad del primario); zonas `limit_conn` colgantes; 11 locations sin `proxy_pass_request_headers off`. **HEAD == producción** en las 2 fases desplegadas. |
| S7 | WARN/BLOCKED | `netshield-watchdog` = `WatchdogSec=120` sin `sd_notify` + `Restart=always` + `StartLimitIntervalSec=0` → ciclo ~125 s; `StartLimit*` en `[Service]` (ignorado) en 4 unidades; 0 alertas, 0 TLS renew, 0 gate post-deploy. |
| S8 | WARN | 3 CRITICAL: `wg0.conf` con PostUp/PostDown concatenados (rompe `wg-quick up`); 3 túneles no medidos (egreso directo `via 172.31.1.1 dev eth0`); MTU 1380+60 > 1280 = PMTU black hole. |
| S9 | FAIL parcial | `emitTivimateSafe` = `emitStandardHls` + etiqueta (single-value solo documentado); `#EXT-X-SESSION-DATA` de master en cabecera de catálogo (emisión real en `HEAD:2458`, no en `:2646`). |
| S10 | FAIL | 5 archivos con material `PrivateKey` (3 `.conf` tracked + `SKILL.md` ×2 copias + `wg0.conf.BASELINE`) y 3 con `PresharedKey`; `prisma-control.php:16,37,44` fail-open + CORS `*`; `.gitignore` sin `*.conf` ni `channels_map.json`. |

### Superficie de credenciales (tres alcances, los tres verdaderos)
- **2.574** URLs en un archivo (`frontend/channels_map.json`, 75 MB tracked) — cifra del informe S10.
- **2.598** sitios en 9 archivos — conteo del harness (C15).
- **9.293 canales con credenciales y 18.586 campos URL** — superficie real medida por la auditoría (AUD-04); la cifra de 2.574 subestima 3,6×.
- Además, la **lista servida** contiene las credenciales en la URL del canal: `…/cdn/line.tivi-ott.net/live/<user>/<pass>/<id>.m3u8`.

---

## 3. VPS medido (2026-10-26 20:00Z, solo lectura)

| Pieza | Realidad medida |
|---|---|
| Stack | nginx **1.24.0 (Ubuntu)** + `libnginx-mod-http-lua`; **no OpenResty**; `--with-http_v2_module` disponible pero **HTTP/2 = 0 directivas** |
| Listas | `/var/www/lists/*.m3u8.gz` (140,6 / 160,8 / 323,9 MB) servidas en `/lists/…` vía symlink; `gzip_static always` + `gunzip on`; ETag; `max-age=300`; CORS. TTFB 5,4 ms. **564 MB crudos** si el cliente no negocia gzip |
| `/cdn/` | 443 → `proxy_pass 127.0.0.1:8088` → `ape_gateway.lua` → `/_ape/_fetch` (resolver 127.0.0.1:53) → proveedor con hasta 3× 302 → rebase al CDN final → UHD/LL-HLS/QoE → `Cache-Control: no-store`. Manifiesto real: **708 ms / 636 B** |
| 3 fases Lua vivas | `ape_header.lua` `a15e1fe3…` · `ape_uri_rebase.lua` `1d456a46…` · `ape_wake_on_manifest.lua` `d9c6b65d…` — **byte-idénticas al HEAD del repo** |
| Resolver | `resolve.php` 42,6 KB = SSOT de URL y token (TTL 120 s; `ORIGINS` en `/etc/ape/origins.php` 0640; `TOKEN_MODE='none'`; `REQUIRE_SIG=false`). `resolve_quality_unified.php` = JSON de cascade (`quality-manifest.json`, TTL 30 s) y delega al anterior en modo fragmento |
| UHD edge | `ape_uhd.declare_auto`: reescribe `RESOLUTION` de la variante top a **3840x2160** (o **7680x4320** si la fuente ≥3840). Flags vivos: `uhd_auto=1`, `uhd4k=1`, `uhd8k=0`, `uhd_pq=0` |
| Seguridad | `/cdn/` con allowlist SSRF (`ape-hosts-allow.txt`); bloques privados denegados; `.ts/.m4s/.mp4` → 404 en el plano público |

**Conclusión operativa:** el VPS **no transporta vídeo**; el player va directo al CDN del proveedor. La "calidad" se decide en PHP y se declara en el edge. Cualquier intento de "mejorar la imagen" desde el VPS sin transcode es metadata; el realce real lo hace el VPP del dispositivo.

---

## 4. Correcciones y contradicciones registradas

### Defectos que el propio equipo encontró en su entrega
| ID | Defecto | Corrección aplicada |
|---|---|---|
| AUD-01 | 5 citas de S1 a líneas inexistentes (12.930 / 13.008 / 19.941 sobre 11.144) | re-ancladas a HEAD (`:2764`, `:9617`, `:2355`, `:2690`, `:2740`); el informe terminal no se reescribe, se declara |
| AUD-02 | `CONSOLIDADO:38` subdeclara el alcance histórico | ≥6 citas de S1 solo caben en el render de 21.581 líneas no conservado |
| AUD-03 | S8 sumaba 2 PASS calificados; el cierre halló 2 calificados más (S9 C1, S10 qoe-flush) | **53 → 51 → 50 → 49** PASS; ratificado en `gobierno/VALIDACION_DEL_CAPITAN.md` |
| AUD-04 | 2.574 credenciales subestima | superficie real 9.293 canales / 18.586 campos |
| AUD-05 | total 138 sumaba blobs distintos | publicar **por blob**, nunca suma agregada |
| AUD-06 | S9 con coordenada del WT vivo | capitán re-ancló y validó (`gobierno/VALIDACION_DEL_CAPITAN.md`) |
| AUD-07..13 | huérfanas sin `check_id`; doc de tercero; "WT actual" ya obsoleto; `TOKEN_SECRET` no era secreto; X1–X10 sin resolución por decreto | registradas en `auditoria/HALLAZGOS.json` |

### Correcciones del capitán (no del autor)
- **S5**: el hash declarado está **truncado**; el prefijo `583C36D6` coincide y el sufijo **no es verificable** → `NO VERIFICADO`, ni PASS ni FAIL.
- **S9**: `#EXT-X-SESSION-DATA` se emite en `HEAD:2458` (no `:2646`, que es un matcher de `DEFINE`); `Upgrade-Insecure-Requests` en el artefacto viejo aparece en **5/10** bloques (no 4/10).
- **S5 capítulo**: cerrado como **FAIL validado por tercero** (`t12`, no-autor, confirmó sus 2 CRITICAL).

### Contradicciones X1–X10 (ninguna resuelta por decreto)
La más importante: **X1/X2** — los blobs HEAD de `ape_header.lua` (`a15e1fe3`, 2.210 B) y `ape_uri_rebase.lua` (`1d456a46`, 6.043 B) son **idénticos a producción**; la divergencia que reportó S6 (`8.088` / `9.930` B) es del **worktree sucio**, no del commit. Consecuencia: "alinear repo con producción" ya está cumplido en HEAD; lo que diverge es el WIP no commiteado.

> **Actualización 2026-10-27 (HEAD `d81ddb3`): X1/X2 quedó invertido.** El WIP se commiteó: `_vps_stage/lua/ape_header.lua` en HEAD = **8.088 B (`23b25b03`)** y `ape_uri_rebase.lua` = **9.930 B (`393635c2`)** — exactamente los blobs sucios de ciclo 1 — mientras producción sigue en 2.210 B (`a15e1fe3`) y 6.043 B (`1d456a46`). **Hoy HEAD diverge de producción en 2 de las 3 fases**; solo `ape_wake_on_manifest.lua` sigue idéntico (`d9c6b65d`). Desplegar HEAD cambiaría dos fases vivas → exige `nginx -t` + ventana (BLOCKED en esta fase). Evidencia: `audit/equipo10_operativo_2026-10-26/ciclo2/medicion/MEDICION_2026-10-27.md`.
>
> **Resuelto 2026-10-27 12:22Z (run `40503068247`):** desplegado con `nginx -t` + reload (sin restart) y verify **9/9**. Producción ahora corre el repo: `ape_gateway.lua` 20.833 B `1b71d90e…`, `ape_rebase_lib.lua` 8.674 B `f813b1cc…`, `ape_uri_rebase.lua` 9.930 B `393635c2…`, `ape_header.lua` 8.088 B `23b25b03…`, `ape_wake_on_manifest.lua` 2.284 B `d9c6b65d…`. **X1/X2 deja de aplicar.** Las listas quedaron intactas.

---

## 5. Reglas permanentes que salieron de esta ronda

1. **Regla de blob**: toda cita del generador/index declara blob (HEAD `c1277bdf` o sha del WT). Sin columna `blob` no es evidencia.
2. **No sumar entre blobs**: los totales se publican agrupados por blob.
3. **Congelar antes de citar**: `git show HEAD:<path>` + copia del WT al inicio; sin snapshot, la auditoría no es reproducible.
4. **Recusación**: autor ≠ consolidador ≠ auditor; el capitán valida lo que queda huérfano y lo firma.
5. **Artefacto viejo ≠ evidencia de HEAD**: datar el artefacto antes de acusar al emisor.
6. **PASS con condición no suma como PASS**.
7. **La resolución declarada no crea píxeles**: verdad de fuente o gate por device; `CODECS=` intocable.
8. **Cero ficción y cero secretos** en todo artefacto emitido; los informes declaran `NOT_RUN` con causa.

---

## 6. Índice del entregable (2026-10-26)

| Ruta | Contenido |
|---|---|
| `audit/equipo10_operativo_2026-10-26/README.md` | Veredicto FAIL, 8 controles, errata 53→51 (el cierre ratificó **49**), totales por blob, 9 límites |
| `…/council/` (8) | Informes S1, S2, S3_S4, S5, S6, S7_S10, S8, S9 |
| `…/verificacion/` (3) | `run_checks.ps1` (21 chequeos, exit 0/1/2), `HARNESS.json`, `VERIFICACION.md` |
| `…/snapshot/` (21) | 17 blobs, `SNAPSHOT.json`, `REPORT_HASHES.json`, `WT_DRIFT_LOG.json`, `REGLA_DE_ORIGEN.md` |
| `…/adn/` (4) | `EQUIPO_10_OPERATIVO.json`, `CONTRATO_DE_ORDEN.md`, `PROTOCOLO_COUNCIL.md`, `REEMPLAZO_DE_FICCIONES.md` |
| `…/consolidado/` (4) | `CONSOLIDADO.md`, `SCORECARD.json`, `RIESGOS_TOP.md`, `INTEGRIDAD_DE_INFORMES.md` |
| `…/auditoria/` (2) | `AUDITORIA_INDEPENDIENTE.md`, `HALLAZGOS.json` (13 hallazgos) |
| `…/gobierno/` (1) | `VALIDACION_DEL_CAPITAN.md` (S9 + decisiones de gobernanza) |
| `audit/EQUIPO_10_OPERATIVO_2026-10-26.zip` | 45 entradas · 1.041.315 B · SHA-256 `6e7ecb24951f017af52858d7bf22fe3f1ee46c0640b896f1a612b9a2c1d0bfe0` |
| `audit/EQUIPO_10_ENTREGA.json` | 8 agentes, 13 tareas, veredictos, comandos de re-verificación |
| Manifest | 44 archivos · 3.992.305 B · verificado 44/44 |

---

## 7. Qué NO se verificó (declarado)

- VPS en modo escritura, `systemctl`, `journalctl`, `nginx -t`, `wg`, `adb` → **NOT_RUN/BLOCKED** (host Windows; `iptv-vps-touch-nothing`).
- Reproducción real en dispositivo (TiviMate/OTT/ExoPlayer/Smart TV) → **NOT_RUN** (sin dispositivo).
- Ejecución del generador / parseo con ffprobe o hls.js → **NOT_RUN** (Council read-only).
- Explotabilidad de endpoints y fuzzing → **prohibido** por la regla ética.
- Alineación de segmentos en producción → **NOT_RUN** (no hay media playlist real versionada).

---

## 8. Deuda abierta (requiere al propietario)

1. **Credenciales**: rotar claves WG, sacar `*.conf`/`channels_map.json` del historial, cerrar el fail-open de `prisma-control.php`, decidir si la lista sigue llevando `user:pass` en la URL.
2. **Edge**: habilitar HTTP/2 (módulo presente), cachear el destino del 302, colapsar el hop 443→8088, decidir doctrina UHD (verdad de fuente vs 4K declarado).
3. **Doctrina**: corregir los documentos que aún prometen LL-HLS/CMAF/Rust/`/shield/` como activos (D-25/D-32 siguen vigentes).
4. **Backlog**: 13 tareas propuestas en `CONSOLIDADO §7`, ninguna ejecutada.

---

## 9. Changelog

| Fecha | Cambio |
|---|---|
| 2026-10-26 | Auditoría completa (13 tareas, 8 agentes), paquete sellado, veredicto FAIL, correcciones AUD-01..13, validación del capitán |
| 2026-10-26 | Revisión read-only del VPS y diagnóstico CDN/Resolver (HTTP/2 ausente, `/cdn/` 708 ms, UHD inflado, listas 564 MB crudos) |
| 2026-10-27 | Comando `/equipo-10-adn` + este documento de contexto + **7 guardas de identidad literal** (team id, 8 member targets, grafo t1..t13, prohibición de variantes de nombre y de reutilizar el id para otro goal) |
| 2026-10-27 | **Coordinación multi-agente**: `docs/COORDINACION_AGENTES.md` + `contracts/ownership_scopes.json` + `_coord/claims/`. Motivo: 3 workstreams escribiendo en el mismo árbol (`hls-forensics` activo con 26 commits/24 h, `auditoria-roku-universal-rea` activo, `edge-fluidez` idle). Regla clave: **nunca `git add -A`** (arrastraría trabajo ajeno) y cada agente escribe solo en su scope |

## 10. Coordinación multi-agente (contexto operativo)

Medido el 2026-10-27 00:40 sobre `8354803` (rama `feat/adb-generic-visual-enhancement-installer`):

| Workstream | Escribe | Commits | Estado |
|---|---|---|---|
| `equipo-enterprise-10-adn` (este team) | `audit/equipo10_operativo_2026-10-26/**`, `audit/EQUIPO_10_*`, este documento, `.claude/commands/equipo-10-adn.md`, `_coord/**`, `contracts/ownership_scopes.json` | **No** | idle/deliverable |
| `hls-forensics` | `_vps_stage/**`, `docs/edge/**`, `audit_teams_REA/**`, `deliverables/**`, `.github/workflows/deploy-vps.yml`, `frontend/**`, `vps/**` | **Sí**, pathspec explícito | activo (00:25) |
| `auditoria-roku-universal-rea` | `audit_teams_REA/**` + su `.agent-teams/**` | No | activo (00:27) |
| `edge-fluidez` | (sin escrituras observadas) | No | idle desde 17:29 |

**Riesgos medidos:** HEAD se movió 2 commits más allá de `d81ddb3` (21 desde `e38a89b`, 26 en 24 h) → nuestro paquete queda anclado a blobs, no a archivos vivos; `git status` = 51 (11 M / 3 D / 37 ??) con trabajo de dos agentes; disco **13,5 GB libres** (snapshot 685 MB, packs de `.git` 564 MB, listas de 210–212 MB ×5) → riesgo de fallo en builds/deploy; `_vps_stage/lua/ape_rebase_lib.lua` en edición activa (backup `before-t111`).

**Contrato:** [`docs/COORDINACION_AGENTES.md`](../../docs/COORDINACION_AGENTES.md) + [`contracts/ownership_scopes.json`](../../contracts/ownership_scopes.json) + claims en `_coord/claims/`. Regla dura: **nunca `git add -A`**, commit solo por pathspec y solo el dueño.
