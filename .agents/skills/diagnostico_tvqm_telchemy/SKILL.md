---
name: Telchemy TVQM y Diagnóstico de Impairments (2026)
description: Reglas y directivas para inyectar vectores de medición de IPTVTroubleshooter (Telchemy Video Quality Metrics, TR 101 290, Jitter MAPDV/PPDV, y Problem Diagnosis) en la columna vertebral del código (M3U8 Generator, resolve.php, resolve_quality.php y channels_map.json).
---

# Diagnóstico TVQM Telchemy 2026 (Zero-Reference Architecture)

Esta habilidad establece una doctrina estricta para auditar y proteger la pureza del streaming en APE ULTIMATE basándose íntegramente en los modelos de medición de **Telchemy** descritos en IPTVTroubleshooter.

## 1. Vectores de Medición Obligatorios (100% Comprensión)

Al generar listas o puentes matemáticos, el sistema debe contemplar o dictar las tolerancias de los siguientes factores de Telchemy (TVQM):

### A. Perceptual Quality Metrics

1. **VSTQ (Video Service Transmission Quality):** Escala de 0-50 (independiente del códec). El sistema debe forzar siempre un objetivo paramétrico de `50`.
2. **VSMQ (Video Service Multimedia Quality):** Escala de 0-50 que considera calidad A/V y sincronización.
3. **EPSNR (Estimated PSNR):** Relación señal/ruido estimada. El umbral base es de `45 dB` (por encima de los 35dB promedio recomendados para HQ).

### B. Jitter & Delay Metrics

1. **MAPDV (Mean Absolute Packet Delay Variation - G.1020):** Debe mantenerse por debajo de `10ms`.
2. **PPDV (Packet to Packet Delay Variation - RFC3550):** Debe mantenerse por debajo de `5ms`.

### C. TR 101 290 MPEG Metrics

Tolerancia de CERO `0` en errores de decodificación crítica:

- `TS_sync_loss`, `Sync_byte_error`, `Continuity_count_error`, `PCR_error`.

### D. Problem Diagnosis (Video Impairments)

- **Blockiness (Congelamientos/Bloques):** Telchemy dicta que ocurre por pérdida de paquetes, buffers demasiado pequeños, o GoP muy largos.
- **Acción del Sistema:** Si `PPDV` o `MAPDV` escalan, el backend debe empujar agresivamente la directiva `#EXTVLCOPT:clock-jitter` y ampliar dramáticamente el `#EXTVLCOPT:network-caching`.

---

## 2. Inyección en el Backend / Frontend

### Archivo Objetivo: `m3u8-typed-arrays-ultimate.js`

El generador inyectará estas métricas en todo su ecosistema:

1. **Headers HLS (`#EXT-X-TELCHEMY-TVQM` y `#EXT-X-TELCHEMY-TR101290`)**

   ```m3u8
   #EXT-X-TELCHEMY-TVQM:VSTQ=50,VSMQ=50,EPSNR=45,MAPDV=10,PPDV=5
   #EXT-X-TELCHEMY-TR101290:SYNC_LOSS=0,CC_ERROR=0,PCR_ERR=0
   ```

2. **Bridge al Backend (`#EXTATTRFROMURL`)**
   Las variables paramétricas se añaden a la query de `resolve.php`:
   `&tvqm_vstq=50&tvqm_epsnr=45&tvqm_mapdv=10&tvqm_ppdv=5`
3. **Mapeo JSON (`channels_map.json`)**
   Dentro de la rutina `buildChannelsMap()`, se generará un bloque independiente `telchemy_metrics` junto a `qoe_qos_metrics`.

### Archivos Objetivos: `resolve.php` y `resolve_quality.php`

- Leerán las variables GET dinámicas enviadas por el frontend (`$_GET['tvqm_mapdv']`, `$_GET['tvqm_vstq']`).
- Actuarán en tiempo real modificando el array `$vlcopt`:
  - En caso de diagnóstico punitivo para evitar `Blockiness` o `Jerkiness` (GoP size violation / Buffer under-run), fijarán umbrales matemáticos estrictos en `#EXTVLCOPT:network-caching`, `#EXTVLCOPT:clock-synchro=0` y forzarán la evasión de pérdida de frames con `no-skip-frames`.

## 3. Condiciones de Implementación

- Ninguna modificación aquí debe entorpecer ni romper la "Fusión Infinita BWDIF" ni la "Sincronización Universal de Ecosistema". Todo esto funciona de manera encapsulada sobre los ecosistemas ya probados y blindados.
