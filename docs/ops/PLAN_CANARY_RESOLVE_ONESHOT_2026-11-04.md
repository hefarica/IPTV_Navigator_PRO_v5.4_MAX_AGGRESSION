# Plan de implementación — Canary-Resolve one-shot por zapping

**Estado:** PLAN. Nada desplegado.
**Norma que lo rige:** [Regla Canónica del Streaming en Tiempo Real](../policies/REGLA_CANONICA_STREAMING_TIEMPO_REAL.md)
**Principio rector:** el canary **prevalece**. Sin medición no hay declaración.

---

## La arquitectura correcta — EL DEVICE ORIGINA, EL CANARY CONSUME

**Corrección del operador (2026-11-04):**

> *«nada tiene que pedir al proveedor, eso lo hace a través del zapping el device y es consumido por el canary cuando este llega, pues siempre está esta información servida, por eso este despierta al llamado del zapping, ni antes ni cuando él quiera, solo al zapping»*

**El canary NO va al proveedor.** No descarga segmentos. No abre ffmpeg contra la fuente.
**No hay riesgo de que el CDN bloquee la IP del VPS por volumen de peticiones, porque el VPS no hace ninguna.**

### El mecanismo ya existe en el repositorio

```
device hace zapping
   │
   ├─ GET /lists/<lista>.m3u8?ape_wake=<dev>&ape_ch=<canal>   ← el device pide SU lista
   │     │
   │     └─ nginx log_by_lua: ape_wake_on_manifest.lua        (DESPUÉS de responder)
   │           → append a /dev/shm/ape_wake_queue
   │             formato: ts<TAB>dev<TAB>ch<TAB>list<TAB>cip
   │
   ├─ GET <canal>.m3u8  (al proveedor, DIRECTO desde el device)
   │     └─ nginx log_by_lua: qoe_server_side_observer.lua
   │           → ngx.shared.qoe_metrics:  VST_proxy, rebuffer_proxy, bitrate_proxy
   │
   └─ el canary DESPIERTA de esa cola y LEE lo que ya está servido
         → no pide nada al proveedor
         → no hay ventana de bloqueo
         → DESPIERTA AL ZAPPING: ni antes, ni cuando él quiera
```

| Fichero | Qué hace | Fase nginx |
|---|---|---|
| `ape_wake_on_manifest.lua` | encola la señal de zapping | `log_by_lua` (post-respuesta) |
| `qoe_server_side_observer.lua` | mide VST/rebuffer/bitrate de lo pedido | `log_by_lua` |
| `ape_device_state_writer.lua` | escribe el estado del device | `log_by_lua` |
| `bandwidth_reactor.lua` | reacciona al throughput medido | `log_by_lua` |

**Todos en `log_by_lua`: corren DESPUÉS de que la respuesta salió. Cero impacto en TTFB.**
Ninguno hace `ngx.exit`, ninguno bloquea, todos bajo `pcall`.

### Consecuencia sobre `ape-visual-emulate.sh`

**Ese script NO sirve para esta arquitectura.** Hace ffmpeg contra `CANARY_SOURCE_URL`, es decir,
**sí pide al proveedor**. Por eso mi Fase 1 anterior estaba mal: ponía al canary a descargar lo que
el VPS no debe descargar.

**El producto que el resolve consume no es un vídeo muestreado: es la observación del zapping real.**

Campos disponibles en `ngx.shared.qoe_metrics`, según el observer:

| Campo | Origen | Sirve para |
|---|---|---|
| `VST_proxy` | primer segmento − manifiesto | detectar arranque lento |
| `rebuffer_proxy` | gaps entre segmentos > 2× duración | detectar cortes reales |
| `bitrate_proxy` | body_bytes_sent / upstream_response_time | **derivar el perfil** |
| `error_rate` | 4xx/5xx sobre el total | detectar bloqueo del proveedor |

---

## El gate que no se salta

```
CADA FASE TIENE UN GATE.
NO SE PASA A LA FASE SIGUIENTE SI EL GATE NO DA PASS.
SI UN GATE FALLA, SE ARREGLA ESA FASE. NO SE SALTEA.
```

**Un gate es un comando con salida verificable.** No es «parece que funciona».

---

## Fase 0 · Inventario real (sólo lectura)

| Comprobación | Comando | Esperado |
|---|---|---|
| La cola de wake existe | `ls -la /dev/shm/ape_wake_queue` | existe o se crea al primer zapping |
| El wake está activo en nginx | `grep -r wake_on_manifest /etc/nginx/` | al menos 1 location |
| El observer está activo | `grep -r qoe_server_side_observer /etc/nginx/` | al menos 1 location |
| El shared dict existe | `grep -r qoe_metrics /etc/nginx/nginx.conf` | `lua_shared_dict qoe_metrics` |
| El flush worker corre | `grep -r qoe_flush_worker /etc/nginx/` | `init_worker_by_lua` |
| nginx responde | `nginx -t` | syntax is ok |

**GATE 0:** los seis pasan. Si el shared dict no está declarado, el observer **retorna silenciosamente**
(`if not dict then return end`) y no hay medición: nada más se intenta hasta declararlo.

**Rollback:** ninguno. Sólo lectura.

---

## Fase 1 · Verificar que el zapping real ya produce señal

**Objetivo:** confirmar que el device, al hacer zapping, deja rastro en la cola del VPS.

**No se arranca ningún canary. No se pide nada al proveedor.** Se comprueba que la señal llega.

```bash
# Reproducir UN canal en el device, o simular la petición que el device hace al VPS:
curl -s -o /dev/null "https://iptv-ape.duckdns.org/lists/<lista>.m3u8?ape_wake=dev_test&ape_ch=3"

# Ver la cola
tail -5 /dev/shm/ape_wake_queue
```

**GATE 1:** aparece una línea con formato `ts<TAB>dev<TAB>ch<TAB>list<TAB>cip` y el `dev` es el enviado.

**Esa línea ES el zapping.** El canary despierta de ella.

**Si `/dev/shm/ape_wake_queue` no existe:** el `log_by_lua` no está activo en ese location.
**No se continúa.**

**Rollback:** ninguno. Sólo lectura de `/dev/shm`.

---

## Fase 2 · Verificar que la observación tiene los campos que el resolve necesita

**Objetivo:** confirmar que `ngx.shared.qoe_metrics` contiene datos reales de lo que el device pidió.

```bash
# El observer escribe al shared dict; el flush worker publica cada 60 s.
curl -s https://iptv-ape.duckdns.org/prisma/api/qoe-flush.php 2>/dev/null | head -c 400
tail -50 /var/log/nginx/access.log | grep -E "m3u8|m4s|\.ts" | head -5
```

**Campos mínimos que el resolve necesita:**

| Campo | Fuente | Aceptable | Inaceptable |
|---|---|---|---|
| bitrate | `bitrate_proxy` | > 0 y estable | `0`, ausente |
| resolución | del manifiesto que el device pidió | `3840x2160` | `unknown` |
| fps | del manifiesto | > 0 | ausente |

**GATE 2:** los tres campos existen con valores reales de una sesión de zapping verificable.

**Si `bitrate_proxy` es 0 o no existe:** la observación no captura. Se corrige el `log_by_lua`
antes de escribir el consumidor. **No se adivina un bitrate.**

**Rollback:** ninguno. Sólo lectura.

---

## Fase 3 · El consumidor, probado contra el dato real

**Objetivo:** escribir el endpoint **sólo ahora**, y probarlo contra la observación de la Fase 2.

**Regla de esta fase:** el endpoint **primero lee un dato que ya existe**. No dispara nada.
Eso aísla el PHP de la captura: si falla, falla una sola pieza.

```php
// v1 del endpoint: SÓLO lee. No invoca nada.
$obs = leer_observacion($canal);          // de ngx.shared via qoe-flush.php o cache
if (!is_array($obs) || empty($obs['bitrate'])) {
    header('Location: ' . $u, true, 302);  // sin dato → fallback honesto
    exit;
}
// componer cartucho con $obs
```

**GATE 3:** con la observación de la Fase 2 disponible:

```
GET /prisma/api/canary-resolve.php?u=<url>&d=<device>
→ 200
→ #EXT-X-APE-CANARY-BITRATE:<mismo número que la observación>
→ #EXT-X-APE-CANARY-REAL-RES:<misma resolución que la observación>
```

**La prueba es la coincidencia.** Si el manifiesto dice un número distinto al observado, el consumidor inventa.

**GATE 3b:** sin dato disponible, el endpoint debe dar **302**, no 200.

**Rollback:** retirar el fichero del VPS (el step de limpieza del workflow ya lo hace).

---

## Fase 4 · Conectar el one-shot real por zapping

**Objetivo:** que el canary despierte **de la cola de zapping**, ni antes ni cuando quiera.

```php
// v2: si no hay observación fresca, se espera la señal del zapping
if (!observacion_fresca($canal)) {
    esperar_wake_queue($canal, 8);   // polling con deadline, NO descarga nada
}
```

**Lo que NO hace:** no descarga, no abre ffmpeg, no pide al proveedor.

**GATE 4:** reproducir el canal en el device y comprobar:

```
→ 200
→ el manifiesto lleva el bitrate que el device acaba de generar
→ el tiempo total es < 3 s (no hay captura que esperar)
```

**Si supera 3 s**, la espera está mal dimensionada. El dato ya existe cuando el device lo pidió:
la latencia debe ser de milisegundos, no de segundos.

**Rollback:** volver a la v1 (sólo lectura).

---

## Fase 5 · Integración con el cartucho completo

**Objetivo:** que el cartucho lleve **lo observado + todo el procesamiento del VPS**.

| # | Capa | Origen | Volumen | Estado |
|---|---|---|---|---|
| 1 | **Cartucho base** | `url2-cartridge.php` | 369 KB | ✅ 200 en producción |
| 2 | **Tags de paridad** | `APE_VPS_PARITY_TAGS` | 186 tags | ✅ desplegado |
| 3 | **Paquete de prioridades** | `APE_PRIORITY_PACKAGE` | 18 directivas | ✅ desplegado |
| 4 | **Perfil por device** | `url2-cartridge.php` dinámico | P0/P3/P5 | ✅ verificado |
| 5 | **CMAF enriquecido** | `#EXT-X-CMAF-*` | 24 directivas | 🟡 estático |
| 6 | **Observación del zapping** | `qoe_metrics` | 4 campos | ⏳ esta implementación |

### Orden de composición

```
1. plantilla por perfil        (url2-cartridge.php, P0-P5)
2. + tags de paridad           (186)
3. + paquete de prioridades    (18)
4. + overrides por device      (caché, perfil, codec)
5. + overrides por observación (CMAF chunk, HDR real, fallback real)   ← cuando hay dato
6. + idempotencia              (SEED = hash(u + device))
7. → manifiesto
```

**Cada capa es aditiva y verificable por separado.** Si la capa 5 no tiene observación, se omite y el
manifiesto lo declara con `#EXT-X-APE-CANARY-VERIFIED:NO`. **No se rellena con un valor inventado.**

### CMAF: qué puede enriquecerse y qué no

De las 24 directivas CMAF del cartucho, **3 pueden derivarse de la observación real**:

| Directiva | Hoy | Con observación |
|---|---|---|
| `#EXT-X-CMAF-CHUNK-DURATION` | valor fijo | `GOP / fps observado` |
| `#EXT-X-CMAF-HDR` | declarado | el `video_range` del manifiesto pedido |
| `#EXT-X-CMAF-CODEC-FALLBACK` | cadena fija | derivado del códec detectado |

**Las otras 21 no se tocan** porque no hay dato que las respalde. Derivarlas sería inventar.

### Por qué `manifest-4k.php` queda fuera

Sirve un master 4K desde el SSOT `/etc/ape-uhdx/ape_4k_manifest.json`, **no consume la observación**
y no tiene P0-P5. Mezclarlo crearía dos caminos declarando 4K con criterios distintos y sin regla
de cuál gana.

**GATE 5:** el manifiesto contiene las cuatro capas:

```
#EXT-X-APE-URL2-CARTRIDGE         (base)
#EXT-X-APE-CANARY-REAL-RES        (observación)
#EXT-X-APE-PROFILE                (device)
#EXT-X-APE-IDEMPOTENCIA:SEED      (reproducibilidad)
```

**Idempotencia:** mismo `(u, device)` → mismo `SEED`. Verificable pidiendo dos veces y comparando.

---

## Fase 6 · Despliegue y validación

**Sólo si las cinco fases anteriores dieron PASS.**

1. `php -l` en el CI (el gate ya existe en el workflow)
2. Deploy con `mode=apply` + `confirm="DESPLIEGO EL GENERADOR AL VPS"`
3. **Comparar sha local contra servido** — nunca el estado del run
4. Verificar los cuatro códigos:

```
200  con observación fresca
302  sin observación
429  tras 21 peticiones en 60 s
400  sin parámetro u
```

**GATE 6:** los cuatro códigos aparecen donde deben.

**Rollback:** `git revert` + deploy. El step de limpieza retira el fichero del VPS.

---

## Riesgos, corregidos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| ~~El canary satura el CDN del proveedor~~ | ~~Pérdida de servicio~~ | **ELIMINADO.** El canary no hace peticiones al proveedor |
| La cola `/dev/shm` se llena | `io.open` falla | `ape_wake_on_manifest.lua` ya corre bajo `pcall` y sólo loguea WARN |
| El shared dict no está declarado | El observer retorna en silencio | GATE 0 lo detecta antes de seguir |
| `bitrate_proxy` no refleja la calidad real | Perfil mal asignado | Derivar de `body_bytes/upstream_time` es una estimación, no una medición del códec |
| nginx reinicia y pierde `/dev/shm` | Se pierde la cola | Es una cola de señales, no de datos: se regenera con el siguiente zapping |

---

## Lo que este plan NO hace

- **No descarga nada del proveedor.** Ni el canary, ni el VPS.
- **No usa `ape-visual-emulate.sh`**, que sí hace ffmpeg contra la fuente.
- **No toca `iptables`, no instala `fail2ban`, no usa secretos por defecto.**
- **No sirve `206`** sobre el manifiesto: es imposible y el plan no promete imposibles.
- **No despliega nada hoy.**

---

## Orden de ejecución, en una línea

```
0 inventario → 1 zapping produce señal → 2 observación tiene datos → 3 consumidor LEE → 4 despierta del zapping → 5 integra → 6 despliega
```

**Cada flecha es un gate. Ninguna se salta.**
