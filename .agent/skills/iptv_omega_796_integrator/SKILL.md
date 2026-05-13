---
name: iptv-omega-796-integrator
description: Integra la arquitectura OMEGA CRYSTAL V5 de 796 líneas por canal (capas L0-L10, polimorfismo, idempotencia, evasión Phantom Hydra) dentro del generador m3u8-typed-arrays-ultimate.js. Usar cuando el usuario pida actualizar su generador IPTV a 796 líneas, inyectar OMEGA V5, aplicar polimorfismo/idempotencia a la lista, o integrar evasión Phantom Hydra en el generador M3U8.
---

# IPTV OMEGA CRYSTAL V5 — Integrador 796 Líneas

Integra la estructura definitiva de 796 líneas por canal en el generador `m3u8-typed-arrays-ultimate.js`, preservando todos los sistemas existentes (UAPhantomEngine, Córtex, Capacity Overdrive, buildChannelUrl).

## Principios de la Arquitectura

**Identidad dual:** cada lista muta hacia el exterior (ISP/DPI), es estable hacia el interior (Resolver/caché).

- `_nonce796 = generateRandomString(8)` → cambia en cada descarga → evasión DPI
- `_sid796 = FNV32(ch.id + 'OMEGA_STATIC_SEED_V5')[:16]` → nunca cambia → cache key del Resolver PHP (<5ms HIT)

Para el detalle completo de las 10 capas y sus directivas, leer [references/omega_layers.md](references/omega_layers.md).

## Flujo de Trabajo

### 1. Recibir el archivo del usuario

El usuario proporciona su `m3u8-typed-arrays-ultimate.js`. Guardarlo en `/home/ubuntu/upload/`.

### 2. Identificar los puntos de corte

Ejecutar para localizar `generateChannelEntry` y sus límites:

```bash
python3 -c "
with open('/home/ubuntu/upload/m3u8-typed-arrays-ultimate.js') as f:
    lines = f.readlines()
for i,l in enumerate(lines,1):
    if 'generateChannelEntry' in l or 'const reqId' in l or 'return lines.join' in l:
        print(i, l.rstrip())
"
```

Los puntos de corte son:
- `CUT_START`: línea con `const reqId = ` (primer token de sesión, inicio del bloque a reemplazar)
- `CUT_END`: línea con `return lines.join` (fin del bloque a reemplazar)

### 3. Ejecutar el script de integración

El script `omega_integrator.py` automatiza la inyección. Ajustar `CUT_START` y `CUT_END` según los valores encontrados en el paso anterior (valores por defecto: 5433 y 5886 para la versión 22.2.0).

```bash
cp /home/ubuntu/skills/iptv-omega-796-integrator/scripts/omega_integrator.py /home/ubuntu/upload/
cd /home/ubuntu/upload && python3 omega_integrator.py
```

El script produce `m3u8-typed-arrays-ultimate.js` con el bloque OMEGA V5 inyectado.

### 4. Verificar la integración

```bash
python3 -c "
import re
c = open('/home/ubuntu/upload/m3u8-typed-arrays-ultimate.js').read()
checks = ['UAPhantomEngine','IPTV_SUPPORT_CORTEX_V_OMEGA','CAPACITY_MULTIPLIER',
          '_nonce796','_sid796','OMEGA_STATIC_SEED_V5',
          '#EXT-X-APE-BUFFER-NUCLEAR:','#EXT-X-PHANTOM-HYDRA:','#EXT-X-MEDIA:TYPE=AUDIO']
for k in checks:
    n = c.count(k)
    print('OK' if n>0 else 'FALTA', k, n)
"
```

Todos los checks deben mostrar `OK`. Si alguno muestra `FALTA`, revisar los puntos de corte del paso 2.

### 5. Empaquetar y entregar

```bash
cd /home/ubuntu/upload
zip -9 m3u8-typed-arrays-ultimate_OMEGA_V5_INTEGRADO.zip m3u8-typed-arrays-ultimate.js
```

Adjuntar el ZIP al mensaje de resultado con la instrucción de ruta:
```
C:\Users\...\frontend\js\ape-v9\m3u8-typed-arrays-ultimate.js
```

## Compatibilidad HLS

Las directivas propietarias (`#EXT-X-APE-*`, `#KODIPROP`, `#EXTVLCOPT`, `#EXTHTTP`) son **ignoradas por parsers HLS estándar** (RFC 8216 §4.1: líneas desconocidas se ignoran). La cadena de degradación de 7 niveles garantiza reproducción en cualquier dispositivo.

## Distribución de 796 Líneas

| Capa | Directiva | Líneas |
|------|-----------|--------|
| L0 | `#EXTINF` + `#EXT-X-STREAM-INF` | 2 |
| L1 | `#EXTVLCOPT` (110 opciones VLC/ExoPlayer) | 110 |
| L2 | `#EXTHTTP` JSON enriquecido | 1 |
| L3 | `#KODIPROP` Kodi ISA | 65 |
| L4 | `#EXT-X-CMAF` Pipeline fMP4 | 25 |
| L5 | `#EXT-X-APE-HDR-DV` HDR10+/DV | 45 |
| L6 | `#EXT-X-APE-TELCHEMY` QoS/QoE | 10 |
| L7 | `#EXTATTRFROMURL` Puente L2-L7 | 53 |
| L8 | `#EXT-X-APE-*` Núcleo Crystal (23 secciones) | 470 |
| L9 | `#EXT-X-PHANTOM-HYDRA` Evasión | 13 |
| L10 | `#EXT-X-MEDIA` + `#EXT-X-I-FRAME` + `#EXT-X-STREAM-INF` + URL | 5 |
| **TOTAL** | | **796** |

Ver detalle completo de cada sección en [references/omega_layers.md](references/omega_layers.md).
