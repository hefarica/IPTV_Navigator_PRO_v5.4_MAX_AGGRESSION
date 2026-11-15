---
name: iptv-failover-upstream-discipline
description: Use when a channel fails and someone proposes failover, retry or a quality drop — fixes that failover is only for 5xx, timeout and EOF, never for 401/403/407/429/451 (provider blocking must be diagnosed, not masked), never trades quality for stability, and defines the automatic return to the recovered primary.
specialist: S6
kind: anchor
---

# iptv-failover-upstream-discipline

## 1. Cuándo usarla

- Un canal "no abre" o "corta" y hay que decidir si se cambia de fuente.
- Alguien propone añadir un `backup` al upstream, un segundo `proxy_pass` o "un
  failover" en la lista.
- Se va a tocar `proxy_next_upstream`, `proxy_cache_use_stale` o el retry de `pulse.php`.
- Un canal vuelve a estar sano y hay que decidir **cuándo** volver al primario.

## 2. Cuándo NO usarla

- Para clasificar el código de error → `iptv-http-error-triage`.
- Para decidir si se puede bajar de perfil → `iptv-profile-fallback-doctrine`.
- Para el diseño de niveles de defensa → `iptv-antifreeze-continuity-doctrine`.
- Para puntuar el canal → `iptv-stream-stability-score`.

## 3. La regla, en una tabla

| Código / evento | ¿Failover? | Qué se hace | Por qué |
|---|---|---|---|
| `0` (connect/timeout) | **Sí**, tras 1 retry | retry 250 ms → si vuelve a fallar, siguiente fuente | no hay respuesta: la fuente está caída |
| `500 502 503 504` | **Sí** | failover | fallo del servidor de origen |
| `408` | **No**, retry | retry con backoff | timeout del proveedor, no caída |
| `429` | **No**, retry con backoff | reintentar y **diagnosticar** | throttle por límite de conexiones; cambiar de fuente lo empeora |
| `461` | **No**, retry largo (400 ms) | reintentar | throttle medido de este CDN (`pulse.php:611-616`) |
| `302` | **No** — se sigue | seguir y **re-pedir** | el token rota: medido `200,302,302` en tres intentos (`pulse.php:618-623`) |
| `401 403` | **NUNCA** | diagnosticar: credencial, IP, UA, token | es bloqueo o auth del proveedor; el failover lo enmascara |
| `407` | **NUNCA** | diagnosticar | **es el código de bloqueo medido de este proveedor** (`ape-module-watchdog.sh:152-157`) |
| `451` | **NUNCA** | diagnosticar | bloqueo legal/regional |
| `499` | **No aplica** | nada | el operador cambió de canal (`LIVE_CAPTURE_20261114.md:301`) |
| `5xx` repetido en 2 fuentes a la vez | **No** | reabrir en el live edge | dos backbones que fallan juntos apuntan a red o fuente, no a proveedor (`mmp` README §Proxy and failover) |

**Por qué 4xx no es failover, con evidencia de este repo:** el `502` fijo que había en
`pulse.php` convertía un `407` del proveedor en un `502` nuestro. Consecuencias medidas en
14 h y 302 respuestas (`pulse.php:685-704`):

- el player reintentaba contra un canal que el proveedor **no iba a servir nunca**;
- el log mostraba 5xx del servidor donde había 4xx del proveedor;
- el QoE server-side separa `err4xx`/`err5xx`, así que **el diagnóstico mentía**.

Un failover disparado por 403 hace lo mismo con otra cara: cambia de fuente para no ver el
bloqueo, y el bloqueo sigue ahí cuando vuelve.

## 4. Regla segunda: el failover cambia de **proveedor**, nunca de **calidad**

Está escrito y es innegociable:

- `docs/policies/ANTI_DEGRADATION_LAW.md:7-21` (Art. 1) prohíbe bajar resolución, codec, HDR,
  fps, bitrate o canales de audio, y `:21` lo cierra: *"Un fallo de reproducción no autoriza
  degradar la señal."*
- Art. 5 (`:70-89`): el rebuffering se corrige con JIT copy, ruta/proxy, buffer/prefetch, CDN
  autorizado o metadata honesta — **no** con FHD/H.264/SDR/bitrate recortado.
- Art. 8 (`:113-122`): tampoco se puede **declarar** que se arregló.
- Art. 10 (`:138-145`): `4K REAL > FHD "que funciona"`.

**La prueba operativa:** si el failover cambia el `CODECS=`, el `RESOLUTION=` o el
`BANDWIDTH=` de lo que se entrega, no es un failover: es una degradación con otro nombre.
Un failover correcto entrega **el mismo perfil** desde otra fuente.

### 4.1 La tensión que hay que resolver, no ocultar

`docs/policies/STREAMING_CONTINUITY_LAW.md:82-90` (Art. 7) dice:

```text
HDR → SDR 1080 → SDR 720
```

Eso **parece** contradecir el Art. 1 de la ley anti-degradación. No lo contradice, y la
diferencia es la causa:

| Disparador | ¿Degrada? | Base |
|---|---|---|
| El **decoder del device** no inicializa el códec/perfil | Sí, un escalón, registrado | Art. 7 de continuidad + `iptv-profile-fallback-doctrine` |
| El **proveedor** devuelve 5xx/timeout | **No autoriza nada** | Art. 1/5 de anti-degradación |

Es decir: la cadena HDR→SDR→720 es una respuesta a **incapacidad de decoder medida**, no a un
fallo de red. Usarla para "estabilizar" un 502 es exactamente lo prohibido. Se documenta la
tensión porque quien lea solo el Art. 7 va a concluir lo contrario.

## 5. Regla tercera: el auto-return, con histéresis

Volver al primario es parte del failover, y volver mal es peor que no volver.

**Principios** (conceptos tomados de tres implementaciones, sin copiar código):

| Principio | Fuente del concepto | Cómo se aplica aquí |
|---|---|---|
| No se cambia de fuente mientras la actual **produce** | autopista (`net-shield-autopista-sop.md:24`) | el swap sólo ocurre cuando la fuente actual ya falló, nunca "por si acaso" |
| Un primario que sobrevive **60 s** recupera su lugar | `christheradioguy/stream-manager` README §Multiple sources and failover | el contador de fallos se resetea tras una corrida sana |
| Backoff exponencial para la fuente caída | `mmp` (`proxy.cooldown_base` 5 s → `cooldown_max` 10 min) | la fuente caída se salta, no se reintenta en cada zap |
| Anti ping-pong | `tuliprox` README §Connection admission ("anti-ping-pong protection") | si dos fuentes alternan en < N minutos, se fija la que esté sirviendo y no se vuelve a probar hasta el siguiente ciclo |
| Reanudar por la última URL buena **o** reiniciar por la primera, y elegirlo | `tuliprox` README §Provider resilience | parámetro explícito; el defecto debe ser "reanudar", porque reiniciar castiga al que ya funcionaba |
| El failover no debe rewinds el reloj del que mira | `stream-manager` README §Sources that rotate | ver §5.1: en HLS esto obliga a cambiar sólo en frontera de sesión |

### 5.1 El límite duro del HLS que nadie debe saltarse

Un multiplexor de TS puede cambiar de fuente a mitad de stream y continuar la línea de
tiempo. **Un manifiesto HLS no.** Si se empalman segmentos de dos proveedores en la misma
ventana de playlist, el player ve un salto de `EXT-X-MEDIA-SEQUENCE`/PTS; lo que hace con
eso depende del player (los basados en reloj —la mayoría de set-top y Android— se quedan
atrás o se desincronizan).

Por eso, en este stack:

- **el failover se decide en la petición de manifiesto** (frontera de sesión), no dentro de
  una ventana ya servida;
- si hiciera falta empalmar, es obligatorio `#EXT-X-DISCONTINUITY` — y aun así el player
  puede no recuperarse, así que **no se promete "sin corte visible"**: se promete "vuelve".

## 6. El bloqueo arquitectónico de este stack (medido)

`/pulse/<id>` recibe **una** URL en `u=` y la rebasa; no hay mapa `canal → [primario, backup]`.
Y la lista **no puede** llevar el backup: la doctrina exige exactamente una URL por canal para
no provocar HTTP 509 (`CLAUDE.md` §Single URL Per Channel;
`single-url-per-channel-enforcer`).

Consecuencia: **un failover multiproveedor sólo es posible server-side, detrás del mismo
`/pulse/<id>`**, con una tabla que hoy **no existe**. Estado: NO EXISTE, no "en progreso".

Lo que **sí** hay hoy, y hay que reconocerlo antes de proponer nada:

| Primitive | Dónde | Qué hace y qué no |
|---|---|---|
| Retry único | `pulse.php:610-624` | reintenta **la misma** URL; no cambia de fuente |
| Stale-while-error 60 s | `pulse.php:671-680` | sirve la última playlist buena; marca `stale=1`; **no** cambia de fuente |
| Código real al cliente | `pulse.php:719-720` | permite al player decidir con información honesta |
| `proxy_next_upstream` (nginx) | `net-shield-autopista-sop.md:64` | `error timeout http_502 http_503 http_504` — correcto: **sin 4xx** |

## 7. Lo que hay que añadir, si se autoriza (diseño, no implementación)

1. Tabla `canal_id → [url_primaria, url_backup...]` en el VPS, versionada y con el mismo
   candado que la lista (una entrada por canal, sin credenciales en claro).
2. Selección de fuente **antes** de abrir la conexión del manifiesto, con:
   - cooldown exponencial por fuente (5 s → 10 min),
   - reset del cooldown tras 60 s de servicio sano,
   - anti ping-pong,
   - registro del **motivo** (`5xx`, `timeout`, `eof`) en el log, no solo del hecho.
3. **Nunca** en `401/403/407/429/451`: esos códigos emiten un evento de diagnóstico y **no**
   tocan la selección de fuente.
4. Un gate que falle el deploy si el failover se dispara por un 4xx (verificable en
   `playlist_access.log`: `failover` cuyo `upstream_code` es 4xx = defecto).
5. Rollback: la tabla es aditiva; sin entradas, el sistema se comporta como hoy.

**Estado de este diseño: propuesta.** No se implementa en esta tarea; escribe fuera del
scope de skills y toca producción.

## 8. Anti-patrones

| Anti-patrón | Daño |
|---|---|
| `proxy_next_upstream http_403 http_429` | enmascara el bloqueo del proveedor |
| Failover por `429` | el proveedor ya dijo "no hay conexión libre"; cambiar de fuente gasta otra |
| Backup dentro de la lista M3U | dos URLs por canal → 509 |
| Failover que baja de perfil | degradación prohibida (Art. 1/5) |
| Volver al primario "en cuanto responde un ping" | ping-pong: el usuario ve dos cortes en vez de uno |
| Failover a mitad de ventana HLS sin `EXT-X-DISCONTINUITY` | desincroniza al player basado en reloj |
| Contar el failover como éxito sin registrar el motivo | no se puede distinguir recuperación de enmascaramiento |
| Sondeo de salud por vídeo cada 60 s | gasta la única conexión del proveedor; el canary se la roba al player (`CANARY_STACK_FORENSICS_20261114.md:310`) |

## 9. Checklist antes de declarar un failover

```
[ ] ¿El disparador es 5xx / timeout / EOF, y no un 4xx?
[ ] ¿La fuente nueva entrega el MISMO perfil (codec, resolución, fps, HDR)?
[ ] ¿El cambio ocurre en frontera de manifiesto/sesión?
[ ] ¿Queda registrado el motivo con su código de upstream?
[ ] ¿Hay cooldown para la fuente caída y reset tras servicio sano?
[ ] ¿Hay anti ping-pong?
[ ] ¿El primary recuperado vuelve solo, y sin cortar una sesión sana?
[ ] ¿El 4xx sigue llegando al cliente con su código real?
[ ] ¿Se puede desactivar sin tocar la lista?
```

## 10. Riesgos y límites honestos

- **Sin tabla de fuentes no hay failover multiproveedor.** Hoy lo único real es retry + stale;
  llamar "failover" a eso es mentir el estado.
- **El auto-return puede ser peor que la estadía**: si el primario falla de forma intermitente,
  volver cada 60 s produce cortes repetidos. Por eso el anti ping-pong es obligatorio, no un
  adorno.
- **"Sin corte visible" no se puede prometer en HLS.** Se puede prometer que el canal vuelve;
  el salto de ventana lo decide el player.
- **La causa de un 4xx no se arregla con código**: es credencial, IP, UA o límite de cuenta.
  Esta skill sólo impide que se esconda.
- **El stale de 60 s puede servir un manifiesto con segmentos ya caducados.** Es mejor que un
  error y peor que una fuente sana; va marcado `stale=1` para que no se confunda con éxito.
- Excepción existente que **no** se toca aquí: `proxy_cache_use_stale` incluye `http_403` en
  la ruta CDN (`net-shield-autopista-sop.md:87`) porque un 403 ahí es **token caducado**, no
  bloqueo. Es una excepción acotada a manifiestos; no autoriza stale de segmentos ni failover
  por 403.
