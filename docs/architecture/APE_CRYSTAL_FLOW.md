# APE CRYSTAL FLOW — nombre propuesto del sistema completo

> **Estado: ADOPTADO (2026-11-15).** El operador lo pidió
> (*«¿cómo vamos a llamar este proceso o sistema?»*) y el nombre se usa como
> referencia del sistema vigente del repo desde
> [`ESTADO_DEL_ARTE_20261115.md`](ESTADO_DEL_ARTE_20261115.md) §5.
> Las alternativas del final quedan como registro histórico de la decisión.

---

## Qué es

**APE CRYSTAL FLOW** es el nombre del pipeline completo que va **de la lista al
píxel y de vuelta al servidor**. No es la APK, ni el VPS, ni el generador por
separado: es el conjunto, con sus cinco estaciones y los contratos entre ellas.

**Lo definió el operador con estas palabras:**

> *«cuando te hablo del sistema es todo lo que sucede con la imagen y el proceso
> de mejora: M3U8 >> VPS >>> APK >> SHIM >>> VPS»*

---

## Las cinco estaciones

```
  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │ 1 GENERADOR  │──▶│ 2 CABLEADO   │──▶│ 3 AGENTE     │──▶│ 4 SHIM       │──▶│ 5 MEDICIÓN   │
  │  (Navigator) │   │   (VPS)      │   │   (APK)      │   │  (loopback)  │   │   (VPS)      │
  └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
     .m3u8 con         /pulse/<id>        settings, HDR     fija variante      QoE, zapeo,
     949 directivas    + caché + token    display, canary   y mapea segmentos  latencia, 4xx
     por canal         + un solo slot     + overlay         (no degrada)       y 5xx medidos
```

### 1 · GENERADOR — el Navigator

**Dueño:** el generador JS del repo (`frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js`).

**Produce:** una `.m3u8` con las directivas por canal. **Medido:**
`#EXT-X-APE-CHANNELS:21224`, `catchup="flussonic"`, `#EXT-X-VERSION:9`.

**No hace:** no transporta vídeo. **No decide** qué variante aguanta el dispositivo.

---

### 2 · CABLEADO — el VPS envuelve

**Dueño:** el cableador (`tools/ops/ape-cablear*.php` / `vps/bin/ape-cablear-queue-worker.sh`).

**Produce:** la misma lista con **cada URL del proveedor envuelta en `/pulse/<id>`**.

**Medido (2026-11-14):**

| Dato | Valor |
|---|---|
| Lista cableada | `APE_LISTA_1794100720046_CABLEADA.m3u8` · 1.298.222.092 B |
| Canales | **21.224** |
| Canales con `/pulse/` | **21.224** (100 %) |
| Tiempo de manifest `/pulse/` | p50 **704 ms** · caché **1 ms** |

**Invariantes:** un solo slot por lista (el proveedor corta a 1 conexión) · el
reproductor tiene prioridad absoluta sobre cualquier canary o JIT.

---

### 3 · AGENTE — la APK aplica

**Dueño:** `com.ape.crystalagent` (APE Crystal Agent).

**Hace tres cosas, y solo tres:**

1. **Aplica settings** de imagen que el VPS dicte (allowlist + regex de valor).
   **Medido: 12 aplicados** — `hdr_conversion_mode=1`,
   `user_preferred_resolution_width=3840`, `match_content_frame_rate`,
   `minimal_post_processing_allowed=0` (MAX IMAGE).
2. **Mide y reporta** (heartbeat, QoE).
3. **Monta el overlay** de upscaling cuando detecta reproducción —
   **sin Activity, sin robar el foco**.

**No hace (y está verificado que no hace):**

- **No abre ventanas encima de otras apps.** El overlay va por `WindowManager`.
  **Prohibido `startActivity`** en el camino de reproducción (riesgo residual
  documentado en `BadgeOverlay.kt` y `UpscaleBadgeActivity.kt`).
- **No configura OTT.** OTT no expone intent público para añadir proveedores;
  el alta de la lista es manual y lo hace el operador.

---

### 4 · SHIM — el proxy loopback

**Dueño:** `dev.venice.ottshim` (módulo `:shim` dentro del mismo APK).

**Hace:** sirve la fuente por `127.0.0.1` para **fijar la variante** y **mapear
los segmentos**, de modo que el player no baje de escalón.

**Medido:** sirve el **catálogo entero (600.000 B) en 1 s**; auto-arranca con
`AgentService`; `sockets=1 · acepta=1`.

**Límite honesto:** con un catálogo multi-canal hace **passthrough** (no
reescribe) porque su rewriter no termina con 22 millones de líneas. Su valor
está en un master o media playlist de un canal.

---

### 5 · MEDICIÓN — vuelve al VPS

**Dueño:** el vigilante de módulos + `/prisma/api/*` + los logs de nginx.

**Es la estación que impide «vivir convencido de que funciona».** Mide:

| Qué | Cómo | Dato del 2026-11-14 |
|---|---|---|
| Canales que sirven | censo HTTP con UA de player | **89 de 100 → 200** |
| Segmento real | `/seg/` bytes + sync TS | 15.435.176 B · 1.270 ms · `0x47` |
| Zapeo | `rt`/`urt` de `playlist_access.log` | manifest p50 704 ms |
| Módulos vivos | vigilante cada 60 s, HTTP real | **6/6 verde** |
| Canary | endpoint + restauración | 302 |
| 4xx/5xx | clasificados, no disfrazados | `403`/`407` **del proveedor**, 0 × `502` |

---

## Por qué este nombre

- **APE** — el ecosistema ya se llama así (APE Crystal Agent, ape-pulse).
- **CRYSTAL** — la doctrina de imagen del repo (`CRYSTAL_4K_ENHANCEMENT_LAW`).
- **FLOW** — porque lo que se describe es un **flujo**, no un producto: la lista
  entra, se transforma cinco veces y vuelve convertida en medidas.

**No es «el sistema APE» a secas** porque hay más piezas en el repo (el LAB, el
generador, los contratos). **FLOW nombra el camino**, que es lo que el operador
describió.

---

## Alternativas (para decidir el operador)

| Nombre | Cuándo encaja mejor |
|---|---|
| **APE CRYSTAL FLOW** | propuesta: el flujo completo, cinco estaciones |
| **CRYSTAL FLOW** | más corto, mismo significado |
| **APE PIPELINE** | si se quiere un tono más técnico |
| **SISTEMA APE** | si se prefiere el nombre llano que usa el operador |

---

## Qué NO es este documento

- **No adopta el nombre.** Es una propuesta; la decisión es del operador.
- **No declara que el flujo esté completo.** Lo que está medido y lo que falta
  está en la tabla de la estación 5 y en `artifacts/HALLAZGOS_2026-11-14.md`.
- **No promete mejora de imagen por VPP.** Los cuatro levers de VPP/AI-PQ
  (`pq_ai_sr_enable`, `ai_sr_level`, `pq_sharpness_enable`, `pq_hdr_mode`)
  devuelven **`null`** en este firmware: **no existen en este SoC**.
