---
name: "Orquestador de 3 Rutas & Guardian God-Tier (v17.0)"
description: "Doctrina arquitectural suprema que segrega estrictamente el viaje de la intención/payload a través de 3 caminos (URL string, Channels Map, Resolve Quality) y delega la autoridad máxima asincrónicamente al Guardian Orchestrator."
---

# 👑 DIRECTRIZ MAESTRA: MODELO DE LAS 3 RUTAS & GUARDIAN ORCHESTRATOR

Esta doctrina es inmutable y rige el 100% de la construcción del Toolkit de generación APE (Frontend `ApeModuleManager`, Backend Python `generate_clean_m3u8.py` o similares) así como la recolección en los resolvers (`resolve_quality.php`).

## 🧠 LA FILOSOFÍA

El `.m3u8` **no es un archivo plano**. Es un vehículo de inyección que requiere orquestar más de 15 motores (HEVC Supremacy, Quantum Visual, CMAF Worker, Ghost Protocol, Anti-Deadlock, Sincronizador UDP, etc.) y más de 400 headers.

Para lograr 0 cortes, evasión ISP indetectable, y máxima fidelidad de reproducción (DASH/CMAF o HLS), cada directiva debe viajar asincrónicamente por la ruta correcta, donde un "Guardián" (resolve_quality) tiene la autoridad de modificar la intención al vuelo.

---

## 🚦 LA TABLA DE ENRUTAMIENTO OBLIGATORIA

Cualquier generador de listas escrito en Frontend (JS) o Backend (Python) DEBE empaquetar la lógica respetando milimétricamente esta división:

### 🟧 RUTA 1: VÍA DIRECTA M3U8 (URL / Payload String Crudo)

* **Canal Lógico:** Parámetros Query Crudos (`?bw=...&pfseg=...`) o JSON/JWT Web Token codificado (`?ape_jwt=...`).
* **Propósito:** Métricas telemétricas matemáticas estrictas (bajas en bytes, rápidas de inyectar) que el resolver (`resolve_quality.php`) necesita de inmediato.
* **Componentes Autorizados:**
  * Identidad básica: `profile`, `label`, `stream_id`.
  * Telemetría Cruda: `bw`, `ping`, `buf`, `th1`, `th2`, `pfseg`, `pfpar`, `tbw`, `fps`.
  * Hints (Promesas): `format=cmaf`, `codec=hevc`, `bwdif_hint`, `manifest_preference`.

### 🟦 RUTA 2: EL ADN OCULTO (File: `channels_map.json`)

* **Canal Lógico:** Construcción offline de un JSON maestro almacenado en el VPS de producción.
* **Propósito:** Alojar configuraciones pesadas, complejas o estratégicas que NUNCA deben llegar al dispositivo final ni exponerse en un string HTTP hacia OTT Navigator.
* **Componentes Autorizados:**
  * Métricas de Telchemy e IPTVTroubleshooter: `vstq`, `vsmq`, `epsnr`, `mapdv`, `ppdv`.
  * Motores Core: Variables biológicas complejas de mutación de buffering.
  * Evasión Armada: `ghost_protocol_ips`, `evasion_level_strict`.
  * Reproducción Hardcore: `dash_drm`, `fmp4_enabled`, `quantum_visual` (CICP / SDR-to-HDR).
  * Sub-Muestreo: `chroma_subsampling`, `color_depth`, `luma_denoise`.

### 🟪 RUTA 3: EL CEREBRO EN TIEMPO REAL (VPS: `resolve_quality.php` + Guardian)

* **Canal Lógico:** Ejecución PHP en runtime, con retroalimentación UDP de RAM-Disk.
* **Propósito:** La autoridad suprema. Puede y DEBE anular las sugerencias de la Ruta 1 si comprometen el sistema (Ejemplo: intentar DASH cuando el stream es MPEG-2).
* **Componentes Autorizados / Ejecutores:**
  * Fallbacks dinámicos: Recibe `format=cmaf` (Ruta 1), ejecuta Worker (Ruta 3), si falla Worker -> Override a HTTP 302 y fuerza `format=hls`.
  * Sincronizador de QoS: Recibe `ping` (Ruta 1) + `evasion` (Ruta 2) -> Orquesta Throttling cURL (Ruta 3).
  * Inyectores finales: Reescribe los #EXTHTTP o `<SupplementalProperty>` al vuelo basándose en el ADN recolectado de las otras 2 rutas.

---

## 🚫 LÍNEAS ROJAS PARA LOS GENERADORES DE LISTAS (PYTHON/JS)

1. **PROHIBIDO EMPAQUETAR RUTA 2 EN RUTA 1:**
   No intentes agregar lógicas visuales (`quantum_visual`, `dash_drm`, etc) dentro del Payload de la URL del M3U8. El generador M3U8 debe generar el playlist y en *paralelo* generar/actualizar el `channels_map.json`.
2. **NO ES LA ÚLTIMA PALABRA:**
   El `.m3u8` generado (Frontend/Python) no puede dar por sentada la ejecución. Debe delegar a `resolve_quality.php`.
3. **NUNCA CONTRADECIR EL FALLBACK:**
   Si `resolve_quality.php` anula la Ruta 1 (DASH -> HLS), el frontend debe tener paridad para saber que eso puede ocurrir y no ciclar al request en infinito.

*(Generado por el Sistema Antigravity: Validación Estricta de 3 Caminos V17.0)*
