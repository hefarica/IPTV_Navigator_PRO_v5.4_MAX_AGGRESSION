# PANEL DE INTEGRACIÓN DE LISTAS — UI para cablear UNA lista concreta (2026-11-14)

**Autor:** http-prober (equipo canary-jit-20261111) · **Tarea:** t61 · **Kind:** implementation
**Pedido del operador (literal):** *"un panel de integración de listas para cablearlas y que no sea la última, sino que sea una en particular, para que pueda en un campo colocar una lista cualquiera que se desee cablear para que el sistema la integre al sistema"*

---

## 0. ESTADO

> **Implementado, alineado con el backend REAL y verificado con `node -c` (exit 0).** Sin probar en navegador (no hay navegador aquí; se documenta la prueba manual). **Sin desplegar.**

| Entregable | Ruta | bytes | sha256 |
|---|---|---|---|
| Panel (JS) | `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/list-cablear-panel.js` | 26.571 | `b9f902818135870cf61911b98437d65fe85b48d5ac7e88840992c1fa63651f76` |
| Entrada de despliegue (preparada, **NO** aplicada) | `IPTV_v5.4_MAX_AGGRESSION/frontend/CABLEAR_PANEL_DEPLOY_ENTRY.md` | 2.830 | `749212fed13e94ed31ae2b3c6f1b75b2f313e10de7247d7c7def666b42c0b7b4` |
| Include en la UI | `IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html` | **+6 líneas, −0** | `git diff --numstat` = `6 0` |

---

## 1. HALLAZGO IMPORTANTE: el backend apareció A MITAD de la tarea, y NO coincidía con el contrato

Al empezar, los ficheros de t60 **no existían** (`cablear.php`, `cablear-estado.php` → FALTA). Empecé
contra el contrato de t59. **Durante la implementación t60 aterrizó**, y al leerlo encontré **4
divergencias reales** entre el contrato escrito y el código. El encargo dice "ajústate a ellos [los
endpoints de t60]", así que **mandó el código** y el panel se corrigió:

| # | Divergencia encontrada | Contrato (t59) | Implementación (t60) | Qué hice |
|---|---|---|---|---|
| 1 | **Forma del error** | `error:{codigo, motivo}` (anidada) | **`{ ok:false, error:'E_CODE', motivo:'texto' }`** (PLANA, en `list_cablear_core.php:378-379`) | `motivoLiteral()` acepta **ambas** formas. Sin esto el operador habría visto `E_LISTA_NO_EXISTE` **sin el motivo** |
| 2 | **`url_cableada` con `publicar=0`** | no lo decía | **`null` por diseño** (`list_cablear_core.php:560`, invariante I3: solo si `publicada`) | Añadido **checkbox «publicar»** (por defecto **desmarcado** = default del contrato) + aviso explícito cuando `done` y no publicada |
| 3 | **Auth opcional `X-APE-Key`** | "se hereda, no se define" | si el VPS define `APE_CABLEAR_KEY`, **exige `X-APE-Key`** → 401 `E_NO_AUTORIZADO` (`list-cablear.php:43-51`) | El panel envía `X-APE-Key` **si** la página expone `window.APE_CABLEAR_KEY` (o está en localStorage). Si no, no inventa nada |
| 4 | **`?ultimos=N`** | "lista de los N más recientes" (sin forma) | **`{ ok:true, count:N, tickets:[…] }`** (`list_cablear_core.php:537-540`) | El panel lee `j.tickets` (y sigue aceptando array plano, sin inventar campos) |

**Nota de arquitectura del backend (útil para el capitán):** hay **dos paths por endpoint**, con una
sola lógica: `cablear.php` → `require list-cablear.php` → `require_once list_cablear_core.php`, y
`cablear-estado.php` → `require list-cablear-status.php`. El panel usa **los paths del contrato**
(`/prisma/api/cablear.php` y `/prisma/api/cablear-estado.php`), que son los que t59 fija y los que el
propio backend declara como "camino del contrato".

---

## 2. QUÉ HACE EL PANEL

1. **Campo de texto** (`#ape-cablear-lista`) donde el operador pega **UNA** lista concreta — nombre de
   `/lists/` (p.ej. `APE_LISTA_1794100720046.m3u8`) **o** URL http(s). **No** coge "la última".
2. **Checkbox «publicar»** (por defecto **desmarcado**, que es el default `publicar=0` del contrato).
   Marcado ⇒ el fichero queda en `/lists/` y habrá `url_cableada`.
3. **Botón «Cablear»** → `POST /prisma/api/cablear.php` `application/x-www-form-urlencoded` con
   `lista`, `publicar`, `forzar` (+ `device` solo si la página lo expone con la forma válida).
   - **202 `queued`** → guarda ticket y arranca polling.
   - **200 `duplicado`** → reengancha **el mismo** ticket y lo dice (no duplica el trabajo).
   - **507 / 4xx / 5xx** → pinta el estado con el **motivo literal**.
4. **Zona de estado** con polling **1 s en `running` y 5 s en `queued`** (regla del contrato), sin websocket.
5. **Al terminar (`done`)**: **URL cableada exacta + botón «Copiar»** (`navigator.clipboard` con
   fallback `execCommand`), más `bytes`, `sha256`, `publicada`, contadores y aviso si `sin_id>0`.
6. **Reenganche tras recargar**: `localStorage['ape.cablear.ticket']` (nombre exacto del contrato) →
   `?ticket=`; si el servidor responde **410**, borra el ticket y cae a `?ultimos=10`. Botón manual «Último trabajo».

### 2.1 Estados (semántica del contrato, aplicada)

| estado | HTTP | UI |
|---|---|---|
| `queued` | 200 | spinner + posición en cola; poll 5 s |
| `running` | 200 | fase + contadores + barra indeterminada; poll 1 s |
| `done` | 200 | **URL + Copiar**; si `publicada=false` avisa de que `url_cableada=null` **por diseño (I3)** |
| `failed` | 200 | `E_CODE · motivo` literal + **Reintentar (forzar=1)** |
| `skipped_disk` | 200 (o **507** al encolar) | motivo literal con los números + **Reintentar (forzar=1)** |
| `expired` | **410** | borra ticket y cae a `?ultimos=10` |

**Nada se disfraza:** si el servidor dice `skipped_disk`, la UI escribe `skipped_disk`; si dice
`E_HOST_NO_PERMITIDO`, se lee eso mismo con su `motivo`.

---

## 3. CÓMO SE MONTA (aditivo, no invasivo)

Include añadido en `index-v4.html` (tras `vps-image-panel.js`):

```html
<script src="js/ape-v9/list-cablear-panel.js?v=20261114-cablear1" defer></script>
```

- El script crea **su propio DOM**. Si existe `#ape-cablear-host`, se monta ahí; si no (caso actual),
  se añade al final del `<body>` dentro de un **`<details>` PLEGADO** con el título
  `🔌 Integración de listas — cablear UNA lista concreta`. **Plegado = no tapa ni desplaza nada.**
- Guarda de idempotencia `window.__APE_CABLEAR_PANEL__` (mismo patrón que `generation-output-panel.js`).
- CSS encapsulado bajo `#ape-cablear-panel` para no filtrar estilos.
- **No toca** el generador (`node -c` del generador → exit 0; `git status` del generador → vacío).

**Diff del HTML, íntegro:** `6 insertions(+), 0 deletions(-)`. Se **añade**, no se sustituye.

---

## 4. VERIFICACIÓN

| Comprobación | Resultado |
|---|---|
| `node -c IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/list-cablear-panel.js` | **exit 0** |
| `node -c` del generador (no debe romperse) | **exit 0** |
| Tokens del contrato presentes | **17/17** |
| Alineación con la implementación real de t60 | **6/6** (motivo plano, forma anidada, `X-APE-Key`, checkbox publicar + su id, aviso I3, `j.tickets`) |
| `git diff --numstat index-v4.html` | **6 añadidas, 0 borradas** |
| `</body>` / `</html>` presentes | **sí** |
| Generador sigue referenciado en el HTML | **4 veces** |

### 4.1 Prueba manual (documentada; no ejecutada aquí)

```text
1. Tras desplegar: abrir https://iptv-ape.duckdns.org/index-v4.html
2. Desplegar "🔌 Integración de listas — cablear UNA lista concreta".
3. Escribir el nombre EXACTO de la lista que se quiere (no la última).
4. (Opcional) marcar "publicar" si se quiere la URL en /lists/.
5. Pulsar "Cablear":
   · estado queued -> running con fase y contadores (poll 5 s / 1 s)
   · lista inexistente -> E_LISTA_NO_EXISTE + motivo literal (NO "error genérico")
6. Al terminar con publicar marcado: aparece "URL cableada" + botón "Copiar".
   Con publicar sin marcar: aviso de que url_cableada es null por diseño (I3).
7. Recargar a mitad: el panel retoma el ticket desde localStorage.
8. Caso disco: si el VPS responde 507 / estado skipped_disk, la UI lo muestra con esas palabras.
```

Consola: `window.APE_CABLEAR` expone `encolar()`, `consultarTicket(t)`, `consultarUltimos()`,
`estadoActual()`, `ticketKey`, `endpoints`.

---

## 5. LÍMITES HONESTOS

| Item | Estado |
|---|---|
| Probado en navegador real | **NO** — no hay navegador en el entorno; se exige `node -c` + prueba manual documentada |
| Endpoint de listado de `/lists/` | **En t61 NO existía** (ni en el contrato ni en t60) → el `<datalist>` solo ofrecía historial local y **no se inventó una ruta**. **Resuelto en t65**: lo construye t64 (`/prisma/api/cablear-listas.php`) y el panel lo consume — ver la sección de reparación al final |
| `?ultimos=N` | Implementación confirmada: `{ok,count,tickets[]}`. Se lee esa forma (y array plano por si cambia) |
| Auth | `X-APE-Key` se envía **solo** si existe `window.APE_CABLEAR_KEY`/localStorage. Si el VPS define `APE_CABLEAR_KEY` y la página no la expone → **401** con motivo literal (comportamiento correcto, no oculto) |
| `device` | Opcional: se envía solo si `window.APE_DEVICE_ID` casa `^[A-Za-z0-9_-]{16,512}$`; si no, se omite y el backend aplica su default. **Ojo:** si se envía mal, el backend tiene `E_DEVICE_INVALIDO` (400) |
| Progreso porcentual | El contrato no da un `%`; la barra es **indeterminada** mientras corre. No se inventa un porcentaje |

---

## 6. DESPLIEGUE — requiere UNA línea en el workflow (preparada, NO aplicada)

`ape-deploy-frontend.yml` sirve los ficheros desde una **allowlist `FICHEROS`**: lo que no esté ahí
**no se sirve**. `.github/` está **fuera del alcance de t61**, así que el cambio queda preparado en
`frontend/CABLEAR_PANEL_DEPLOY_ENTRY.md`:

```yaml
      js/ape-v9/list-cablear-panel.js      # <- única línea nueva en FICHEROS
```

Sin esa línea el JS daría 404 y la consola del navegador mostraría el fallo de carga (el include ya está).

---

## 7. ROLLBACK

```bash
# 1) quitar el include (6 líneas: comentario + <script>) de index-v4.html
# 2) borrar los dos ficheros nuevos
rm IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/list-cablear-panel.js
rm IPTV_v5.4_MAX_AGGRESSION/frontend/CABLEAR_PANEL_DEPLOY_ENTRY.md
# 3) (si se añadió al workflow) quitar la línea de FICHEROS
```

El panel es autocontenido: sin su `<script>`, la UI queda exactamente como estaba.

---

*Implementado el 2026-11-14. No se tocó el generador, ni el backend, ni el VPS, ni `.github/`, ni `contracts/`. Sin deploy.*

---

# REPARACIÓN t65 — desplegable de listas reales + `publicar` marcado (2026-11-14)

**Motivo:** el panel de t61 no servía al caso de uso del operador en dos puntos, los dos bloqueantes:

| Defecto | Qué pasaba | Reparación |
|---|---|---|
| **F-PANEL-01** | No había lista que elegir: el operador tenía que **escribir el nombre a ciegas** | **Desplegable** con las listas reales de `/lists/`, alimentado por el endpoint de t64 |
| **F-PANEL-02** | `publicar` venía **desmarcado** → `url_cableada = null` (invariante I3) → cableaba y **no recibía ninguna URL** para cargar en el reproductor | `publicar` **MARCADO por defecto**, etiqueta explícita y **aviso en claro** si se desmarca |

## Endpoint consumido (t64) — verificado, no inventado

```
GET /prisma/api/cablear-listas.php?limite=200      (opcional X-APE-Key)
fichero: IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/cablear-listas.php
         10.017 B · sha256 fa23cf1f5718bd3717f41a936f09e444f193f2fec74e8b3c2d3190ac429b356c
respuesta: { ok, count, total, truncado, generado, base, listas:[...], auth }
por lista: { nombre, bytes, bytes_gz, bytes_descomprimidos, mtime, mtime_epoch, canales,
             canales_motivo, sha256, sha256_motivo, url, tiene_cableada, url_cableada,
             cableada_bytes, cableada_mtime, cableada_mas_nueva, estado }
orden: mtime descendente -> la PRIMERA es la más reciente (se etiqueta como tal)
```

**Cada opción del desplegable muestra:** `nombre · tamaño · fecha · nº de canales · estado de cableado`.
El estado de cableado usa `tiene_cableada` y `cableada_mas_nueva`:
`YA CABLEADA (al día)` / `ya cableada (la fuente es más nueva)` / `sin cablear`.
La primera opción va etiquetada `← la más reciente` para que el operador vea cuál es y **elija otra**.
La opción por defecto es el placeholder vacío: **no se preselecciona la más reciente**.

## Comportamiento nuevo

1. Al abrir el panel se llama a `cargarListas()` y se puebla el `<select>`.
2. `listaElegida()`: manda el desplegable; si está vacío, cae al campo manual (`<details>` de respaldo).
3. **`publicar` viene `checked`** con la etiqueta *"Publicar: dejar la lista accesible para cargarla en
   el reproductor (necesario para obtener la URL)"*.
4. Si se **desmarca**, aparece el aviso: *"Sin publicar: el trabajo quedará solo en staging y **NO
   habrá URL cargable** (url_cableada = null por diseño, invariante I3)"*. En vivo, en el `change`.
5. Si el listado falla (endpoint sin desplegar, 404, 401…), se muestra el **motivo literal**
   (`motivoLiteral`) y el campo manual queda operativo: **degradación honesta, no pantalla rota**.
6. Los errores del backend siguen soportando **las dos formas** (plana `{error:'E_CODE',motivo}` de t60
   y anidada `{error:{codigo,motivo}}` del contrato) — sin regresión respecto a t61.

## Prueba manual documentada (no ejecutada: no hay navegador en este entorno)

```text
1. Desplegar el JS (CABLEAR_PANEL_DEPLOY_ENTRY.md §1) y el endpoint PHP (§2).
2. Abrir index-v4.html y desplegar "🔌 Integración de listas — cablear UNA lista concreta".
3. El desplegable lista N listas con fecha/tamaño/canales y su estado de cableado;
   la primera lleva "← la más reciente".
4. ELEGIR UNA HISTÓRICA (no la primera) -> el campo manual se sincroniza con el nombre elegido.
5. "Publicar" debe estar MARCADO. Pulsar "Cablear".
6. Esperado: queued -> running -> done, y en done aparece "URL cableada" (no nula) + botón Copiar;
   la URL debe acabar en /lists/<nombre>_CABLEADA.m3u8.
7. Desmarcar "Publicar" y repetir: aparece el aviso de que NO habrá URL, y en done url_cableada
   será null con el aviso de invariante I3.
8. Consola: APE_CABLEAR.cargarListas() / APE_CABLEAR.listaElegida() / APE_CABLEAR.endpoints.listas
```

## Verificación de esta reparación

| Comprobación | Resultado |
|---|---|
| `node -c list-cablear-panel.js` | **exit 0** |
| Tokens de F-PANEL-01/02 (14 comprobaciones) | **14/14** |
| Errores en dos formas (plana + anidada) | **sí**, sin regresión |
| HTML aditivo | **6 insertions / 0 deletions** (commit `8263987d`, `git show --numstat`) |
| Generador / backend / worker | **no tocados** |

**Estado:** reparado en el repo, **NO desplegado**.

