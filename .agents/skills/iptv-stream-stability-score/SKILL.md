---
name: iptv-stream-stability-score
description: Use when scoring channel stability from telemetry the stack already has (playlist_access.log, the module watchdog, the X-APE-Pulse header) — gives the explicit formula with justified weights, the PASS/FAIL/SKIP mapping, and the NO COMPUTADO list so a score is never invented for what the logs cannot see.
specialist: S5
kind: anchor
---

# iptv-stream-stability-score

## 1. Cuándo usarla

- Hay que decidir **qué canal está peor** sin reproducirlos uno a uno.
- Alguien propone "puntuar los canales" o "elegir la mejor fuente del mismo canal".
- Hay que justificar por qué un canal va a la lista de revisión y otro no.
- Se quiere comparar el estado de hoy con el de la semana pasada.

## 2. Cuándo NO usarla

- Para decidir si un fallo es red, proveedor, decoder o lista → `iptv-http-error-triage`.
- Para actuar sobre el score (failover, degradar, borrar) → `iptv-failover-upstream-discipline`
  y `iptv-antifreeze-continuity-doctrine`. **Un score no autoriza nada por sí solo.**
- Para calidad de imagen → `iptv-real-resolution-verifier`.

## 3. Principio

> Un score solo vale si cada componente se puede recalcular desde un artefacto que existe
> hoy y si lo que no se mide se declara NO COMPUTADO en vez de puntuarse como cero.

El modelo de referencia es `ottstreamscore` (MIT), que puntúa por **reliability 60 % /
resolution 25 % / FPS 15 %** sobre 7 días de uptime (README, §Feed Ranking). Se toma el
**concepto** — pesos explícitos, ventana larga, ranking de duplicados — y se adapta a lo
que este stack mide de verdad. **No se copia código**: ver `references.md`.

## 4. Los insumos que SÍ existen

| # | Artefacto | Campos | Granularidad | Cobertura medida | Trampa |
|---|---|---|---|---|---|
| I1 | `/var/log/nginx/playlist_access.log` (formato `ape_playlist`) | `$status`, `rt=` (total), `urt=` (upstream), `$body_bytes_sent`, request `/pulse/<id>` y `/seg/` | **1 s** | 2.929 hits de `/pulse/` medidos frente a 3 en `access.log` | rotación diaria; `rt` existe desde 2026-11-14 (`ZAP_LATENCY_INSTRUMENTATION_20261114.md:16-31`) |
| I2 | `/var/lib/ape/module-watchdog.json` | `verdict`, `fallos`, `modulos[]` | 60 s | 7 filas | `pulse-canal` con 4xx del proveedor sale **`sin-muestra`**, no `fail` |
| I3 | header `X-APE-Pulse` | `mode`, `cache=hit|miss`, `stale=1`, `code`, `kind` | por petición | sólo si el cliente lo guarda | **no se persiste**: sin serie histórica |
| I4 | `tools/ops/ape-zapping-meter.sh` | arranque de red, gap entre segmentos, servicio de segmento | ventana 30 min | JSON | latencia en **segundos**, no ms |
| I5 | `ape-last-channel.php` | canal + resolución real (ffprobe) | bajo demanda | 200 | un canal por llamada |

**Lo que NO existe** (y por tanto no puede pesar en la fórmula): latencia de render en el
device, frame drops, decoder errors, rebuffer del player, y calidad perceptual. El propio
repo lo cierra: *"QoE perceptual del decoder: no medible sin root; solo proxy-QoE de red"*
(`docs/architecture/INSTRUMENTACION_APE_CRYSTAL_FLOW.md:148`).

## 5. La fórmula

Por canal `c` y ventana `W` (por defecto 60 min, mínimo 30 muestras):

```
S(c) = 100 · ( 0.40·A + 0.20·L + 0.30·C + 0.10·F )        [0..100]
```

Cuatro sub-scores normalizados a `[0,1]`:

### A — disponibilidad (peso 40)

```
A = ( n_2xx + n_3xx ) / ( n_2xx + n_3xx + n_5xx + n_4xx_prov + n_000 )
```

- `n_4xx_prov` = 401/403/407/429/451/461 — **se cuenta como no disponible pero se
  reporta aparte como `bloqueo_proveedor`, no se mezcla con 5xx**.
- **Excluidos del denominador:** `499` (el operador cambió de canal:
  `LIVE_CAPTURE_20261114.md:301`), `404` de health checks y cualquier petición sin
  `/pulse/` o `/seg/`.
- **Justificación del 40 %:** el 75,2 % de los 502 medidos son del proveedor
  (`SEGMENT_PROXY_FIX_20261114.md:71`; `pulse.php:661`). La disponibilidad es el eje que
  más veces falla y por eso pesa más.

### L — latencia de arranque (peso 20)

```
L = clamp( 1 − ( p50(rt) / p50_ref − 1 ) / 2 , 0 , 1 )
```

- `p50_ref = 0.649 s` — mediana medida del zapping bueno
  (`docs/audits/LIVE_CAPTURE_20261114.md:259`). **No es un número inventado: es el
  baseline del propio stack**, y por eso `L` se recalibra sola si mañana cambia.
- `p50(rt)` se toma de las peticiones `/pulse/` del canal (no de `/seg/`, que mide otra cosa).
- Se **excluyen los 502** del cálculo: *"un 502 de latencia media NO es una muestra de
  zapping bueno"* — son dos poblaciones y promediarlas miente (`LIVE_CAPTURE:248-259`).
- `L = 1` cuando el canal arranca al baseline o mejor; `L = 0` cuando tarda **3×** el baseline.

### C — continuidad de segmentos (peso 30)

```
C = 1 − min( 1 , n_gap_malo / n_gap_total )
gap_malo  ⇔  gap > 2 · targetduration
```

- Sólo computable cuando la cadena `/pulse/<id>` → `/seg/` es **atribuible** al canal
  (peticiones consecutivas del mismo cliente dentro de la ventana). Si hay intercalado de
  varios canales, `C` es **NO COMPUTADO** — no se estima.
- `targetduration` se lee del propio manifest (medido: **11 s**,
  `pulse.php:656-667`); el umbral queda en 22 s.
- **Justificación del 30 %:** el gap es lo que el usuario **ve** como freeze. Pesa más que
  la latencia porque la latencia cuesta segundos una vez y el gap se repite.

### F — frescura (peso 10)

```
F = 1.0   si ninguna respuesta lleva stale=1
    0.5   si stale=1 en < 20 % de las respuestas
    0.0   si stale=1 en ≥ 20 %
```

- Se lee del header `X-APE-Pulse` (`pulse.php:676`, `:736`) cuando el cliente lo registra;
  si no hay registro, `F` es **NO COMPUTADO** y el peso se redistribuye (ver §7).
- **Justificación del 10 %:** servir stale es *disponibilidad con bandera*. Pesa poco para
  no contar dos veces lo mismo que `A`.

## 6. Veredicto PASS / FAIL / SKIP

Se adoptan las tres etiquetas de `christheradioguy/stream-manager` (`tools/audit.py`,
README §Auditing every source) porque separan lo que el resto de la industria mezcla:
**pasó**, **falló** y **no se pudo probar**.

| Veredicto | Condición | Qué significa para el operador |
|---|---|---|
| **PASS** | `n ≥ 30` ∧ `A ≥ 0,98` ∧ `L ≥ 0,70` ∧ (`C ≥ 0,90` ∨ `C` no computado) ∧ sin 5xx en los últimos 5 min | el canal está sano en esta ventana |
| **FAIL** | `A < 0,90` ∨ ≥ 5 5xx consecutivos ∨ `stale=1 ≥ 20 %` ∨ `C < 0,70` (computado) | hay que diagnosticar; **no** autoriza degradar ni borrar |
| **SKIP** | `n < 30` ∨ el canal no se pidió en `W` ∨ `bloqueo_proveedor > 50 %` de las muestras | no hay muestra suficiente; **no es un cero** |

Reglas duras:

- Un `FAIL` **no** es una orden de borrado: `NO CHANNEL LOSS` sigue vigente
  (`CLAUDE.md` §Regla Madre). Un canal bloqueado por el proveedor es un caso para el
  proveedor, no para la lista.
- Un `SKIP` **no** se promedia con `PASS` para decir "la plataforma está al 90 %".
- `bloqueo_proveedor` es un **flag de diagnóstico**, no un sub-score: 407 es el código de
  bloqueo medido de este proveedor (`ape-module-watchdog.sh:152-157`).

## 7. Pesos ausentes: qué se hace

Si `F` o `C` no son computados, **no se pone cero**. Se renormaliza sobre los pesos
presentes:

```
S(c) = 100 · Σ(w_i · X_i) / Σ(w_i)        para los i computados
```

Y el resultado lleva `"confianza": "parcial"` con la lista de componentes ausentes. Un
score parcial sin su etiqueta es un score falso.

## 8. Salida (esquema propio, no de ningún repo)

```json
{
  "canal": "1312008",
  "ventana_min": 60,
  "n_pulse": 84, "n_seg": 512,
  "A": 0.964, "L": 0.71, "C": null, "F": 1.0,
  "bloqueo_proveedor": 0,
  "score": 88.9,
  "confianza": "parcial",
  "no_computado": ["C: cadena /pulse -> /seg no atribuible en la ventana"],
  "veredicto": "PASS",
  "artefacto": "/var/log/nginx/playlist_access.log + /var/lib/ape/module-watchdog.json"
}
```

## 9. Cómo se produce (comandos read-only, sin tocar producción)

Todo esto es **lectura**. Ninguno escribe en el VPS.

```bash
# U1 · inventario de la ventana por canal (status, rt, urt)
awk '$7 ~ /\/pulse\// {print $7, $9, $0}' /var/log/nginx/playlist_access.log \
  | sed -E 's/.*\/pulse\/([0-9]+)[^ ]* ([0-9]{3}) .* rt=([0-9.]+).* urt=([0-9.-]+).*/\1 \2 \3 \4/' \
  | tail -5000

# U2 · estado de módulos (no confundir sin-muestra con fail)
cat /var/lib/ape/module-watchdog.json

# U3 · zapping medido con su propia herramienta
bash tools/ops/ape-zapping-meter.sh --json

# U4 · distribución de errores separada 4xx/5xx (la que el 502 fijo escondía)
awk '{print $9}' /var/log/nginx/playlist_access.log | sort | uniq -c | sort -rn
```

**Estado en este entorno: NO COMPUTADO.** El log vive en el VPS
`178.156.147.234` y esta sesión no tiene acceso a él; no se rellena con cifras de ejemplo.
Los valores agregados citados (§4, §5) son del baseline congelado en el repo, **no** de una
corrida per-canal.

## 10. Protocolo de calibración (antes de mirar el resultado)

1. Congelar la ventana: 7 días, mismos canales, mismo `targetduration` de referencia.
2. Producir el ranking con los pesos de §5 y guardarlo.
3. Pedir al operador un ranking subjetivo de **20 canales** que él considere problemáticos.
4. Medir la correlación (Spearman) entre ambos rankings.
5. **Sólo entonces** mover pesos, y declarar el cambio y su motivo en la skill.
6. Re-medir en la ventana siguiente. Un cambio de pesos sin esta secuencia es una opinión.

Sin el paso 3 este score es **descriptivo**, no validado. Se declara así.

## 11. Anti-patrones

| Anti-patrón | Por qué |
|---|---|
| Promediar 200 con 502 | Dos poblaciones distintas; ya está advertido `LIVE_CAPTURE:248-259` |
| Contar 499 como fallo | 499 = el operador zappeando |
| Contar 4xx del proveedor como 5xx | Es el defecto que `pulse.php:687-704` corrigió |
| Puntuar `stale` como éxito y como disponibilidad | Doble conteo |
| Puntuar 0 lo que no se midió | Un NO COMPUTADO no es un cero |
| Usar el score para degradar o borrar | Viola `ANTI_DEGRADATION_LAW` y `NO CHANNEL LOSS` |
| Puntuar con 3 muestras | `n ≥ 30` o `SKIP` |

## 12. Checklist

```
[ ] ¿Ventana declarada y con n ≥ 30 por canal?
[ ] ¿499 y health checks fuera del denominador?
[ ] ¿4xx del proveedor separados y reportados como flag?
[ ] ¿502 excluidos del cálculo de L?
[ ] ¿C atribuible o declarado NO COMPUTADO?
[ ] ¿Pesos renormalizados si falta un componente?
[ ] ¿confianza = parcial cuando corresponde?
[ ] ¿El veredicto SKIP se reporta como SKIP y no como 0?
```

## 13. Riesgos y límites honestos

- **El score no ve el device.** Un canal con score 100 puede congelarse en un decoder que
  no soporta el perfil; eso es `iptv-profile-fallback-doctrine`, no este skill.
- **`rt` tiene granularidad de segundos** en el log, así que las diferencias por debajo de
  ~1 s no se resuelven por esta vía.
- **`F` casi nunca será computado** hasta que el header `X-APE-Pulse` se persista. Hoy se
  lee del cliente; sin persistencia, `F` es NO COMPUTADO y el score pierde ese 10 %.
- **Los pesos son una propuesta**, no un hecho medido: el paso 3 de §10 aún no se ha hecho.
  Un score con pesos no validados sirve para ordenar, no para decidir.
