# INFORME FINAL — Canary ↔ JIT ↔ Listas ↔ APK

**Fecha:** 2026-11-13 · **Base:** `472f7cc3` · **HEAD:** `721cacd5` · **116 commits** en `deploy/engine-restart-20261112`
**Master:** `d2c27293b36ee331480d56dc91d08c0981cd3c50` — **intacto, nunca tocado**
**Informe anterior (auditoría de solo lectura del 2026-11-11):** `14_CANARY_FINAL_REPORT_20261111.md`, preservado

---

## 0 · Aviso de método, antes de cualquier cifra

- **Sin SSH al VPS. Sin despliegue. Sin cambio en OTT.** Nada de lo que dependa del servidor se presenta como hecho.
- **Cada cifra lleva su fuente al lado.** Sin fuente no hay cifra: va como `NO COMPUTADO` con el motivo.
- **Cuatro medidas mías resultaron falsas y están corregidas aquí**, no borradas: los gates "2 fallos" (era un bug de mi bucle de PowerShell), el detector HF sin clasificar de zona (marcaba `DEGRADADO` en dos copias idénticas), el conteo "3 URLs muertas" (contaba muestras, eran 2.753) y la tabla de precisión del monitor de bloque (no tenía medición detrás).
- **Tres enfoques se refutaron con medición propia**, dos de ellos contra mi propio trabajo.

---

## 1 · Estado por categoría (§17)

| Categoría | Qué cae aquí |
|---|---|
| **VERIFIED** | 14 gates locales · 11 pasos de CI · v3 25/25 tests · fixture `APTA` · aparato en baseline · harness aplicado a la lista real con cuerpo idéntico · 21.224 canales con `/pulse/` respondiendo 200 |
| **IMPLEMENTED_NOT_DEPLOYED** | `ape-quality-watch` · `ape-list-probe v3` · `apply_harness.js` · `regenerate_playlist_urls.js` · `check_display_state.ps1` · `pipeline_lint.ps1` · `list_gate.js` |
| **TESTED_IN_DEVICE** | `check_display_state.ps1` y `pipeline_lint.ps1` contra el ONN real. Ese es todo el contacto con el aparato. |
| **BLOCKED** | Firma de APK (falta keystore) · deploy al VPS (falta SSH/autorización) · token del probe (solo lo tiene el operador) |
| **FAILED** | Detector de bloque `borde8/resto` — refutado · Detección de artefactos SAO desde píxeles — refutada · Calibrador HF sin clasificación de zona — refutado |
| **ROLLED_BACK** | Incidente de pantalla del 2026-11-13 (densidad 640 + size_forced 1080p): revertido y verificado |
| **DEPLOYED_NOT_DEVICE_TESTED** | **nada** |

## 2 · Archivos modificados y commits (§17.1)

**116 commits** sobre `472f7cc3`. Lo creado en esta sesión:

| Área | Ficheros |
|---|---|
| Gates de lista | `tools/quality/list_gate.js` · `check_playlist_servability.js` · `apply_harness.js` · `regenerate_playlist_urls.js` |
| Métricas de imagen | `test_hf_detail_metric.js` · `test_hevc_block_detector.js` · `test_sao_artifact.js` · `hf_zone_aware_calibrator.js` · `calibrate_two_class.js` · `calibrate_blockiness.js` |
| Servicios del VPS | `vps/ape-quality-watch/` · `vps/ape-list-probe/v3/` (paquete del operador, auditado) |
| Sondas del aparato | `tools/probe/check_display_state.ps1` · `pipeline_lint.ps1` |
| Contratos | `contracts/canary_policy_schema.json` (8.672 B) · `contracts/device_capability_schema.json` (18.840 B) |
| Fixture | `tests/fixtures/lista_sana_con_harness.m3u8` |

**Y 49 documentos de auditoría de sesiones anteriores que nunca se habían commiteado.**

## 3 · Hashes (§17.2)

| Artefacto | SHA-256 / identidad |
|---|---|
| Lista viva del operador | `81b00a123d1df3b4682f0124a8d52430bd056403287c369bb22391bbd8ee49fe` · 1.311.381.927 B |
| Copia con harness aplicado | 1.311.382.485 B · cuerpo `fd1f3db6abbace92…` **IDÉNTICO** al origen |
| Certificado APK instalado | `19:35:B4:40:70:FA:A3:A5:93:86:EB:E3:C8:3A:EE:DF:5B:83:4D:4B:0B:D4:BE:D0:C2:56:43:9A:DC:08:FA:F2` |
| Paquete v3 del operador | `9c73cf38dab5fba49b4490b5b891becbeb280fe9b36df5b0ba79e539cd5829ce` · 9/9 hashes internos coinciden |

## 4 · Endpoints (§17.3)

**Creados en producción: NINGUNO.** Preparados sin desplegar:

| Ruta | Servicio | Estado |
|---|---|---|
| `GET /probe?url=<lista>` | ape-list-probe v3 | NO_DESPLEGADO |
| `GET /health` | ape-list-probe v3 | NO_DESPLEGADO |

**Reutilizados, medidos:** `/pulse/N.m3u8?u=…` → **200** (21.224 canales VIVOS) · `/lists/APE_LISTA_…m3u8` → **200** · `resolve_quality.php?ch=N` → **200** · `/live/N.m3u8` → **404** · `/live/N.ts` y `.m4s` → **404**.

## 5 · Pruebas y resultados (§17.5)

```
14 gates locales                    · 0 fallos
11 pasos del CI (entorno real)      · 0 fallos
v3 del operador                     · 25/25 tests
fixture lista_sana_con_harness      · APTA, exit 0, 0,0 s, sin red
aparato (check_display_state)       · LIMPIO, exit 0
lista viva (probe v3)               · HLS_MASTER, 21.224 extinf, 0 huérfanas, integridad completa
lista viva (list_gate)              · APTA_SIN_HARNESS (0 de 9 líneas)
harness sobre lista viva            · +9 líneas, cuerpo sha256 IDÉNTICO, 445 s
```

**Cuatro gates fallaban o mentían, y se corrigió el gate, no el resultado:**
1. `list_gate` en CI apuntaba a una lista truncada → modo `--sin-red` + fixture determinista
2. `test_hevc_block_detector` fallaba por `EPERM` al limpiar su temporal en Windows → carpeta única por ejecución
3. `check_playlist_servability` salía con `0xC0000409` (aserción libuv) → `process.exitCode`
4. La batería decía "2 fallos" por un bug de **mi** bucle de PowerShell → medido sin pipe: 0 fallos

## 6 · Calidad visual observada (§17.6)

**No mejorada por este trabajo. Medido, no opinado:**

- La fuente real del canal en el ONN es **640×360** (`c2.amlogic.avc.decoder`). Cualquier etiqueta 4K/6K sobre eso es una **declaración**.
- **Doble escalado medido**: 360p → composición 1080p (×3) → panel 2160p (×2).
- **Color incoherente en el stream**: `standard=4` (BT.2020) con `transfer=3` (BT.601).
- **La composición está capada por firmware** a 1920×1080 (`ro.surface_flinger.max_graphics_height`, propiedad de build, inmutable). `wm size 5760x3240` devuelve `rc=0` **sin hacer nada** — éxito falso.
- **HEVC gana donde importa**: a 500 kbps conserva **+12,3 %** de detalle frente a H.264; a 8 Mbps empatan. La palanca real es pedir más bitrate al proveedor.

## 7 · Rendimiento y continuidad (§17.7)

**No medidos en reproducción real.** Lo único que hay:
- `probe v3` sobre 1,31 GB: **66,8 s**
- `apply_harness` sobre 1,31 GB: **445 s** (limitado por la descarga, no por el proceso)
- `list_gate` sobre 1,31 GB: **49,9 s**

**La meta de cero cortes no se declara.** Requiere una prueba definida por duración, canales, dispositivo, red y condiciones, y esa prueba no se ha hecho.

## 8 · Dispositivos comprobados (§17.8)

**ONN 4K** (`AMLS905Y4`, SDK 34, `192.168.1.3:34813`). Solo lectura, salvo el incidente de pantalla del 2026-11-13, revertido y verificado.
**Ningún otro dispositivo.**

## 9 · Estado de los reproductores (§17.9)

| Reproductor | Estado |
|---|---|
| OTT Navigator | **En el dispositivo, sin cambios.** Es el que reproduce. No se ha tocado su configuración. |
| TiviMate | No comprobado |
| ExoPlayer / Media3 | Pipeline propio: **`ImageReader` no puede ser la salida de `MediaCodec`**. Bloqueante técnico, no resuelto. |

**Ese bloqueante es el límite real de toda la línea de detección en el aparato.** Tres salidas documentadas: renderer propio en modo ByteBuffer, `SurfaceTexture` + shader con `glReadPixels`, o correr el análisis en el VPS/JIT donde el frame ya está en CPU. **La tercera es la única que no toca el camino de reproducción.**

## 10 · Listas compatibles (§17.10)

| Lista | Veredicto | Evidencia |
|---|---|---|
| `APE_LISTA_1794100720046.m3u8` (la viva) | **APTA sin harness** | 21.224 canales, `/pulse/` 200, 0 huérfanas |
| Copia con harness | **APTA** | cuerpo idéntico byte a byte |
| `APE_OMEGA_PRODUCTION_v5.2.m3u8` | **NO PUBLICAR — truncada** | declara 4.143, tiene 2.754; huérfana en L2.034.515 |
| `downloaded_list_4K/_8K` | **MUERTA — 100 %** | 2.753 URLs a `/live/` → 404 |

## 11 · Límites conocidos

1. **No hay motor que mejore píxeles en este sistema.** El VPS no transporta vídeo; la APK no puede leer frames del decodificador de OTT.
2. **Cuatro enfoques de detección de calidad de imagen se refutaron midiendo**, incluidos dos míos. El que sobrevive (HF con clasificación de zona) **solo funciona comparando el mismo contenido**.
3. **La composición está capada a 1080p** por propiedad de build.
4. **El `pipeline_lint` y el detector HF no comparten sujeto**: uno lee estado del sistema, el otro necesita frames. No se puede fingir que son lo mismo.
5. **Nada está desplegado.** El recibo `12_CANARY_DEPLOYMENT_RECEIPT.json` lo declara con el motivo de cada bloqueo.

## 12 · Pendientes de autorización

1. Subir la lista con harness al VPS
2. Instalar y arrancar `ape-quality-watch`
3. Instalar `ape-list-probe v3` y poner `APE_PROBE_TOKEN`
4. Regenerar la lista OMEGA truncada **o retirarla**
5. Firmar la APK (falta `signing/ape-fluid-dev.jks` + credenciales)
6. `user_preferred_refresh_rate`: quedó en `0.0` donde estaba `50.0`. **No se ha tocado.**

## 13 · Procedimiento de reversión

Ver [`13_CANARY_ROLLBACK_PROCEDURE.md`](13_CANARY_ROLLBACK_PROCEDURE.md).

**Lo esencial: `master` está intacto; todo vive en una rama; ningún aplicador sobrescribe nada; el instalador deja su propio `rollback.sh`.**

---

## 14 · Lo que este trabajo NO es

**No es un sistema que mejore la imagen.** Es un sistema que:

- **impide publicar listas rotas** (candado + fixture en CI),
- **mide el estado del pipeline** con hechos del sistema, no con opiniones sobre píxeles,
- **aplica el contrato del harness de forma atómica** con el cuerpo verificado idéntico,
- **dice «no» con evidencia** cuando una idea no se sostiene — cuatro veces, dos contra mi propio trabajo.

**La mejora de imagen real, cuando exista, vendrá de pedir más bitrate al proveedor o de un motor que ejecute de verdad.** Ninguna de las dos está en este repo todavía.
