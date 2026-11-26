# RESUMEN EJECUTIVO — Integración APE 4K/6K (staging)

**Alcance:** worktree `C:\Users\HFRC\Desktop\IPTV_FASE2_STAGING` (detached en `5376eef6`), diff de 12
ficheros sobre `84f3231f`. **Sin push, sin despliegue, producción y VPS intactos.**

Este documento consolida el estado real con la ruta de evidencia de cada afirmación. Todo lo que no está
marcado como medido, está marcado como abierto con su causa.

---

## 1 · Cerrado y medido

| # | Capacidad | Evidencia |
|---|---|---|
| 1 | Selección de los 12 IDs por el **control visible** del profile manager | §16 · `clickVisible=ok` en las 12 filas |
| 2 | OFF emite 0 sidecar · ON emite 3 (uno por canal) | §42 · runner 12/12 |
| 3 | Geometría nominal por perfil, sin degradación (P0 = **7680x4320**) | §41 · §42 |
| 4 | `network-caching` = `L3_EXTVLCOPT` propio del perfil, en los 12 | §42 |
| 5 | Export a archivo privado con sha256 completo verificado por relectura | §22 · `APE_PRIVADO/fase8` |
| 6 | Reimportación efectiva por el control de la app | §22-§23 |
| 7 | Idempotencia del sidecar entre dos pasadas ON | §22 |
| 8 | Recuperación quirúrgica (quitar sidecar no toca EXTINF/URIs) | §39 |
| 9 | Recuperación byte a byte ON−sidecar == previo | generador sembrado (previo, con ambos LAB) |
| 10 | Consumidor del sidecar con validación de versión/capacidades y niveles separados | §25 · 17/17 PASS |
| 11 | Rollback completo ejecutado y restaurado | §26 |
| 12 | Rutas HTTP del arnés: loopback, testigo, origen, confinamiento | §27 · 8/8 |
| 13 | Lista real de 754 MB: 11.222 canales, 5,1 s, 140 MB de heap, cancelación 292 ms | §33 |
| 14 | `forceProfile`: la selección manda en geometría y caching | §35-§41 · commit `346b0fdd` |

## 2 · Abierto, con causa acreditada

| # | Cuestión | Estado | Causa / siguiente sonda |
|---|---|---|---|
| A | **Cluster HDR/audio/saturación** (`video-hdr` true→false, `HDR10PLUS`→`SDR`, `audio-channels` 2→6, `clock-jitter`→0, `saturation` 1.06→1.08) | **causa localizada, no corregida** | El importador no nombra esas claves (0 coincidencias de `video-hdr` en `ape-profiles-config.js`): `getProfile().vlcopt` no es el `vlcopt` del LAB (§49). Fix: añadir las claves a la homologación o pasar `vlcopt` sin filtrar, midiendo antes/después |
| B | **Selector automático** (`determineProfile`) | **NOT_RUN** | Función interna (`m3u8-typed-arrays-ultimate.js:8010`, uso en `:13921`), sin punto de entrada público; su decisión no aparece en el artefacto. Requiere instrumentar el generador |
| C | `includeExtrasByProfile` | **descartado con medición** | Activarlo para los seis `.5` no cambia nada (§48) |
| D | Herencia de buffers/prefetch/headers/límites fuera de `network-caching` | **parcial** | §40 mide 44 claves `#EXTVLCOPT`; 28 PASS / 10 FAIL en P0.5, resto sin veredicto por campo |

## 3 · Comandos de reproducción

```bat
:: suite del adaptador (204 aserciones)
node IPTV_v5.4_MAX_AGGRESSION\frontend\tests\ape-4k6k-audit-adapter.test.js

:: autotest de privacidad y confinamiento de rutas (8 casos)
node IPTV_v5.4_MAX_AGGRESSION\artifacts\integracion-4k6k\fase8-runner.js --selftest

:: matriz 12 perfiles contra la app real en Chrome
node IPTV_v5.4_MAX_AGGRESSION\artifacts\integracion-4k6k\fase8-runner.js "P0,P1,P2,P3,P4,P5,P0.5,P1.5,P2.5,P3.5,P4.5,P5.5"

:: verificación de geometría y caching por perfil
node IPTV_v5.4_MAX_AGGRESSION\artifacts\integracion-4k6k\matriz-final-check.js

:: herencia campo a campo
node IPTV_v5.4_MAX_AGGRESSION\artifacts\integracion-4k6k\herencia-multi-check.js
```

## 4 · Rollback

```bat
git -C C:\Users\HFRC\Desktop\IPTV_FASE2_STAGING stash push -u
git -C C:\Users\HFRC\Desktop\IPTV_FASE2_STAGING stash pop
```

Probado (§26): tras `stash push -u` el árbol queda limpio y los tres módulos nuevos desaparecen; tras
`stash pop` vuelven los 12 ficheros, las 4 referencias `<script>` del index y `node --check` = 0.

---

**NO se declara cierre integral.** El flujo principal (importar LAB → seleccionar 12 IDs → generar →
exportar → reimportar → verificar intención) está medido y verde; el tuning HDR/audio de los `.5` sigue
sin heredar y el selector automático sigue sin ser observable.

---

## 5 · Actualización 2026-11-21 — estado tras la serie de correcciones

**Verificado hoy en el worktree de staging:**

- Sintaxis de los 8 ficheros tocados: **8 OK / 0 FAIL**.
- Suite del adaptador: **PASS 204 · FAIL 0**.
- Cobertura de los 12 perfiles: **dos lotes de seis, ambos `EXIT=0` con `"fallos":[]`** — reproducible. Comando:
  `node fase8-runner.js "P0,P1,P2,P3,P4,P5"` y `node fase8-runner.js "P0.5,P1.5,P2.5,P3.5,P4.5,P5.5"`.

**Corregido durante la serie (con medición):**

- La selección del profile manager no llegaba al generador (`forceProfile`): ahora la geometría y el
  `network-caching` de cada perfil salen del propio perfil — **P0 emite 7680x4320 y 105000**, verificado.
- Los seis Premium `.5` heredan su `L3_EXTVLCOPT` (105000/72000/58000/55000/52000/30000), **6/6**.

**Abierto, con causa localizada:**

- **Doble escritor HDR**: `:4142` (LAB) y `:10704` (otra sección) emiten las mismas directivas; gana el
  segundo (P0.5 emite `SDR` frente a `HDR10PLUS` del LAB). Guarda de regresión presente pero inerte; el
  parche que probé **rompió la página y fue revertido**.
- **Selector automático** (`determineProfile`, `:8010`): interno, sin punto de entrada; su decisión no es
  observable en el artefacto.
- **Intermitencia del runner** con 12 perfiles de una tirada (carrera `--dump-dom` vs driver): mitigada con
  los dos lotes de seis. El patrón callback (usado con éxito en la prueba de 754 MB) queda como arreglo
  definitivo pendiente.
---

## 6 · Actualización final 2026-11-21 — verificado en el último ciclo

```
LOTE P0,P1,P2,P3,P4,P5             EXIT=0 · "fallos":[]
LOTE P0.5,P1.5,P2.5,P3.5,P4.5,P5.5  EXIT=0 · "fallos":[]
GUARDA_HDR_AUDIO PASS=12 FAIL=0
Suite del adaptador                 PASS 204 · FAIL 0
Sintaxis de los 8 ficheros tocados  8 OK / 0 FAIL
```

**Los seis defectos reales encontrados y corregidos, cada uno verificado en artefacto:**

| # | Defecto | Antes → Después | Sección |
|---|---|---|---|
| 1 | `forceProfile` no llegaba al generador | geometría de P3 → **7680×4320 en P0** | §35-§41 |
| 2 | `video-hdr` de los `.5` no heredaba | `SDR` → **`HDR10_PLUS`** | §65-§72 |
| 3 | `audio-channels` literal | `6` → **`2`** (del perfil) | §67 |
| 4 | `saturation` literal | `1.08` → **gradiente 1.06→1.00** | §76 |
| 5 | `clock-jitter` pisado por 6 presets | `0` → **2000/1000/1200** | §79 |
| 6 | `determineProfile` clasificaba UHD como FHD | `1920` → **3840 (P1)** con `sel=null` | §85 |

**Selector automático**: ejercitado en el flujo real con `entrada_mixta.m3u8`
(sha `73317b2088d72e2b4e922f193effa549573152069ee10f66092d39c268f918d5`): canal `UHD → P1` (3840) y canal
`FHD → P3` (1920), con `selectedProfile: null`. Es la primera evidencia de la ruta automática decidiendo por
canal.

**Pendiente único**: portar al runner de la matriz el patrón callback (`POST /resultado`) ya validado en la
prueba de 754 MB, para que los 12 perfiles salgan en una sola tirada sin depender de la carrera con
`--dump-dom`. Hoy se cubren con dos lotes de seis, reproducible.

**Errores propios documentados en la serie** (para no repetirlos): parchear código muerto dos veces (§57, §69),
una aserción de recuperación inválida sobre generador polimórfico (§39), comparar contra campos equivocados en
tres ocasiones (§29, §38, §52) y **tres ediciones del driver que rompieron el arnés** (§84, §58, §86), todas
detectadas y revertidas.