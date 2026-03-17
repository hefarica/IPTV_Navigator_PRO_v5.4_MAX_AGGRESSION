---
name: latencia_rayo_qos
description: "Crea directivas dinámicas de Auto-Speedtest en el frontend y manipula las cabeceras QoS/DSCP en el backend VPS para obligar a los ISPs a dar máxima prioridad al tráfico de streaming del reproductor, combatiendo el estrangulamiento (throttling) y ajustando la matemática a la velocidad de internet en vivo."
---

# Habilidad: Latencia Rayo QoS (Priorización Dinámica ISP)

Esta habilidad fue forjada para destruir los bloqueos de los proveedores de internet (ISP Throttling) mediante ingeniería de control de tráfico y adaptar físicamente el generador a la velocidad real de conexión.

## 📡 1. Módulo Snapshot de Red (Network State Profiler en 2do Plano)

El sistema no debe medir compulsivamente en cada generación, sino mantener un estado perfilado.

1. **Perfilado Asíncrono:** Mapear la red destino en segundo plano y asentar su topología (Ej: *Latencia Promedio, Ancho de Banda Confiable, Tasa de Interrupción*).
2. **Alertas de Congruencia:** Al presionar "Generar M3U8", el toolkit confrontará los requisitos de los perfiles (Bitrate, Prefetch) contra el Snapshot de Red. Emitirá una directiva dictando si la lista se ajusta o no a la realidad del Router/ISP.
3. **Inyección Resolutiva:** El snapshot alimenta la configuración y se incrusta matematicamente en las variables (Headroom, Buffer) para inyecciones deterministas de la lista final.

## 🚀 2. Inyección de QoS y Monitorización 1hz desde el VPS (Backend)

Debemos obligar legalmente a la red interna y a los routers puente a tratar nuestros paquetes de video como el Santo Grial basándose en la configuración enviada.

* **Sello de Alta Prioridad (QoS / DSCP):**
  La Directiva M3U8 incrustada por el generador dictará que tipo de tráfico debe cursar.
  Ejemplo en Exoplayer: `#EXTVLCOPT:network-caching-dscp=46` (46 indica Expedited Forwarding).
* **Monitorización e Inyección HLS Activa (1Hz):**
  El Servidor Flask/PHP (VPS), leyendo el perfil asíncrono transferido desde la UI (`#EXT-X-APE-MIN-BANDWIDTH-MBPS`, `#EXT-X-APE-NETWORK-CACHING-DSCP`), supervisará la entrega en `/segment` segundo a segundo.
  Cualquier paquete (`.m3u8`, `.ts`, `.mp4`) originado desde este resolver debe sobreescribir la capa de red con el TAG del tipo de servicio **TOS=0x18 (Flash Override)** o **TOS=0xb8 (Expedited Forwarding)** forzando a todo ISP y Modem que lea el frame a pasarlo con prioridad absoluta.

## 🛡️ 3. Interceptor Dinámico y Fallback Seguro (Frontend Toolkit)

El generador funcionará como una aduana inteligente que exige o dispensa la telemetría según el contexto o el rigor manual.

1. **Graceful Fallback:** Si un usuario intenta generar sin ningún "Network Snapshot" la app NO DEBE chocar. Presentará un Prompt advirtiendo la falta de datos pero ofreciendo generar con heurísticas seguras para que no se caiga el ABR bajo una conexión incógnita.
2. **Aduana Obligatoria (Force Prompt):** En el UI existirá una palanca para "Forzar Evaluación". Al activarse, obligará permanentemente a levantar el Prompt de Configuración QoS antes de cualquier generación, preveyendo si cambió de fibra o si degradó su internet, exprimiendo así la última gota del ancho de banda actual.

## 🧮 4. Reglas de Implementación

* [ ] Implementar arquitectura de *Network Profiling UI* para guardar la telemetría del router destino.
* [ ] Injectar el Prompt Pre-Fligh Modal Infranqueable en la UI que atrape las solicitudes de generación de los botones.
* [ ] Mapear validación cruzada antes de emitir cualquier M3U8 forzando o dispensado vía Graceful Fallback (`generateWithQoSCheck()`).
* [ ] Desplegar Inyección EXTVLCOPT de DSCP/TOS en los `.m3u8` generados.
* [ ] Construir lógica en rutinas del servidor `ape_server_v15_ultimate.py` / `resolve.php` para estampar paquetes a nivel socket (IP TOS / DSCP) segundo a segundo.
