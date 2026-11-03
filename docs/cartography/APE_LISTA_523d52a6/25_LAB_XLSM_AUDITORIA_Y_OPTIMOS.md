# APE_M3U8_LAB_v8_FIXED.xlsm — auditoría del canónico y valores óptimos propuestos

**Libro:** `APE_M3U8_LAB_v8_FIXED.xlsm` · 3.498 KB · sha256 `663ef44e2d69521eb0e77dda7b64a32ea4f942992f8f2c80614eaee8ec52806a`
**Método:** forense ZIP/XML (descomprimir + leer `sharedStrings.xml` y `worksheets/*.xml`).
**El libro NO se abrió en Excel ni se modificó.** Cero riesgo de corrupción.

---

## 1 · El libro ya tenía la pieza que yo estaba haciendo a mano

`10_HOMOLOGATION` — 32 filas, **29 conceptos semánticos cross-capa**, con columnas:

`Concepto semantico | Capas equivalentes | Transformacion | Unidad | Direccion | Notas`

Ejemplo real (fila 4):

> **buffer_seconds** → `EXTVLCOPT:network-caching, live-caching, file-caching, KODIPROP:assured_buffer_duration, max_buffer_duration, EXTHTTP:X-Buffer-Target, X-Min-Buffer-Time, SYS-NETWORK-CACHING, SYS-LIVE-CACHING, HLSjs.maxBufferLength` · **s × 1000 = ms**

**Eso es mi mapa de homologación, pero con 29 conceptos en vez de mis 15.** La regla del operador ya estaba diseñada aquí; lo que faltaba era el valor.

## 2 · Y la tabla de valores ya existía: `37_VALORES_UNIFICADOS`

**2.888 filas**, columnas: `Directiva | Capa | Nivel | Source | Valor_N1 | Valor_N3 | P0 | P1 | P2 | P3 | P4 | P5 | Score_ref`

Ordenadas por `Score_ref = 99.4`. Esta es la tabla que hace que el mismo valor llegue a todas las capas.

---

## 3 · EL DEFECTO ENCONTRADO: 138 celdas imposibles

| Medida | Valor |
|---|---|
| Filas totales | 2.888 |
| Filas con directiva en col A | 2.886 |
| **Celdas con valor > 1e15** | **138** |
| Celdas con fracción sospechosa | 0 |

**Muestra:**

```
headerOverrides.X-APE-TARGET-BITRATE  P0 = 2.0000000009999999E+33
headerOverrides.X-APE-TARGET-BITRATE  P1 = 1.000000005E+31
headerOverrides.X-APE-TARGET-BITRATE  P2 = 5.0000000199999998E+29
headerOverrides.X-APE-TARGET-BITRATE  P3 = 2.0000000800000002E+28
headerOverrides.X-APE-TARGET-BITRATE  P4 = 8.0000003500000097E+20
headerOverrides.X-APE-TARGET-BITRATE  P5 = 3.00000015000006E+19
headerOverrides.X-Initial-Bitrate     (los mismos seis valores)
```

**2×10³³ bps son ~10²⁴ veces la capacidad agregada de Internet.** No es un valor agresivo: es un número que ningún motor puede interpretar.

Y `X-Initial-Bitrate` repite exactamente los mismos números: dos directivas distintas con el mismo valor imposible, cuando el bitrate inicial **nunca** debe igualar el techo.

**Mecanismo probable:** la fila `X-APE-BITRATE` (fila 8) guarda la escalera en **Mbps** — `200,100,50,25 | 100,50,20,8 | 50,20,8,3 | 20,8,3,1 | 8,3,1 | 3,1,0`. Las filas de bitrate en **bps** debían multiplicar por 10⁶ y en su lugar acumularon un factor ~10²⁵. Es el mismo tipo de defecto que ya documenté en la lista: un valor que se propaga a todas las capas.

---

## 4 · Valores óptimos propuestos (teoría + ingeniería)

### 4.1 · Bitrate objetivo — derivado, no inventado

La escalera ya existe en `X-APE-BITRATE`. El objetivo en bps **es esa escalera × 10⁶**:

| Perfil | Escalera (Mbps) | **Óptimo TARGET-BITRATE (bps)** |
|---|---:|---:|
| P0 | 200 | **200 000 000** |
| P1 | 100 | **100 000 000** |
| P2 | 50 | **50 000 000** |
| P3 | 20 | **20 000 000** |
| P4 | 8 | **8 000 000** |
| P5 | 3 | **3 000 000** |

**Criterio:** el techo de la escalera en bps. Coincide con la tabla de bitrate por resolución que ya rige el repo (4K = 28 Mbps, 1080p60 = 12 Mbps): 200 Mbps para P0 es holgado y permite 8K.

### 4.2 · Bitrate inicial — debe ser MENOR que el objetivo

`initialBitrateEstimate` de hls.js y ExoPlayer existe para **arrancar rápido**, no para elegir la mejor variante. Si iguala el techo, el player pide 4K en la primera petición y el arranque se degrada o cae.

**Óptimo: 25 % del objetivo, redondeado al escalón inferior disponible.**

| Perfil | Óptimo INITIAL-BITRATE (bps) | Razonamiento |
|---|---:|---|
| P0 | **3 000 000** | arranca en el escalón más bajo y sube por ABR |
| P1 | **3 000 000** | idem |
| P2 | **3 000 000** | idem |
| P3 | **1 000 000** | enlace débil |
| P4 | **1 000 000** | idem |
| P5 | **1 000 000** | idem |

**Criterio:** arrancar con un valor que casi cualquier enlace sostiene; el ABR sube en 2-3 segmentos. Un initial alto es la causa clásica de "tarda en arrancar".

### 4.3 · Mis 15 familias — ya leídas del LAB, pendientes de confirmar

Del certificado `LAB_CALIBRATED_BULLETPROOF` (sha `345783e3…`, idéntico al que subes):

| Familia | LAB P4 dice | ¿Óptimo según ingeniería? |
|---|---:|---|
| `cache_red` | 52 000 ms | **discutible** — 105 s es latencia; 52 s sigue siendo mucho para directo |
| `reintentos_http` | 115 | 115 es razonable (ni 99 ni 350) |
| `timeout_http` | 5 000 ms | **bajo** — un timeout de 5 s corta en baches de móvil |
| `abr_factor` | 0.55 | **conservador de más** — hls.js usa 0.95; 0.85 ya es cauto |
| `livesync_rate` | 1.25 | correcto (default 1.5) |
| `max_buffer_length` | 52 | coherente con caché |
| `max_max_buffer_len` | 104 | correcto (2×) |
| `nudge_offset` | 0.1 | correcto (default) |
| `nudge_max_retry` | 7 | correcto (default 3, más tolerante) |
| `watchdog` | 3 | correcto |
| `frag_tolerance` | 0.25 | correcto (default exacto) |
| `luminancia_hdr` | 400 nits | **muy bajo** — un master HDR real declara 1000-4000 |
| `prefetch` | 8 | correcto (el repo fija 8 en `X-Concurrent-Downloads`) |
| `privacidad` | 1 | correcto |
| `buffer_floor` | 30 % | razonable |

**Dos merecen corrección por teoría, no por gusto:** `timeout_http` (5 s corta demasiado en redes móviles; 15-30 s es el rango operativo) y `luminancia_hdr` (400 nits no describe un master HDR; el rango real es 1000-4000).

---

## 5 · Qué haría falta para escribirlo

**No he modificado el libro.** Escribir en el SSOT exige `iptv-excel-safe-mode` completo:

1. `.bak_<timestamp>` antes de cualquier `Save()` — el libro tiene 1.675 KB de `vbaProject.bin` y 55 hojas
2. Una sola instancia COM, `try/finally` con `ReleaseComObject` + doble `GC.Collect`
3. `DisplayAlerts/AskToUpdateLinks/EnableEvents = $false` antes de `Open`
4. A1 notation para rangos con nombre (JS-ES separador `;` si se añade validación)

**Columnas a escribir** (F..L = N1, N3, P0, P1, P2, P3, P4, P5 según la cabecera de fila 2):
- Fila de `X-APE-TARGET-BITRATE` → `200e6, 100e6, 50e6, 20e6, 8e6, 3e6`
- Fila de `X-Initial-Bitrate` → `3e6, 3e6, 3e6, 1e6, 1e6, 1e6`
- Las 138 celdas imposibles: reescribir las que pertenezcan a estas dos directivas; **inventariar las restantes antes de tocarlas**

---

## 6 · Lo que este análisis NO prueba

- **No verifiqué que las 138 celdas sean solo de esas dos directivas.** Conté el total; el inventario completo por directiva está pendiente.
- **No leí las macros (`vbaProject.bin`, 1.675 KB).** No sé si el libro *recalcula* esos valores al abrir o al ejecutar el solver, ni si mi escritura sería sobrescrita. **Esto es crítico antes de escribir.**
- **No sé qué columnas son realmente P0..P5**: la cabecera dice `F=P0` pero el conteo de celdas sugiere que G..L son los seis perfiles. Confirmarlo es el primer paso de la escritura.
- **Los "óptimos" de §4.3 son criterio técnico documentable, no medición.** No cronometré arranque ni rebuffering con ningún valor.
