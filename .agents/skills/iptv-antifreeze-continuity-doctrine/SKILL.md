---
name: iptv-antifreeze-continuity-doctrine
description: Use when deciding how to keep a 4K channel alive through an upstream hiccup — separates the five defence levels (client buffer, proxy, multiplexer, monitoring, self-healing), states which ones exist in the APE stack as measured today, and forbids the ngx.exit(503) circuit breaker under the autopista doctrine while naming the only valid alternative (telemetry plus upstream failover, never cutting the client).
specialist: S7
kind: anchor
---

# iptv-antifreeze-continuity-doctrine

## 1. Cuándo usarla

- Alguien propone "poner un buffer en el VPS", "un circuit breaker", "un proxy intermedio"
  para que un canal 4K deje de cortar.
- Hay que decidir **qué nivel de defensa** corresponde a un freeze concreto.
- Hay que explicar por qué el VPS no puede ser el buffer que la literatura de proxies propone.
- Se va a tocar `pulse.php`, `nginx`, el vigilante o el JIT "para estabilizar".

## 2. Cuándo NO usarla

- Para asignar el código de fallo a una causa → `iptv-http-error-triage`.
- Para decidir si se puede bajar de perfil → `iptv-profile-fallback-doctrine`.
- Para el "cuándo" del failover y el auto-return → `iptv-failover-upstream-discipline`.
- Para puntuar un canal → `iptv-stream-stability-score`.

## 3. La doctrina que ya existe en este repo (no se re-inventa)

| Regla | Artefacto |
|---|---|
| Nunca frenar, bloquear, limitar ni interferir con la reproducción | `.agent/workflows/net-shield-autopista-sop.md:24` |
| `upstream_gate.lua` = PASSTHROUGH, nunca `ngx.exit(503)` | mismo SOP `:60`; `CLAUDE.md` §VPS NET SHIELD AUTOPISTA |
| Failover lo hace nginx, nunca un script Lua ni un circuit breaker | SOP `:24`, `:64` |
| Rebuffering se corrige con JIT copy, ruta/proxy, buffer/prefetch, CDN autorizado o metadata honesta; **nunca** con FHD/H.264/SDR/bitrate recortado | `docs/policies/ANTI_DEGRADATION_LAW.md:70-89` (Art. 5) |
| Manifiestos frescos, segmentos únicos, 206 exacto, sin caché de segmentos | `docs/policies/STREAMING_CONTINUITY_LAW.md:7-58` (Arts. 1–4) |
| Un cambio de streaming no se entrega sin pasar sus tres gates | misma ley `:105-115` (Art. 9) |
| Un 4xx del proveedor **no** se reporta como 5xx nuestro | `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/pulse.php:685-720` |

## 4. Los cinco niveles de defensa

Cada nivel vive en un sitio distinto, cuesta distinto y **falla distinto**. Confundirlos es
el error que produce "arreglos" que degradan o que bloquean.

| Nivel | Qué hace | Mecanismo | Dónde vive | Coste real |
|---|---|---|---|---|
| **N0 — buffer de cliente** | absorbe el hipo sin tocar la red | buffer del player (network-caching / minBuffer) | device | memoria del player y latencia de arranque |
| **N1 — proxy de manifiesto** | reintenta una vez, sirve la última playlist buena, deduplica recargas | `retry` + `stale-while-error` + `single-flight` | `pulse.php` | PHP-FPM (3 vCPU) |
| **N2 — buffer de hueco (gap buffer)** | guarda 5–20 s de segmentos y los sirve durante el bache | ring/gap buffer en el proxy | un proxy con proceso propio | RAM + **latencia añadida** + copia de bytes |
| **N3 — multiplexor / failover** | cambia de proveedor sin cortar al cliente | un canal lógico con N fuentes | un multiplexor | una conexión por canal + estado + mapeo |
| **N4 — monitoreo** | detecta antes que el usuario | sondeo por HTTP real, estado por módulo | vigilante | CPU de sondeo, y **una conexión del proveedor si sondea vídeo** |
| **N5 — auto-healing** | revive lo caído sin humano | reinicio + reemplazo + cooldown | vigilante / job | escribe estado; puede enmascarar la causa |

**Regla de oro del orden:** un nivel nunca sustituye al de abajo. N3 no arregla un N1 roto
(si el manifiesto sale mal, el multiplexor cambia de proveedor para servir el mismo mal
manifiesto). N5 no arregla un N4 ciego (reiniciar lo que no se midió es ruido).

## 5. Qué existe en NUESTRO stack, medido

### 5.1 N1 — sí existe, y es más de lo que parece

`IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/pulse.php` (786 líneas) ya implementa cuatro
mecanismos que la literatura vende como "anti-freeze":

| Mecanismo | Dónde | Valor medido / leído |
|---|---|---|
| Caché corta de manifiesto | `:580`, `:667` | TTL **8 s**, justificado contra `targetduration` del proveedor **11 s** (`:656-667`) |
| Single-flight (anti-509) | `:582`, `:591-607` | lock APCu 3 s, espera 12×150 ms = **1,8 s** |
| Retry único | `:610-624` | sólo para `0`, `≥500`, `513`, `461`, `429`, `408`, `302`; sleep 250 ms (461→400 ms, 302→150 ms) |
| Stale-while-error | `:671-680` | última playlist buena **60 s**, servida con `X-APE-Pulse: …;stale=1;upstream_code=N` |
| Código real al cliente | `:719-720` | `$httpOut = ($code >= 400 && $code <= 599) ? $code : 502` |

Esto **es** N1, y está por encima de la media de los proxies estudiados en un punto: no
miente el código. Un 407 del proveedor sale como 407, no como 502.

### 5.2 N2 — no existe, y no debe existir en PHP

El path de vídeo **sí** atraviesa el VPS desde 2026-11-14: `ape_seg_serve()` sirve
`/seg/<b64url>` con `CURLOPT_RETURNTRANSFER=false`, cero rebase, cero filtro, cero
recompresión. Medido: `HTTP 200`, `content-type video/mp2t`, `12.503.316 B`, sync `0x47`
en byte 0 y 188, `20 segs / 285.562.174 B = 11,42 Mbps`
(`docs/audits/SEGMENT_PROXY_FIX_20261114.md:43-52`).

O sea: el dato pasa. Aun así un **gap buffer de 5–20 s** no se implementa aquí, por tres
razones medidas y una doctrinal:

1. **Recursos.** PHP-FPM en 3 vCPU (`docs/manifestos/VPS_REALITY_MEASURED_2026-10-25.md:110`
   y SOP `:22`) sirviendo 21.224 canales. Un buffer por sesión es memoria por sesión.
2. **Latencia.** El propio arreglo de `/seg/` se diseñó como streaming directo al output
   (`RETURNTRANSFER=false`, `:29`) precisamente para no copiar. Guardar 5–20 s es lo contrario.
3. **El recurso escaso no es el buffer, es la conexión.** El proveedor da ~1 conexión por
   cuenta; el zapping ya cuesta 0,649 s de p50 bueno y 4,3 s perdidos por 502
   (`docs/audits/LIVE_CAPTURE_20261114.md:259`). Añadir 20 s de buffer **empeora** el
   arranque, que es el freeze que el operador reporta primero.
4. **Doctrina.** La autopista prohíbe frenar. Un gap buffer introduce espera deliberada.

**Veredicto: NO APLICABLE.** El buffer correcto es N0, en el device, que ya existe.

### 5.3 N3 — no existe, y está bloqueado por una regla del catálogo

No hay multiplexor: `/pulse/<id>` recibe **una** URL (`u=`) y la rebasa. No hay mapa
`canal → [primario, backup]` en el servidor.

Y no puede resolverse desde la lista: la doctrina manda **exactamente una URL por canal**
para no provocar HTTP 509 (`CLAUDE.md` §Single URL Per Channel). Un "failover en la lista"
son dos URLs por canal, que es exactamente lo prohibido.

**La única forma válida** es una tabla server-side detrás del mismo `/pulse/<id>`, que el
cliente nunca ve. Eso es trabajo de `iptv-failover-upstream-discipline`, no de esta skill,
y hoy **NO EXISTE** (no se ha medido ninguna tabla así en el repo).

### 5.4 N4 — existe, con 7 filas

`IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-module-watchdog.sh` (215 líneas), timer cada 60 s
(`vps/systemd/ape-module-watchdog.timer:3`), estado en `/var/lib/ape/module-watchdog.json`.

Las filas reales, leídas del script:

```
nginx-health | php-fpm | jit-catalogo | canary | pulse-canal | zapping | proyeccion
```

Y una decisión de diseño que hay que copiar, no discutir: cuando `pulse-canal` recibe
`502|461|000|403|407|404|429|451` lo marca **`sin-muestra`**, no `fail` (`:146-158`),
porque *"un canal caído no es un módulo caído"*. Un monitor que confunde proveedor con
plataforma entrena al operador a ignorar el panel.

**Nota de conteo honesta:** la documentación dice 6 módulos
(`docs/architecture/INSTRUMENTACION_APE_CRYSTAL_FLOW.md:112-114`,
`docs/architecture/BASELINE_APE_CRYSTAL_FLOW_20261114.md:88`); `ESTADO_DEL_ARTE_20261115.md:217`
dice 7. El script tiene 7 filas: `proyeccion` se añadió el 2026-11-15. **Manda el script.**

### 5.5 N5 — existe a nivel de servicio, no de canal

`restart_if()` (`:76-84`) reinicia `nginx`, `php8.3-fpm`, `ape-jit` y, si el enlace falta,
republica el JIT (`:119-121`). **No hay** auto-healing por canal: no hay reemplazo de
fuente ni "revive" de un stream muerto. Eso es N5 de canal y hoy es NO COMPUTADO en
nuestro stack.

## 6. La línea roja: el circuit breaker con `ngx.exit(503)`

Un circuit breaker que responde 503 al cliente **viola la doctrina** y además está
técnicamente mal. Las dos cosas, con evidencia:

**Doctrinal.** `.agent/workflows/net-shield-autopista-sop.md:24` — *"Si el upstream falla,
nginx maneja failover automáticamente — nunca un script Lua ni un circuit breaker"*.
`:60` — `upstream_gate.lua` **es** PASSTHROUGH. `CLAUDE.md` lista "Activar circuit breaker
en el VPS que bloquee por host" entre las cosas que **nunca** se hacen.
`circuit-breaker-removal-doctrine` existe justamente para desmontarlo.

**Técnico, y es lo caro.** Este repo ya pagó el defecto:

- Un 502 fijo *"dice 'el servidor falló, reintenta' → el player insiste contra un canal que
  el proveedor no va a servir nunca"*, mientras un 407 *"dice 'el proveedor rechaza' → el
  player puede saltar"* (`pulse.php:697-700`).
- El 502 fijo escondió **302 respuestas** durante 14 h y metió todo 4xx del proveedor en el
  cubo de 5xx, con lo que *"el diagnóstico mentía"* (`:687-704`).
- Un breaker añade el daño inverso: convierte un 407 real en un 503 nuestro, y el 407 —el
  código de bloqueo de este proveedor— desaparece del log.

**El único sustituto válido, en este orden:**

1. **Telemetría** (no bloquea, no interviene).
2. **Retry único con backoff** — ya en `:610-624`.
3. **Stale-while-error acotado** (60 s) — ya en `:671-680`, y **marcado** con `stale=1`.
4. **Failover de upstream** (N3) cuando la fuente primaria falla de verdad.
5. **Servir el código real** — la respuesta honesta también es una respuesta.

**Matiz que no se oculta:** el circuit breaker de `m3ue/m3u-proxy` (su "Strict Live TS
Mode") es legítimo **en su contexto**: multiproveedor, multiusuario, con *slots* de
conexión que hay que repartir. Aquí hay un operador y ~1 conexión por cuenta: no hay nada
que proteger de una tormenta de reintentos. Copiar el patrón sin su contexto es copiar el
defecto.

## 7. El presupuesto de latencia (lo que cada nivel cuesta)

Un anti-freeze que añade 20 s de espera no es anti-freeze: es un freeze con colchón.
Números medidos en este stack:

| Métrica | Valor | Artefacto |
|---|---|---|
| Zapping bueno (manifiesto → manifiesto) p50 | **0,649 s** | `docs/audits/LIVE_CAPTURE_20261114.md:259` |
| Lo que cuesta un fallo (502) | **4,3 s perdidos** | mismo |
| Latencia de manifiesto `/pulse/` p50 | **704 ms**; con caché **1 ms** | `docs/architecture/BASELINE_APE_CRYSTAL_FLOW_20261114.md:43` |
| Origen de esa latencia | **99,97 % es el proveedor** (`urt`), el VPS no añade | `docs/audits/E2E_PULSE_20261114.md:131` |

Conclusión operativa: **el VPS no es el cuello de botella y no hay nada que rascar ahí**.
Cualquier nivel que añada decenas de ms para "estabilizar" compra riesgo contra un p50 de
704 ms que ya es casi todo proveedor.

## 8. Qué medir para saber si un nivel sirve

Un nivel que no se mide no se declara. Mínimo por nivel:

- **N1**: tasa de `stale=1` sobre el total de `/pulse/`, y `cache=hit|miss` del header
  `X-APE-Pulse`. Si `stale=1` supera ~10 % de la ventana, N1 está tapando un N3 que falta.
- **N2**: (si algún día existe) latencia añadida p50/p90 y RAM por sesión. Hoy: **no aplica**.
- **N3**: tasa de failover y **por qué** (5xx vs 4xx). Un failover disparado por 403 es un
  defecto, no una recuperación.
- **N4**: `fallos` en `/var/lib/ape/module-watchdog.json`, contando `sin-muestra` aparte.
- **N5**: reinicios por unidad y si el síntoma volvió. Reiniciar sin causa medida es ruido.

Fórmula y estados de evidencia: `iptv-stream-stability-score`.

## 9. Anti-patrones

| Anti-patrón | Por qué está mal |
|---|---|
| Buffer en el VPS "para que no corte" | Añade latencia, consume RAM por sesión, y el recurso escaso es la conexión |
| `ngx.exit(503)` como breaker | Viola autopista y convierte 4xx del proveedor en 5xx nuestro |
| Bajar a FHD "para estabilizar" | Art. 1/5 de la ley anti-degradación |
| Vigilar con `systemctl is-active` | Mide el proceso, no el servicio; el vigilante ya prueba HTTP real (`:88-160`) |
| Contar `499` como error | 499 es el operador cambiando de canal (`LIVE_CAPTURE:301`) |
| Sondear vídeo cada 60 s desde el VPS | Gasta la única conexión del proveedor y **el canary se la roba al player** (`docs/audits/CANARY_STACK_FORENSICS_20261114.md:310`) |
| Prometer failover desde la lista | Dos URLs por canal = HTTP 509 |

## 10. Checklist antes de tocar continuidad

```
[ ] ¿Qué nivel es esto (N0..N5) y por qué no el de abajo?
[ ] ¿Añade latencia? ¿cuánta, contra qué p50 medido?
[ ] ¿Bloquea, frena o limita algo? → si sí, viola autopista, se para
[ ] ¿Convierte un 4xx del proveedor en un código nuestro?
[ ] ¿Sigue sirviendo el código real al player?
[ ] ¿Puedo medir su efecto con playlist_access.log y el vigilante?
[ ] ¿Toca una conexión del proveedor que el player necesita?
[ ] ¿Cambia calidad de vídeo? → Art. 9 de la ley anti-degradación o no se hace
```

## 11. Riesgos y límites honestos

- **El nivel que falta es N3**, y es el único que resuelve "el proveedor se cayó de verdad".
  Todo lo demás alarga la agonía. No se presenta N1 como si fuera N3.
- **N2 no es "imposible"**: es no aplicable por recursos, latencia y doctrina. Si el VPS
  cambiara de tamaño o de rol, la respuesta se revisa; hoy no.
- **N5 de canal no existe**; decir "auto-healing" hoy es hablar del servicio, no del canal.
- **La documentación de módulos va un paso por detrás del script** (6 vs 7). Se cita el
  script; la cifra de la doc se marca como desactualizada, no se corrige aquí.
- Un freeze puede ser **del device** (decoder, SoC, superficie) y no de la red: en ese caso
  ningún nivel de esta skill lo arregla (`SEGMENT_PROXY_FIX` §"Lo que NO está arreglado").
