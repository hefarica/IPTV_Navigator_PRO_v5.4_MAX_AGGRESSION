---
name: sincronizador_netflix_max
description: Configura y sincroniza los módulos APE v9 en la interfaz para igualar la calidad visual de Netflix 4K HDR y alcanzar un Riesgo cercano a 0 con un Headroom >= 300%.
---

# Sincronizador de Calidad Absoluta (Filosofía Netflix/HBO Max)

## Objetivo

Configurar automáticamente los *toggles* y parámetros de los módulos APE en la interfaz para que trabajen en perfecta sincronía con los 34 headers de máxima calidad (HEVC, HDR, BT.2020). El fin último es lograr un **Risk = 0** (o lo más cercano posible) y un **Headroom >= 300%**, asegurando cero cortes y la mejor calidad de imagen producible, comparable a plataformas premium como Netflix 4K HDR y HBO Max Dolby Vision, aplicadas a su respectiva resolución.

## Procedimiento (Paso a Paso)

1. **Configuración de Estrategia Base (Obligatoria):**
   - La estrategia principal del perfil DEBE establecerse en `ultra-aggressive` o `aggressive`. Esto asegura que los tamaños de buffer, reconexiones en nanosegundos y los segmentos de *prefetch* se maximicen para obtener un alto Headroom.

2. **Auditoría de Módulos Críticos de Calidad Visual (Habilitar Obligatoriamente):**
   Asegúrate de que los siguientes módulos (Toggles) estén ACTIVOS mediante la API del frontend o marcación directa:
   - `Smart Codec Priority`: Para forzar siempre HEVC/H.265 como códec principal.
   - `Headers Matrix`: Para inyectar los 34 headers automatizados de Netflix/HBO Max sin error humano.
   - `Prio. Quality`: Para priorizar el bitrate y la fidelidad visual, omitiendo drop-frames.
   - `Directivas HLS Avanzadas`: Para soportar los tags nativos de HDR y perfiles HEVC High-Tier en el manifest.
   - `Elite HLS v16`: Para procesar arquitecturas de manifest multicapa y pesadas sin estrangular el parseo.
   - `KODIPROP/Manifest`: Mantiene la compatibilidad estricta 4K HDR con Exoplayer, VLC y Kodi.

3. **Auditoría de Módulos de Resiliencia (Objetivo: Risk = 0):**
   Para bajar el Riesgo de corte a cero absoluto y mantener un stream a prueba de balas:
   - `Session Warmup`: **ACTIVAR** (Pre-conecta sockets antes de que el usuario inicie el playback).
   - `Fallback Mode`: **ACTIVAR** (Evita interrupciones mediante conmutación en caliente si falla un segmento).
   - `ABR Control Predictivo`: **ACTIVAR** (La heurística se adelanta a los bajones de red del usuario antes de que ocurran).
   - `Redundant Streams`: **ACTIVAR** (Proporciona un stream de respaldo invisible y paralelo para evitar cortes físicos).
   - `Dual Client Runtime`: **ACTIVAR** (Para mantener dos conexiones simultáneas si el CDN principal flaquea).

4. **Auditoría de Módulos de Headroom (Objetivo: >= 300%):**
   Para asegurar que el buffer mantenga un tamaño que exceda por más de 3 veces (300%) la necesidad de consumo actual:
   - `Prefetch Optimizer`: **ACTIVAR** y cerciorarse de que el multiplicador BW Mínimo opere al 3× del bitrate como mínimo.
   - `Buffer Adaptativo Supremo`: **ACTIVAR** (Permite crecer el buffer dinámicamente según la RAM en milisegundos).
   - `Caché CDN`: **ACTIVAR** (Aprovecha los nodos Edge para maximizar la descarga anticipada).
   - `Throughput Tiempo Real`: **ACTIVAR** (Necesario para el cálculo algorítmico y matemático del Headroom en tiempo real).
   - `Latencia Rayo`: **DESACTIVAR** (La ultra-baja latencia riñe fundamentalmente con un Headroom alto. Las latencias de <5s exigen buffers pequeños, lo cual sube el riesgo y baja el headroom. Nuestra prioridad aquí es calidad fílmica y estabilidad 0 cortes, no latencia de deportes en vivo).

5. **Verificación de la Sincronización:**
   - Validar que al aplicar estos módulos, la métrica visual indique un Headroom >= 300%.
   - Validar que los buffers C1 (Network) y C2 (Live) del perfil queden configurados generosamente (>30,000ms a 60,000ms dependiendo si es FHD o 8K).

## Reglas Estrictas

- NUNCA actives el módulo `Latencia Rayo` (Ultra-low latency) simultáneamente al usar esta habilidad.
- NUNCA selecciones estrategias `balanced` o `conservative` en los perfiles si se sincronizan con este objetivo.
- NUNCA modifiques manualmente en la IU los 34 headers de calidad (quedaron gestionados en modo estricto READONLY por `ProfileManagerV9.QUALITY_MAPS`).
- NUNCA uses códecs que no sean H.265/HEVC a menos que el dispositivo cliente explícitamente regrese un *fallback* forzado a H.264.
- **OBLIGATORIO (Escalabilidad Matemática de Headroom 0 Cortes):** Los siguientes parámetros críticos ya no dependen del ID del perfil, sino que deben **escalar matemáticamente basados en la cantidad total de píxeles** de la resolución física (`width * height`), tomando 4K (8,294,400 píxeles) como base 1.0x:
  - **Bitrate y Throughput (t1/t2):** Escala a razón de `(Pixeles / 8.29M) * 13.5 Mbps`.
  - **Estrategia de Prefetch (Bandwidth & ISP Safe):** Crece proporcionalmente para mantener el 0-cuts, **pero restringiendo drásticamente el consumo de datos innecesario para conexiones de internet no ilimitadas**. 4K mapea ~15 segmentos (aprox 90s de buffer puro); y resoluciones superlativas escalan a un techo duro inquebrantable de 40 segmentos. Las conexiones HTTP paralelas se bloquean en un estricto máximo de 6 para cuidar el router y el ISP.
  - **Buffers Nativos de ExoPlayer:** Escala la memoria física partiendo de 35,000ms para 4K, y creciendo generosamente para resoluciones 8K y superiores.
  - **Física de Color:** Todo stream con un ancho `>= 3840` debe forzar el ecosistema de color HDR `BT2020` con matriz `BT2020NC`. Todo stream inferior puede caer en `BT709` de manera segura.
