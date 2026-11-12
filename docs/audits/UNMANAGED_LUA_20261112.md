# lua vivas fuera del manifiesto — 2026-11-12

**Cómo se obtuvo:** el `--audit` (`dry-run.sh`, corrida `43180534557`, `mode=dry-run`, cero mutación) ahora lee `stat -c %s` + `sha256sum` de cada lua de `/etc/nginx/lua`. Antes solo listaba el **nombre**, con lo que no se podía decidir nada.

**Corrección de un dato mío:** reporté «18 lua sin manifiesto». **Falso.** Hay **18 lua vivas en total**; **10 las gestiona el manifiesto** (salen como `IGUAL`) y **8 son las no gestionadas**. La sección del script se titulaba «las que el manifiesto NO toca» y listaba las 18. Arreglado: cada fila dice ahora `gestionada` o `NO-GESTIONADA` y el resumen cuenta las no gestionadas.

## Las 8 no gestionadas, clasificadas por uso real

La regla de inclusión del propio manifiesto (`manifest.tsv:5`) es *«SOLO se incluyen ficheros REFERENCIADOS por la config viva»*. `ape_rebase_lib` demuestra que «referenciado» incluye también `require()` desde otra lua, no solo una directiva `*_by_lua_file`. Aplico las dos comprobaciones:

| lua viva | Bytes | `.conf` que la referencia | `require()` desde lua desplegada | Veredicto |
|---|---|---|---|---|
| `ape_attr` | 31.210 | `ape-attr-public.conf:29`, `meta-plane.conf:244` | — | **USADA** |
| `ape_lab_upload` | 4.723 | `ape-meta-public.conf:38` | — | **USADA** |
| `floor_lock_filter` | 2.169 | `prisma-floor-lock.conf:48` | — | **USADA** |
| `ape_lab_bridge` | 7.723 | — | `ape_gateway.lua:35`, `ape_lab_api.lua:5` | **USADA** |
| `ape_lastgood` | 5.083 | — | `ape_gateway.lua:33` | **USADA** |
| `ape_profile_resolver` | 4.191 | — | solo un `test_profile_resolver.lua` | inerte |
| `bw_adaptive_floor` | 9.075 | — | solo un `test_bw_adaptive.lua` | inerte |
| `sentinel_auth_guard` | 7.207 | — | nadie | inerte |

**Control del método:** `ape_rebase_lib`, que SÍ está en el manifiesto, no aparece en ningún `.conf` y se carga con `require()` desde `ape_gateway.lua:32`. Sin esa comprobación lo habría clasificado como inerte por error.

## La consecuencia, concreta

**5 lua en uso quedan fuera del manifiesto.** Dos de ellas, `ape_lab_bridge` y `ape_lastgood`, se cargan por `require()` desde `ape_gateway.lua`. Un VPS reconstruido desde el manifiesto arrancaría **sin ellas** y `ape_gateway.lua` fallaría en el `require()` — con el gateway de streams caído.

Las otras 3 (`ape_profile_resolver`, `bw_adaptive_floor`, `sentinel_auth_guard`) **no las usa producción**. El manifiesto hace bien en excluirlas, y no se añaden.

## Cada copia viva está identificada por hash, no por tamaño

Comparación por `sha256` entre el fichero vivo y los candidatos del repositorio. **Los 8 coinciden byte a byte con exactamente un candidato:**

| lua vivo | Bytes | Copia del repo que coincide por sha256 |
|---|---|---|
| `ape_attr` | 31.210 | `_vps_stage/lua/ape_attr.lua` |
| `ape_lab_bridge` | 7.723 | `_vps_stage/lua/ape_lab_bridge.lua` |
| `ape_lab_upload` | 4.723 | `_vps_stage/lua/ape_lab_upload.lua` |
| `ape_lastgood` | 5.083 | `_vps_stage/lua/ape_lastgood.lua` |
| `ape_profile_resolver` | 4.191 | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/ape_profile_resolver.lua` |
| `bw_adaptive_floor` | 9.075 | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/bw_adaptive_floor.lua` |
| **`floor_lock_filter`** | **2.169** | **`ara-x/vps/lua/floor_lock_filter.lua`** |
| `sentinel_auth_guard` | 7.207 | `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/sentinel_auth_guard.lua` |

Esto disuelve la ambigüedad que quedó abierta: `floor_lock_filter.lua` tiene **cuatro** copias en el repo (2.169 / 9.269 / 9.601 / 17.982 B) y la viva es la de **2.169 B de `ara-x/`**. `sentinel_auth_guard.lua` tiene dos (7.207 / 12.992) y la viva es la de **7.207 B**.

**Ya no es una pregunta para el operador: es una comparación de hashes con una sola respuesta.**

## Parche listo, NO aplicado

`docs/canary/fixes/0006-manifest-lua-usadas.patch`

- **5 filas** (solo las USADAS), modo `644`, dueño `www-data:www-data`, igual que las 10 lua que ya gestiona.
- `git apply --check` → **exit 0**.
- Aplicado de verdad, el manifiesto pasa de **33 a 38 filas**; revertido, vuelve a 33.
- **Riesgo:** bajo. El contenido es byte-idéntico al vivo, así que el deploy copiaría los mismos bytes y saldría `IGUAL`. Lo único que fija cada fila es modo y dueño, tomados de las filas hermanas ya desplegadas.
- **`aplicado: false`.** Cambia lo que el pipeline gestiona; es decisión del operador.

## Lo que este documento NO afirma

- **No dice que el VPS esté roto.** Hoy las 5 lua están **vivas y sirviendo**; el hueco es de **reproducibilidad**, no de funcionamiento actual. Se manifestaría al reconstruir el VPS.
- **No mide modo ni dueño de las lua vivas.** El audit lee tamaño y sha256, no `stat -c %a %U:%G`. Por eso las filas del parche usan el modo de sus hermanas y no el medido.
