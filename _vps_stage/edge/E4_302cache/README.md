# `_vps_stage/edge/E4_302cache/` — E4 · caché del destino del 302

Fase 3 medida y modelada. **Veredicto: la especificación (TTL 30–60 s, 708 → <350 ms) está refutada
por medición**; el prototipo seguro (TTL 3 s + revalidación por status) ahorra **≈9,6 %** y está
**verificado offline, no desplegado**. Informe: [`docs/edge/E4_CACHE_302.md`](../../../docs/edge/E4_CACHE_302.md).

## Los tres números que deciden

| Hecho medido | Valor | Consecuencia |
|---|---|---|
| hop1 (proveedor `302`) | p50 **295,6 ms** (p95 729,7) | techo de ahorro por acierto = **42,7 % del p50** |
| hop2 (CDN playlist) | p50 **396,4 ms** (p95 473,6) | **suelo**: `<350 ms` es inalcanzable |
| vida del token del CDN | **3,5–6,5 s** (6/6 hoy) · 8,4–30+ s 25 min antes | TTL > ~4 s solo añade aciertos **muertos** (`509`) |

Con el hueco real entre peticiones de la misma clave (**p50 12 s**), la tasa de acierto salta de
**21,6 % (TTL 10 s)** a **76,6 % (TTL 15 s)** — justo por encima de donde el token ya está muerto.

## Ficheros

| Ruta | Qué es | ¿Toca el VPS? |
|---|---|---|
| `live/ape_gateway.lua` | copia byte-exacta del gateway vivo (`sha256 2dc0fad8…`, sin caché) | no |
| `proposed/ape_gateway.lua` | + caché `ape_hops`: TTL 3 s (flag `hop_ttl` 1–10), clave `host+path+query`, **revalidación por status** | **no desplegado** |
| `proposed/50-ape-meta-plane.conf` | + `lua_shared_dict ape_hops 10m;` (aditivo) | **no desplegado** |
| `proposed/ape_gateway.hopcache.patch` | diff aplicable sobre el vivo (`git apply --check` = 0) | no |
| `proposed/50-ape-meta-plane.hopcache.patch` | diff de la directiva | no |
| `scripts/e4_measure.py` | split de saltos (30 pares) + vida del token (6 ensayos, parada al primer `509`) | no (solo GET) |
| `scripts/e4_hitrate.mjs` | tasa de acierto alcanzable desde el log real de clientes externos | no |
| `scripts/e4_model.mjs` | modelo de las dos variantes (ingenua vs revalidada) sobre lo medido | no |
| `scripts/e4_sim_cache.mjs` | simulación offline VIVO vs PROTOTIPO con `ngx` falso y CDN guionizado | no |
| `runs/20261026T210638Z/` | log redactado, `measure.jsonl`, `sim_cache.txt` | no |

## Cómo se re-ejecuta

```bash
# offline (Node ≥18, 0 dependencias)
node _vps_stage/edge/E4_302cache/scripts/e4_hitrate.mjs _vps_stage/edge/E4_302cache/runs/<stamp>/access443_cdn.log
node _vps_stage/edge/E4_302cache/scripts/e4_model.mjs  _vps_stage/edge/E4_302cache/runs/<stamp>/access443_cdn.log \
                                                       _vps_stage/edge/E4_302cache/runs/<stamp>/measure.jsonl
node _vps_stage/edge/E4_302cache/scripts/e4_sim_cache.mjs _vps_stage/edge/E4_302cache

# en vivo (solo GET, ~4 min: 30 pares + 6 ensayos de vida del token)
ssh -o BatchMode=yes root@178.156.147.234 'python3 -' \
    < _vps_stage/edge/E4_302cache/scripts/e4_measure.py > runs/<stamp>/measure.jsonl
```

> ⚠️ **Trampa medida:** el proveedor contesta **`461`** si la petición lleva `Accept: */*` (defecto de
> `curl`) y **`302`** si lleva solo `Host` + `User-Agent: Mozilla/5.0` — lo que manda `/_ape/_fetch`.
> Sin esa réplica se mide un falso «caído».

## Verificaciones hechas (sin desplegar)

| Comprobación | Resultado |
|---|---|
| `git apply --check` de los 2 parches sobre el vivo | exit 0 |
| fichero aplicado == `proposed/*` (comparación byte a byte) | idéntico |
| `lua5.1` (LuaJIT-compatible) sobre el gateway propuesto | `SYNTAX_OK` |
| simulación offline VIVO vs PROTOTIPO | `RESULT=OK (14/14)` |
| gateway vivo y `ape_obs.lua` al terminar | `2dc0fad8…` / `f477741b…`, `MainPID 2001835`, `NRestarts 0`, `nginx -t` OK |

## Decisión pendiente del dueño

La única vía que alcanza el techo (**−43 % ⇒ ~396 ms p50**) es la **«bomba de tokens»**
(pre-acuñir el token cada ~2 s por clave caliente, edad ≤ 2 s ⇒ token vivo 6/6). Cuesta ~0,5
peticiones/s al proveedor por clave caliente + un timer en `init_worker`. No se implementa aquí.
