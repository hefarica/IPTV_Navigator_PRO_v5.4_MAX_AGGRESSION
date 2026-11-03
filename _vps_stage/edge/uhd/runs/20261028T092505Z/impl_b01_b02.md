# Fase 0 REA · B-01+B-02 — implementación (sin despliegue)

**Tarea:** `t29` · **attempt:** `1b13e7f7-d388-40d4-a13b-0f69861a4f17` · **Autor:** `s6-nginx-lua`
**Fecha:** 2026-10-28T04:25:05-05:00 (= `20261028T092505Z`) · **Snapshot:** `git HEAD a8ff0e9`
**Spec vinculante:** `docs/rea/02_EDGE_DECLARE_AUTO_API.md` v3 §1.3/§1.4 (C1-C7) · `docs/rea/PLAN_REA.md` v3 F0-1/F0-2 · `docs/rea/DECISION_A_LOCKED.md`
**Regla respetada:** `declare_auto` **NO se quita** (sigue siendo la ruta viva por defecto y sigue reescribiendo `RESOLUTION`); `CODECS` **no se tocó**.
**No se desplegó, no se commiteó, no se hizo `git add`.** `docs/edge/**` y `docs/rea/**` intactos.

---

## 1 · Archivos modificados (6) — hashes reales

| Archivo | Antes (`git show HEAD:`) | Después (disco) | Δ |
|---|---|---|---|
| `_vps_stage/lua/ape_uhd.lua` | 5 320 B · 124 L · `f1f5eb674744…` | **9 894 B · 215 L · `b02fbe28ad2b…`** | nuevas funciones + marcador v2 |
| `_vps_stage/lua/ape_gateway.lua` | 20 833 B · 494 L · `1b71d90e02cd…` | **21 329 B · 504 L · `814165c3708a…`** | +10 L (allow_8k, can8k, 2 `qset`) |
| `_vps_stage/lua/ape_obs.lua` | 4 030 B · 103 L · `f477741bcfa6…` | **5 038 B · 130 L · `afa003ad6e92…`** | `/_ape/uhd` + `h.uhd` |
| `_vps_stage/lua/ape_luatest.lua` | 10 711 B · 191 L · `98a29c444f1b…` | **14 064 B · 246 L · `7f5be2657458…`** | matriz A + `EXPECTED_ASSERTS` |
| `_vps_stage/nginx/meta-plane.conf` | 10 941 B · 232 L · `3e29b9280c05…` | **11 224 B · 240 L · `6b3c71e76ae4…`** | +1 `location` (8088) |
| `_vps_stage/deploy/manifest.tsv` | 1 711 B · 16 L · 9 filas · `915b5e6c4542…` | **1 922 B · 17 L · 10 filas · `e779001e2622…`** | +fila `ape_uhd.lua` |

*(`git status`: los 6 quedan `M` — modificados y **sin `git add`**. `ape_uhd.lua`/`ape_obs.lua` coinciden además con el hash vivo publicado en `docs/edge/E5_UHD_DOCTRINE.md` §1 — el módulo del repo **sí** era el desplegado en esos dos.)*

### 1.1 `ape_uhd.lua`
- `M.max_resolution(body)` → ancho **máximo** entre variantes + 2.º retorno `"WxH"` literal. `M.top_resolution` **se conserva** (compatibilidad; sigue devolviendo la 1.ª variante).
- `M.can_declare_8k(body, opts)` → `allow_8k==true` **AND** `max_resolution>=3840` **AND** todas las variantes con ese ancho declaran HEVC con `level_idc>=183`. Sin `CODECS`/sin HEVC ⇒ `false`. Parseo: `hvc1%.[%d%.]-L(%d+)` (y `hev1` como respaldo); ignora `mp4a.*` de la misma cadena.
- `M.declare(body, opts)` → marcador único: `#EXT-X-APE-UPSCALE:declared=<target>;codec=truthful;mode=<4k|8k>;src=<WxH real>;can8k=<0|1>`. Si ya existe marcador se **sustituye** (`gsub` con tope 1) ⇒ nunca se duplica.
- `M.declare_auto(body, opts)` → `8K` **sólo** si `can_declare_8k`; si no, `4K` (degradación honesta). Devuelve `body, n, mode, can8k`; sin master ⇒ `body, 0, nil` (idéntico a hoy: sigue detectando master con `top_resolution`, no con `max_resolution`, para no cambiar el criterio de "es master").
- Constantes nuevas: `M.LEVEL_8K_MIN = 183`, `M.MIN_WIDTH_8K = 3840` (excepción de producto AU-01: **no** se sube a 7680).

### 1.2 `ape_gateway.lua` (mínimo)
- `allow_8k = flag("uhd8k", false)` en la llamada a `declare_auto`; captura `mode` y `can8k` (4.º retorno).
- `qset("uhd_mode_last", uhd_mode or "off")` y `qset("can8k_last", uhd_can8k and 1 or 0)` junto a los contadores existentes (`uhd4k/uhd8k`). Ningún otro cambio.
- **NOTA (riesgo residual declarado, NO corregido por alcance):** la rama explícita `uhd8k=1` (`:276-282`) sigue llamando `declare(target=8K)` **sin** la guarda `can_declare_8k`; sólo se **mide** (`uhd_can8k = uhd.can_declare_8k(...)`) para publicarlo. Con el default vivo `uhd8k=0` esa rama no se ejecuta. Cerrarla exige tocar más el gateway ⇒ **fuera de alcance de Fase 0**; queda como follow-up explícito (§5).

### 1.3 `ape_obs.lua`
- `uhd_counters()` → `{uhd4k, uhd8k, off, mode_last, can8k_last}` desde `ape_qoe` (contadores reales).
  **`off` es DERIVADO**: `req − (uhd4k + uhd8k)`, con clamp a 0 — el gateway no incrementa un contador de "off" y la tarea prohíbe añadirle nada más.
- `GET /_ape/uhd` → `{ok, uhd4k, uhd8k, off, mode_last, can8k_last, ts}`.
- `health()` → objeto `uhd` **añadido al final** (`h.uhd = uhd_counters()`), sin renombrar ni borrar campos previos. **Caveat medido:** `lua-cjson` no garantiza orden de claves de objeto al codificar (itera `lua_next`), así que la garantía real es **aditiva** (clave nueva, contrato previo intacto), no posicional.
- `/_ape/qoe` **sin cambios de contrato** (su rama `else` sigue devolviendo `qoe()`); `/ape/health` público **sin** contadores nuevos (mínimo, como estaba).

### 1.4 `meta-plane.conf`
`location = /_ape/uhd { allow 127.0.0.1; deny all; content_by_lua_file /etc/nginx/lua/ape_obs.lua; }` — 1 sola ocurrencia (`grep -c '/_ape/uhd'` = **1**). **No se añadió nada al 443** (este fichero es solo el server `:8088`).

### 1.5 `deploy/manifest.tsv`
Fila nueva (tabs verificados: 4 tabs = 5 campos):
`_vps_stage/lua/ape_uhd.lua → /etc/nginx/lua/ape_uhd.lua · 644 · www-data:www-data`.
**Confirmado el hallazgo B-02:** el módulo que `ape_gateway.lua` y `ape_luatest.lua` cargan por `require` **no estaba** en el manifiesto ⇒ nunca llegaba al VPS. Sin esta fila el resto del cambio es inerte.

### 1.6 `ape_luatest.lua`
Matriz actualizada a **A LOCKED** + conteo explícito para G5. Asserts: **68 → 88** (`grep -c 'eq("'` = 88 = `EXPECTED_ASSERTS`).

| Caso | Antes (test) | Ahora (test) |
|---|---|---|
| 1080p AVC | 4K · modo 4k | 4K · modo 4k · **can8k=false** |
| **4K L153** | 8K · modo 8k | **4K** · modo 4k · `can8k=false` · `;can8k=0` en el marcador |
| **4K L183** (+`allow_8k=true`) | no existía | **8K** · modo 8k · `can8k=true` · `src=3840x2160;can8k=1` · CODECS intacto |
| 8K L153 (+`allow_8k=true`) | no existía | **4K** (degradado) · `can8k=false` |
| 8K L183 (+`allow_8k=true`) | no existía | **8K** · `can8k=true` · `src=7680x4320;can8k=1` |
| sin `allow_8k` (default `uhd8k=0`) | no existía | 4K · `can8k=false` |
| master ascendente | no existía | `max_resolution`=3840 · `top_resolution`=1280 (compat) |
| doble pasada | `declare` directo | `declare_auto` dos veces ⇒ **1** `#EXT-X-APE-UPSCALE` |

---

## 2 · Gates — comandos y exit REALES

| # | Comando | Exit real | Veredicto |
|---|---|---|---|
| G1 | `node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs --selftest` | **0** | **PASS 8/8** (`S1_codecs_mutado … S7_8k_con_L153` + `control_negativo`) |
| G2 | `node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs` | **1** | **BLOCKED** — causa exacta en §3. **No es un fallo del código de este cambio** |
| G3 | `lua5.1` / `luac -p` | — | **NOT_RUN**: sin intérprete (ver §4) |
| G4 | Idempotencia del marcador | — | **Verificado por construcción + assert** (ver §2.1); ejecución real = **NOT_RUN** |

### 2.1 Idempotencia (G4) — evidencia estática, no ejecutada
`M.declare` emite el marcador por **una sola de dos vías excluyentes**, ambas acotadas a 1 ocurrencia:
1. `body2:gsub("#EXT%-X%-APE%-UPSCALE:[^\r\n]*", tag, 1)` → si existía, **sustituye** (cuenta 1, no añade);
2. si no existía, `body2:gsub("(#EXTM3U[^\n]*\n)", "%1"..tag.."\n", 1)` → **inserta una vez**.

⇒ Tras N pasadas hay exactamente **1** marcador y siempre refleja la última decisión. Se añadió el assert `uhd.auto_marca_unica_tras_dos_pasadas` (cuenta 1) para que el VPS lo verifique en el mismo despliegue.

---

## 3 · G2 — por qué `exit 0` es inalcanzable en Fase 0 (BLOCKED, sin inventar)

El guard **no evalúa el código del repo**: evalúa `_vps_stage/edge/uhd/cases/latest.json`, que es una **captura del VPS del 2026-10-26** con dos insumos anteriores a este cambio por definición:

| Check | Insumo | Por qué sigue en rojo |
|---|---|---|
| **UHD-09** (blocker) | `pairs[]` = cuerpos **servidos** por `/cdn/` el 2026-10-26 | el módulo desplegado entonces era `f1f5eb67…` (pre-cambio). Sin desplegar, la captura no puede cambiar |
| **UHD-10/11** (high) | `lua_matrix[]` = matriz ejecutada **en el VPS** con `lua5.1` sobre el módulo **desplegado** | ídem: es la matriz del módulo viejo |

Salida real (resumen): `VEREDICTO: FAIL blocker=1 high=2 info=1` · `UHD-09 master_4k_hevc: 1 variante(s) declaran 8K con nivel insuficiente: #1 7680x4320@hvc1.2.4.L153.B0`.

**Conclusión honesta:** el gate se cierra **después** de aplicar el cambio en la ventana autorizada y **re-capturar** (`capture_uhd.mjs` → `cases/<ts>.json` → `--cases`). Ponerlo verde ahora exigiría (a) desplegar — prohibido por esta tarea — o (b) fabricar un `cases/*.json` — evidencia inventada, prohibida. **No se hizo ninguna de las dos.** El `exit 1` de hoy es el mismo de antes del cambio: mide el VPS, no el repositorio.

**Circularidad a resolver por el capitán:** G2 (guard) requiere despliegue; el despliegue requiere G2 verde. Secuencia correcta: **desplegar en la ventana → `capture_uhd.mjs --label post` → `guard --cases <nuevo>`**. Es exactamente el orden C3/C4 de `02 §1.4`.

---

## 4 · NOT_RUN — causa exacta (sin intérprete Lua local)

| Buscado | Windows | WSL (Ubuntu) | Repo | Python |
|---|---|---|---|---|
| `lua5.1` · `lua` · `luac` · `luajit` · `resty` | — | `NO` (los 5) | sin binario `.exe/.dll` | `lupa`=False · `luaparser`=False |

⇒ **No hay forma local de ejecutar** `ape_uhd.lua` ni `ape_luatest.lua`. En E5 el módulo se ejecutó con `lua5.1` **en el VPS** (`docs/edge/E5_UHD_DOCTRINE.md` §6), que aquí está fuera de alcance (no hay autorización de `ssh` en esta tarea). **No se declara verificado nada que no se haya ejecutado.**

**Verificaciones sí ejecutadas sobre el artefacto:** conteo de asserts (88 = `EXPECTED_ASSERTS`), tabs del TSV (4 = 5 campos), unicidad del `location` (1), presupuesto de locales Lua del gateway (59 « 200, sin riesgo de *too many locals*), y el selftest del guard (8/8). Todo lo demás sobre la semántica Lua queda pendiente del self-test `/_ape/luatest` en el VPS.

---

## 5 · Riesgos residuales y follow-ups (declarados, no corregidos)

1. **Rama `uhd8k=1` explícita sin guarda** (`ape_gateway.lua:276-282`): sigue declarando 8K sin `can_declare_8k`; sólo se mide. Con el default vivo (`uhd8k=0`) es inalcanzable. Cerrarla = tocar más el gateway → follow-up.
2. **`off` derivado** en `/_ape/uhd`: si algún día se añade un contador propio, `off` debe pasar a leerse de él (hoy `req − uhd4k − uhd8k`).
3. **Orden de claves en JSON**: `lua-cjson` no garantiza el orden; la garantía de `health()` es aditiva.
4. **`docs/edge/E5_UHD_DOCTRINE.md §4.8`**: la fila «4K L183 → 8K (producto, marcado)» sigue `PENDIENTE_BRIDGE` — esta tarea prohíbe tocar `docs/edge/**`.
5. **Ningún cambio se ha aplicado al VPS**: sin `nginx -t`, sin reload, sin escritura en `/etc/nginx`. `git status` de los 6 archivos = `M` sin `git add`.
6. **Impacto colateral declarado (fuera de mis 6 archivos, NO corregido):** `_vps_stage/edge/E10_window/scripts/build_staged.mjs:177-200` parchea `ape_uhd.lua` por **coincidencia literal** del `declare_auto` viejo (`autoOld`) y ahora fallará con `throw 'ape_uhd: no encuentro declare_auto exacto'`. Además su validación `:202` rechaza por diseño el comportamiento A LOCKED (`uhd.includes('target, mode = M.TARGET_8K, "8k"')` ⇒ su propio `fail`), porque E10 codifica el «techo 4K» **sin** la excepción de producto que `DECISION_A_LOCKED.md` ordena. **Sin impacto en runtime**: son bundles staged/snapshots (`E10_window/staged/`, `E11_intermittent/`) que llevan sus propias copias; la ruta desplegada es `/etc/nginx/lua/` alimentada por `deploy/manifest.tsv`. Corregir E10 exige editar fuera de mi alcance ⇒ lo decide el capitán.

---

## 6 · Reproducir (todo lectura)

```powershell
node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs --selftest    # exit 0 · 8/8  (G1, verde)
node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs               # exit 1 · BLOCKED (G2, ver §3)
(Get-Content _vps_stage\lua\ape_luatest.lua -Raw | Select-String -Pattern 'eq\("' -AllMatches).Matches.Count  # 88
foreach($f in @('_vps_stage\lua\ape_uhd.lua','_vps_stage\lua\ape_gateway.lua','_vps_stage\lua\ape_obs.lua','_vps_stage\lua\ape_luatest.lua','_vps_stage\nginx\meta-plane.conf','_vps_stage\deploy\manifest.tsv')){ Get-FileHash $f -Algorithm SHA256 }
```

*Sin despliegue, sin commit, sin `git add`. Cero escrituras en `docs/edge/**`, `docs/rea/**`, VPS, `ape_header/ape_uri_rebase/ape_wake/ape_rebase_lib`.*

---

## 7 · Addendum — attempt 3 (2026-10-28T09:33Z): propiedad de los gates

El plan del capitán en la lista compartida **separa la implementación de la puerta de gates**:

| Tarea | Alcance | Dueño |
|---|---|---|
| **t29** (este artefacto) | B-01+B-02 = los 6 archivos | `s6-nginx-lua` |
| **t30** | **Puerta PRE-deploy**: G1/G2/G3pre/G4/G6pre/G8/manifiesto | `s7-sre-secops` (dep: t29) |
| **t31** | **Puerta POST-deploy**: G3-G11 + `/_ape/uhd` + paridad 10/10 | `s9-player-compat` (dep: t30) |

Por tanto **G2 (`uhd_doctrine_guard.mjs` exit 0) NO es criterio de t29**: su ejecución y su veredicto pertenecen a t30 (pre) / t31 (post). Este documento deja el estado medido para que t30 no tenga que redescubrirlo.

**Estado re-verificado en attempt 3** (mismos insumos: `cases/latest.json`, mtime 2026-10-26T15:41, sin capturas nuevas):

| Gate | Comando | Exit | Nota |
|---|---|---|---|
| G1 | `uhd_doctrine_guard.mjs --selftest` | **0** | `SELFTEST: PASS (8/8)` |
| G2 | `uhd_doctrine_guard.mjs` | **1** | `VEREDICTO: FAIL blocker=1 high=2 info=1` · `UHD-09 master_4k_hevc: 7680x4320@hvc1.2.4.L153.B0` |

**Para t30:** el `exit 1` de G2 es **independiente del código de t29** mientras no se re-capture: `UHD-09` consume `pairs[]` y `UHD-10/11` consumen `lua_matrix[]`, ambos de `cases/latest.json` (captura del VPS del 2026-10-26 con el módulo **anterior**). Sólo hay dos vías para ponerlo verde, y ninguna pertenece a t29:
1. **T31 (post-deploy):** desplegar en la ventana → `capture_uhd.mjs --label post` → `guard --cases cases/<ts>.json`. Es la vía prevista.
2. **Pre-deploy sin desplegar:** ejecutar el módulo nuevo y construir un `cases` desde sus salidas. Hoy **no es posible en local** (sin `lua5.1`/`luac` en Windows ni WSL, sin binario en el repo, sin `lupa`/`luaparser` en Python — §4). Si t30 quiere G2 verde **antes** de desplegar, necesita un intérprete Lua en la máquina de gates o autorización de `ssh` para correr `lua5.1` contra el árbol staged (patrón que E5 usó: `docs/edge/E5_UHD_DOCTRINE.md` §6).

**Sin cambios en los 6 archivos entre attempt 2 y attempt 3**: hashes idénticos, verificados por `Get-FileHash` contra los registrados en §1.

---

## 8 · t32 — cierre del bypass `uhd8k=1` (2026-10-28, attempt 2)

**Motivo:** el §1.2 de este documento declaraba como «riesgo residual» que la rama explícita `uhd8k=1` **medía** `can_declare_8k` pero **no lo aplicaba**. El capitán lo reclasificó como **bloqueante de B-02**: con el flag encendido se declaraba `7680x4320` sobre `hvc1.2.4.L153` = Ley Cardinal 1 rota (el mismo freeze que UHD-09). Se cierra aquí.

**Alcance:** **sólo** `_vps_stage/lua/ape_gateway.lua` (rama `elseif flag("uhd8k", false)`). No se tocó `ape_uhd.lua`, `ape_obs.lua`, `ape_luatest.lua`, `meta-plane.conf` ni `manifest.tsv` (hashes idénticos a §1, verificados). `CODECS` sigue intacto: la rama sólo llama a `declare`, que reescribe `RESOLUTION` y el marcador.

**Hash:** `814165c3708a…` → **`360e4097bb21…`** · 504 → **511 líneas** (+7).

**Diff exacto aplicado** (L276-289):

```diff
     elseif flag("uhd8k", false) then
-        -- Override explícito del propietario: se mide si el 8K es legal (L183)
-        -- pero NO se cambia el comportamiento de esta rama en Fase 0.
-        uhd_can8k = uhd.can_declare_8k(rebased, { allow_8k = true })
-        rebased, uhd_n = uhd.declare(rebased, { target = uhd.TARGET_8K, mode = "8k",
-            add_pq = flag("uhd_pq", false), only_top = true })
-        if uhd_n > 0 then uhd_mode = "8k" end
+        -- Override explícito del propietario (t32): la guarda se APLICA, no sólo se mide.
+        -- Sin can_declare_8k (nivel < L183 o fuente < 3840) ⇒ 4K, nunca 8K ilegal.
+        local ok8 = uhd.can_declare_8k(rebased, { allow_8k = true })
+        uhd_can8k = ok8
+        if ok8 then
+            rebased, uhd_n = uhd.declare(rebased, { target = uhd.TARGET_8K, mode = "8k",
+                add_pq = flag("uhd_pq", false), only_top = true, can8k = true })
+            if uhd_n > 0 then uhd_mode = "8k" end
+        else
+            rebased, uhd_n = uhd.declare(rebased, { target = uhd.TARGET_4K, mode = "4k",
+                add_pq = flag("uhd_pq", false), only_top = true, can8k = false })
+            if uhd_n > 0 then uhd_mode = "4k" end
+        end
```

**Comportamiento resultante, por inspección del control de flujo** (ejecución = `NOT_RUN`: sin intérprete Lua, §4):

| Estado de flags | Camino | RESOLUTION | marcador `can8k=` |
|---|---|---|---|
| `uhd8k=0` (**default vivo**) | la rama **no se toma** ⇒ sigue a `uhd_auto` (`:290-296`) | idéntico a t29/t30 | idéntico |
| `uhd8k=1` + `can_declare_8k`=true (L183) | `if ok8` | `7680x4320` · mode `8k` | `1` |
| `uhd8k=1` + `can_declare_8k`=false (L153 o fuente <3840) | `else` | `3840x2160` · mode `4k` (degradación honesta) | `0` |

`uhd_can8k` queda asignado en **ambas** ramas ⇒ `qset("can8k_last", …)` en `:494-495` publica la decisión real también con el flag encendido.

**Gates de este cambio:**

| Gate | Comando | Exit real | Lectura |
|---|---|---|---|
| G1 | `node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs --selftest` | **0** | `SELFTEST: PASS (8/8)` — el guard sigue cazando sus sabotajes |
| G2 | `node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs` | **1** | `FAIL blocker=1 high=2 info=1` · `UHD-09 master_4k_hevc` — **esperado y declarado**: evalúa `cases/latest.json` (captura pre-cambio). G2 pertenece a **t31** (post-deploy) |

`lua5.1`/`luac` = **NOT_RUN** (sin intérprete en Windows/WSL/repo/Python — §4). Sin deploy, sin commit, sin `git add`; sólo este `.md` y `ape_gateway.lua` se tocaron.
