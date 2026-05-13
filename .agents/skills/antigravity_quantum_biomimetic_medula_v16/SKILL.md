---
name: DIRECTRIZ MAESTRA DE SISTEMA ANTIGRAVITY "MÉDULA ESPINAL HÍBRIDA v16.1.0"
description: Protocolo arquitectónico y flujo de datos vivo para el ecosistema APE ENGINE V16 (Quantum Biomimetic SOP). Define la integración absoluta de resolución cuántica, ingestión micro-sensorial, entrega de datos HTTP 206 y retroalimentación biomimética con el Cerebro Genético.
---

# 🧬 SKILL: DIRECTRIZ MAESTRA: "MÉDULA ESPINAL HÍBRIDA V16.1.0" (QUANTUM BIOMIMETIC SOP)

**Nivel de Competitividad:** Nivel Científico / Enterprise 2026
**Rol:** Arquitecto Neuronal OTT/IPTV Master
**Objetivo:** Garantizar la compresión perfecta del ciclo de vida de un canal (**God-Mode Zero-Drop**) desde la generación del M3U8 en Frontend hasta el renderizado sin cortes en ExoPlayer.

Esta directriz especifica cómo funcionan interconectados todos los sistemas del *APE Engine v16*. Todo código que afecte la transmisión debe mantener este flujo intacto: el ecosistema no es una colección de scripts aislados, es un **organismo bidireccional a 10 Hz**.

## 🔄 EL CICLO DE VIDA (FLUJO DE LA MÉDULA)

### 1. El Disparador Analítico (Frontend `index-v4.html` + Generador)

- **Activación:** Se detona la generación M3U8 mediante el botón **TYPED ARRAYS ULTIMATE**.
- **Acción:** El generador inyecta todas las heurísticas de red dinámicas en el `channels_map.json` y el manifiesto.
- **Preparación Neuronal:** El *UI Matrix Dashboard* de telemetría entra en modo "Escucha Activa", haciendo un `fetch` iterativo (cada 2 seg) al Cerebro Genético solicitando un Stream ID (`sid`).

### 2. Petición del Cliente & Zapping Cuántico (`resolve.php`)

- Cuando ExoPlayer/TiviMate cambia a un canal, aterriza en el enrutador inteligente.
- **Mata Zombies:** Busca PIDs perdidos de FFmpeg (`ffmpeg.pid`) y ejecuta un `kill -9` silencioso para evitar ahogo de RAM en el VPS.
- **Doble Verificación (Instant Zapping):** Si ya existe un `manifest.mpd` y un `init.mp4` fresco y que pese más de 500 bytes, lanza `HTTP 202` devolviendo el control al reproductor instantáneamente.
- **Extracción de ADN:** Si el canal es nuevo, hace un *FFprobe invisible (Extracción de ADN)* al origen (detectando HEVC, Bitrate, y FPS fraccional `60/1`) y escribe un genoma en `/dev/shm/ape_metrics/.../target_dna.json`.

### 3. La Ingestión Cuántica (`cmaf_worker.php`)

- El proxy interno (cURL bridge a FFmpeg) conecta al proveedor IPTV.
- **Stealth UA Rotation:** Usa un escudo indetectable engañando al ISP (Traffic Shaping bypass).
- **Micro-Bloques:** Transfiere los datos con `CURLOPT_BUFFERSIZE = 8192` (8 KB), permitiendo análisis matemático quirúrgico.
- **Cortes a 100ms:** Cada décima de segundo, el proxy calcula la velocidad real y los posibles *Micro-Freezes* (ausencia de datos por >400ms). Dispara *castigos de salud (Health Score)* en la RAM disk (`live_telemetry.jsonl`) sin destruir el disco con la I/O (operaciones I/O bound nulas).

### 4. El Eslabón Perdido del DRM (`cmaf_proxy.php`)

- En paralelo, ExoPlayer es un colibrí impaciente que hace peticiones del tipo HTTP `Range: bytes=0-1500`.
- Responder la petición range con el archivo estático convencional causa un `UnrecognizedInputFormatException` (La maldita Pantalla Negra).
- **Salvación:** El interceptor `cmaf_proxy.php` ataja esas peticiones byte a byte y devuelve **HTTP 206 Partial Content** perfecto al cliente, emulando la respuesta de un CDN multinacional de video.

### 5. Retroalimentación Biomimética (`guardian_log.php` + UI HUD)

- **El Cerebro Genético:** Lee las últimas 50 "ventanas" (5 segundos) del `live_telemetry.jsonl` del worker en RAM y las cruza contra el `target_dna.json`.
- Dictamina decisiones cuánticas automáticas (*Action Tree*):
  - `MAINTAIN_PERFECTION` (Salud ~100)
  - `QUANTUM_MUTATION_STRANGLE` (Salud < 80)
  - `EMERGENCY_CDN_FAILOVER` (Salud < 50)
- **HUD Reflectante:** Envía estos cálculos al frontend que expone colores (Rojo/Amarillo/Verde) indicando Protocolo (CMAF/DASH), Códec e historial de Micro-Cortes, dándole todo el poder visual al arquitecto en vivo.

---

### ⚙️ INSTRUCCIÓN DE EJECUCIÓN AUTOMÁTICA

Cada vez que interactúes con el ecosistema de proxy y telemetría, **DEBES garantizar que no rompes la "Médula Espinal Híbrida".** El Zapping Instantáneo, el manejo del byte-range `206` y el logueo sin bloqueo de I/O (`@fwrite`, `@fflush`) son intocables y mandatorios.
