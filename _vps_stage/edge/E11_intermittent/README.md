# `_vps_stage/edge/E11_intermittent/` — E11 · fallo intermitente de `/cdn/`

Diagnóstico **read-only** del «~20 % de manifiestos que falla» y de sus causas. Todo lo de esta
carpeta se ejecuta **desde** el VPS por SSH con scripts que **solo hacen `GET`** y **no escriben nada**
en el servidor (payload por `stdin`, evidencia por `stdout`). Informe completo:
[`docs/edge/E11_FALLO_INTERMITENTE.md`](../../../docs/edge/E11_FALLO_INTERMITENTE.md).

## Conclusión (una línea)

La causa dominante era el **circuit-breaker de 15 s por host** de `ape_gateway.lua` (`down:<host>`),
**ya eliminado** del gateway vivo por el capitán (`2dc0fad8…`, 20:49:57Z) y verificado **dos veces**:
**83–89 %** de los fallos servidos al cliente externo real no llegaban al proveedor (9,2× de
amplificación); tras el hotfix, **0 × `502`** en 535 peticiones de log, **114/114 = `200`** en la
2ª campaña (§11 del informe) y **0 % de zaps perdidos** en el consumidor externo (antes 17,5 %).

## Estado de la entrega

| Pieza | Estado |
|---|---|
| Diagnóstico (causa, A/B del TTL, códigos del proveedor, TTL del token, métrica, zaps) | **cerrado**, read-only |
| Breaker fuera del gateway vivo | **HECHO** por el capitán (2 líneas) y verificado aquí |
| Métrica honesta (`error_ratio = fallos/intentos`) | **propuesta + compuesta con E7**, no desplegada |
| Gateway del repo (`b9eb1406`, 439 L) | **NO desplegable tal cual**: tiene el breaker y +172 líneas de fusible (§12) |
| Composición E11+E7 (un fichero por destino) | **entregada y verificada** (§13) — es lo que debe aplicar E10 |

## Ficheros

| Ruta | Qué es | ¿Escribe en el VPS? |
|---|---|---|
| `live/ape_gateway.lua` | copia byte-exacta del gateway **con** breaker (`sha256 66a20017…`) | no |
| `live/ape_obs.lua` | copia byte-exacta de `ape_obs.lua` (métrica `fallos/éxitos`) | no |
| `live/postfix/ape_gateway.lua` | copia del gateway **post-hotfix** (`sha256 2dc0fad8…`) | no |
| `live/postfix/ape_obs.lua` | copia de `ape_obs.lua` (sin cambios: la métrica sigue pendiente) | no |
| `proposed/ape_gateway.lua` | hotfix + delta E11: `reason` garantizado, cabeceras `X-APE-Reason`/`-Attempts`, `provider_fail:*` | **no desplegado** |
| `proposed/ape_obs.lua` | métrica honesta + retirada de la telemetría muerta `upstreams_down` | **no desplegado** |
| `proposed/ape_gateway.delta.patch` | diff aplicable sobre el **vivo** (`git apply --check` = 0) | no |
| `proposed/ape_obs.delta.patch` | idem | no |
| `proposed/historical/` | propuesta E11 de eliminar el breaker (equivalente funcional al hotfix del capitán) — se conserva por trazabilidad | no |
| `proposed/composed/ape_gateway.lua` | **E11 + E7 en un solo fichero** (§13): `reason`/`X-APE-Reason`/`attempts` + `ngx.ctx.ape_dec` | **no desplegado** |
| `proposed/composed/ape_obs.lua` | **E7 + E11**: métrica honesta + ventana de `/_ape/metrics` + `provider_failures_total` | **no desplegado** |
| `proposed/composed/composed_*.delta.patch` | parches ÚNICOS contra los bytes vivos (`git apply --check` = 0) | no |
| `scripts/e11_sim_composed.mjs` | simulación de **4 versiones** (incluye COMPOSED): `RESULT=OK (11/11)` | no |
| `scripts/e11_sample.py` | campaña: 150 GET al 443 + 30 al `:8088`, 3 canales, estado del breaker por muestra, control al proveedor en cada fallo | no |
| `scripts/e11_breaker_ab.py` | A/B determinista del breaker (1 disparo + ventana de 22 s) | no |
| `scripts/e11_provider_codes.py` | códigos del proveedor por ruta + concurrencia acotada (6 hilos) | no |
| `scripts/e11_token_ttl.py` | unicidad y TTL del token del `302` (rejilla 2→30 s) | no |
| `scripts/e11_analyze.mjs` | analizador offline → `E11_evidence.json` | no |
| `scripts/e11_sim_breaker.mjs` | simulación **offline** con `ngx` falso: perfila PREFIX / HOTFIX / PROPOSED | no |
| `scripts/e11_timeline.mjs` | línea de tiempo de fallos por cliente | no |
| `runs/20261026T203828Z/` | **ANTES**: campaña, A/B, logs `/cdn/` del 443 y del 8088, `E11_evidence.json` | no |
| `runs/POSTFIX_20261026T205125Z/` | **DESPUÉS**: campaña (180/180), códigos del proveedor, TTL del token, `E11_evidence.json` | no |
| `runs/VERIFY2_20261026T210641Z/` | **2ª pasada (§11)**: campaña propia 114×200, log de 2 días (1.227 peticiones), zaps, simulación compuesta | no |

Todos los artefactos **redactan** usuario/contraseña del proveedor (`<USER>`/`<PASS>`) y el token del
CDN (`<TOKEN>`).

## Cómo se re-ejecuta

```bash
# ANALIZADOR (offline, local: Node ≥18, 0 dependencias)
node _vps_stage/edge/E11_intermittent/scripts/e11_analyze.mjs \
     _vps_stage/edge/E11_intermittent/runs/20261026T203828Z
node _vps_stage/edge/E11_intermittent/scripts/e11_analyze.mjs \
     _vps_stage/edge/E11_intermittent/runs/POSTFIX_20261026T205125Z

# SIMULACIÓN de las 3 versiones (offline: canaliza Lua por stdin a `lua5.1 -` del VPS)
node _vps_stage/edge/E11_intermittent/scripts/e11_sim_breaker.mjs \
     _vps_stage/edge/E11_intermittent
node _vps_stage/edge/E11_intermittent/scripts/e11_sim_composed.mjs \
     _vps_stage/edge/E11_intermittent          # 4 versiones: PREFIX/HOTFIX/PROPOSED/COMPOSED

# MEDICIONES EN VIVO (solo GET; ~3-4 min cada una). Escriben SOLO en runs/<stamp>/
ssh -o BatchMode=yes root@178.156.147.234 'python3 -' \
    < _vps_stage/edge/E11_intermittent/scripts/e11_sample.py         > runs/<stamp>/samples.jsonl
ssh -o BatchMode=yes root@178.156.147.234 'python3 -' \
    < _vps_stage/edge/E11_intermittent/scripts/e11_provider_codes.py > runs/<stamp>/provider_codes.jsonl
ssh -o BatchMode=yes root@178.156.147.234 'python3 -' \
    < _vps_stage/edge/E11_intermittent/scripts/e11_token_ttl.py      > runs/<stamp>/token_ttl.jsonl
```

> ⚠️ **Trampa medida antes de cualquier sonda al proveedor:** responde **`461`** si la petición lleva
> `Accept: */*` (lo que manda `curl` por defecto) y **`302`** si solo lleva `Host` +
> `User-Agent: Mozilla/5.0` — exactamente lo que envía `/_ape/_fetch`
> (`proxy_pass_request_headers off`). Una sonda sin esas cabeceras mide un **falso “caído”**.

## Verificaciones de los parches (sin desplegar)

| Comprobación | Resultado |
|---|---|
| `git apply --check` de ambos `.delta.patch` sobre el fichero vivo | exit 0 |
| fichero aplicado == `proposed/*.lua` (comparación byte a byte, LF normalizado) | idéntico |
| `lua5.1` (LuaJIT-compatible) `loadstring` | `SYNTAX_OK` ambos |
| simulación offline PREFIX/HOTFIX/PROPOSED | `RESULT=OK (11/11)` |

## Lo que **no** se toca

`/var/www/lists`, `/lists/`, `gzip_static`/`gunzip`, la regla `.ts → 404`, `resolve.php`,
`origins.php`, `ngx.exit(503)`, circuit breakers, el generador/LAB. No se recarga nginx. El único
cambio en producción relacionado con este informe es **el del capitán** (breaker fuera), y aquí solo
se **verifica**.
