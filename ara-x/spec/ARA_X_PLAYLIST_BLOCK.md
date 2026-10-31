# ARA-X — bloque de configuración en playlist (catálogo M3U Plus)

Versión del documento: `1` · Fecha: 2026-10-30 · Scope: `ara-x/spec/**`
Estado: **propuesta verificada contra el catálogo real** (no aplicada aún a la lista servida).

---

## 1. Estado medido del catálogo

`GET https://iptv-ape.duckdns.org/lists/APE_LISTA_4K.m3u8` (2026-10-30):

| Métrica | Valor medido |
|---|---|
| HTTP | `200`, `Content-Type: application/vnd.apple.mpegurl`, `Accept-Ranges: bytes`, `Cache-Control: max-age=300` |
| Tamaño servido | `572.170.477 B` (546 MB), sha256 `E27C03EB…E2A680` |
| Cabecera | `#EXTM3U … refresh="1800"` + `#EXT-X-VERSION:9` + `#EXT-X-INDEPENDENT-SEGMENTS` + `#EXT-X-START:TIME-OFFSET=-3.0` |
| Canales declarados | `#EXT-X-APE-CHANNELS:10631` (footer `VALIDATED:RFC8216-STRICT,verdict=PASS`) |
| `#EXTINF` | **10.631** (10.169.562 líneas totales) |
| `#EXT-X-STREAM-INF` | **10.631**, todos `RESOLUTION=3840x2160`, `hvc1.2.4.L153.B0`, `VIDEO-RANGE=PQ` |
| `#EXT-X-ARA-*` | **0** (la capa no existe todavía) |
| `#EXTATTRFROMURL` | 584.705 |
| `4KFALSE` | 42.524 |
| `#EXT-X-APE-8KFAKE` | **10.631**, `ENABLED=1;NEVER_REAL=1;TARGET=DISPLAY` |
| Perfiles | P1=808 · P3=2.300 · P4=7.523 (P0/P2/P5=0) |
| Duplicados | `tvg-id`=0, URLs=0 (10.631 únicas) |

> **Corrección de medición:** una captura previa de 150.410.194 B estaba **truncada** (2.795 `#EXTINF`,
> 2.794 URLs, un bloque sin URL al final). No debe usarse como denominador del catálogo. El E2E válido se
> ejecuta sólo sobre la captura completa y exige `EXTINF == #EXT-X-APE-CHANNELS`.

**Conclusión:** la lista no está “rota” ni le falta `VERSION:6`; ya está en un estadio superior.
Lo que falta es la capa de control ARA-X y su disciplina de placement.

---

## 2. Correcciones al bloque propuesto en el chat

| Propuesta original | Problema real | Corrección ARA-X |
|---|---|---|
| `#EXT-X-VERSION:6` | Downgrade: el archivo ya declara `VERSION:9`; bajarlo puede romper features ya usadas | **No emitir**. Conservar `VERSION:9`. |
| `#EXT-X-INDEPENDENT-SEGMENTS` | Ya está presente; duplicarlo es ruido | **No duplicar**. |
| `#EXT-X-START:TIME-OFFSET=0` | Ya existe `TIME-OFFSET=-3.0,PRECISE=YES`; duplicarlo deja dos valores contradictorios | **No duplicar**; conservar el existente. |
| `#EXT-X-ARA-MAX-RESOLUTION:7680x4320` | Ambiguo y peligroso: si un consumidor lo interpreta como resolución de **wire**, en S905X4 se declara un decode imposible (Ley Cardinal 1 / freeze 2026-06-08) | Separar **decode** (`3840x2160`) de **presentación** (`7680x4320`) y añadir `#EXT-X-ARA-8K-MODE:PRESENTATION`. |
| `#EXT-X-ARA-VPS-SYNC:https://…/sync` | La URL correcta es válida, pero **hoy da 404** | Mantener como *puntero inerte*, con `#EXT-X-ARA-SYNC:enabled` + cadencia; el endpoint se implementa aparte. |
| `#EXT-X-ARA-LCEVC-TARGET`, `#EXT-X-ARA-AI-SR:aggressive`, `FORCE-HDR:hdr10` | Venden procesamiento que el VPS no hace y codecs que no existen en el bitstream | **Prohibidos** (ver §6). |
| Token/clave en la lista | Secreto en artefacto público | **Prohibido**: sólo `HMAC-SHA256` como identificador de esquema; la clave vive en device/env. |

---

## 3. Bloque global canónico (inert metadata)

Placement: **después del bloque global `#EXT-X-APE-*` / `#EXT-X-SESSION-DATA` y antes del primer
`#EXTINF`** (en el catálogo actual, entre la línea ~128 y la 129). Una sola vez.

```m3u
#EXT-X-ARA-VERSION:2026.10.30-EVO
#EXT-X-ARA-SCHEMA:1
#EXT-X-ARA-DYNAMIC-CONTROL:enabled
#EXT-X-ARA-PROFILE-AUTO:true
#EXT-X-ARA-SYNC:enabled
#EXT-X-ARA-VPS-SYNC:https://iptv-ape.duckdns.org/sync
#EXT-X-ARA-SYNC-CADENCE:30
#EXT-X-ARA-AUTH:HMAC-SHA256
#EXT-X-ARA-CLIENT-TYPE:onn4k
#EXT-X-ARA-MAX-DECODE-RESOLUTION:3840x2160
#EXT-X-ARA-MAX-PRESENT-RESOLUTION:7680x4320
#EXT-X-ARA-8K-MODE:PRESENTATION
#EXT-X-ARA-THERMAL-AWARE:true
#EXT-X-ARA-THERMAL-TARGET:70
#EXT-X-ARA-FALLBACK:passthrough
#EXT-X-ARA-LIST-VERSION:2026-10-29T11:54:23Z
```

Notas:

- `MAX-DECODE-RESOLUTION` es la **capacidad real del decoder** del device declarado; para ONN 4K
  es `3840x2160`. `MAX-PRESENT-RESOLUTION` describe la **salida de presentación/emulación**.
- `8K-MODE:PRESENTATION` prohíbe cualquier lectura como “8K en el wire”.
- `AUTH` describe el esquema; **no** contiene token ni clave.
- `LIST-VERSION` permite cache-busting e idempotencia (se actualiza con el `Last-Modified` real).

---

## 4. Bloque por canal (opcional, sólo con evidencia)

Un único bloque por `#EXTINF`, antes de su URL, y sólo cuando el dato venga del probe/resolver
(no inventado). Máximo 6 directivas por canal para no inflar el catálogo.

```m3u
#EXT-X-ARA-CHANNEL-ID:3
#EXT-X-ARA-CONTENT-TYPE:GENERALISTA
#EXT-X-ARA-MOTION:slow
#EXT-X-ARA-PROFILE-HINT:P3
#EXT-X-ARA-8K:presentation
#EXT-X-ARA-THERMAL-BUDGET:75
```

Reglas:

- `PROFILE-HINT` ∈ `P0..P5` (no implica cambio de codec/resolución en el wire).
- `8K` ∈ `presentation|disabled` (nunca `wire`).
- `THERMAL-BUDGET` ∈ `[60,85]` °C.
- Si el canal no tiene evidencia, **no se emite bloque por canal** (fail-open).

---

## 5. Invariantes del catálogo (el validador debe probarlas)

1. `#EXTINF` = **10.631** antes y después; **1 URL por canal**; 0 `URI=` extra en `#EXT-X-MEDIA` /
   `#EXT-X-I-FRAME-STREAM-INF` (anti-509).
2. **0 URLs mutadas**: hash por URL idéntico antes/después. ARA-X no toca rutas ni credenciales.
3. **0 tags media-only nuevos** en el catálogo: no `#EXT-X-TARGETDURATION`, `#EXT-X-PART`,
   `#EXT-X-SERVER-CONTROL`, `#EXT-X-MAP` añadidos por esta capa.
4. **0 duplicados** de directivas ARA (`VERSION`, `SCHEMA`, `SYNC`, `8K-MODE` una sola vez).
5. **Idempotencia**: segunda pasada byte-idéntica (sha256 igual).
6. **Fail-open**: si el inyector falla, la lista sale exactamente como entró.
7. `node --check` y validador verdes; sin secretos.

---

## 6. Prohibiciones explícitas (truth-guards)

- `#EXT-X-ARA-MAX-RESOLUTION:7680x4320` (ambiguo) → usar el par decode/present.
- `#EXT-X-ARA-8K:wire` o `RESOLUTION=7680x4320` para S905X4 → freeze asegurado.
- `#EXT-X-ARA-LCEVC-TARGET:*` → no hay LCEVC real en el bitstream.
- `#EXT-X-ARA-AI-SR:aggressive` como promesa del VPS → el VPS no procesa píxeles.
- `#EXT-X-ARA-FORCE-HDR:hdr10` → HDR falso; PQ es hint de display, no un HDR real inventado.
- Cualquier tag que pretenda **ejecutar** código, instalar o habilitar ADB desde la playlist.
- Tokens, claves, `user:pass` o URLs firmadas dentro de directivas ARA.

---

## 7. Compatibilidad de players

`#EXT-X-ARA-*` es un tag desconocido para RFC 8216 y los players lo **ignoran** (§6.3.1). Aun así:

| Player | Comportamiento esperado | Acción |
|---|---|---|
| TiviMate / OTT Navigator | Ignoran tags desconocidos; parsean `#EXTINF` + URL | No requiere cambios |
| VLC / Kodi | Ignoran `#EXT-X-*` no reconocidos; `#EXTVLCOPT`/`#KODIPROP` siguen mandando | No mezclar ARA con esos bloques |
| ExoPlayer / hls.js | Ignoran en catálogo (no es media playlist) | No usar ARA para configurar el player vía HLS |
| APK ARA | Lee el bloque vía parser propio o `/a/` | Fuente de verdad: `/sync` + `/a/` |

La lista **no** configura al player: sólo declara intención. La configuración efectiva viaja por
`/sync` (respuesta) y `/a/` (atributos), que sí tienen consumidor real.

---

## 8. Integración (orden correcto)

```
generador (sin cambios por defecto)
   └─ post-emit: ara_x_injector (opt-in, fail-open)
        ├─ inserta bloque global + bloques por canal con evidencia
        └─ ara_x_validator (invariantes §5)
             └─ lista servida (mismos canales, mismas URLs)
```

No se edita el generador caliente en este baseline: el inyector es un paso posterior y opt-in.
Cuando se integre, el flag por defecto es **OFF** y con OFF la salida debe ser byte-idéntica.

---

## 9. Aceptación

- Inyector: 2ª pasada byte-idéntica; 10.631 `#EXTINF`; 0 URL mutada; 0 tag media-only.
- Validador: falla en fixtures de tag mal ubicado, URL extra, ARA duplicado y canal perdido.
- E2E sobre la captura real: conteos idénticos y `sha256` de entrada/salida en el reporte.
- Sin claves, tokens ni credenciales en la lista ni en los reportes.

---

## 10. Pendiente para el equipo (D1/I2/V2)

- Formalizar la gramática completa y el versionado (`ARA_X_MASTER_CONTRACT.md`).
- Implementar `ara-x/playlist/ara_x_injector.js` + `ara_x_validator.js` con fixtures.
- Ejecutar V2 sobre el catálogo completo y emitir `V2_e2e_report.md` con hashes.
