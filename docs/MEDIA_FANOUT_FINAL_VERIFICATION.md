# Media Fan-Out — Verificación FINAL V3 (bytes reparados t15+t18)

**Tarea:** t17 · V3 · veredicto definitivo
**Fecha:** 2026-10-25 (UTC)
**VPS de staging:** 178.156.147.234
**Veredicto global: PASS** — `RESULT=PASS_INVARIANT`, `invariant_pass=28`, `invariant_fail=0`, `warnings=0`, exit 0.

Corrida completa **sin shim** (`--shim-delay 0`) sobre los bytes definitivos, con entrada de player O2 bajo 50 clientes, F1 y F2 en vivo. Producción intacta: nginx `MainPID 1931562 → 1931562`, sha de `/etc/nginx/nginx.conf` sin cambios y `journal_events=0` en la ventana. Sólo se copiaron fuentes a `/tmp`; `/dev/shm/mf` quedó limpio.

## 1. Tabla de SHAs (revisión exacta)

| Fichero | SHA-256 |
|---|---|
| `_vps_stage/media/ape-ingest.sh` (worker, 2.718 líneas) | `a01c6e299062ae9c1a29dd5771c863c44652903bb2a2e8cfe03bcdf7352848f7` |
| `_vps_stage/media/ape-ingest@.service` (188 líneas) | `29a83c1a954f96a76892cea174c9f78bbeea8bb46d5f404dec442e496122835e` |
| `_vps_stage/media/ape-supervisor.sh` | `91aaea7c1e2a674907762f8ee9cebc5c92f767ae2a493357853183e329627987` |
| `_vps_stage/media/ape-supervisor.lua` | `59a272dda35a4ff6303dbf519ff54bf56d9cab1d1bc3bd978b2e8722d87d88d1` |
| `_vps_stage/lua/ape_session.lua` | `cbef5132a3a2f8e5521f271309fed03f9c369ac2c8496f2761317a76f6410965` |
| `_vps_stage/nginx/media-fanout.conf` | `b1000903d3f1e5939fe0c4c0658809f7975e820eaf6c6a1fa8e4d1030c4112b9` |
| `_vps_stage/tests/fanout_concurrency.sh` (1.942 líneas, V3) | `9b774bffbe6c744fc205136561c506e3bf93af8e1dea575304d16ae5601a6c94` |

Estos hashes son los que fija este informe. Cualquier cambio posterior requiere repetir V3.

## 2. Comando y ventana de medición

```
MF_STAGE_SRC=/tmp/mf_stage bash /tmp/mf_stage/tests/fanout_concurrency.sh --shim-delay 0 --keep
```

- Inicio: `2026-10-25T22:22:34Z`; fin: `2026-10-25T22:25:28Z` (**174 s**).
- Evidencia completa: `/tmp/mf_v3_run3.log`, `/tmp/mf_v1/evidence.txt`, `/tmp/mf_v1/analysis.json` (host de staging).
- Origen local real en `:19090`; el proveedor real **no** se tocó. La URL del origen de staging llevaba credenciales de prueba para ejercitar F1.

## 3. Veredicto por criterio

| Criterio | Veredicto | Evidencia medida |
|---|---|---|
| Banco completo sin shim sobre bytes definitivos + SHAs | **PASS** | `--shim-delay 0`; 28 invariantes PASS / 0 FAIL / 0 WARN; tabla de SHAs §1; cold 50/50 HTTP 200. |
| **50 clientes → EXACTAMENTE 1 conexión upstream** (ss/conntrack reales) | **PASS** | `origin max_active=1` en cold/1/5/50/100/snapshot/isolation/fencing; sonda `ss`: 20 hits, **72 muestras positivas**, `max_ss_lines=1`, `max_proc_tcp=1`, 1 ffmpeg. Tasa de aceptaciones del origen: 0.99/s (1c), 1.04/s (50c), 1.06/s (100c) → no escala con N. |
| Misma secuencia, sin duplicados ni saltos MSN/PTS | **PASS** | 1.100 playlists de 50 clientes: MSN 3→15, `signature_mismatches=0`, `duplicate_segments=0`, `window_holes=0`, `union_segment_holes=0`, `msn_regressions=0`, 8 segmentos/playlist; snapshots 5/5 byte-idénticos; timestamps 6 segmentos/300 packets, `gaps_fuera_rango=0`, `dts_back=0`. |
| Entrada de player `/sess/.../live.m3u8` bajo 50 clientes (O2) | **PASS** | 50 clientes, 500 peticiones, **500 HTTP 200**, `gen_hdr=500`, `rel_uris=0`, `bad_gen_uris=0`, `abs_uris=4.000`, **500/500 segmentos 200**, `gen_values=['1']`. X-MF-Gen + URIs absolutas con generación. |
| **F1 en vivo**: 0 credenciales y logs 0600 | **PASS** | URL de staging con `user:pass` + `token`; `logs=2`, `modo_no_600=0`, `ficheros_con_secreto=0`, probe ffmpeg real con URL mala y `--keep-logs` → log 0600 y `<redacted>`; `grep` de la contraseña en `/dev/shm/mf` = 0. |
| **F2 en vivo**: SIGKILL del worker → sin generación huérfana | **PASS** | Kill del grupo worker+ffmpeg; playlist vieja congelada; `--cleanup --own-gen` (equivalente a ExecStopPost) → `/dev/shm` **2.381.368 B → 0 B**, `dirs=0`, key dir ausente; cierre de sesión 11 s; **/dev/shm/mf final 0 B / 0 entradas**. |
| Fencing intacto | **PASS** | Gen1 msn54 congelada; gen nueva **2** con cold 200; gen vieja → **302 stale_generation + jump-to-live**; exactamente **1 worker** (session leader) y **1 ffmpeg**; directorio gen1 eliminado. |
| Límites siguen pasando | **PASS** | 2 sesiones (máx) creadas; 3ª → 503 `max_sessions`; viewer 4 → 503 `max_viewers`; 6º global → 503 `max_total_viewers`; conectados 12/12, 6/6 siguen 200 sin expulsión. |
| Medición válida / prod intacta / limpieza | **PASS** | nginx PID 1931562→1931562, sha_ok=1, `journal_events=0`; no `/etc/mediafanout` ni `/var/lib/mediafanout`; 0 procesos del banco; `/dev/shm/mf` 0 B/0 entradas. |

## 4. Comparación con t6 y estado del shim

t6 ya cerró con **`--shim-delay 0`** (23 PASS, 0 FAIL; cold p50 3.262,5 ms, p95 3.315,7 ms). El `--shim-delay 4` fue un workaround de *bring-up* para el antiguo B1 (supervisor con flock largo); con shim, el arranque en frío seguía pudiendo caer en `rc=20`/`manifest_not_ready`. Tras t11/t12 (supervisor sin flock + READY temprano + reintento PUBLISH) el shim dejó de ser necesario y t6 final ya fue sin shim.

V3, sobre los bytes reparados t15/t18 (más fases O2/F1/F2), confirma:

| Corrida | Shim | Invariantes | Cold p50 / p95 | Resultado |
|---|---:|---:|---:|---|
| t6 final (bytes previos a t15/t18) | 0 s | 23 PASS / 0 FAIL | 3.262,5 / 3.315,7 ms | PASS |
| **V3 (bytes definitivos)** | **0 s** | **28 PASS / 0 FAIL** | **3.310,3 / 3.324,6 ms** | **PASS** |

El shim queda **desactivado por defecto (`--shim-delay 0`)** y sólo se conserva para reproducir snapshots antiguos; no es necesario para la operación ni para este veredicto. La diferencia de ~48 ms en p50 es el coste de las fases adicionales y del arranque real, no del shim.

## 5. Detalle de las fases

- **Cold start:** 50/50 HTTP 200; p50 3.310,3 ms; p95 3.324,6 ms.
- **Curva:** n1 10/10, n5 50/50, main50 1.100/1.100, n100 1.500/1.500 (todos 200).
- **Coherencia:** 50 clientes, MSN 3..15, 12 firmas distintas, 0 mismatch/dup/holes/regresiones; 5 snapshots simultáneos × 50 clientes idénticos.
- **Timestamps:** 6 segmentos, 300 packets, 0 gaps fuera de rango, 0 DTS atrás.
- **Aislamiento:** 50 clientes, éxito **100 %**, `seg_ok=1100/1100`, avance MSN mínimo 10.
- **Latencia:** 1c p95 3,956 ms; 50c p50 0,620 ms / p95 6,073 ms; 100c p95 42,573 ms; segmento p95 5,408 ms.
- **Bytes fase 50:** 375.650 B playlists + 287.066.600 B segmentos.
- **Límites:** 2 sesiones, 3ª 503 max_sessions, 4º viewer 503 max_viewers, 6º global 503 max_total_viewers, conectados intactos.
- **F1:** 2 logs, 0600, 0 coincidencias de credenciales; probe real de error ffmpeg redactado.
- **F2:** SIGKILL + own-gen: 2.381.368 B → 0 B; sesión cerrada 11 s; gen nueva 2; una sola ingesta.

## 6. Alcance y limitaciones honestas

- Staging aislado (fanout :18099, límites :18100, origen local :19090); producción no se reinició ni se modificó.
- El proveedor real no se usó en esta corrida; la URL de origen de staging simula el HLS y lleva credenciales de prueba para F1.
- F2 en vivo ejecuta el mismo comando que `ExecStopPost` (`--cleanup --own-gen`) tras el SIGKILL; la unit/transitorios systemd se validaron en t18 (36 unidades, `NRestarts=0`) y el selftest t18 T26/T30.
- 4K escalado y HDR no forman parte de esta verificación: siguen gateados y fuera del camino por defecto; no se etiqueta HDR nada escalado/remuxeado.
- El shim no se eliminó del script (sólo está desactivado por defecto) para conservar la capacidad de reproducir snapshots antiguos; no participa en la corrida PASS.

## 7. Conclusión

**PASS.** Sobre los SHAs de §1, el sistema cumple el invariante central (50→1 conexión upstream, una sola ingesta, misma secuencia), O2 bajo carga, F1/F2 en vivo, fencing, límites, medición válida y limpieza. t8 puede integrar estos bytes; cualquier cambio posterior invalida este informe y exige repetir V3.
