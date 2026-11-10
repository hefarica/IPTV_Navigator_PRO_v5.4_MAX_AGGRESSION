# INVENTARIO — Pestaña TELEMETRÍA (lo que se había realizado)

**Fecha del inventario:** 2026-11-10
**Método:** `git log` sobre los dos ficheros de la pestaña + lectura del código real
`vps-image-panel.js` (63 funciones) + `index-v4.html` + prueba HTTP de los endpoints.
**Nada de este documento viene de memoria: cada afirmación cita fichero y línea, o
un comando ejecutado.**

---

## 0. El hallazgo que explica que la pestaña se vea vacía

Los **11 endpoints `/jit/image/*` devuelven 502** porque el motor `ape-jit` está
**parado** desde 2026-11-09 08:34 UTC (lo paró el agente para cortar un bucle de
transcodificación 4K).

```
/jit/image/config         502      /jit/image/rules        502
/jit/image/capacity       502      /jit/image/gestor/state 502
/jit/image/matrix         502      /jit/image/llm-status   502
/jit/image/cascade        502      /jit/image/prisma/all   502
/jit/image/catalog        502      /jit/image/governance   502
/jit/image/lineup         502

/prisma/api/prisma-control.php         200  2.354 B   (no es del JIT)
/prisma/api/prisma-service-status.php  200  1.274 B   (no es del JIT)
```

El panel hace `Promise.all` y **si una llamada falla no pinta la sección**. Con las
11 en 502, la pestaña aparece **vacía**.

**No falta código. No falta despliegue. Falta el motor encendido.**

Verificado que **sí está desplegado e idéntico**:

```
index-v4.html          local 291.208 B sha256 0934fc14…  =  VPS 291.208 B sha256 0934fc14…
vps-image-panel.js     local 102.498 B sha256 548ee3d2…  =  VPS 102.498 B sha256 548ee3d2…
live server 127.0.0.1:5500  sirve el HTML con data-tab="telemetry", telemetryApeCalls,
                            telemetryEnabled, Guardian Engine v16, vps-image-panel.js
9/9 scripts de la pestaña  node -c -> EXIT 0, 0 errores de sintaxis
```

---

## 1. Capas que viven en la pestaña

### 1.1 V4.1 — Telemetría Rápida (`index-v4.html`)

| Qué | Dónde |
|---|---|
| Pestaña | `index-v4.html:1120` — `data-tab="telemetry"` |
| Panel mini | `:2262` `🆕 V4.1 FEATURE 2: TELEMETRÍA RÁPIDA` · `:2265` `.telemetry-mini-panel` |
| Título | `:2272` `Telemetría en Vivo` |
| Interruptor | `:2276` `id="telemetryEnabled"` |
| Contadores | `:2289` `telemetryApeCalls` · `:2300` `telemetrySuccess` · `:2311` `telemetryAvgTime` · `:2322` `telemetryOverrides` |
| Dashboard completo | `:2474` `🆕 V4.1 FEATURE 4: DASHBOARD TELEMETRÍA COMPLETO` · `:2477` `.telemetry-dashboard-section` |
| Lógica | `js/v41/telemetry-feedback-v41.js?v=4.1` (cargado en `:4291`, 2.613 B, `node -c` OK) |

### 1.2 APE Guardian Engine v16 — Telemetría Exchange

| Qué | Dónde |
|---|---|
| Sección | `index-v4.html:2788` y dentro del tab en `:3076-3096` |
| Lógica | `js/ape-v9/guardian-exchange-v16.js` (`:4893`, 9.239 B, `node -c` OK) |
| Vacío honesto | `:2904` `⏳ Sin canales activos — haz zapping para ver telemetría en vivo` |

### 1.3 Módulo de IMAGEN — 16 secciones, 63 funciones

Vive **dentro** de `#tab-telemetry` (`a31b0096`: antes estaba fuera de todo
`.tab-content` en el body y se veía en todas las pestañas; se movió a `L3083`,
seis líneas después de la apertura del tab en `L3077`).

Fichero: `js/ape-v9/vps-image-panel.js` · 102.498 B · cargado en `index-v4.html:5133`
como `?v=20261109-svc1`.

| # | Sección (función) | Línea | Qué hace |
|---|---|---|---|
| 1 | `buildSection` | 149 | Constructor de perfil completo |
| 2 | `llmSection` | 647 | Clave LLM, alineación, loop de perfección |
| 3 | `rulesSection` | 1134 | Tabla de reglas editable |
| 4 | `cascadeSection` | 1327 | Cascada de 13 codecs RFC 6381 |
| 5 | `matrixSection` | 1418 | Matriz de los 12 perfiles P0–P5.5 |
| 6 | `governSection` | 1462 | Gobierno VPS → player |
| 7 | `capacitySection` | 1523 | Capacidad MEDIDA en este host |
| 8 | `liveSection` | 1546 | Estado vivo (`/image/state`) |
| 9 | `packSection` | 1580 | Empaquetado |
| 10 | `persistSection` | 1611 | Persistencia del Gestor de Perfiles |
| 11 | `prismaSection` | 1715 | APE PRISMA |
| 12 | `serviceSection` | 1817 | Estado de SERVICIOS (3 señales por servicio) |
| 13 | `render` | 1929 | Pintado |
| 14 | `load` | 1968 | Carga con `Promise.all` |
| 15 | `startLive` | 2033 | Polling del estado vivo |
| 16 | helpers | 30–139 | `el` `api` `post` `logLine` `fld` `inp` `sel` `sec` `chip` `warn` `injectCss` |

**Acciones del constructor de perfil:** `applyRecommended` (443) · `applyDefaults`
(453) · `doOptimize` (461) · `doDeclare` (499) · `applyBuild` (512) · `applyBand`
(535) · `recalcOptimos` (551) · `loadProfile` (591).

**Alineación con el Gestor:** `doAlign` (756) · `markModified` (779) ·
`modifiedList` (783) · `doLoop` (793) · `doAlignAll` (826) · `doApplyAll` (847) ·
`doAlignLLM` (886) · `doApplyAlign` (908) · `renderAlign` (944).

**Reglas:** `ruleVal` (1256) · `saveRule` (1261) · `autoFillRow` (1290) ·
`deleteRule` (1318).

**Resto:** `doFallback` (1398) · `saveMatrixRow` (1449) · `loadPersist` (1690) ·
`loadPrisma` (1799).

### 1.4 Los ~30 endpoints que alimenta la pestaña

Todos bajo `S.base + '/image/…'`:

```
config · capacity · cascade · matrix · rules (+ /rules/auto, /rules/:id DELETE)
fallback · governance · declare · catalog · lineup?engine=
gestor/state · gestor/profiles · gestor/journal · gestor/pending
gestor/save · gestor/restore · gestor/backups
llm-key · llm-status · optimize-llm
profile/:pid/full?player= · profile/align · profile/align-loop
profile/align-all · profile/align-all/apply · profile/align-llm · profile/align/apply
prisma/all
```

Más los dos de `/prisma/api/` (`prisma-control.php`, `prisma-service-status.php`),
que **no dependen del JIT y responden 200**.

---

## 2. Los 25 commits que construyeron la pestaña

`git log --oneline -- <index-v4.html> <vps-image-panel.js>`

| Commit | Qué añadió |
|---|---|
| `9a0831fd` | Estado de SERVICIOS en TELEMETRÍA + toggle PRISMA (solo el `<script>`; la feature vive en el JS) |
| `1bdff664` | APE PRISMA implementado y auditado contra el APK real |
| `10cca510` | Persistencia real del Gestor de Perfiles (lo del LLM no se pierde) |
| `a1457eaa` | Auto-clasificación con los 12 perfiles canónicos |
| `c2f9f6d5` | El módulo carga los campos REALES del Gestor y lista los 12 perfiles |
| `f3ae408f` | Loop de perfección con alcance explícito y perfiles independientes |
| `c16f773d` | Ley de Preservación — nada se borra, nada se vacía, cascadas de 4 |
| `40c36a2d` | Los 12 perfiles (6.750 campos) y el modo del perfil manda |
| `f3abaaa3` | Ley de Suficiencia Excepcional — risk≤10 y headroom≥200% |
| `e05bbdd7` | Los 6 perfiles de golpe (3.366 campos) + suelo nativo anti-degradación |
| `3f899ddf` | Niveles L1–L7 con escalera ABR + LLM sobre los 577 campos |
| `430a3e6b` | Alineación de los 577 campos con cascada ABR y guardado al Gestor |
| `a79c320a` | Key LLM persistible en caliente + alineación con el Gestor |
| `c0c83eae` | Función objetivo REAL vs EMULADO + optimizador con LLM y fallback |
| `7cc003e9` | Recálculo automático de óptimos al cambiar resolución o entrada |
| `08c4563e` | Al elegir un perfil el constructor trae TODA su configuración |
| `6b2b0293` | La tabla lleva TODOS los campos del panel — encoder, filtros, empaquetado |
| `0ea7c97a` | Modo REAL vs EMULADO — la resolución siempre se puede colocar |
| `1134744b` | Tabla de reglas manual con auto por campo y botón óptimo por fila |
| `8f422348` | Cascada de 13 codecs con seriales RFC 6381 + fallback armable |
| `6c2a824f` | Panel único — constructor + matriz + gobierno, 24/24 |
| `8b60a3c3` | Matriz editable de 12 perfiles + gobierno VPS→player, 10.080 cálculos |
| `a4f77a12` | Los 12 perfiles del LAB instrumentados; viable/alternativa/nota; HALLAZGO: ninguno de los 12 destinos declarados es viable aquí, el único certificable es FHD_1080 |
| `1ee2b484` | `/image/state` — estado vivo + `output_observed` de ffprobe; fps real con `-r 25 -fps_mode cfr` |
| `6242672e` | El JIT FILTRA DE VERDAD — 3 defectos encadenados (`-c:v copy` con receta, `zscale` siempre, `x265-params` hardcodeando PQ) |
| `2daa0646` | Módulo de imagen instrumentado con control remoto desde la UI |
| `a31b0096` | **El panel de imagen pasa a la pestaña TELEMETRÍA** (estaba fuera, visible en todas) |

---

## 3. Estado verificado pieza por pieza

| Comprobación | Resultado |
|---|---|
| Pestaña existe | ✅ `index-v4.html:1120` |
| Panel dentro del tab | ✅ `L3083`, entre apertura `L3077` y el siguiente tab |
| Telemetría Rápida (4 contadores + toggle) | ✅ todos presentes |
| Dashboard completo | ✅ presente |
| Guardian Engine v16 | ✅ 4–6 ocurrencias |
| `telemetry-feedback-v41.js` | ✅ cargado, 2.613 B, `node -c` OK |
| Módulo de imagen, 16 secciones | ✅ 63 funciones, todas presentes |
| Scripts de la pestaña | ✅ 9/9 `node -c` EXIT 0 |
| local == VPS (HTML y JS) | ✅ hashes idénticos |
| live server sirve lo correcto | ✅ HTML con todas las marcas |
| **Endpoints `/jit/image/*`** | ❌ **502 — el JIT está parado** |
| Endpoints `/prisma/api/*` | ✅ 200 |

---

## 4. Lo único que falta

**Encender `ape-jit`.** El panel **solo lee** (config, matriz, reglas, gestor,
estado) — **no reproduce canales**, así que arrancarlo **no dispara** el bucle del
4K. Ese bucle solo aparece si alguien pide `/jit/live/<id>` de un canal 4K.

**Y hay un detalle que importa:** el paso `restart_if_was_active` añadido a
`deploy.sh` **no arranca servicios parados** (respeta el estado a propósito). Por
tanto **el deploy tampoco levantará el JIT**. La decisión de encenderlo es
explícita, de una persona, no del pipeline ni del agente.
