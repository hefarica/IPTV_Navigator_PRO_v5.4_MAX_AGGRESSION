---
name: Orquestación Suprema RFC 8216 y Consecuencia VLC Strict
description: Habilidad Maestra para orquestar más de 120 cabeceras (EXTVLCOPT, KODIPROP, EXTHTTP, EXT-X-APE) sin contradicciones, manteniendo TODO el poder masivo del DNA pero forzando el estándar RFC 8216 estricto (EXT-X-STREAM-INF seguido siempre y únicamente por su URL).
---

# 👑 ORQUESTACIÓN SUPREMA RFC 8216 Y CONSECUENCIA VLC STRICT

## 1. PROPÓSITO SUPREMO

Esta es la **habilidad maestra que gobierna TODAS las demás habilidades** del ecosistema APE ULTIMATE. Su objetivo es garantizar que la inyección masiva de cabeceras (>120 atributos entre `EXTVLCOPT`, `EXT-X-APE`, `KODIPROP`, `EXTHTTP`, etc.) se **preserve intacta y sea consecuente**, sin contradicciones, y con **100% de compatibilidad** con los parsers estrictos de **VLC, Kodi, TiviMate, OTT Navigator, Smarters Player y ExoPlayer**.

El ecosistema genera un poder inmenso con 116+ directivas `EXTVLCOPT`, pero si no se inyectan **en orden** y sin contradecirse, causan desbordamiento de socket, truncamiento de lectura y "saltos de canal" en VLC.

---

## 2. DOCTRINA DEL ARREGLO DINÁMICO (NO BORRAR, ORQUESTAR)

### ❌ PROHIBIDO

- **Eliminar** cualquier directiva `EXTVLCOPT`, `EXTHTTP`, `KODIPROP` o `EXT-X-APE` del pipeline.
- **Purgar** payloads JSON de `#EXTHTTP` bajo el pretexto de "simplificar".
- **Reducir** la cantidad de headers para "aligerar" la lista.

### ✅ OBLIGATORIO

- **Conservar** el 100% de los arrays de configuración tal como fueron diseñados.
- **Clasificar** cada directiva en su capa lógica correcta (VLC-Layer, Kodi-Layer, APE-Layer, JSON-Layer).
- **Orquestar** el ensamblaje final usando el `ApeOmniOrchestrator` para garantizar la secuencia RFC 8216.

---

## 3. REGLA DE ORO DEL M3U8 (DOCTRINA RFC 8216)

### A. La Ley del `EXT-X-STREAM-INF`

**Prohibido absolutamente** insertar líneas adicionales entre la etiqueta `#EXT-X-STREAM-INF` y el enlace directo (URL).

- VLC y reproductores estándar esperan que la URL variante esté en la línea **INMEDIATAMENTE SIGUIENTE**.
- Todas las inyecciones de cabeceras (`EXTVLCOPT`, `EXTATTRFROMURL`, `EXTHTTP`, `KODIPROP`) deben ir **ANTES** del `EXT-X-STREAM-INF`.

### B. Erradicación de Mock Extensions con Hash (`#`)

**Prohibido** insertar cadenas como `#/.mpd` o `#/.m3u8` en las URLs exportadas.

- VLC corta la URL al encontrar un `#` (hash de fragmento HTTP), lo que provoca peticiones truncadas, 404 del backend, y el salto compulsivo entre canales.

### C. Posición Estricta de `#EXTHTTP`

El JSON de EXTHTTP es **mandatorio** para el ecosistema APE, pero su posición es vital.

- Todos los payloads `EXTHTTP` deben inyectarse de forma inquebrantable, pero **NO pueden estar entre `EXT-X-STREAM-INF` y la URL**.
- Se posicionan en la sección superior del bloque, junto a los `EXTVLCOPT`.

### D. Eliminación de Preload Hints Simulados

**Prohibido** usar `PRELOAD-HINT:URI="preload-next.m3u8"` estáticos hacia rutas falsas que provocan loops de salto en VLC al no poder indexarlos.

---

## 4. EL MOTOR ORQUESTADOR: `ApeOmniOrchestrator`

### 4.1 Arquitectura del Motor

El `ApeOmniOrchestrator` es un algoritmo de clasificación y ensamblaje dinámico que se ejecuta **al final** de cada `generateChannelEntry()`. Intercepta el array crudo `lines[]` (que contiene todas las directivas ya generadas por el toolkit) y lo re-estructura para VLC Strict.

```javascript
const ApeOmniOrchestrator = {
    process: function(rawLines) {
        // ── CLASIFICADOR DE CAPAS ──
        const vlcLayer     = [];  // #EXTVLCOPT (VLC, OTT Nav, TiviMate)
        const kodiLayer    = [];  // #KODIPROP (Kodi, InputStream Adaptive)
        const apeLayer     = [];  // #EXT-X-APE-* (Motor APE Interno)
        const jsonLayer    = [];  // #EXTHTTP (JSON Headers para ExoPlayer/Smarters)
        const extInf       = [];  // #EXTINF (Siempre primero)
        const streamInf    = [];  // #EXT-X-STREAM-INF (Siempre penúltimo)
        const urls         = [];  // http... (Siempre último)
        const othersLayer  = [];  // #EXTATTRFROMURL, #EXT-X-START, #EXT-X-TELCHEMY, etc.

        for (const line of rawLines) {
            if (!line) continue;
            if (line.startsWith('#EXTINF'))              extInf.push(line);
            else if (line.startsWith('#EXTVLCOPT'))      vlcLayer.push(line);
            else if (line.startsWith('#KODIPROP'))        kodiLayer.push(line);
            else if (line.startsWith('#EXT-X-APE'))       apeLayer.push(line);
            else if (line.startsWith('#EXTHTTP'))         jsonLayer.push(line);
            else if (line.startsWith('#EXTATTRFROMURL'))  othersLayer.push(line);
            else if (line.startsWith('#EXT-X-STREAM-INF')) streamInf.push(line);
            else if (line.startsWith('http'))             urls.push(line);
            else othersLayer.push(line);
        }

        // ── ENSAMBLAJE ESTRICTO RFC 8216 ──
        // Orden: EXTINF → VLC → JSON → APE → KODI → Others → STREAM-INF → URL
        return [
            ...extInf,        // 1. Identificación del canal
            ...vlcLayer,      // 2. Directivas VLC/OTT (116+ arrays)
            ...jsonLayer,     // 3. Headers JSON para ExoPlayer/Smarters
            ...apeLayer,      // 4. Motor APE interno
            ...kodiLayer,     // 5. Kodi InputStream Adaptive
            ...othersLayer,   // 6. EXTATTRFROMURL, Telchemy, EXT-X-START
            ...streamInf,     // 7. Penúltimo: Declaración ABR
            ...urls           // 8. Último: URL LIMPIA (sin #)
        ].join('\n');
    }
};
```

### 4.2 Justificación del Orden de Capas

| Posición | Capa | Razón |
|----------|------|-------|
| 1 | `#EXTINF` | Identificación obligatoria del canal (RFC M3U) |
| 2 | `#EXTVLCOPT` | VLC los procesa en orden de aparición. Los primeros 30 son los críticos (`http-user-agent`, `network-caching`, `clock-synchro`) |
| 3 | `#EXTHTTP` | JSON para ExoPlayer/TiviMate. Leído como bloque opaco por reproductores no-VLC |
| 4 | `#EXT-X-APE` | Motor interno APE. Ignorado por VLC pero crucial para el resolver VPS |
| 5 | `#KODIPROP` | Kodi InputStream Adaptive. Procesado exclusivamente por Kodi |
| 6 | Others | `#EXTATTRFROMURL`, `#EXT-X-START`, `#EXT-X-TELCHEMY` — Metadatos |
| 7 | `#EXT-X-STREAM-INF` | **PENÚLTIMO ABSOLUTO** — RFC 8216 §4.3.4.2 exige que la URL siga inmediatamente |
| 8 | URL | **ÚLTIMO ABSOLUTO** — La URL del stream, limpia y sin hash fragments |

### 4.3 Compatibilidad Multi-Player

| Player | Lee EXTVLCOPT | Lee EXTHTTP | Lee KODIPROP | Lee EXT-X-APE | Lee STREAM-INF |
|--------|--------------|-------------|-------------|--------------|----------------|
| VLC | ✅ Primario | ❌ Ignora | ❌ Ignora | ❌ Ignora | ✅ RFC 8216 |
| OTT Navigator | ✅ Parcial | ✅ JSON | ❌ Ignora | ❌ Ignora | ✅ |
| TiviMate | ✅ Parcial | ✅ JSON | ❌ Ignora | ❌ Ignora | ✅ |
| Kodi | ❌ Ignora | ❌ Ignora | ✅ Primario | ❌ Ignora | ✅ |
| Smarters | ❌ Ignora | ✅ JSON | ❌ Ignora | ❌ Ignora | ✅ |
| ExoPlayer | ❌ Ignora | ✅ JSON | ✅ Parcial | ❌ Ignora | ✅ ABR Engine |

---

## 5. SECUENCIA DE RENDERIZACIÓN DE CANAL (RESULTADO FINAL)

Cada bloque de canal generado por el toolkit **DEBE** verse así después de pasar por el Orquestador:

```m3u8
#EXTINF:-1 tvg-id="tf1.fr" tvg-logo="..." group-title="FR",FR - TF1 FHD
#EXTVLCOPT:http-user-agent=OTT Navigator/1.6.9.4 (Build 40936) AppleWebKit/606
#EXTVLCOPT:http-referrer=https://iptv-ape.duckdns.org/
#EXTVLCOPT:http-accept=*/*
#EXTVLCOPT:network-caching=19000
#EXTVLCOPT:live-caching=19000
#EXTVLCOPT:file-caching=4750
#EXTVLCOPT:clock-jitter=0
#EXTVLCOPT:clock-synchro=0
[... TODAS LAS 116+ DIRECTIVAS EXTVLCOPT ...]
#EXTHTTP:{"User-Agent":"OTT Navigator/1.7.4.1","X-Hardware-Decode":"true","Connection":"close",...}
#EXT-X-APE-PROFILE:P3
#EXT-X-APE-NETWORK-CACHING:19000
#EXT-X-APE-BUFFER-STRATEGY:LAYERED_3
[... TODAS LAS EXT-X-APE ...]
#KODIPROP:inputstream.adaptive.manifest_type=mpd
#KODIPROP:inputstream.adaptive.buffer_duration=19
[... TODAS LAS KODIPROP ...]
#EXT-X-TELCHEMY-TVQM:VSTQ=50,VSMQ=50,EPSNR=45,MAPDV=10,PPDV=5
#EXTATTRFROMURL:https://iptv-ape.duckdns.org/resolve_quality.php?ch=4&sid=4&...
#EXT-X-STREAM-INF:BANDWIDTH=8000000,AVERAGE-BANDWIDTH=6400000,RESOLUTION=1920x1080,CODECS="hev1.2.4.L153.B0,mp4a.40.2",FRAME-RATE=60.000
http://line.tivi-ott.net/live/user/pass/4.m3u8
```

---

## 6. CONCLUSIÓN Y PENALIZACIÓN

Si algún generador:

1. **Imprime** una URL con `#/.mpd` o `#/.m3u8` → **VIOLA** esta habilidad.
2. **Separa** el `EXT-X-STREAM-INF` de su URL con otras directivas → **VIOLA** RFC 8216.
3. **Purga** headers EXTVLCOPT o EXTHTTP "para simplificar" → **VIOLA** la Doctrina de Conservación Total.
4. **Contradice** el formato (dice `format=cmaf` en EXTATTRFROMURL pero `manifest_type=mpd` en KODIPROP) → **VIOLA** la Consecuencia Universal.

**EL CÓDIGO INCUMPLIDOR DEBE SER CORREGIDO INMEDIATAMENTE SIN ELIMINAR NADA.**
