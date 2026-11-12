# Auditoría de solo lectura de producción — 2026-11-12

**Corrida:** `43178033803` · `mode=dry-run` · `headSha 92fcdf55` · **success**
**Jobs:** `1 inventory` success · `2 preflight + dry-run` success · `3 validate` success · `5 verify` success · **`4 deploy` skipped** (cero mutación)

Esta corrida existe por dos motivos: **validar en CI** el arreglo fail-closed de `dry-run.sh` (que hasta ahora solo estaba probado en local) y **producir una auditoría de producción con las semánticas nuevas**.

## El resultado, tal cual

```
== RESUMEN DRY-RUN
   VPS ALCANZABLE: 33 filas del manifiesto leidas
   ficheros que CAMBIARIAN: 0
   CAMBIOS REALES EN EL VPS: 0 (dry-run: solo lecturas)
   DRY-RUN COMPLETO
```

| Estado | Ficheros |
|---|---|
| **IGUAL** | **33** |
| NUEVO | 0 |
| CAMBIA | 0 |
| AUSENTE | 0 |
| DESCONOCIDO | 0 |

**33 de 33 con paridad exacta repo ↔ VPS.** No es una estimación: es el diff por sha256 de cada destino del manifiesto contra el fichero desplegado.

Muestras del diff, con su sha real:

```
IGUAL  449392  290b11030f3b…  /opt/ape-jit/server.js          ← tools/lab/ape-jit/server.js
IGUAL  8088    23b25b031964…  /etc/nginx/lua/ape_header.lua   ← _vps_stage/lua/ape_header.lua
IGUAL  4043    a17281d6cf86…  /opt/ape-pulse/ape-pulse-canary-worker.sh ← vps/bin/ape-pulse-canary-worker.sh
```

El motor desplegado es **el pineado por el contrato** (449.392 B · `290b1103…`), confirmado ahora por una vía independiente del job que lo instaló.

## Lo que valida este resultado

1. **El arreglo de `--audit` funciona sobre el VPS real**, no solo con `ssh` falso. El paso `2 · preflight + dry-run` corrió el `dry-run.sh` parcheado y salió `success`.
2. **La semántica nueva no rompe el camino feliz**: con el VPS respondiendo, el script imprime la tabla, cuenta 0 cambios y termina `DRY-RUN COMPLETO` con exit 0 — igual que antes, más las garantías.
3. **Cero mutación**: `4 · deploy` quedó `skipped`. Todo lo que corrió fue lectura.

## Lo que el manifiesto NO toca (y sigue intacto)

**18** lua presentes en el VPS que el manifiesto no cubre. El dry-run las **lista** para que nada se pierda de vista y **no las toca**, lo que cumple el principio NO DESTRUCTIVO de §12:

`ape_attr` · `ape_gateway` · `ape_header` · `ape_lab_api` · `ape_lab_bridge` · `ape_lab_upload` · `ape_lastgood` · `ape_luatest` · `ape_obs` · `ape_profile_resolver` · `ape_rebase_lib` · `ape_uhd` · `ape_uri_rebase` · `ape_wake_on_manifest` · `ara_x_sync` · **`bw_adaptive_floor`** · **`floor_lock_filter`** · **`sentinel_auth_guard`**

> **Corrección:** una versión anterior de este recibo decía 15. El error fue mío: al imprimir la sección del log usé un límite de 15 líneas y leí el truncamiento como el total. Las tres que faltaban son justamente las tres últimas de la lista.

### Las tres últimas no aparecen en la lista por casualidad

Ninguna de las tres tiene fila en `manifest.tsv` (**0 filas cada una**), pero **sí tienen fuente en el repositorio**:

| lua | Tamaño en el **repositorio** | Qué es | Filas en el manifiesto |
|---|---|---|---|
| `sentinel_auth_guard.lua` | 7.207 B (versión `_vps_stage/lua/`) · 12.992 B (versión `vps/vps-live-snapshot-20260428/`) | *«APE SENTINEL v1.0 — Auth Guard + UA Rotation + Provider Fingerprint»*, `header_filter_by_lua_file`, passthrough que detecta 401/403 del upstream y rota UA | **0** |
| `bw_adaptive_floor.lua` | 9.075 B | cierra el lazo bitrate-reactor → manifest | **0** |
| `floor_lock_filter.lua` | 2.169 / 9.269 / 9.601 / 17.982 B (cuatro versiones) | filtro de floor de bitrate | **0** |

> **Corrección de etiqueta:** una versión anterior de esta tabla titulaba esa columna «Tamaño en el VPS». **Era falso:** los tamaños salieron del repositorio, no del VPS. El `--audit` de esta corrida solo listaba los nombres de los 18 lua sin leer su tamaño ni su hash, así que no tenía ningún dato del VPS para esas tres.
>
> Arreglado en el script: el `--audit` ahora lee `stat -c %s` + `sha256sum` de cada lua no gestionada (sigue siendo solo lectura) y **falla con exit 4** si no puede leer ese inventario. La próxima corrida en modo `dry-run` dará los hashes reales, y entonces decidir qué versión del repositorio es la canónica deja de ser una pregunta y pasa a ser una comparación de hashes.

**Consecuencia:** producción ejecuta lógica —incluido un guard de autenticación— que **el pipeline no puede reproducir**. Un VPS reconstruido desde el manifiesto saldría sin esas tres.

**No se añaden filas.** El repositorio tiene **versiones divergentes** de las mismas: `floor_lock_filter.lua` aparece en 2.169 / 9.269 / 9.601 / 17.982 B y `sentinel_auth_guard.lua` en 7.207 / 12.992 B. Añadir una fila elegiría una versión a ciegas y **sobrescribiría la viva** en el siguiente deploy. Decidir cuál es la canónica es del operador, no del pipeline.


## Lo que esta auditoría NO dice

- **No dice que el vídeo funcione.** Comprueba ficheros en disco y sintaxis (`validate`), no imagen. Sin dispositivo no hay reproducción.
- **No dice que el proceso vivo ejecute ese sha**: el dry-run lee el fichero; que lo ejecute lo prueba `/jit/health` 200 y el job `4b`, que son otra medición.
- **No verifica los 4 items de §12** que siguen sin computar (política, dispositivo, pipeline de vídeo): siguen en `3 covered · 5 partial · 4 not_computed` en `contracts/canary_vps_reconciler_contract.json`.
