---
name: Protocolo Anti-Downgrade Resolution-Driven (SSOT)
description: Regla arquitectónica inmutable que desvincula los perfiles P0-P5 de resoluciones estáticas e impone el campo "resolution" como Single Source of Truth (SSOT). Prohíbe el downgrade artificial de canales y exige homogeneidad de perfiles en las listas generadas.
---

# Protocolo Anti-Downgrade Resolution-Driven (SSOT)

**Nivel de Regla:** Absoluto / Inmutable
**Clasificación:** Arquitectura Quality Assurance / Zero-Downgrade
**Objetivo:** Erradicar fallas críticas donde canales nativos de alta calidad (ej. 4K) son rebajados artificialmente a resoluciones inferiores (ej. FHD/1080p) debido a conflictos en la asignación de perfiles o redefiniciones en cascada.

---

## 1. El Paradigma "Resolution-Driven"

**El concepto de que "P1 = 4K y P3 = FHD" HA QUEDADO OBSOLETO.**

1. **P0 a P5 son 'Bolsas de Parámetros' (Perfiles):** Definen el bitrate, codecs, agresividad del prefetch, evasión y buffers. *NO definen una resolución matemática fija o inamovible transversal a todo el frontend*.
2. **El campo de Resolución es el Rey:** La resolución de cada perfil es inyectada dinámicamente desde la Interfaz gráfica de usuario mediante el selector de resoluciones (`pm9_resolution`).
3. **Single Source of Truth (SSOT):** En una lista final (`.m3u8`), cada perfil `P{n}` debe contar con **EXACTAMENTE UNA SOLA DEFINICIÓN DE RESOLUCIÓN**.
    * Ejemplo: `#EXT-X-APE-PROFILE-P2-RESOLUTION:1920x1080`.
    * Si un mismo perfil (ej. P2) se declara con `1920x1080` al inicio y luego con `3840x2160` a la mitad del archivo, se produce un colapso en el reproductor resultando en un downgrade por seguridad.

---

## 2. Doctrina del "Nunca Downgrade"

1. **Prioridad del Origen:** Si el servidor IPTV maestro (Xtream Codes u original) ofrece una resolución nativa superior (Ej. UHD/4K), el pipeline de APE ULTIMATE (generadores de lista, `channels_map.json` y `resolve.php`) está **estrictamente prohibido de forzar matemáticamente un downgrade** solo porque el canal fue clasificado en un "perfil bajo".
2. **Auto-Upgrade Inmediato:** Si el canal era histórico de 720p y de repente el proveedor sube un stream 1080p, el sistema de resolución (Backend) debe engancharse al "master playlist origin" y extraer el `#EXT-X-STREAM-INF` con mayor RESOLUTION.
3. **Tope Máximo Dinámico:** La variable `max_resolution` inyectada en el M3U (`KODIPROP` o `EXTVLCOPT`) debe permitir buscar hasta lo más alto que permita el hardware (Ej. `MAX` o `7680x4320`), para no acuartelar el canal.

---

## 3. Implementación Estricta

Para que esto se cumpla, todo Agente debe asegurar las siguientes verificaciones en el código:

### Fase A: Listas Construidas (Generadores JS)

* **Bloque Único (Embedded Config):** Todas las definiciones de perfil `#EXT-X-APE-PROFILE-P{n}-*` deben inyectarse exclusivamente en la cabecera del documento (`GLOBAL HEADERS`).
* **Prohibición de Redefinición:** Ningún iterador de canales debe reescribir la resolución del perfil a nivel global en el ciclo de canales (`generateChannelEntry`).

### Fase B: El Mapeo (channels_map.json)

* Los metadatos almacenados en el mapa deben promover el descubrimiento de la calidad. `fusion_directives.max_resolution` se mantendrá en valores asintóticos (Ej. `4320p`) para habilitar el auto-upgrade.

### Fase C: Ejecutor VPS (resolve.php)

* **Protocolo de Recalibración Profunda (Deep Recalibration):** Al detectar una variante Master M3U8 con mayor resolución (ej: 4K), el backend de PHP está **obligado a escalar el perfil completo** (ej: de P3 a P2).
* **Herencia de Directivas:** Esta escalación garantiza que el stream herede automáticamente la matriz de 120+ headers correspondientes a la alta gama, incluyendo:
  * **Espacio de Color:** Cambio automático a BT.2020 y HDR10/Dolby Vision.
  * **Prioridad Requerida:** Elevación de `X-Request-Priority` a rangos 'ultra-high'.
  * **Matemática de Caché:** Adopción de las ventanas de prefetch y buffer industrial de los perfiles premium.
* **Soberanía del Origen:** El sistema siempre preferirá la calidad máxima del proveedor, recalculando el ADN del stream en tiempo real.

---

## 4. Validación Continua (Quality Guard)

Queda establecido el uso obligatorio del script `quality_guard_resolution_driven.py` para someter a estrés las listas generadas.
Este script audita sintácticamente que no haya conflictos de perfiles y que el metadata del grupo/nombre (Ej. "UHD") no quede castigado por un perfil de pobre resolución en la declaración.
