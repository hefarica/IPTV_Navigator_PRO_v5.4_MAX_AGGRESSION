# El suelo de bitrate: del 0,24 de la UI al dato del LAB

**Fecha:** 2026-11-03
**Síntoma:** el gestor mostraba `BITRATE FLOOR (MBPS)` = **0,24** con etiqueta `AUTO`.
**Deploy:** run `41649018442` **success**

---

## 1 · De dónde salía el 0,24

`profile-manager-v9.js`, `_computeBitrateFloor()`:

```js
const maxFloor = Math.max(0.1, bitrate * 0.8);   // el piso no puede pasar del 80% del bitrate
```

**0,24 = 0,3 × 0,8.** El perfil activo llevaba `settings.bitrate = 0.3`.

Ese recorte se escribió para que un suelo viejo no superase un objetivo nuevo, y es correcto **en tanto el
objetivo sea un objetivo**. Pero asumía que `bitrate` siempre es un valor sano. Con 0,3 no lo es.

**0,24 Mbps está seis veces por debajo del suelo más bajo del LAB (P5 = 1,5 Mbps) e inservible para SD.**

## 2 · La corrección

Prioridad en el cálculo, y el orden importa:

1. **`settings.bandwidth_floor`** — el suelo del LAB, en bps. Es dato del laboratorio.
2. `settings.bitrate_floor_mbps` — si el perfil lo trae.
3. `BITRATE_FLOOR_TABLE` por calidad.

Y el recorte cambió de criterio: **un `bitrate` por debajo de 1 Mbps no es un techo, es un dato roto.** En ese
caso no se recorta contra él: manda el suelo del LAB o la tabla, con **mínimo absoluto de 1 Mbps**.

### Simulación

| Caso | Antes | Ahora |
|---|---:|---:|
| bitrate 0,3 sin suelo | **0,24** | **5** |
| bitrate 0,3 con suelo 1,5 M | 0,24 | **1,5** |
| P0 (200 / 15 M) | 15 | **15** |
| P3 (15 / 5 M) | 5 | **5** |
| P5 (2 / 1,5 M) | 1,5 | **1,5** |

## 3 · El suelo ahora vive en la APP y viene del LAB

`ape-profiles-config.js` no declaraba `bandwidth_floor`. Se añadió `_ensureBandwidthFloor()` que corre al
cargar **y tras cada importación del LAB**, con esta precedencia:

| # | Fuente | Comportamiento |
|---|---|---|
| 1 | lo que ya trae el perfil | **manda** — si vino de un LAB importado, no se toca |
| 2 | `APE_LAB_V8_PROFILES[pid]` | el LAB embebido (se carga antes), copiado en bps |
| 3 | derivado del bitrate | 10 % con mínimo 1,5 Mbps, **marcado `derived_from_bitrate`** |

**No hay valores hardcodeados:** los seis salen del LAB. Si el LAB cambia, esto cambia solo.

### Resultado por perfil, y adaptación al botón

| Perfil | bitrate | suelo | fuente |
|---|---:|---:|---|
| P0 | 80 | **15 Mbps** | `lab_v8` |
| P1 | 40 | 12 Mbps | `lab_v8` |
| P2 | 20 | 8 Mbps | `lab_v8` |
| P3 | 10 | 5 Mbps | `lab_v8` |
| P4 | 5 | 3 Mbps | `lab_v8` |
| P5 | 2 | 1,5 Mbps | `lab_v8` |

El panel lee el suelo del perfil **activo**, así que al cambiar de botón cambia el umbral sin tocar código.

## 4 · El obstáculo que casi lo deja sin desplegar

**Tres intentos fallaron la verificación con los ficheros ya correctos en disco.** El deploy registraba el
sha correcto y la URL seguía devolviendo la generación anterior, con `Last-Modified` del día previo.

**Causa: `open_file_cache` de nginx.** Mantiene descriptores abiertos y sigue sirviendo ese descriptor hasta
que la entrada expira o el worker se recarga.

**Solución:** `nginx -t` y luego `nginx -s reload` tras instalar. Un reload **no es un restart**: relee
configuración, reemplaza workers y descarta los descriptores **sin cortar conexiones**. El chequeo corre
primero; si falla, el paso se detiene antes de recargar.

## 5 · Verificación final, desde fuera

```
m3u8-typed-arrays-ultimate.js  827.257 B  colorspace=iall=bt709 ×1   OK
profile-manager-v9.js          227.603 B  bitrateUtil ×3             OK
generation-output-panel.js      35.853 B  activeFloorMbps ×2         OK
ape-profiles-config.js         375.721 B  _ensureBandwidthFloor ×3   OK
```

## 6 · Lo que NO se verificó

- **No abrí la UI en un navegador.** El cálculo se validó por simulación con los valores del LAB; el render
  del campo y el clic en el botón de perfil no se ejercitaron.
- **No sé por qué ese perfil tenía `bitrate = 0.3`.** La corrección lo tolera, pero el origen del dato roto
  no lo investigué. Puede ser un perfil custom del usuario o un guardado antiguo en `localStorage`.
- **`bandwidth_floor` en bps convive con `bitrate` en Mbps** dentro del mismo `settings`. Funciona, pero es
  una trampa para el próximo que lea el objeto.
