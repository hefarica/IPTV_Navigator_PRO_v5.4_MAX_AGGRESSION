---
name: "F1-Grade Guardian Telemetry Engine (1% Uniqueness Protocol)"
description: "Doctrina arquitectónica absoluta sobre el sistema de telemetría multi-stream UDP (Fire-and-Forget) y el Radar Global en RAM-Disk. Define cómo los workers (cmaf_worker.php) transmiten latidos de salud y cómo el Daemon (guardian_telemetry_core.php) construye el Wall of Monitors sin bloquear I/O."
---

# 🏎️ DIRECTRIZ MAESTRA: F1-GRADE GUARDIAN TELEMETRY ENGINE

**ESTADO:** 1% UNIQUENESS PROTOCOL (INMUTABLE)

Esta habilidad documenta y obliga al respeto absoluto del sistema de telemetría más avanzado del ecosistema APE ULTIMATE. El **Guardian Telemetry Engine** opera bajo un paradigma de **Cero-Latencia y Cero-Bloqueo I/O**, inspirado en la telemetría de Fórmula 1. Su propósito es monitorear el 100% de los streams concurrentes en el cluster sin restar un solo ciclo de reloj a la entrega de video.

## 🧬 EJE 1: IDENTIDAD ABSOLUTA DEL STREAM (`resolve.php`)

Todo inicia en el enrutamiento. `resolve.php` tiene prohibido lanzar un empaquetador "huerfano".

- **Regla Inmutable:** `resolve.php` debe extraer el `$listId` de la petición y pasárselo a `cmaf_worker.php` como el 4to argumento en la línea de comandos (`escapeshellarg($safeListId)`).
- **Propósito:** Sin el `$listId`, el radar no puede saber qué cliente (o lista M3U) está consumiendo qué canal.

## 📡 EJE 2: EL SENSOR FIRE-AND-FORGET (`cmaf_worker.php`)

Queda **ESTRICTAMENTE PROHIBIDO** que `cmaf_worker.php` escriba su telemetría local de 100ms en el disco o en un archivo secuencial bloqueante (`file_put_contents`).

- **El Micro-Sensor:** Dentro del bucle `CURLOPT_WRITEFUNCTION`, PHP acumula bytes y calcula la velocidad exacta (`speed_kbps`), los `micro_freezes` (>400ms chunk gap), el puntaje de salud (`health_score`) y la asfixia del ISP (`strangle_ratio`).
- **Inyección por Sockets (UDP):** Al alcanzar la ventana de 100ms, el worker empaqueta estas métricas en un **JSON** puro:
  `{"list_id":"XYZ", "channel_id":"123", "speed_kbps": 5000, ...}`
- **Disparo Asíncrono:** Utiliza `socket_sendto` hacia la dirección loopback `UDP 127.0.0.1:8125`. Si el daemon receptor está caído, el paquete simplemente se pierde en el vacío, **garantizando un impacto 0.00% sobre la fluidez del stream de video**.

## 🧠 EJE 3: EL DEMONIO OBSERVADOR (`guardian_telemetry_core.php`)

El núcleo del sistema es un servicio PHP minimalista corriendo en background (Supervisor/nohup/systemd) en el VPS.

- **Listen on UDP:8125:** Abre un socket crudo (`AF_INET, SOCK_DGRAM, SOL_UDP`) y utiliza `socket_select` con un timeout microscópico (100ms) para atrapar en ráfaga todos los paquetes de todos los workers.
- **Ensamblaje del Arreglo Multi-Dimensional:** Mapea el tráfico entrante en RAM: `$globalState[$listId][$channelId]`.
- **Destilado y Expulsión:** Revisa el diccionario global. Si algún canal no ha hecho *ping* en los últimos 10 segundos, su hilo se considera "muerto" y es atómicamente destruido de la memoria RAM.
- **Escritura en RAM-Disk (Atomic Rename):** Cada 500ms, codifica toda la matriz a JSON y la escribe en `/dev/shm/ape_guardian/live_telemetry_global.json` usando un cambio de nombre atómico (`@rename`) para prevenir lecturas corruptas.

## 🖥️ EJE 4: EXTRACCIÓN Y THE WALL OF MONITORS (`guardian_log.php` & `index-v4.html`)

- **El Puente (`guardian_log.php`):** Cuando el frontend solicita el estado general de la red, la API carga el diccionario maestro desde `/dev/shm` y lo inyecta completo bajo la clave `['f1_radar']`.
- **Renderización Neural Reactiva (`index-v4.html`):** El DOM fue purgando de pantallas estáticas. El contenedor `ape-f1-radar-wall` ahora utiliza un `CSS Grid` expansivo. Cada iteración de JS evalúa `data.f1_radar` e **inyecta dinámicamente o actualiza en tiempo real** una tarjeta visual de alta densidad por cada stream vivo.
- **Indicadores en la Tarjeta:** Muestra `Velocidad actual (100ms)`, `Bitrate Fuente`, `Health Score`, y el contador biométrico de `Micro-Freezes` con gradientes de color calculados algorítmicamente (Rojo/Naranja/Verde).

## 🛑 MANDAMIENTOS FINAL_ESTRICTOS

1. **NO MEZCLAR FFmpeg Progress con Custom JSON:** FFmpeg no tiene la semántica suficiente en su pipe primitivo UDP para transmitir `$listId`. El sensor *debe* permanecer a nivel de PHP en `curl_setopt`.
2. **NO TOCAR EL RAM-DISK:** Jamás usar el disco mecánico para telemetría a este nivel. Todo vive, respira y muere en `/dev/shm/`.
3. **MANTENER EL FIRE-AND-FORGET:** Si el socket falla, el stream debe continuar impasible. La caída de la telemetría no debe nunca estrangular la entrega del C-Engine al cliente.
