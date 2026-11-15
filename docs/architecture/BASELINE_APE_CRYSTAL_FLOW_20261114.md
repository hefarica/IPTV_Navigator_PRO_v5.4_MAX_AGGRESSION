# APE CRYSTAL FLOW — Baseline congelado (2026-11-14)

> **Qué es este documento.** El nivel medido del flujo en el momento en que el
> operador pidió *«hardening para que no tenga regresiones al nivel que ya se
> encuentra»*. **Cada fila tiene su comando de repro.** Si un cambio futuro baja
> cualquiera de estos números, es una regresión, aunque compile.

---

## Los dos gates que vigilan este baseline

| Gate | Qué protege | Tiempo |
|---|---|---|
| `tools/quality/gate_no_focus_steal.sh` | **ARA no roba el foco.** Falló 3 veces el 2026-11-14 | milisegundos (estático) |
| `tools/quality/gate_ape_crystal_flow.sh` | **El flujo sirve.** HTTP real contra el VPS | ~5 s |

**Ambos devuelven `exit 0` hoy.** Cualquiera que devuelva `1` bloquea.

```bash
bash tools/quality/gate_no_focus_steal.sh          # PASS 6/6
bash tools/quality/gate_ape_crystal_flow.sh        # PASS 6/6
```

---

## Estación 1 · GENERADOR — sin cambios en esta sesión

**Lo que no debe romperse:** la lista sale con `catchup="flussonic"`,
`#EXT-X-VERSION:9`, `#EXT-X-APE-CHANNELS:21224`.

`gate_ape_crystal_flow.sh` lo verifica leyendo la cabecera por `Range`.

---

## Estación 2 · CABLEADO — el VPS envuelve

| Métrica | Valor congelado | Cómo se comprueba |
|---|---|---|
| Lista cableada | **HTTP 200/206**, `#EXT-X-APE-CHANNELS:21224` | `curl -r 0-4194303` |
| Canales | **21.224** | `grep -c '^#EXTINF'` |
| Con `/pulse/` | **21.224** (100 %) | `grep -c '/pulse/'` |
| Tamaño | **1.298.222.092 B** | `stat -c%s` |
| Manifest `/pulse/` p50 | **704 ms** (caché: **1 ms**) | `rt=` de `playlist_access.log` |

**Regresión si:** el `#EXTINF` cae por debajo de 20.000, o `/pulse/` deja de
estar en el 100 % de los canales, o el manifest pasa de 2 s sostenidos.

---

## Estación 3 · AGENTE — la APK

| Métrica | Valor congelado | Cómo se comprueba |
|---|---|---|
| Salto al menú de ARA | **0 llamadas reales a `startActivity`** en `AgentService`, `CaptureWatchdogService` y `BootReceiver` | `gate_no_focus_steal.sh` |
| Badge | `BadgeOverlay` con `WindowManager.addView` + `TYPE_APPLICATION_OVERLAY` | idem |
| Foco con OTT reproduciendo | `studio.scillarium.ottnavigator/.PlayerActivity` | `dumpsys activity activities \| grep mFocusedApp` |
| `UpscaleBadgeActivity` en la pila | **0** | `grep -c UpscaleBadgeActivity` |
| Audio sostenido | **≥ 60 s sin pausarse** | `dumpsys audio \| grep -c state:started` |
| Settings aplicados | **12** | logcat `ApeSettingsApplier` |
| Rechazos de log por pasada | **1** (solo `display_size_forced`) | `grep -c 'RECHAZADO global/display_size_forced'` |

**Regresión si:** aparece cualquier `startActivity` real en esos tres ficheros,
o el foco deja de quedarse en OTT, o los rechazos vuelven a 42.

---

## Estación 4 · SHIM — el proxy loopback

| Métrica | Valor congelado | Cómo se comprueba |
|---|---|---|
| Arranque | **automático con ARA** | `dumpsys activity services \| grep ProxyService` |
| Puerto publicado | `port.txt` con un número | `cat .../port.txt` |
| `/health` | `{"ok":true,"proxy_up":true}` | `nc 127.0.0.1 <port>` |
| Catálogo por `/source.m3u8` | **600.000 B en 1 s** | `nc` + `head -c` |

**Regresión si:** `/source.m3u8` vuelve a dar **0 bytes** (el síntoma del
`contentLength() = -1`), o el shim deja de arrancar solo.

---

## Estación 5 · MEDICIÓN — el VPS

| Métrica | Valor congelado | Cómo se comprueba |
|---|---|---|
| Canales que sirven | **89 de 100** → 200 | censo con UA de player |
| Segundo 4K | **21.343.452 B** · `0x47` | `xxd -l 4` |
| Canary | **302** (NUNCA 404 ni 500) | `gate_ape_crystal_flow.sh` |
| Vigilante de módulos | **6/6 verde**, `verdict OK` | `/var/lib/ape/module-watchdog.json` |
| Disco | **< 90 %** | `df -h /` |
| `ape-last-channel.php` | `{"ok":true,"name":"…","resolution":"3840x2160"}` | curl |

**Regresión si:** el canary vuelve a 404/500, el vigilante baja de 6/6, o el
disco pasa del 90 %.

---

## Las tres causas del «me lleva al ARA», y su commit

| # | Causa | Commit | Gate que la vigila |
|---|---|---|---|
| 1 | `startActivity(UpscaleBadgeActivity)` desde el ticker | **v668** (BadgeOverlay) | `gate_no_focus_steal.sh` [1][4][5] |
| 2 | `CaptureWatchdogService.onForeground` → `startActivity` cada 30 s | **`86a5bde4`** | `gate_no_focus_steal.sh` [2] |
| 3 | `BootReceiver` → `ScreenCaptureActivity` al encender | **`73cc966c`** | `gate_no_focus_steal.sh` [3] |

**El informe del badge dejó escrito:** *«si una versión futura vuelve a llamar
`startActivity(UpscaleBadgeActivity)` desde el ticker, el salto vuelve»*.
**Ese riesgo ya no es una advertencia: es un build rojo.**

---

## Cómo se mide cada cosa (comandos, no prosa)

```bash
# Gate estático (milisegundos)
bash tools/quality/gate_no_focus_steal.sh

# Gate del flujo (HTTP real)
bash tools/quality/gate_ape_crystal_flow.sh --json

# Foco y overlay en el device
adb -s 192.168.1.3:5555 shell dumpsys activity activities | grep mFocusedApp
adb -s 192.168.1.3:5555 shell "dumpsys window windows | grep -c UpscaleBadge"

# Zapeo (tiempos reales)
ssh root@178.156.147.234 "grep 'GET /pulse/' /var/log/nginx/playlist_access.log | tail -200 | sed -E 's/.* rt=([0-9.]+).*/\1/' | sort -n | awk '{a[NR]=\$1} END{print a[NR], a[int(NR/2)+1]}'"

# Canales que sirven (muestra)
bash tools/quality/gate_ape_crystal_flow.sh --json   # el check pulse-canal
```

---

## Lo que este baseline NO cubre (honesto)

| No cubierto | Por qué |
|---|---|
| **El 4K en el televisor** | necesita ~18 Mbps sostenidos; el WiFi medido no los da. **No es regresión del flujo.** |
| **La resolución de ENTRADA del badge** | `N/D` hasta que el endpoint la mida con `ffprobe` (implementado, pendiente de verificar en device) |
| **La 4ª vía del salto a ARA** | t69 abierta: no existe `startActivity(MainActivity)`; hay que cazar el `intent` |
| **VPP / AI-PQ** | los 4 levers devuelven `null`: **no existen en este firmware** |
| **Alta de la lista en OTT** | manual por diseño de OTT; no automatizable sin root |

**Un baseline sin esta sección sería una mentira.** Lo que no está medido no
está protegido, y se dice.

---

# AMPLIACIÓN 2026-11-15 — los 14 hechos medidos

> Esta ampliación **no borra nada** de lo anterior. Lo anterior queda como la foto
> del 2026-11-14; esto es la foto del 2026-11-15, con los valores que cambiaron
> escritos como **ANTES → DESPUÉS** para que una regresión se vea de un vistazo.

## Cómo leer las marcas de esta ampliación

| Marca | Significado |
|---|---|
| **[VERIFICADO AQUÍ]** | lo he ejecutado y pego la salida. Es reproducible ahora |
| **[DECLARADO POR EL CAPITÁN]** | no lo he podido ejecutar yo (ssh al VPS bloqueado por política a mitad de sesión — ver §Nota de método). Se cita con su comando de repro, **sin afirmar que lo medí** |

Los comandos de repro se escriben **tal cual se lanzan**, no parafraseados.

---

## Hecho 1 · La 4ª vía del salto a ARA — CERRADA

**No era un `startActivity`.** Era el `<intent-filter>` de `ReaExternalPlayerActivity`
(`BROWSABLE` + `scheme https` + `mimeType x-mpegURL`): el sistema registraba ARA como
**manejador preferido** para los enlaces `https://…m3u8`.

| | ANTES (2026-11-14) | DESPUÉS (2026-11-15) |
|---|---|---|
| Un `VIEW https://…m3u8` lo abría | **ARA** (`Preferred Activities User 0`) | **BrowserStub** |
| `intent-filter` BROWSABLE | presente | **eliminado** |
| Gate que lo vigila | no existía | `gate_no_focus_steal.sh` checks **[7]** `manifest-sin-BROWSABLE` y **[8]** `manifest-sin-scheme-http` |

```bash
bash tools/quality/gate_no_focus_steal.sh        # VERDICT=PASS pass=8 fail=0  [VERIFICADO AQUÍ]
adb -s 192.168.1.3:5555 shell dumpsys package com.ape.crystalagent | grep -A3 'Preferred Activities'
adb -s 192.168.1.3:5555 shell "am start -a android.intent.action.VIEW -d 'https://iptv-ape.duckdns.org/lists/x.m3u8'"
```

> **Nota:** el registro «Preferred Activities» sigue guardado en el sistema, pero es **inerte**
> una vez retirado el filtro. No confundir «sigue apareciendo en dumpsys» con «sigue secuestrando».

---

## Hecho 2 · El badge ya muestra la ENTRADA — verificado en device

| | ANTES | DESPUÉS |
|---|---|---|
| Resolución de entrada en el badge | `N/D` (el baseline anterior la listaba como **no cubierta**) | **`entrada=3840x2160`** |
| Coste de resolverla | **3.077 ms** (midiendo con `ffprobe` en cada zapeo) | **23 ms** con `cache_hit:true` |

Log medido en device:

```text
badge de upscaling sobre OTT canal=|UK| TNT SPORTS ULTIMATE 4K entrada=3840x2160 (overlay sin Activity)
```

La entrada se mide **en el VPS** con `ffprobe` sobre un segmento real, y devuelve
`{"resolution":"3840x2160","codec":"hevc","profile":"Main 10","fps":"50/1"}`.

```bash
adb -s 192.168.1.3:5555 logcat -d | grep 'badge de upscaling'
curl -s 'https://iptv-ape.duckdns.org/prisma/api/ape-last.php'      # el JSON con resolution/codec/profile/fps
```

**[DECLARADO POR EL CAPITÁN]** — el log y el JSON son suyos; desde aquí no tengo device.

---

## Hecho 3 · El badge solo sale con OTT real — el falso positivo está cerrado

`isMusicActive()` es **global**: se activa con cualquier audio, no solo con el OTT.

| Escenario | ANTES | DESPUÉS |
|---|---|---|
| Foco en `youtube.tv`, audio activo | `audio=1 · badge=3` **(mal)** | `audio=1 · badge=0` |
| Motivo registrado | — | `audio activo pero OTT no reciente (age_s=1193) -> sin badge` |

El endpoint devuelve **`age_s`** (segundos desde el último `/pulse/` **externo**) y la app
exige **0..120**.

> **`age_s` solo cuenta peticiones EXTERNAS** (descarta loopback, la IP del VPS y RFC1918).
> Si contara todas, el propio vigilante —que pide `/pulse/` cada 60 s— habría mantenido el
> badge encendido para siempre. Ese matiz es la diferencia entre un arreglo y un arreglo aparente.

```bash
adb -s 192.168.1.3:5555 logcat -d | grep -E 'OTT no reciente|badge de upscaling'
curl -s 'https://iptv-ape.duckdns.org/prisma/api/ape-last.php' | grep -o 'age_s[^,]*'
```

**[DECLARADO POR EL CAPITÁN]**

---

## Hecho 4 · El shim ya no se relanza en bucle

| | ANTES | DESPUÉS |
|---|---|---|
| Relanzos del shim con el shim **sano** | **6**, uno cada 5 s | **0** |
| Síntoma | `OTT reproduciendo y shim caido -> relanzo` con `/health = {"ok":true,"proxy_up":true,"uptime_ms":832469}` | — |

**Causa raíz:** `ShimBridge.running` solo se refrescaba desde `MainActivity`, así que el
ticker lo veía `false` para siempre. **Arreglo:** el ticker llama `ShimBridge.refresh()`.

```bash
adb -s 192.168.1.3:5555 logcat -d | grep -c 'shim caido -> relanzo'      # esperado: 0
adb -s 192.168.1.3:5555 shell dumpsys activity services | grep ProxyService
```

**[DECLARADO POR EL CAPITÁN]**

---

## Hecho 5 · La lista tiene una PROYECCIÓN LIGERA para OTT (el hallazgo más grande)

| Métrica | Valor |
|---|---|
| Lista cableada completa | **1.298.222.092 B** · `.gz` **352.804.883 B** (353 MB) |
| Proyección ligera `…_CABLEADA_LIGHT.m3u8` | **171.893.544 B** · `.gz` **3.480.451 B** |
| `#EXT-X-APE-` en la LIGHT | **0** líneas |
| Canales / URLs de la LIGHT | **21.224 / 21.224**, URLs **verbatim** |

**Desglose por familia en la lista completa:** `#EXT-X-APE-` **14.316.139** líneas /
**734.550.274 B** (56,6 %) · `#EXTVLCOPT` **2.907.692** / **111.071.055 B** (8,6 %) ·
`#EXTINF` **21.224** / **10.157.879 B** (0,8 %) · URLs **21.224** / **4.392.831 B** (0,3 %).

| | ANTES | DESPUÉS |
|---|---|---|
| Carga del catálogo a 20 Mbps | **~141 s** | **~1,3 s** |

```bash
ls -l /var/www/lists/APE_LISTA_1794100720046_CABLEADA.m3u8 /var/www/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8
grep -c '^#EXT-X-APE-' /var/www/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8   # esperado: 0
grep -c '^#EXTINF'     /var/www/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8   # esperado: 21224
```

**[DECLARADO POR EL CAPITÁN]** — el ssh al VPS quedó bloqueado antes de poder re-medirlo.

---

## Hecho 6 · El mecanismo que SECUESTRABA la proyección (documentarlo o se repite)

`/etc/nginx/snippets/url2-cartridge.conf` sirve **`/lists/pulse/X` antes que `/lists/X`**:

```nginx
location ~ ^/lists/(?<ape_list>[A-Za-z0-9._-]+)\.m3u8$ {
    root /var/www;
    try_files /lists/pulse/$ape_list.m3u8 /lists/$ape_list.m3u8 =404;
    add_header X-APE-List-Source "pulse-wrapped-if-present";
}
```

Y `ape-pulse-sync.sh` copia `$LISTS/*.m3u8` a `$LISTS/pulse/` **añadiendo** las `#EXT-X-APE-`.
Resultado: la proyección ligera se servía **con las APE inyectadas**.

| | ANTES | DESPUÉS |
|---|---|---|
| Servido por HTTP | **181.614.136 B con 169.792 líneas `#EXT-X-APE-`** | la LIGHT, **0** líneas `#EXT-X-APE-` |
| Cómo se delató | comparar **sha256 en disco vs descarga** | — |
| Arreglo | — | se añadió **`*_LIGHT*`** a la lista de exclusión del sync |

`/var/www/html/lists` es un **SYMLINK** a `/var/www/lists` — razón por la que comparar rutas
literales engaña.

```bash
grep -nE 'location|try_files|X-APE-List-Source' /etc/nginx/snippets/url2-cartridge.conf
grep -n 'LIGHT' /opt/ape-pulse/ape-pulse-sync.sh
sha256sum /var/www/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8
curl -s https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8 | sha256sum
ls -ld /var/www/html/lists
```

**[DECLARADO POR EL CAPITÁN]** — el comando que lo delata (sha256 disco vs descarga) está arriba
y es el que hay que ejecutar en cualquier revisión futura.

---

## Hecho 7 · El vigilante tenía DOS falsos positivos

| # | ANTES | DESPUÉS |
|---|---|---|
| 1 | Marcaba **DEGRADADO** con `nginx` y `php-fpm` **active**, porque el canal de prueba devolvía **407** (bloqueo del proveedor) | **403/407/404/429/451 → `sin-muestra`** |
| 2 | El módulo `zapping` leía `/var/log/nginx/access.log` (**3** peticiones) | lee `playlist_access.log` (**2.929**) → ahora informa **67** peticiones |

**Por qué importa el primero:** un 407 del proveedor no dice nada del flujo. Contarlo como
degradación hace que el vigilante grite cuando el sistema está sano — y un vigilante que grita
siempre se ignora, que es peor que no tenerlo.

```bash
curl -s https://iptv-ape.duckdns.org/prisma/api/prisma-service-status.php     # o el endpoint del vigilante
grep -n 'sin-muestra' /opt/ape-pulse/*.sh
wc -l /var/log/nginx/access.log /var/log/nginx/playlist_access.log
```

**[DECLARADO POR EL CAPITÁN]**

---

## Hecho 8 · Los TRES gates (el hardening)

| Gate | Tipo | Checks | Resultado |
|---|---|---|---|
| `tools/quality/gate_no_focus_steal.sh` | estático | **8** | **PASS 8 / 0** |
| `tools/quality/gate_ape_crystal_flow.sh` | HTTP real | **10** | **PASS 8 / 0** *(en el VPS)* |
| `tools/ops/ape-device-health.sh` | device por `adb` | **8** | **PASS 7 / 0 + 1 SKIP** |

**[VERIFICADO AQUÍ] el primero, y el segundo parcialmente:**

```text
$ bash tools/quality/gate_no_focus_steal.sh
[focus-gate] VERDICT=PASS pass=8 fail=0
exit 0

$ bash tools/quality/gate_ape_crystal_flow.sh
[gate] APE CRYSTAL FLOW — https://iptv-ape.duckdns.org
[gate] VERDICT=PASS pass=5 fail=0
exit 0
```

**Por qué 5 y no 8 en el segundo, sin que sea una regresión:** el gate define **10** checks y
marca **SKIP** los que exigen estar *en* el VPS, con el motivo escrito en el propio código:

```text
L139:  skip "disco"              "sin /var/www/html (no es el VPS)"
L154:  skip "cache-resolucion"   "aun no existe (se crea al primer zapeo con ffprobe)"
L168:  skip "vigilante-fresco"   "sin $WD"
L117:  skip "pulse-canal"        "(canal bloqueado por el proveedor, no por el flujo)"
L126:  skip "vigilante"          "sin endpoint publico ($c)"
```

Ejecutado desde este host (Windows) no hay `/var/www/html`, así que esos checks se saltan **con
su razón** en vez de mentir con un FAIL. **El número honesto es: 5 PASS + 5 SKIP aquí; 8 PASS + 2 SKIP
en el VPS.** No son dos cifras contradictorias: son dos entornos.

El gate de flujo incluye, cuando corre en el VPS: **disco < 90 %**, **caché de resolución válida**
y **frescura del vigilante < 180 s**.

**[DECLARADO POR EL CAPITÁN]** para el device-health (7/0 + 1 SKIP): necesita `adb` al ONN.

---

## Hecho 9 · El VPP no existe en este SoC — concluyente

| | Resultado |
|---|---|
| Settings **aplicados** | **12** (`hdr_conversion_mode=1`, `match_content_frame_rate=2`, `minimal_post_processing_allowed=0`, `user_preferred_resolution 3840x2160`, …) |
| Settings **rechazados** (devuelven `null`) | **12**: `pq_ai_sr_enable`, `ai_sr_level`, `pq_sharpness_enable`, `pq_hdr_mode`, `ai_pq_mode`, `pq_dnr_enable` + **7 `com.amazon.tv.*`** |

Los `com.amazon.tv.*` son de **Fire TV**; este equipo es **ONN**. Buscarlos aquí es buscar una
API que no está.

> **Esto cambia el baseline anterior:** «VPP / AI-PQ» figuraba en *no cubierto* como «los 4 levers
> devuelven `null`». Ya no es una incógnita: es un **hecho concluyente** — no existe en este firmware.

```bash
adb -s 192.168.1.3:5555 shell settings list global | grep -E 'pq_ai_sr|ai_sr_level|pq_sharpness|pq_hdr|ai_pq|pq_dnr'
adb -s 192.168.1.3:5555 logcat -d | grep -c 'ApeSettingsApplier'      # aplicados vs rechazados
```

**[DECLARADO POR EL CAPITÁN]**

---

## Hecho 10 · El URL2 no llega a OTT

**2.907.692 líneas `#EXTVLCOPT`** con filtros ffmpeg (`nlmeans`, `unsharp`, `gradfun`, `zscale`)
son **opciones de VLC**. OTT Navigator no las lee. Los **14,3 M** de `#EXT-X-APE-` tampoco:
**RFC 8216 manda ignorar las etiquetas desconocidas**.

Consecuencia práctica: el recetario de imagen de la lista **no actúa en OTT**. Lo que se ve en
OTT es el stream tal cual; el "realce" sólo existe en la ruta VLC.

```bash
grep -c '^#EXTVLCOPT' /var/www/lists/APE_LISTA_1794100720046_CABLEADA.m3u8   # 2907692
grep -c '^#EXT-X-APE-' /var/www/lists/APE_LISTA_1794100720046_CABLEADA.m3u8  # 14316139
```

**[DECLARADO POR EL CAPITÁN]**

---

## Hecho 11 · Desajuste de cadencia — ABIERTO y medido

| | Valor |
|---|---|
| El canal 4K sirve | **50 fps** (`ffprobe` → `50/1`) |
| El panel está en | **3840x2160 @ 59,94 Hz** (`mDefaultModeId=229`, `renderFrameRate 59.94006`) |
| Relación | **1,199 refrescos por fotograma** → judder |
| `match_content_frame_rate=2` | **no lo corrige** |
| Existe modo 3840x2160@**50 Hz** en el panel | sí |

**NO verificado en reproducción real.** Es el último número pendiente de este baseline: se sabe
que el desajuste existe y se sabe cuál es el modo correcto, pero **no está medido el efecto en
pantalla**. No se declara arreglado.

```bash
adb -s 192.168.1.3:5555 shell dumpsys display | grep -E 'mDefaultModeId|renderFrameRate'
adb -s 192.168.1.3:5555 shell dumpsys display | grep -E '3840x2160.*50'
ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 <segmento>
```

**[DECLARADO POR EL CAPITÁN]** y **sigue abierto**.

---

## Hecho 12 · El medidor de zapeo

`tools/ops/ape-zapping-meter.sh` lee `playlist_access.log` (`rt=` / `urt=`).

| Métrica (ventana de **60 min** con tráfico real) | Valor |
|---|---|
| Zapeos | **106** |
| Segmentos | **46** |
| Arranque de red **p50** | **3.000 ms** |
| Servicio de segmento **p50** | **3.520 ms** |
| Gap **p50** | **4.000 ms** |
| Canales | 1312008, 622683-622685 |

> **AVISO que hay que repetir cada vez:** el log tiene granularidad de **SEGUNDOS**, no de ms.
> Un p50 de «3.000 ms» significa «3 s» redondeado por el propio log: no se puede refinar más
> desde ahí. Cualquier cifra con decimales sacada de este log es inventada.

```bash
bash tools/ops/ape-zapping-meter.sh            # o el comando de la sección «Cómo se mide cada cosa»
```

**[DECLARADO POR EL CAPITÁN]** — no lo he re-ejecutado (necesita leer el log del VPS por ssh).

---

## Hecho 13 · El disco

| | ANTES | DESPUÉS |
|---|---|---|
| Uso del disco | **91 %** — y el vigilante decía **OK** | **79 %** (**7,8 GB** libres) |
| Protección | ninguna | el gate del flujo **falla si pasa del 90 %** |

**El dato incómodo:** estuvo al 91 % mientras el vigilante decía OK. Un vigilante que no mira el
disco no es un vigilante. Ahora el disco es un **check con umbral**, no un adorno.

```bash
df -h /
bash tools/quality/gate_ape_crystal_flow.sh | grep -i disco
```

**[DECLARADO POR EL CAPITÁN]**

---

## Hecho 14 · Nuevas reglas y contratos

| Artefacto | Bytes | Qué fija |
|---|---|---|
| `contracts/ape_crystal_flow_operativa.json` | **11.195** | Contrato de operativa por estación, con **`LEY_1_SEGUNDO_PLANO`** (texto literal del operador) |
| `docs/architecture/INSTRUMENTACION_APE_CRYSTAL_FLOW.md` | **9.820** | Qué mide cada módulo |
| `docs/architecture/APE_CRYSTAL_FLOW.md` | **6.389** | El nombre propuesto del sistema |

**[VERIFICADO AQUÍ]** los tres existen con esos bytes (más los gates: `gate_no_focus_steal.sh`
**8.121 B**, `gate_ape_crystal_flow.sh` **10.629 B**, `ape-device-health.sh` **9.526 B**,
`ape-zapping-meter.sh` **6.571 B**).

```bash
ls -l contracts/ape_crystal_flow_operativa.json docs/architecture/INSTRUMENTACION_APE_CRYSTAL_FLOW.md docs/architecture/APE_CRYSTAL_FLOW.md
grep -o 'LEY_1_SEGUNDO_PLANO' contracts/ape_crystal_flow_operativa.json | head -1
```

---

## Actualización de «Lo que este baseline NO cubre»

La tabla original de arriba **se conserva tal cual** (es la foto del 14). Tres filas han cambiado
de estado; no se borran, se anotan aquí:

| Fila original | Estado a 2026-11-15 |
|---|---|
| **La resolución de ENTRADA del badge** — «`N/D` hasta que el endpoint la mida con `ffprobe`» | **CUBIERTA** → Hecho 2: `entrada=3840x2160`, caché 23 ms |
| **La 4ª vía del salto a ARA** — «t69 abierta: hay que cazar el `intent`» | **CERRADA** → Hecho 1: era el `intent-filter` BROWSABLE; retirado, gate [7][8] lo vigila |
| **VPP / AI-PQ** — «los 4 levers devuelven `null`: no existen en este firmware» | **CONCLUYENTE** → Hecho 9: 12 aplicados / 12 rechazados; los `com.amazon.tv.*` son de Fire TV |

**Lo que SIGUE sin medir (actualizado):**

| No cubierto | Por qué sigue abierto |
|---|---|
| **El efecto del desajuste de cadencia en pantalla** | Hecho 11: se sabe que hay 1,199 refrescos/fotograma y que existe el modo 50 Hz, pero **no se ha verificado en reproducción real** |
| **El 4K real en el televisor** | sigue necesitando ~18 Mbps sostenidos; el WiFi medido no los da. **No es regresión del flujo** |
| **Alta de la lista en OTT** | manual por diseño de OTT; no automatizable sin root |
| **La proyección LIGHT servida por HTTP con su sha256** | Hecho 6: el comando está escrito, pero **en esta sesión no se pudo ejecutar** (ssh bloqueado) — hay que correrlo en la próxima revisión |

---

## Nota de método (por qué hay filas «declaradas» y no «medidas»)

Durante esta actualización **el acceso ssh al VPS quedó bloqueado por política** a mitad de sesión
(`Auto review rejected tool "pwsh"; its body was not executed` — el comando **no llegó a correr**,
no fue red ni timeout). Por eso:

- Lo que se pudo ejecutar **sin ssh** (gates locales y HTTP público, existencia y bytes de los
  artefactos) va marcado **[VERIFICADO AQUÍ]** con su salida pegada.
- Lo que exige leer el VPS o el device va marcado **[DECLARADO POR EL CAPITÁN]** con su comando.

**Un valor declarado no es un valor medido**, y este documento no los mezcla. Cuando se recupere el
acceso, la primera tarea es convertir las filas declaradas en medidas: los comandos ya están escritos
al lado de cada una, que es precisamente para lo que sirven.

---

## HISTORIAL DE REVISIONES

| Fecha | Cambio | Motivo |
|---|---|---|
| **2026-11-14** | **Baseline inicial** | Congelar el nivel medido cuando el operador pidió *«hardening para que no tenga regresiones»*. Commits `2784595c`, `cf1ca27f`. Dos gates, 6/6 cada uno |
| **2026-11-15** | **Ampliación con los 14 hechos** (este commit) | Cerrar la 4ª vía del salto a ARA (H1), medir la entrada del badge (H2), cerrar el falso positivo del badge (H3) y del shim (H4), documentar la **proyección ligera** y el **mecanismo que la secuestraba** (H5, H6), los dos falsos positivos del vigilante (H7), los **tres** gates (H8), el VPP concluyente (H9), el URL2 que no llega a OTT (H10), el desajuste de cadencia abierto (H11), el medidor de zapeo (H12), el disco 91→79 % (H13) y los contratos nuevos (H14). **Ningún valor anterior se ha borrado** |

### Qué cambió en los números (ANTES → DESPUÉS)

| Métrica | 2026-11-14 | 2026-11-15 |
|---|---|---|
| Gates que vigilan | 2 (`no_focus_steal` 6/6, `ape_crystal_flow` 6/6) | **3** (`no_focus_steal` **8**/0, `ape_crystal_flow` **8**/0 en VPS, `ape-device-health` 7/0 + 1 SKIP) |
| Enlace `https://…m3u8` lo abre | ARA (preferido) | **BrowserStub** |
| Resolución de entrada del badge | `N/D` | **3840x2160** |
| Coste de resolverla | 3.077 ms | **23 ms** |
| Badge con audio ajeno | `badge=3` (falso positivo) | **`badge=0`** con `age_s=1193` |
| Relanzos del shim | 6 | **0** |
| Carga del catálogo (20 Mbps) | ~141 s | **~1,3 s** |
| Disco | **91 %** con vigilante OK | **79 %** y el gate falla > 90 % |
| VPP / AI-PQ | «4 levers null», incógnita | **12 aplicados / 12 rechazados — concluyente: no existe** |

### Regla para la próxima revisión

**Antes de dar por buena una mejora, correr el comando que está al lado del número.** Si el número
baja, es regresión aunque compile, aunque el gate pase y aunque el informe diga que está arreglado.


---

## Hecho 15 · El generador es LOCAL, no del VPS — y el manifest tenia 4 huecos

El operador lo corrigio: *«EL GENERADOR ESTA EN LOCAL LA APP IPTV NAVIGATOR»*. Tenia
razon y esto lo deja escrito para que no se repita.

**Donde vive el generador de verdad**
```
repo (app local) : IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
                   949.737 B · EXTSHIMOTT=11 · ejecuta el tag de verdad
VPS (servido)    : /var/www/html/js/ape-v9/m3u8-typed-arrays-ultimate.js
                   ahora 949.737 B · EXTSHIMOTT=7
```
El operador abre `frontend/index-v4.html` (296.806 B) y genera desde ahi. El VPS solo
lo sirve si se abre la app por URL.

**LOS CUATRO HUECOS DEL MANIFEST** (`_vps_stage/deploy/manifest.tsv`), todos medidos
y cerrados en esta sesion:
| # | Fichero | Sintoma medido antes |
|---|---|---|
| 1 | `ape-pulse-sync.sh` | mi exclusion `*_LIGHT*` nunca llego al VPS; la lista se seguia secuestrando |
| 2 | `ape-pulse-wrap.js` | VPS 14.040 B (13-nov) vs repo 23.407 B: el tag no se emitia en ninguna lista |
| 3 | `ape-shimott-emit.php` | `php -l` post-deploy decia "NO EXISTE" |
| 4 | `m3u8-typed-arrays-ultimate.js` + `index-v4.html` | el generador con el tag no llegaba y el cache-buster no cambiaba |
Repro de cualquiera: `grep <fichero> _vps_stage/deploy/manifest.tsv` (vacio = no se
despliega) y luego `stat -c%s` en el VPS contra el tamano del repo.

**EL CACHE-BUSTER ERA UN SEGUNDO MURO**
```
antes : <script src="js/ape-v9/m3u8-typed-arrays-ultimate.js?v=20261107-rea">
ahora : <script src="js/ape-v9/m3u8-typed-arrays-ultimate.js?v=20261115-extshimott">
```
Sin subir el `?v=`, el fichero servido puede tener el tag y el navegador seguir
ejecutando el viejo. **Desplegar no es servir; servir no es ejecutar.**

**PRUEBA DE QUE EL GENERADOR EMITE (no solo comenta)**
Se extrajeron las 11 funciones (`_apeAppendExtshimottTag` + 10 auxiliares) y se
ejecutaron con Node. Salida real:
```
#EXTINF:-1 tvg-id="test.4k" group-title="Deportes",TEST 4K
#EXTHTTP:{"User-Agent":"VLC/3.0","Referer":"http://ref.example/"}
#EXTSHIMOTT:{"ver":1,"id":"ch_1","v":{"c":"hevc","w":3840,"h":2160,"f":50},"a":{"c":"ec-3","ch":6,"l":"es"},"hdr":{"ua":"VLC/3.0","rf":"http://ref.example/"},"dev":{"hdr_c":1,"mcr":2,"mmp":0,"res_w":3840,"res_h":2160},"tgt":"ott|vlc|kod"}
http://proveedor/canal.m3u8
```
238 chars · JSON parsea · EXTINF/EXTHTTP/URL intactos · tag justo antes de la URL ·
idempotente · sin EXTINF no emite.

**LECCION DE METODO (me equivoque en mi propia prueba)**
La primera extraccion tomo SOLO `_apeAppendExtshimottTag`, sin sus auxiliares. El
`catch (_eShim)` atrapo el `ReferenceError` y devolvio el texto original: el test dijo
`tag presente: false` y el codigo estaba bien. **Un catch que protege la generacion
tambien protege al test de fallar: hay que probar con las dependencias completas o el
verde es falso.**

**`ape-deploy-frontend.yml` NO ARRANCA**
```
43670875744 · failure 03:07
43670881892 · failure 03:07  ("workflow file issue", 0 jobs)
43672046248 · cancelled 03:22 (28 min en pending)
43674131702 · pending 03:50
43674613977 · pending 03:57
```
Se corrigio un YAML invalido que YO habia dejado (un `with:` huerfano del
`actions/checkout` pegado a un step con solo `run:`; el dispatch daba HTTP 422
`Unexpected value 'with'` en L72 y L764). **Tras el arreglo el dispatch se acepta pero
los runs se quedan en `pending` sin jobs: ese workflow hay que revisarlo aparte.** El
generador se despliega por `deploy-vps.yml`, que si corre (9 jobs, success).
**Ojo:** `python yaml.safe_load` aceptaba el fichero roto; el validador de GitHub no.
Un gate de YAML tiene que usar el criterio de GitHub.

**ESTADO DE LA CADENA AL CERRAR ESTE HECHO**
```
app local        index-v4.html 296.806 B · cache-buster 20261115-extshimott
generador repo   949.737 B · EXTSHIMOTT=11
generador VPS    949.737 B · EXTSHIMOTT=7    (servido == local salvo comentarios)
wrap VPS         23.407 B  · EXTSHIMOTT=9
proyeccion       conserva el tag (ape-list-project.sh L97-101)
APK device       v673 · log "ApeExtShimOtt: sink instalado"
lista en disco   1.298.222.092 B · 0 tags  <-- generada ANTES; hay que regenerarla
```
---

## Hecho 16 · La proyeccion baja a 186 MB con 21.224 tags — y el error de metodo que lo causo

LA LISTA SERVIDA AHORA
```
https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8
1.298.222.092 B -> 186.789.613 B   (-85,6 %)
  gzip 352.804.883 B -> 4.023.576 B (-98,9 %)
  21.224 canales · 21.224 #EXTSHIMOTT · APE=0 · PHANTOM=0 · VNOVA=0 · CMAF=0
  servida con gzip: 200 · 4.023.576 B · 0,0147 s
Desglose: EXTHTTP 157,3 MB (SE CONSERVA: el player si usa esas cabeceras) ·
          EXTINF 10,2 MB · tags 5,3 MB · URLs 4,4 MB · #EXT-X-* estandar 9,6 MB
```

EL ERROR DE METODO, Y ES EL APRENDIZAJE DEL DIA
Se recorto en tres pasadas persiguiendo tags uno a uno:
```
sin #EXT-X-APE-              ->  -735 MB
sin #EXT-X-VNOVA-LCEVC-*     ->   -90 MB   (6 tags x 21.224 = 127.344 lineas)
sin #EXT-X-PHANTOM-HYDRA-*   ->   -94 MB   (6 tags x 21.224 mas)
```
Cada pasada parecia la definitiva y quedaba otra familia. El generador emite ~10 familias
de metadata propietaria por canal. **Con lista negra el trabajo no termina nunca.**
Se invirtio a LISTA BLANCA: 29 tags de RFC 8216 y cae todo lo que no este. Un solo cambio,
resultado estable. `STANDARD_TAGS` vive en `ape-list-light.sh`.

CUATRO BUGS MIOS, TODOS DE BASH, TODOS MEDIDOS
| # | Bug | Sintoma |
|---|---|---|
| 1 | `sed` con `.*` GREEDY | capturaba `shimott_present` (0) en vez de `shimott` (21.224) |
| 2 | `grep` con coma final | el JSON acaba en `"errors":0}` SIN coma → no matchea → aborta |
| 3 | `ls -1t` ordena por FECHA | tomo la lista de 3 canales de prueba, no la de 21.224 |
| 4 | `grep -c` imprime el conteo Y sale 1 | con `|| echo 0` queda `"0 0"` → la comparacion revienta |
Se quito ademas la dependencia de `ape-list-project.sh`: compone el nombre de salida a
partir del de su origen y con sufijos encadenados (`_CABLEADA`, `_OTT_CABLEADA`, `_LIGHT`)
**no coincidia nunca**. Fueron tres intentos antes de verlo.

EL SCRIPT Y SU TIMER
`/opt/ape-pulse/ape-list-light.sh` (manifest -> /opt/ape-pulse/)
```
origen -> wrap (#EXTSHIMOTT) -> lista blanca RFC 8216 -> instala atomico -> .gz
IDEMPOTENTE: .stamp con mtime+tamano del origen. Medido: 2a ejecucion dice
             "sin cambios: ya corresponde al origen" y sale 0.
FAIL-CLOSED : exit 3 wrap con errors>0 · exit 4 si no hay 1 tag por canal, 1 URL por
              canal, o quedan APE · exit 5 sin disco. NO instala nada en esos casos.
              Nunca se publica una lista a medias.
ATOMICO     : escribe .tmp y hace mv, para que nginx no lea un fichero a medio escribir.
```
`ape-list-light.timer` corre cada 10 min y en el arranque. Si la lista no cambio, el
script no hace nada: no hay coste. **Era la pieza que faltaba para que esto no se caiga
de manera inadvertida**, que es lo que el operador viene denunciando.

LO QUE SIGUE SIN MEDIR
El shim aplicando un tag real. La lista lo tiene y el parser esta instalado (v673, log
`ApeExtShimOtt: sink instalado`), pero hace falta reproducir y zapear. Medido el
2026-11-15 04:5x: el device estaba en Paramount+, 0 peticiones externas a la lista nueva.
**No se declara verde.**
---

## Hecho 17 · Analisis 4xx/5xx: 324 de 398 404 cerrados

El operador lo pidio literal: *«agrega analisis de todos los errores que salgan y
resuelvelos 4xx y 5xx»*. Esto es lo medido y lo cerrado.

EL UNIVERSO MEDIDO (`/var/log/nginx/playlist_access.log`, 15.795 peticiones)
```
200 = 14.273   206 = 423   404 = 398   302 = 358   407 = 309
503 =   199   403 =  18   400 =  17   499 =   4   502 =   2
```
OJO CON LA RUTA: el log de `/pulse/` y `/lists/` es
`/var/log/nginx/playlist_access.log`, **NO** `/var/www/lists/playlist_access.log`
(y tampoco `access.log`). Con la ruta mal, el analisis sale vacio y parece que no hay
errores. Ya paso dos veces.

404 CERRADOS: 324 de 398 (81 %)
| Ruta | Peticiones | Quien | Causa | Fix |
|---|---|---|---|---|
| `/prisma/api/telemetry-full` | 141 | widget del frontend | pedia SIN `.php` cada 30 s | constante -> `.php` |
| `/prisma/api/sentinel-status` | 141 | widget del frontend | idem | constante -> `.php` |
| `/prisma/api/ape-module-status.php` | 42 | el propio VPS | el fichero no existia | endpoint creado |
Los tres endpoints devuelven 200 ahora: 2.384 B / 217 B / 1.527 B.
Se arreglo EL CLIENTE, no nginx. Tocar la config para aceptar una URL mal formada habria
sido tapar el sintoma, y ademas `conf.d/` esta en contexto `http`: un `location` ahi hace
fallar `nginx -t` (probado, el snippet se revierte solo y nginx queda intacto).

LOS OTROS 74 404 (no son del flujo)
```
/lists/APE_LISTA_1793589060441.m3u8        48   lista vieja que el cliente aun pide
/lists/APE_LISTA_1793531111695_CDN.m3u8    15   idem
/favicon.ico                                2
/cgi-bin/luci/;stok=/locale                 2   ESCANEO de bot a un router
/wp-login.php                               1   ESCANEO de bot a WordPress
```
Los dos ultimos son ruido de internet, no del sistema.

503 (199): EL JIT, NO UN FALLO DEL FLUJO
```
/jit/live/3/master.m3u8            30      /jit/live/1174213/master.m3u8      30
/jit/live/3/sdr/master.m3u8        30      /jit/live/1174213/sdr/master.m3u8  30
/jit/live/3/manifest.mpd           15      /jit/live/1174213/manifest.mpd     15
UA: "node"
```
El JIT escucha en **127.0.0.1:3099** (medido) y nginx lo publica en **8088**. Responde 503
cuando el canal pedido no esta en su mapa (`/opt/ape-jit/current/channels.json`). Es el
contrato del motor bajo demanda, no un error de configuracion.

407 (309): DEL PROVEEDOR, SE ESPERAN
Todas a `/pulse/1312008.m3u8`. Ese canal esta bloqueado por el proveedor. Contarlo como
fallo del flujo fue uno de los DOS falsos positivos del vigilante (Hecho 7).

400 (17): 5 `/jit/image/config` (parametros), 4 `/prisma/api/conviva-event.php`,
2 `/` — residuales, sin patron.

ERROR.LOG: 738 [error], de los cuales 641 NO SON ERRORES
Son `PHP message: ara-sync ok ...` — un INFO que PHP escribe por stderr y nginx marca
como [error]. Los 59 reales son `fastcgi ... buffered to a temporary file` (respuesta
grande, nginx la pasa a disco: normal) y 34 `client intended to send too large body`
(peticiones sobredimensionadas de un cliente, no del sistema).
**Un error.log que se lee por el nivel y no por el mensaje da 641 falsos positivos.**

HERRAMIENTA
`ape-module-status.php` devuelve el estado por modulo leyendo `systemctl`, `/proc/net/tcp`
y los ficheros de estado. `apk_agent` y `shim` se declaran **UNKNOWN con la razon**: corren
en el device y el VPS no puede ver su proceso. Un `unknown` explicado no es un `ok`.
---

## Hecho 18 · "Nunca se caiga" — medido matando el servicio, no leyendo la config

El operador lo pidio asi: *«haz un workflow para que corra siempre, nunca se caiga...
sin generar lacks ni freezeos, en segundo plano pero que trabaje siempre»*. Eso no se
verifica leyendo `Restart=on-failure` en un fichero. Se verifica matando el proceso.

EL AGUJERO, MEDIDO ANTES
```
systemctl show nginx      -p Restart  ->  no
systemctl show php8.3-fpm -p Restart  ->  no
systemctl show ape-jit    -p Restart  ->  always
```
nginx sirve las listas y los segmentos; php-fpm ejecuta cada `/pulse/` y cada endpoint.
Si cualquiera moria (OOM, worker roto, reload fallido) **systemd no lo levantaba** y el
VPS se quedaba sin plano de servicio hasta que alguien entrara a mano. Es literalmente
el "se caen de manera inadvertida" que el operador denuncia.

EL FIX
Drop-ins (`/etc/systemd/system/<unit>.d/10-ape-restart.conf`), no edicion del unit:
```
Restart=on-failure
RestartSec=5s
StartLimitIntervalSec=60s
StartLimitBurst=5
```
Drop-in y no unit: un `apt upgrade` del paquete no lo pisa, y `rm` revierte sin rastro.
`StartLimitBurst=5` a proposito: un servicio que falla, se levanta y vuelve a fallar en
bucle es PEOR que uno parado (come CPU y esconde la causa). A los 5 intentos en 60 s
queda en `failed` y `ape-module-status.php` lo reporta como DOWN.

LA PRUEBA (2026-11-15 05:57 UTC)
```
PID master php-fpm antes : 3324267
kill -9 3324267                      (equivale a un OOM kill)
ACTIVO de nuevo          : a los 6 s
PID master nuevo         : 1720929
NRestarts                : 1
journal: "Main process exited, code=killed, status=9/KILL" ->
         "Failed with result 'signal'" ->
         "Scheduled restart job, restart counter is at 1" ->
         "Started php8.3-fpm.service"

Flujo durante y despues de la caida:
  lista  : 206 · 0,0072 s   <-- se siguio sirviendo SIN php: es estatica via nginx
  modulo : 200 · 0,0308 s
  nginx  : active (no se toco)
```
Ese ultimo punto es el hallazgo util: **php-fpm caido NO es catalogo caido.** La lista es
un fichero estatico que sirve nginx; los endpoints PHP son los que dan 502 mientras dure.
Separar esas dos dependencias es lo que permite que el reproductor siga viendo canales
aunque el plano de control parpadee.

EL RESTO DE MODULOS: 17 TIMERS ACTIVOS
```
ara-wake-watchdog   5 s     ape-pulse-canary   20 s    wg-health-fast     3 s
surfshark-failover 20 s     ape-meta-watchdog  60 s    iptv-tcp-autosync 60 s
ape-pulse-sync      5 min   ape-quality-sync    5 min  ape-jit-reconcile  5 min
ape-list-light     10 min   ape-cablear-auto   15 min  ape-cablear-cola   15 min
cache-hygiene      5 min    unbound-prewarm     5 min  sysstat-collect   10 min
phpsessionclean     1 dia   apt-daily-upgrade   1 dia
```
El JIT ademas tiene `Restart=always` y su mapa con 21.224 canales.

LO QUE NO CUBRE
  Esto protege contra que un PROCESO muera. No protege contra que el VPS entero caiga
  (ahi hacen falta backups fuera del host) ni contra que un servicio quede "active" pero
  degradado: para eso estan los gates, no el Restart.
---

## Hecho 19 · La lista reproduco: manifest -> segmento -> TS valido

Es la parte del "SI" que se puede demostrar SIN el televisor. Se hizo sobre la LISTA
NUEVA (la que lleva los 21.224 #EXTSHIMOTT), no sobre la vieja.

MUESTRA DE 60 CANALES AL AZAR
```
55 -> HTTP 200
 5 -> 000 (timeout del proveedor; no es el flujo)
52 de los 55 traen #EXTM3U valido
```

CADENA COMPLETA DE UN CANAL
```
manifest : https://iptv-ape.duckdns.org/pulse/1.m3u8?u=...   1.348 B · #EXTM3U · 3 segmentos
segmento : /seg/aHR0cDovLzEwNDcyNTUw...                      (ABSOLUTO desde la raiz)
           https://iptv-ape.duckdns.org/seg/aHR0...          200 · 1.601.760 B
           primer byte 0x47  -> MPEG-TS sincronizado
```
No es una lista que "parece" correcta: sirve bytes que un decodificador acepta.

TRAMPA DE MEDICION (me paso y la dejo escrita)
El segmento del manifest es ABSOLUTO (`/seg/...`). Mi primer test lo unio a la base del
manifest y pidio `/pulse//seg/...` -> 404, y casi reporto "el segmento no funciona".
Con la resolucion correcta da 200 · 1,6 MB. **Una URL mal construida en el test se
parece demasiado a un fallo del sistema.**

LO QUE ESTA PRUEBA NO CUBRE (y por eso el objetivo sigue abierto)
  - que OTT Navigator ACEPTE la lista: eso es del reproductor
  - que el shim LEA los tags: necesita que OTT pida la lista
  - el TIEMPO DE ZAPEO con la red y el televisor reales
Los tres necesitan el zapeo del operador. No se declaran.
---

## Hecho 20 · Las imagenes del operador: el sistema confirmado por el propio servidor

Las dos fotos del 2026-11-14 que el operador adjunto al principio del encargo contenian
el estado real del sistema, y yo no las habia mirado. Esto es lo que dicen, verificado
despues contra el VPS.

PANEL VPS/ARA (foto 13:10)
```
Settings recibidos: 14 · Aplicados/rechazados: 12 / 12
Presets homologados: 41 (Android: 5, player: 41) p50/p95/p99/max: 8/13/13/19 ms
Verdad presets: APPLIED 4 · STORED 29 · DECLARED 8
Ultimo SSE: hace 1s
Track: mime=video/hevc codecs=hvc1.2.4.L153.B0 3840x2160 bps=-1
Perfil: crystal_uhd · Buffer: max · HDR: HDR10, HLG, HDR10+
VPP: sin dato · Estado: detenido
```
Dos cosas que importan y que no salen de mis mediciones:
  - Las latencias de los 41 presets: **p50 8 ms, p95 13, p99 13, max 19**. Son el
    presupuesto real de aplicacion de settings, no una estimacion.
  - **APPLIED 4 · STORED 29 · DECLARED 8**: el contrato requested/applied/output en
    vivo. Solo 4 de los 41 presets estan APLICADOS de verdad; 29 solo guardados y 8
    solo declarados. Ese numero es la prueba de que el sistema distingue los tres
    estados en vez de llamar "aplicado" a todo.
  - `VPP: sin dato` y `Estado: detenido`: el panel NO inventa. Cuando no mide, lo dice.

SHIM (foto 15:59)
```
shim: ACTIVO · puerto 45721 · up 109s
cache 0/0 (null) · segmentos 0 · req 59 · pending 0
techo 6000000 B/s · admitido 9223372036854775807 · ids 0 · restarts 0
base=http://127.0.0.1:45721/source.m3u8
            con la lista https://.../lists/APE_PRUEBA_ORDER_OK_CABLEADA.m3u8
```
El shim SI se arranca con una URL de lista y expone `base=/source.m3u8` para el player.
Medido: 59 peticiones, 0 segmentos servidos, 0 restarts. El techo de 6.000.000 es
BYTES/s (48 Mbps) y `maxBwAdmitted` esta en Long.MAX_VALUE: no limita nada.

LA RUTA "IDEMPOTENTE, POLIMORFICA, ISOMORFICA" YA EXISTE (foto 15:56)
```
REA · Catalogo JIT
Confirmado por el servidor
ape-jit-catalog/1.0.0 · idempotente+polimorfico+isomorfico
perfil=P5 · target=source · receta=balanced

https://iptv-ape.duckdns.org/jit/playlist-calidad.m3u8
https://iptv-ape.duckdns.org/jit/playlist-resolver.m3u8
```
VERIFICADO EN EL VPS el 2026-11-15: los dos endpoints responden **200 ·
1.298.222.092 B · 21.224 canales**, y las cabeceras lo declaran:
```
#EXT-X-APE-CONTRACT:ape-jit-catalog/1.0.0
#EXT-X-APE-CONTRACT-MODE:idempotente+polimorfico+isomorfico
#EXT-X-CMAF-POLIMORFISMO:NONCE=...,SID=...,HASH=...
```
El codigo: `/opt/ape-jit/jit_catalog_build.js:134-135`. **Existia antes de esta sesion.
El agente llevaba 100 rondas sin citarlo porque no habia mirado las fotos del operador.**

DOS CATALOGOS EN EL MISMO VPS (hallazgo)
```
JIT /jit/playlist-*.m3u8   -> 1.298.222.092 B · la lista completa
mi proyeccion /lists/*_LIGHT.m3u8 -> 186.789.613 B · con los 21.224 tags · gzip 4,0 MB
referencias a CABLEADA_LIGHT dentro del JIT: 0
```
**Son 7x mas bytes y 88x mas gzip.** No es un fallo (el JIT es la ruta del agente y la
proyeccion es la del reproductor), pero son DOS catalogos y conviene no confundirlos.

LO QUE LA PROPIA APP LE DICE AL OPERADOR
```
El alta del proveedor la haces tu: Ajustes -> Proveedor -> Anadir proveedor ->
Lista de reproduccion, y pegas la URL.
No hay Intent publico de OTT para registrarlo solo.
```
**El ultimo paso del objetivo es manual POR DISENO DE OTT, y esta escrito en la app.**
No es una carencia del sistema: es una limitacion del reproductor, documentada donde el
operador la va a leer.
---

## Hecho 21 · La eficiencia por perfil llega a la lista servida (241 MB con las 1.040 lineas dentro)

El operador lo pidio asi: "que cuando el canal viaje, se lleve las mas de mil lineas con el
que corresponda a cada perfil". Esto es lo que se hizo y lo que costo.

LO QUE VIAJA AHORA
```
lista servida : 241.369.227 B · gzip 13.679.788 B
canales       : 21.224 · tags #EXTSHIMOTT: 21.224 · URLs: 21.224
plantillas    : 9 en la cabecera (una por par Perfil+Tier real)
APE en cuerpo : 0
lineas/canal  : las 1.040, disponibles via plantilla + los 9 nonces del canal
```

LAS 9 PLANTILLAS, Y POR QUE SON 9 Y NO 12
La lista real usa 9 combinaciones (medido): P3+T5 14462, P3+T6 4405, P3+T7 1320, P1+T8 672,
P1+T9 255, P3+T9 35, P4+T5 58, P1+T5 6, P5+T5 11. Los 12 perfiles existen en el contrato
(6 canonicos + 6 emulados 6K), pero solo 9 pares tienen canales.

LA PRUEBA
  verify-light sobre los 21.224 canales: 0 lineas distintas contra el origen.
  Tres perfiles comprobados por sha256: P1+T9 1.041 lineas, P3+T7 1.044, P4+T5 1.047.
  Y un reconstructor INDEPENDIENTE que no importa el tool confirma lo mismo.

EL COSTE, SIN MAQUILLAJE
```
                crudo          gzip        servida
antes       186.789.613 B   4.023.576 B   200 · 14 ms
ahora       241.369.227 B  13.679.788 B   200 · 33 ms
             +29,22 %          3,40x
```
Se paga 9,7 MB mas de gzip a cambio de devolverle a cada canal sus 1.040 lineas. Es la
decision que el operador pidio; el rollback esta en el backup del 093743Z.

## El mismo defecto de clase en TRES sitios, y el tercero casi tira el trabajo

Los tres comparaban metadata de CABECERA como si fuera metadata POR CANAL:

| Sitio | Sintoma | Fix |
|---|---|---|
| `gate_ape_crystal_flow.sh` | `proyeccion FAIL ape=10` | `awk '/^#EXTINF/{f=1} f && /^#EXT-X-APE-/'` |
| `ape-module-watchdog.sh` | idem, habria marcado DEGRADADO | idem |
| `ape-list-light.sh` L103 y L174 | decia REPARAR y REGENERABA la LIGHT | idem en las dos |

EL TERCERO, MEDIDO EN VIVO (2026-11-15)
```
09:40:38  el timer corrio
09:40:39  "REPARAR: la lista no cuadra"
09:41:17  "wrap 38s" -> regenero la LIGHT (186 MB)
```
La metapack-light duro 10 minutos. Si no se revisa, la mejora se pierde en silencio cada
vez que corre el timer. Tras el fix:
```
09:44:31  "sin cambios: ... ya corresponde al origen Y SU CONTENIDO CUADRA"
```

## Incidente: CRLF en el VPS

Al desplegar los checks con `scp` desde Windows llegaron con CRLF y **el gate y el vigilante
quedaron rotos** en produccion (`syntax error near unexpected token $'do\r'`). Restaurado en
el mismo turno con `sed -i 's/\r$//'` y verificado con `bash -n` + ejecucion real.
**Regla: un .sh que viaja a Linux se normaliza a LF antes de subirlo.**

Nota de entorno: en este Windows `python3` es el stub de WindowsApps; el interprete real
responde a `python`.

## Los 4xx/5xx al cierre
```
5xx: 0
4xx: 435 en las ultimas 3000 lineas del log
  230  407 /pulse/1312008.m3u8   -> el canal de prueba, bloqueado por el proveedor
   26  403 /                     -> escaneo de bots
   12  404 /prisma/api/sentinel-status   -> SIN .php, de una version vieja del cliente (06:57)
   11  404 /prisma/api/telemetry-full    -> idem
```
Los 23 sin `.php` son historicos (tu IP, hace 3 horas); el widget actual usa `.php`. No se
toca nginx por eso.
---

## Hecho 22 · El `d=` de cada canal declara SU resolucion, no el default 1080p30

EL BUG
Todas las URLs de la lista llevaban el mismo parametro:
```
d = {"t":"generic","s":"unknown","r":2048,"w":1920,"h":1080,"f":30}
```
Un canal 4K real (548065, P1+T9) incluido. Se originaba en dos sitios:
- el generador lo escribe como constante (m3u8-typed-arrays-ultimate.js:13213)
- el wrap pasaba `deviceType:'generic'`, y ese perfil del ApeUrlBuilder es
  `{maxRes:[1920,1080], hdr:'sdr', fps:30}` (ape-url-builder.js:77)

EL FIX, en el wrap (que es capa nuestra, no el generador)
`rebuildDeviceData(url)` reescribe el `d=` con w/h/f del `#EXT-X-APE-STREAM-TRUTH`
del canal. Se aplica ANTES del early-return de ALREADY — las listas cableadas ya
traen URLs /pulse/ y sin eso el fix no llegaba nunca (medido: wrapped=0, d_rebuilt=None).
No se toca `hdr`: el fichero documenta que no se declara HDR desde `pq=1`.

VERIFICADO, canal a canal
```
canal 4K (548065) : d= {"w":3840,"h":2160,"f":60}
                    truth: src=real,w=3840,h=2160,fps=60  -> COINCIDE
canal FHD (1)     : d= {"w":1920,"h":1080,"f":60}
                    truth: src=fake-4k,w=1920,h=1080,fps=60 -> COINCIDE
```

ESTADO
```
LIGHT : 241.369.147 B · gz 13.682.971 B · 21.224 canales · 9 plantillas · 21.224 tags
P1    :  12.062.307 B · gz    960.567 B ·    933 canales 4K reales
P3    : 228.720.957 B · gz 12.613.740 B · 20.222 canales
P4    :   1.157.469 B · gz    322.609 B ·     58 canales
P5    :     499.539 B · gz    282.668 B ·     11 canales
gate  : PASS 10/10 · vigilante OK · servicios NRestarts=0
```

EL ZAPEO MEDIDO, y su fecha importa
```
06:15:58 -> 06:20:54  canal 548065
  12 manifiestos · 112 segmentos · 984,0 MB · ~53 Mbps · 1,01-1,33 s por segmento
```
Ese zapeo funciono, pero fue con la lista de ANTES del fix. Despues el operador
pidio la lista tres veces (07:24, 08:25, 09:26, todas 200) y no volvio a zapear.
El fix se aplico a las 09:58. **La lista con el `d=` correcto aun no se ha probado
en el televisor.** No se declara probada.

FALSO POSITIVO CONOCIDO DEL VERIFICADOR
`verify-light` devuelve ok:false con lineas_distintas=21224 en la linea 1040 (la URL),
porque el `d=` nuevo cambio la URI y el verificador compara byte a byte contra el
origen. Las 1.040 lineas de metadata siguen saliendo de las plantillas + mp.
No se relaja el verificador para que diga lo que conviene.

PENDIENTE, y es de la APK
El shim manda su PROPIO `d=` al pedir, con defaults. Este fix arregla el de la LISTA;
el del shim necesita recompilar (v675) e instalar. No se hizo sin autorizacion.
---

## Hecho 23 · El canary decía «ok» sobre un canal muerto

EL DEFECTO, MEDIDO
El canal de prueba estaba hardcodeado en tres sitios y murió (407 del proveedor):
```
module-watchdog.sh:58    CH_PROBE  (configurable por APE_CH_PROBE)
module-watchdog.sh:127   canary-resolve?u=...1312008   <- hardcodeado
gate_ape_crystal_flow.sh:97,108                        <- hardcodeado
```
Medido: 662 peticiones en 10 h al 1312008, 661 de ellas del propio VPS.

Y el daño real no era el ruido:
```
el canary probaba canary-resolve.php?u=...1312008
ese endpoint devuelve 302 (redirige al upstream)
el codigo acepta 302 como EXITO
=> el canary PASABA con el canal muerto
```
Un instrumento que dice «ok» sobre un canal que el proveedor tiene bloqueado.
Es el mismo patrón que los otros cuatro: declarar un estado sin comprobarlo.

EL FIX
```
drop-in /etc/systemd/system/ape-module-watchdog.service.d/ch-probe.conf
  Environment=APE_CH_PROBE -> canal 27 (medido 200 · 3.886 B · 0,52 s)
sed 1312008 -> 27 en la URL de prueba del watchdog L127 y del gate L97/L108
  (solo la URL, no la logica)
backups .bak_chprobe_20261115T1015Z de ambos scripts en el VPS
```

VERIFICADO EN PRODUCCION
```
bash -n (paths POSIX) : OK en los 4 scripts tocados
watchdog              : exit=0 · verdict=OK · fallos=0
gate                  : PASS · 11/11   (antes 10/10: el canary ahora pasa de verdad)
canal muerto 1312008  : 710 -> 710 peticiones en 130 s  (+0)
canal vivo 27         :   6 ->   8 en 130 s  (+2, las del watchdog)
servicios             : nginx/php/jit active
```

ROLLBACK
```
cp /opt/ape-pulse/<script>.bak_chprobe_20261115T1015Z /opt/ape-pulse/<script>
rm /etc/systemd/system/ape-module-watchdog.service.d/ch-probe.conf && systemctl daemon-reload
```

RESTO DE LOS 4xx/5xx REVISADOS, y su veredicto
```
662 x 407 /pulse/1312008        -> canal de prueba muerto      RESUELTO (este Hecho)
 42 x 404 ape-module-status.php -> anteriores a crear el fichero; ahora 200
153 x 404 sentinel-status       -> cliente viejo sin .php; con .php 200
152 x 404 telemetry-full        -> idem
 39 x 503 /jit/live/*           -> CORRECTO: gate=player_active, slot del proveedor
                                   ocupado; el JIT se aborta y cae a provider-direct
 50 x 403 /                     -> directorio sin index publico; normal
  1 x lua tcp socket read timed out (06:44) -> aislado, 1 sola vez en 10 h
```

El JIT escucha en 127.0.0.1:3099 (no en 8084, que nunca existió) y nginx en 8088.
Lo dice el propio CLAUDE.md y ahora está verificado en vivo.
---

## Hecho 24 · El badge de upscaling era código muerto: faltaba Usage Access en el device

LO QUE PEDIA EL OPERADOR
"en el overlay, coloques un logo de upscaling para saber que está funcionando".
El badge EXISTE y está bien escrito desde antes:
```
BadgeOverlay.kt L18  Badge de upscaling DINAMICO en el overlay — montado SIN Activity
          L38    <entrada> -> <salida>  ·  REAL (nativa) | SIMULADA (upscale xN) | REDUCIDA | N/D
          L45    SI NO SE SABE, SE DICE "N/D" — NUNCA SE INVENTA
          L119   w.setTitle("UpscaleBadge")
```

LA CADENA, Y DONDE ESTABA CORTADA
```
GET_USAGE_STATS = default  (medido en el ONN 4K)
  -> foregroundPackage() devuelve ""
  -> CaptureWatchdogService: ARA_WATCHDOG poll pkg=''    (medido)
  -> ottReciente nunca true
  -> BadgeOverlay.show() nunca se llama
  -> dumpsys window | grep -c UpscaleBadge = 0 · log ARA-BadgeOverlay VACIO
```
El permiso SI estaba declarado en el manifest (L7 PACKAGE_USAGE_STATS, L20
SYSTEM_ALERT_WINDOW). SYSTEM_ALERT_WINDOW llevaba 3h58m concedido. GET_USAGE_STATS
estaba en `default`: NUNCA se habia concedido. Por eso el poll devolvia cadena vacia.

EL FIX
```
adb shell appops set com.ape.crystalagent GET_USAGE_STATS allow
```
Es el permiso que el propio CaptureWatchdogService.kt:24 documenta:
"Usage Access is required for foreground detection."

VERIFICADO EN EL DEVICE
```
ANTES  ARA_WATCHDOG: poll pkg=''
AHORA  ARA_WATCHDOG: poll pkg='com.ape.crystalagent'   (cada 1 s: :02.948 :03.953 :04.957)

servicios vivos (4):
  dev.venice.ottshim.ProxyService     isForeground=true
  .CaptureWatchdogService             isForeground=true
  dev.venice.ottshim.SessionTap
  .AgentService
GET_USAGE_STATS    : allow
SYSTEM_ALERT_WINDOW: allow
```

TROPIEZO PROPIO, DOCUMENTADO
Para que el agente releyera el permiso se uso `am force-stop`, que deja el paquete en
estado *stopped*. En ese estado Android NO relanza servicios sticky: el proceso (pid 27563)
quedaba vivo pero SIN servicios, y el poll no logueaba nada. Se detecto porque se fue a
buscar el `Log.i(TAG, "watchdog start")` (L25/L36) y no estaba. Se recupero con
`am start -n com.ape.crystalagent/.MainActivity`.

REGLA PARA LA PROXIMA
`am force-stop` NO es la forma de hacer que un agente relea un permiso. Es la forma de
dejarlo medio muerto sin que nadie lo note. Si hay que releer: `am start` de la Activity.

LO QUE FALTA, y es del operador
La cadena esta completa hasta el poll. Falta que OTT este en primer plano para que
`poll pkg=` diga el paquete de OTT y el badge se monte. Tres lineas a verificar cuando
se zapee:
```
ARA_WATCHDOG: poll pkg='<paquete de OTT>'
ARA-BadgeOverlay: badge de upscaling sobre OTT canal=... entrada=...
dumpsys window windows | grep -c UpscaleBadge  ->  > 0
```

Y EL SoC, que limita el resto
```
pq_sharpness_enable   -> no existe en ningun ns de este device — skip
pq_dnr_enable         -> no existe en ningun ns de este device — skip
pq_ai_fbc_enable      -> no existe en ningun ns de este device — skip
com.amazon.tv.* (6)   -> no existe en ningun ns de este device — skip
ApeSettingsApplier    -> device_settings aplicados=12 rechazados=12
```
El "VPP" que pide el operador no tiene palancas en este hardware. No es un fallo del
shim: es el SoC. Y ApeUltraEnhance declara `fps=30->60` como HINT del VPS, que no esta
medido: si el badge muestra SIMULADA xN es coherente; si muestra REAL (nativa), el hint
no se materializo y el badge dira la verdad. No se declara aplicado sin recibo.
---

## Hecho 25 · Inventario de la data viva: seis tipos de artefacto, y siete .json muertos que no estaban caídos

Lo pidio el operador: "haz una captura de toda la data que cada modulo este generando en vivo,
como funcionan los archivos .json, los php, los lua". Medido el 2026-11-15 10:21-10:26 UTC.

### LA URL DEL OPERADOR FUNCIONA
```
https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046.m3u8
  200 · 1.311.467.322 B · application/vnd.apple.mpegurl · 21.224 canales
  #EXTM3U x-tvg-url="" ... catchup="flussonic" · #EXT-X-VERSION:9
```
Y el fichero en disco es un STUB de 8 B (`#EXTM3U\n`): nginx sirve el contenido real.
Un listado por `ls -la` habria hecho creer que la lista esta vacia. No lo esta.

### JSON (8 ficheros en /var/lib/ape)
```
module-watchdog.json       640 B  2026-11-15 10:21  verdict=OK fallos=0   <- VIVO
device_capabilities.json   803 B  2026-06-27                            <- huerfano
health_status.json         226 B  2026-06-27                            <- huerfano
qoe_last.json              720 B  2026-06-27                            <- huerfano
visual_policy_last.json   1928 B  2026-06-27                            <- huerfano
omega_tune_last.json      3031 B  2026-06-18                            <- huerfano
last_visual_policy_*.json 1917/1910 B 2026-06-12                        <- huerfanos
```
DIAGNOSTICO, y la distincion importa: los cinco modulos asociados
(ape-visual-policy, ape-qoe, ape-health, ape-device-caps, ape-omega-tune)
NO EXISTEN como unidad systemd (`not-found`) y NO tienen escritor en /opt/ape-pulse.
No son "servicios caidos": son ficheros de estado de modulos que nunca se instalaron.
No hay nada que reiniciar. `ape-quality-sync` si tiene timer activo.

### PHP del panel (medidos con curl, no leidos en disco)
```
ape-module-status.php       200 | 1529 B   {"ok":true,"verdict":"UP","down":[]}
sentinel-status.php         200 |  217 B
telemetry-full.php          200 | 2568 B
canary-resolve.php          400 |   35 B   <- correcto: exige el parametro u=
ape-last-channel.php        200 |  243 B
ape-feedforward-stream.php  200 |   84 B
```

### Lua (25 ficheros en /etc/nginx/lua)
ape_gateway · ape_rebase_lib · ape_profile_resolver · ape_header · ape_lab_api ·
quality_realtime · qoe_flush_worker · ape_wake_on_manifest · floor_lock_filter ·
bandwidth_reactor_api · ...

### M3U8 servidos (15 en /var/www/lists, 7,4 GB)
```
APE_LISTA_1794100720046.m3u8             8 B (stub) · .gz 352.103.394 B · 21.224 canales
APE_LISTA_1794100720046_CABLEADA.m3u8    1.298.222.092 B · 21.224 canales
APE_LISTA_1794100720046_CABLEADA_LIGHT   241.369.147 B · gz 13.682.971 B · 9 plantillas
APE_LISTA_1794100720046_P1                12.062.307 B · gz    960.893 B · 933 canales
APE_LISTA_1794100720046_P3               228.720.957 B · 20.222 canales
APE_LISTA_1794100720046_P4/P5              1.157.411 / 499.517 B
APE_LISTA_1793787155230 / _1793926685925   8 B stub + .gz 187/184 MB   <- listas viejas
APE_PRUEBA_ORDER_OK / _PERFILES          163.187 B x2                   <- pruebas
```

### JIT
```
/opt/ape-jit/current/channels.json   4.944.656 B
/dev/shm/ape-jit/  con los directorios 3 y 1174213
escucha en 127.0.0.1:3099 (no 8084, que nunca existio); nginx en 8088
```

### TIMERS (7, la senal de zapping en segundo plano)
```
ape-pulse-canary.timer        cada 20 s
ape-meta-watchdog.timer       cada 60 s
ape-module-watchdog.timer     cada 60 s
ape-pulse-sync.timer          cada  5 min
ape-quality-sync.timer        cada  5 min
ape-jit-reconcile.timer       cada  5 min
ape-list-light.timer          cada 10 min   (idempotente: dice "sin cambios")
ape-cablear-auto.timer        cada 15 min
```

### DEUDA MEDIDA, no ejecutada
```
/var/www/lists = 7,4 GB · disco 86% · 5,0 GB libres
  ~371 MB en listas viejas (1793787155230, 1793926685925) con sus .gz
  duplicados: _LIGHT_CABLEADA (241 MB) y _P5_CABLEADA (499 KB)
  APE_PRUEBA_ORDER_OK y _PERFILES (163 KB x2)
```
NO se purga: borrar sin pedido explicito del dueño viola la doctrina del repo. Queda medido.
---

## Hecho 26 · Tiempo de zapping medido: 0,21 s en el VPS (y corrección de los 66 s del Hecho 19)

EL NUMERO
```
canal 27, tres muestras, 2026-11-15 10:23Z:
  muestra 1: manifest 6,810 ms · 822 B · 200  ->  primer segmento 202,587 ms · 2.729.008 B
  muestra 2: manifest 6,989 ms · 822 B · 200  ->  primer segmento 220,267 ms · 2.729.008 B
  muestra 3: manifest 639,900 ms · 822 B · 200 ->  primer segmento 192,584 ms · 2.238.892 B
```
2,7 MB en 0,20 s = 13 MB/s ~= 104 Mbps. El canal 548065 daba 8 MB en 1,2 s (53 Mbps):
el canal 27 es el doble de rapido, por eso es mejor canal de prueba.

CORRECCION HONESTA DE UN NUMERO ANTERIOR
En el Hecho 19 se reportaron "66 s de arranque" del zapeo del 06:18. Ese numero NO era el
tiempo de zapping del VPS: era la distancia en el log entre el primer manifest y el primer
segmento de una sesion que incluia navegacion entre canales. El VPS tarda 0,21 s en servir
manifest + primer segmento. Medir el intervalo entre dos lineas del log no es medir el
zapping, y presentarlo como tal fue un error de lectura.

LO QUE ESTE NUMERO NO INCLUYE
El arranque del decoder en el televisor (MediaCodec init, superficie, primer frame). Eso no
se mide desde el VPS y no se declara. El unico dato honesto del lado device seria
`logcat` del player con su propio timestamp de first-frame, que no existe en este stack.

ESTADO AL MEDIRLO
```
/pulse/ externas en 1 h : 0        (el operador no habia zapeado)
gate : PASS 11/11 · vig : OK 0 fallos
lista: 241.369.147 B · disco 86% · 5,0 GB libres
```
---

## Hecho 27 · "Nunca se caiga": el Restart= correcto es el que NO esta en los one-shot

Lo pidio el operador: "un workflow para que corra siempre, nunca se caiga y despierte en
cada zapping de segundo plano". Medido el 2026-11-15 10:25Z sobre las 14 unidades ape-*.

LA TABLA REAL
```
UNIDAD                        RESTART      ENABLED   NATURALEZA
ape-jit.service               always       enabled   persistente
ape-list-probe.service        on-failure   enabled   persistente
ape-net-tuning.service        no           enabled   persistente (arranque)
nginx / php8.3-fpm            on-failure   --        NRestarts=0

ape-module-watchdog.service   no           static    one-shot <- disparado por timer
ape-meta-watchdog.service     no           static    one-shot
ape-pulse-canary.service      no           static    one-shot (StartLimitBurst=10)
ape-list-light.service        no           static    one-shot
ape-pulse-sync / quality-sync / jit-reconcile / cablear-auto / cablear-cola   static
```

POR QUE `Restart=no` EN LOS ONE-SHOT NO ES UN DEFECTO
Son `Type=oneshot` disparados por timer. El mecanismo de repeticion NO es `Restart=`, es
el TIMER:
```
ape-pulse-canary.timer        cada 20 s   StartLimitBurst=10 en el service
ape-meta-watchdog.timer       cada 60 s
ape-module-watchdog.timer     cada 60 s
ape-pulse-sync / quality-sync / jit-reconcile   cada  5 min
ape-list-light.timer          cada 10 min
ape-cablear-auto.timer        cada 15 min   persistent=yes
```
Poner `Restart=always` en un oneshot seria el error, no la solucion: lo reejecutaria en
bucle sin esperar al timer y sin la ventana que el timer impone.

LOS 11 TIMERS, TODOS enabled
```
ape-cablear-auto.timer    persistent=yes   <- recupera la ejecucion perdida tras una caida
ape-jit-reconcile.timer   persistent=yes
los otros 9               persistent=no    (se rearman solos en el siguiente ciclo)
```

SERVICIOS QUE DEBEN VIVIR SIEMPRE
```
nginx        restart=on-failure   NRestarts=0
php8.3-fpm   restart=on-failure   NRestarts=0
ape-jit      restart=always       NRestarts=0
```
Cero reinicios en toda la sesion: no han necesitado la red de seguridad, pero la tienen.

ARTEFACTOS DE MI PROPIO COMANDO, declarados antes de que confundan
El listado mostro un servicio llamado `UNIT` y un timer llamado `16`. Son el `awk`
capturando la cabecera y un fragmento de linea, NO unidades reales. Se dice para que nadie
lea la salida y crea que hay basura en systemd.

CONCLUSION
"Cada modulo corre siempre" no se garantiza con `Restart=always` en todo: se garantiza con
timer + enabled en los one-shot, y con `Restart=` en los persistentes. Ambas cosas estan
medidas arriba.
---

## Hecho 28 · La cuarta salida LIGHT: checkbox, cerrojo y validacion (medido en el DOM real)

Pedido del operador: "aSEGURATE QUE AGREGUES UN CHECKBOX, PARA VALIDAR ESTE TIPO DE
GENERACION DE NUEVA LISTA, GARANTIZA QUE SE GENERE COMO DEBE SER".

POR QUE HIZO FALTA UNA CUARTA SALIDA
Las tres variantes del panel NO producen la lista LIGHT:
  runVps()    -> prepublishAndGenerateDual()            -> _CDN.m3u8 (d= del generador)
  runDirect() -> prepublishAndGenerateDirect()           -> URLs del proveedor
  runBoth()   -> prepublishAndGenerateDual({dual:'both'}) -> las dos
La LIGHT nace de la CABLEADA y la transforman DOS pasos posteriores que ninguna hace:
  ape-pulse-wrap.js       reescribe d= desde #EXT-X-APE-STREAM-TRUTH
  ape-profile-project.js  escribe 9 plantillas + 1 indice en la cabecera

QUE SE AGREGO (68.443 B, +7.564 sobre los 60.879)
  checkbox #ape-out-light en la fila SALIDAS
  cuarta tarjeta "LIGHT - proyeccion por perfil" con data-ape-run="light"
  runLight(): base CDN -> POST a la proyeccion -> validacion -> estado honesto
  LIGHT_CONTRACT + validateLight() fail-closed
  el boton LIGHT solo se habilita con su checkbox marcado (autorizacion explicita)

MEDIDO EN EL DOM REAL, CON CHROME HEADLESS CONTRA PRODUCCION
Comando: chrome --headless=new --virtual-time-budget=10000 --dump-dom
         https://iptv-ape.duckdns.org/index-v4.html
  exit 0 · dump 630.180 B
  ape-gen-output-panel       x1
  ape-out-light              x1   PRESENTE
  "LIGHT - proyeccion por perfil"  x1   PRESENTE
  ape-light-state            x1   PRESENTE
  data-ape-run="light"       x1   PRESENTE
  4 botones: both, direct, light, vps
  CERO errores de consola
  HTML exacto: <input type="checkbox" id="ape-out-light" style="accent-color:#e879f9;">

EL CERROJO, COMPARADO CONTRA LOS OTROS TRES
  vps    disabled=NO  opacity=1      <- el de defecto, abierto
  direct disabled=SI  opacity=0.4    <- cerrado
  both   disabled=SI  opacity=0.4    <- cerrado
  light  disabled=SI  opacity=0.4    <- cerrado, cursor not-allowed
  span LIGHT al cargar: 'sin validar'
  selector de salidas:  'VPS seleccionado(s)'

LOS DOS ENDPOINTS, MEDIDOS
  GET  /prisma/api/list-light-verify.php?lista=..._LIGHT.m3u8  -> 200
       canales 21224 - plantillas 9 - ape_cuerpo 0 - tags 21224
       lineas 127390 - lineas_por_canal 6 - truncado false
  GET  /prisma/api/list-light-verify.php?lista=..._CABLEADA.m3u8 -> 200
       lineas_por_canal 1044 - ape_cuerpo 257772 - truncado true (lo dice)
  GET  /prisma/api/list-light-project.php -> 405 (correcto: es POST)

POR QUE 6 LINEAS POR CANAL ES LO CORRECTO, NO UN DEFECTO
La LIGHT lleva 6 lineas por canal MAS 9 plantillas y 1 indice. Las 1.046 lineas de la
CABLEADA se RECUPERAN de las plantillas. Eso ES la eficiencia por perfil: 1,28 GB -> 241 MB
sin perder una sola linea de la lista larga.

DOS BUGS MIOS, ENCONTRADOS ANTES DE ENTREGAR
  1. header('X-APE-Endpoint', 'valor') -> TypeError: el 2o argumento es $replace (bool).
     Corregido a header('X-APE-Endpoint: valor'). Lo detecto el error log de php-fpm.
  2. strncmp($line,'#EXT-X-APE-PROFILE-TEMPLATE:',29) -> la firma mide 28.
     Off-by-one que reportaba plantillas=0 cuando hay 9. Lo detecto el grep del fichero.

Y UN TERCERO EN EL DESPLIEGUE
  El primer scp se hizo sin backup: mi script bash tenia un error de escapado de PowerShell
  ('syntax error near unexpected token (') y el cp -a nunca corrio. Detectado al ir a mirar
  si el fichero existia. El rollback por git nunca falto (HEAD~1 tiene la version vieja).

LO QUE NO ESTA VERIFICADO
  El click real del operador sobre el checkbox. Lo verificado es que el DOM lo pinta, que el
  boton nace cerrado y que los endpoints responden. La generacion LIGHT completa desde la UI
  no se ha ejecutado de punta a punta: el POST a list-light-project.php no se probo con exito
  porque exige que ape-list-light.sh corra 86-90 s y no se lanzo.
---

## Hecho 29 · El contrato LIGHT NO depende del numero de canales (correccion del operador)

Lo dijo el operador: "ESTA LISTAS NO ESTA SUJETA A NINGUN NUMERO DE CANALES, ESTOS SON
CORRESPONDIENTES AL FILTRO, SI QUIERO 100 CANALES Y ESTOS CON EL CHECK MARCADO DE LIGHT,
DEBE SALIR LA VERSION MARCADA".

EL DEFECTO QUE EL SEÑALO
El Hecho 28 dejo el contrato con `canalesMin: 20000` y `lineasPorCanal: 6`. Eran DOS
candados mal puestos, y los dos vetaban listas validas:
  - el NUMERO de canales lo fija el FILTRO del operador, no el formato. 100 canales
    filtrados con LIGHT marcado tienen que salir LIGHT.
  - las LINEAS POR CANAL no son constantes: medidas 6 en P1, 7 en P4 y 10 en P5, porque
    cada canal arrastra sus propias lineas extra. Exigir un valor fijo veta listas vivas.

LO QUE QUEDA COMO GATE (solo lo ESTRUCTURAL)
  canales    >= 1     la lista existe y no esta vacia
  plantillas == 9     9 plantillas + 1 indice, o no es una proyeccion LIGHT
  ape_cuerpo == 0     0 lineas #EXT-X-APE- despues del primer #EXTINF
  truncado   == false el conteo cubre la lista entera, no una muestra
`lineas_por_canal` se publica como DATO INFORMATIVO y no veta.

MEDIDO: EL GATE APLICADO A CADA TAMANO DE LISTA
  CANALES   PLANTILLAS  APE_CUERPO  LINEAS/CANAL  GATE
  11        9           0           10            PASA   <- el caso del operador
  58        9           0           7             PASA
  933       9           0           6             PASA
  20.222    9           0           6             PASA
  21.224    9           0           6             PASA
Comando: GET /prisma/api/list-light-verify.php?lista=<cada lista>

Y EL 502 QUE BAJO EL GATE A 10/11, DIAGNOSTICADO
El gate fallo con `502|122|12.262603`. No era un defecto del codigo: el canal 27, que
era el probe, quedo INTERMITENTE en el proveedor.
   upstream sin seguir redirect : 302|0|1,416 s
   upstream siguiendo redirect  : 200|503 B|0,770 s
   pulse/27 en el log           : 200 a las 13:39:06, 13:39:20, 13:41:40
                                  502 a las 13:40:30, 13:40:33, 13:40:57, 13:41:10
El gate lo pillo en un 502. El probe se movio al canal 1256710, el que el operador usa:
   pulse/1256710 -> 200|4.015 B|0,42 s (y 3 intentos seguidos: 2,23 s / 0,45 s / 2,26 s)
Resultado: gate VERDICT PASS · pass 11 · fail 0.

LO QUE NO ESTA VERIFICADO
  El POST real a list-light-project.php con una lista pequena. Exige que ape-list-light.sh
  corra 86-90 s y no se lanzo. Lo verificado es el gate de verificacion, que es el que
  decide, y que las cinco listas de distinto tamano lo pasan.
---

## Hecho 30 · El pipeline LIGHT son DOS pasos, y el contrato no exige 9 plantillas

El operador insistio: "SI QUIERO 100 CANALES Y ESTOS CON EL CHECK MARCADO DE LIGHT, DEBE SALIR
LA VERSION MARCADA". Tenia razon y habia TRES candados mas mal puestos.

CANDADO 3 · EL SCRIPT DESCARTA LISTAS PEQUENAS
  ape-list-light.sh:58  MIN_CHANNELS="${APE_MIN_CHANNELS:-1000}"
  Ese 1000 protege la ELECCION AUTOMATICA del origen (que no coja un fixture de 3 canales, bug
  documentado en las lineas 46-57 del propio script). NO es un limite del formato. El endpoint
  ahora pasa APE_MIN_CHANNELS=1 porque el operador ya eligio la lista en el POST.

CANDADO 4 · EL ENDPOINT NO PASABA LA LISTA
  El script acepta el origen como $1 (L27: BASE="${1:-}"). Si no se le pasa, elige por su cuenta
  la mas reciente y procesa OTRA lista: medido, con APE_MIN_CHANNELS=1 eligio P5_CABLEADA de 11
  canales cuando se le pidio la principal. Ahora se pasa la RUTA COMPLETA como $1, porque el
  script deriva base="${SRC%_CABLEADA.m3u8}" y exige que termine en _CABLEADA.m3u8.

CANDADO 5 · EL CONTRATO EXIGIA 9 PLANTILLAS
  Medido: las 9 plantillas de la lista grande son 9 COMBINACIONES perfil+tier:
  P1+T5 P1+T8 P1+T9 P3+T5 P3+T6 P3+T7 P3+T9 P4+T5 P5+T5
  Una lista filtrada a un solo tier (P5+T5) solo necesita UNA. Exigir 9 veta listas validas.
  Gate corregido: plantillas >= 1 (no == 9). Sigue exigiendo: canales >= 1, ape_cuerpo == 0,
  truncado == false.

EL PIPELINE DE VERDAD SON DOS PASOS, Y EL ENDPOINT SOLO LLAMABA A UNO
  paso 1  ape-list-project.sh <ruta_cableada>
          proyecta la cableada -> _CABLEADA_LIGHT (EXTINF + EXTHTTP + URL) y verifica que no
          se pierde ni un canal y que cada canal tiene EXACTAMENTE 1 URL.
  paso 2  ape-profile-project.js light <light> <tmp> --origin <origen> --gz
          escribe las plantillas de perfil + el indice en la cabecera.
  ape-list-light.sh NO sustituye a ninguno: hace el wrap #EXTSHIMOTT y PISA el fichero,
  borrando las plantillas que hubiera. Por eso dejo de usarse en el endpoint.
  Y hay que instalar LOS DOS ficheros, .m3u8 y .gz: si solo se mueve el .m3u8, el .gz queda
  con el contenido anterior y el verificador (que lee el .gz) reporta 0 plantillas cuando el
  .m3u8 si las tiene. Medido.

SEIS DEFECTOS MIOS CORREGIDOS EN EL CAMINO
  1. header('X-APE-Endpoint','v') -> TypeError, el 2o argumento es $replace (bool).
  2. strncmp(...,'#EXT-X-APE-PROFILE-TEMPLATE:',29) -> la firma mide 28. Reportaba 0 plantillas.
  3. $light usado 60 lineas antes de definirse -> escapeshellarg(null) fatal.
  4. preg_replace('/\.m3u8\$/i') con el \$ escapado -> no quitaba la extension.
  5. El verificador se invocaba por http://127.0.0.1 y nginx devuelve 302 a https -> ahora CLI.
  6. PHP_BINARY bajo php-fpm apunta a php-fpm, no al CLI -> ahora /usr/bin/php.
  Y uno de despliegue: el primer scp se hizo sin backup porque un error de escapado de PowerShell
  ('syntax error near unexpected token (') impidio que corriera el cp -a.

MEDIDO AL FINAL, PUNTA A PUNTA
  POST {"lista":"APE_LISTA_1794100720046_P5_CABLEADA.m3u8"}
  -> ok:true · light APE_LISTA_1794100720046_P5_CABLEADA_LIGHT.m3u8 · 128 ms
     verify: canales 11 · plantillas 1 · ape_cuerpo 0 · bytes 147629 · truncado false
  Y la lista grande, intacta: 241.369.147 B · 9 plantillas · 21.224 canales · gate 11/11.

LA LISTA GRANDE SE PERDIO Y SE RESTAURO
  La primera prueba del pipeline (con ape-list-light.sh) SOBRESCRIBIO la LIGHT buena de 241 MB
  con una de 186 MB SIN plantillas. Se recupero de APE_LISTA_..._CABLEADA_LIGHT_CABLEADA.m3u8
  (241.369.147 B, 9 plantillas), se reinstalo, y se verifico con el endpoint. El backup del
  fichero malo queda en .bak-sin-plantillas-20261115T134709Z.
---

## Hecho 31 · Sincronizacion LIGHT <-> Modulo de Imagen (JIT APE)

El operador paso el HTML completo del MODULO DE IMAGEN y pidio: "ESTE SISTEMA APE CRYSTAL FLOW
DEBE ESTAR ACTUALIZADO Y SINCRONIZADO CON ESTE MODULO ... Y DEBE HACERSE PERFECTAMENTE PARA
TODAS LAS SALIDAS INCLUYENDO LA VARIANTE LIGHT".

LA DESINCRONIZACION MEDIDA ERA BIDIRECCIONAL Y EXACTA
  /jit/image/lineup (10,7 MB · 21.224 canales)        APE_..._CABLEADA_LIGHT.m3u8 (241 MB)
    EXT-X-APE-GOVERNANCE  x1                            GOVERNANCE   0
    EXT-X-APE-ENGINE      x1                            ENGINE       0
    EXT-X-APE-PROFILE     por canal                     PROFILE      0
    EXT-X-APE-TARGET      por canal                     TARGET       0
    EXT-X-APE-PROCESSING  por canal                     PROCESSING   0
    EXT-X-APE-WARNING     por canal                     WARNING      0
    EXT-X-APE-PROFILE-TEMPLATE  0   <- no lo tiene      PROFILE-TEMPLATE  9  <- si
    EXT-X-APE-LAB-METADATA      0   <- no lo emite      LAB-METADATA      0  <- ninguno
  Cada superficie tenia exactamente lo que a la otra le faltaba.

EL PLAN PRISMA DE LOS 12 PERFILES SI EXISTE, EN EL JIT
  GET /jit/image/prisma/emit-all  ->  ok · defaultProfile P4.5
      5.497 B json · 7.332 B base64 · 31 chunks de 240 chars
      doc = { profile:'ALL', fields:{ prisma:{P0..P5.5}, gl:{...} } }
      lines = ['#EXT-X-APE-LAB-METADATA:i/n:<b64>', ...]  (31)
  Es EXACTAMENTE el mismo payload que pinta el panel (5.497 B json · 7.332 B base64 · 31 chunks).
  El codigo: server.js:5905 prismaEmitLabMetadata(), server.js:7742 ruta /image/prisma/emit,
  y /image/prisma/emit-all para los 12.

LO QUE SE CONSTRUYO
  /opt/ape-pulse/ape-light-sync-image-module.sh  (desde vps/bin/)
  Inyecta en la LIGHT, SOLO en la cabecera y sin tocar un canal:
    1) #EXT-X-APE-GOVERNANCE  (leido del JIT, no inventado)
    2) #EXT-X-APE-ENGINE      (idem)
    3) los 31 #EXT-X-APE-LAB-METADATA (idem)
  Orden final: #EXTM3U, GOVERNANCE, ENGINE, #EXT-X-* de playlist, 31 LAB-METADATA,
  PROFILE-INDEX, PROFILE-TEMPLATE xN, cuerpo intacto.
  Idempotente (2a pasada dice "sin cambios"), fail-closed (si canales/urls/plantillas no
  cuadran o el JIT no responde, NO publica), y hace backup .bak-presync-<stamp>.

MEDIDO, PUNTA A PUNTA
  P5_CABLEADA_LIGHT (11 canales)
    antes  147.629 B · TMPL 1 · GOV 0 · LAB 0
    despues 156.045 B · TMPL 1 · GOV 1 · LAB 31 · ENG 1 · URLs IDENTICAS
  CABLEADA_LIGHT (21.224 canales)
    antes  241.369.147 B · TMPL 9 · GOV 0 · LAB 0 · ENG 0
    despues 250.932.706 B · TMPL 9 · GOV 1 · LAB 31 · ENG 1 · 4,5 s · gz 13.862.781 B
    sha256 de las URLs: 7dd8ce1598a9be8eb4f9a33abf65c498142ec185c925010a294b5116110f8e4e
    -> EL MISMO antes y despues. No se toco ni una URL.
  Y el JSON se reconstruye de verdad desde los 31 chunks:
    profile ALL · 12 perfiles · default_profile P4.5
    P0 decode 8294400 fps 60 glsl 1 ai_sr 0 · P3 decode 2073600 fps 60 · P5 decode 409920 fps 30 ai_sr 1
  verify: canales 21224 · plantillas 9 · ape_cuerpo 0 · truncado false · gate PASS 11/11

DOS BUGS REALES DEL MODULO, VISTOS EN EL LOG DEL PANEL
  1. "FALLO al aplicar: fps invalido: " (5 veces: 02:52:49, 02:53:39, 03:07:01, 03:12:02, 03:12:22)
     El campo outFps llega VACIO al endpoint. No es un fallo de red: el mensaje incluye el valor
     y el valor esta en blanco. La validacion del campo no distingue "vacio" de "no numerico".
  2. "optimizar: Unexpected token '<', "<html> <h"... is not valid JSON" (02:53:55)
     El endpoint devolvio HTML (una pagina de error), no JSON. El cliente intenta JSON.parse y
     explota. Falta comprobar el Content-Type antes de parsear.
  Y un tercero, medido ahora: GET /jit/image/optimize?width=1920&height=1080&fps=25&mode=real
  devuelve input.fps = 30, NO 25. El parametro fps SE IGNORA. Eso explica que el panel proponga
  siempre 30 y que "Aplicar al JIT" reciba un fps que no es el pedido.

LO QUE NO ESTA HECHO
  Las listas P1/P3/P4/P5 (no LIGHT) siguen SIN los tags del modulo. El sincronizador acepta
  cualquier lista como argumento, pero solo se ejecuto sobre las dos LIGHT.
  Y la sincronizacion inversa (meter las 9 plantillas en /jit/image/lineup) no se toco: el
  lineup lo regenera el JIT en cada peticion y habria que editar server.js.
---

## Hecho 32 · Todas las salidas sincronizadas con el modulo de imagen

El operador pidio que la sincronizacion no fuera solo para la LIGHT: "DEBE HACERSE
PERFECTAMENTE PARA TODAS LAS SALIDAS INCLUYENDO LA VARIANTE LIGHT".

QUE HABIA, MEDIDO
  Solo existen CUATRO listas de perfil en /var/www/lists:
    P1  12.062.307 B ·   933 canales · 9 plantillas · GOV 0 · ENG 0 · LAB 0
    P3 228.720.957 B · 20.222 canales · 9 plantillas · GOV 0 · ENG 0 · LAB 0
    P4   1.157.411 B ·    58 canales · 9 plantillas · GOV 0 · ENG 0 · LAB 0
    P5     499.517 B ·    11 canales · 9 plantillas · GOV 0 · ENG 0 · LAB 0
  P0 y P2 NO EXISTEN como fichero. Las emuladas .5 (P0.5..P5.5) tampoco existen como fichero.
  No se crean aqui: el generador no las emitio y fabricarlas seria inventar.

LAS SEIS LISTAS, DESPUES
  LISTA                          BYTES  CANALES   GOV  ENG  LAB
  P1                        12.492.848      933     1    1   31
  P3                       237.832.226   20.222     1    1   31
  P4                         1.191.058       58     1    1   31
  P5                           512.867       11     1    1   31
  CABLEADA_LIGHT           250.932.706   21.224     1    1   31
  P5_CABLEADA_LIGHT            156.045       11     1    1   31
  gate PASS 11/11

VERIFICACION POR LISTA (no solo el exit code)
  En las CUATRO de perfil el script comprobo, antes y despues:
    canales      iguales
    plantillas   iguales
    sha256 de TODAS las lineas http(s)   igual
  Y el propio script aborta (die 4) si cualquiera de los tres no cuadra.

LO QUE ESTA SINCRONIZADO Y LO QUE NO
  SI: GOVERNANCE, ENGINE y los 31 chunks de LAB-METADATA (el plan Prisma de los 12 perfiles)
      estan ahora en las seis listas servidas.
  NO: la sincronizacion INVERSA. Las 9 plantillas de perfil siguen sin entrar en
      /jit/image/lineup, porque ese endpoint lo regenera server.js en cada peticion
      (server.js:7742 y siguientes). Editarlo es tocar el motor: queda pendiente de que el
      operador lo autorice.

LOS TRES BUGS DEL MODULO, SIGUEN ABIERTOS
  1. fps ignorado: GET /jit/image/optimize?...&fps=25 devuelve input.fps=30.
  2. outFps vacio: "FALLO al aplicar: fps invalido: " (5 veces en el log del panel).
  3. HTML en vez de JSON: "Unexpected token '<'".
  Los tres viven en server.js. No se tocaron: son el motor de imagen y el operador no ha
  autorizado editarlo. Se reportan con su evidencia para que los decida.
---

## Hecho 33 · Los tres bugs del modulo de imagen, arreglados y verificados

El operador autorizo: "ARREGLALOS". Se corrigieron los tres, con backup previo
(server.js.bak-3bugs-20261115T135756Z y vps-image-panel.js.bak-3bugs-...).

BUG 1 · UN CAMPO VACIO SE TRATABA COMO INVALIDO
  server.js:4199 y siguientes
    if (p.recipe !== undefined) {
      c.recipe = pick(p.recipe, IMAGE_LIMITS.recipes, c.recipe);
      if (c.recipe !== String(p.recipe)) errors.push('recipe invalida: ' + p.recipe);
    }
  Con p.recipe = '': pick('') devuelve el DEFAULT, y c.recipe !== '' es true, asi que se
  reportaba "recipe invalida: " con el valor EN BLANCO. El panel manda '' cuando el operador
  no ha tocado el campo todavia. Mismo patron en recipe, codec, preset, fps y audio.
  FIX: no entrar en la validacion si el valor es undefined, null o cadena vacia; y el mensaje
  de error usa JSON.stringify para que un valor vacio se vea como "" y no desaparezca.
  MEDIDO: POST /image/config con los 5 campos vacios -> ok:true, errors:[] (antes: 1 error).

BUG 2 · objective() NUNCA DEVOLVIA EL FPS DE SALIDA
  server.js:3227
    output: { width: outW, height: outH, pixels: outPx },      <- sin fps
  El panel lee r.fields.outFps.value para rellenar el campo SALIDA fps; al no existir, el
  input quedaba vacio y al declarar llegaba '' -> disparaba el BUG 1. Era una cadena.
  FIX (tres puntos):
    const outFps = Number(o.outFps) > 0 ? Number(o.outFps) : inFps;   // no se inventan fotogramas
    output: { width: outW, height: outH, fps: outFps, pixels: outPx },
    fields.outFps: { value: outFps, reason: 'se conserva el fps de entrada' | 'fijado...' }
  MEDIDO: ?inFps=60 -> output.fps 60 y fields.outFps 60.

BUG 2b · EL GET NO LEIA outFps
  El POST lo pasaba a objective() pero el GET solo leia inW/inH/inFps/outW/outH, asi que
  ?outFps=25 se ignoraba en silencio (devolvia el de entrada).
  FIX: outFps: q.get('outFps') en el bloque GET.
  MEDIDO: ?inFps=60&outFps=25 -> in 60, out 25 (antes: out 60).

BUG 3 · JSON.parse SIN COMPROBAR EL CONTENT-TYPE
  vps-image-panel.js:47
    return fetch(...).then(r => r.json().then(...))
  Cuando el endpoint devolvia HTML, r.json() lanzaba
  "Unexpected token '<', "<html> <h"... is not valid JSON" (visto en el log del panel).
  FIX: r.text() y decidir por Content-Type o por la forma del texto; si no es JSON, se lanza
  un error legible con el HTTP, el content-type y 120 caracteres de muestra.
  MEDIDO: GET /image/rtua-inexistente -> "not found" (texto plano) y el panel lo trata como
  error normal, sin romper.

VERIFICACION
  node -c server.js            OK
  node -c vps-image-panel.js   OK
  ape-jit reiniciado: active · health 200
  gate: PASS 11/11

ESPEJADO AL REPO
  IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js            470.702 B (con los 5 parches)
  IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/vps-image-panel.js  103.329 B
  Comprobado en el repo: 5 guards de vacio, 2 declaraciones de outFps, 1 output con fps,
  1 GET que lee outFps, 2 comprobaciones de content-type.

PENDIENTE, Y SE DICE
  tools/lab/ape-jit/server.js sigue en 468.210 B, SIN los parches: es la copia de laboratorio
  y no se toco. Si esa copia es la que se redespliega algun dia, los tres bugs vuelven.
  Decidir cual es la fuente es del operador.
---

## Hecho 34 · El timer ya no puede borrar lo que el modulo inyecta

RIESGO REAL, NO HIPOTETICO
  ape-list-light.timer corre cada ~10 min y lanza ape-list-light.sh. Ese script solo mira si
  cambio el ORIGEN: compara el tamano y el mtime de la _CABLEADA con el .stamp. Si el origen no
  cambio, dice "sin cambios" y no toca nada. Pero cuando el generador produce una _CABLEADA
  nueva, REGENERA la LIGHT, y esa regeneracion NO lleva:
    - las plantillas de perfil (las pone ape-profile-project.js, no ese script)
    - el plan Prisma (#EXT-X-APE-LAB-METADATA)
    - la cabecera de gobierno (#EXT-X-APE-GOVERNANCE / ENGINE)
  Ya paso una vez: a las 13:26 la LIGHT buena de 241 MB quedo sustituida por una de 186 MB
  sin plantillas. Se recupero de APE_..._CABLEADA_LIGHT_CABLEADA.m3u8.

EL ARREGLO
  /etc/systemd/system/ape-list-light.service  gana un ExecStartPost:
    ExecStart=/bin/bash /opt/ape-pulse/ape-list-light.sh
    ExecStartPost=/bin/bash /opt/ape-pulse/ape-light-sync-image-module.sh \
      /var/www/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8
  Asi, cada vez que el script regenere, el sincronizador vuelve a inyectar las tres piezas.
  Los dos pasos son idempotentes, en ambos sentidos.
  Se anadio tambien After=ape-jit.service, porque el sincronizador lee del motor y antes
  podia arrancar cuando el JIT aun no estaba listo.

MEDIDO: ejecucion forzada a las 14:00:23
  1) ape-list-light.sh        -> "sin cambios" (el .stamp del origen coincide)
  2) ExecStartPost            -> "sin cambios: ya tiene GOVERNANCE y LAB-METADATA"
  LIGHT: 250.932.706 -> 250.932.706 B · TMPL 9 · GOV 1 · LAB 31
  Result del servicio: success · gate PASS 11/11
  Y con un origen nuevo: el paso 1 la regenera, el paso 2 re-inyecta. Nadie tiene que
  acordarse de correr el sincronizador a mano.

ESPEJADO AL REPO
  IPTV_v5.4_MAX_AGGRESSION/vps/systemd/ape-list-light.service
---

## Hecho 35 · El panel tambien en el servidor local, y tres trampas que lo impedian

El operador senalo http://127.0.0.1:5500/IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html y pidio
que todo quedara implementado ahi tambien.

TRAMPA 1 · EL CACHE-BUSTER ERA DE HACE UNA SEMANA
  index-v4.html:5127 cargaba generation-output-panel.js?v=20261107-rea y :5133
  vps-image-panel.js?v=20261109-svc1. El navegador servia la copia cacheada aunque el fichero
  estuviera bien: la tarjeta LIGHT no habria aparecido nunca. Actualizado en el repo y en el
  VPS a v=20261115-light y v=20261115-3bugs.

TRAMPA 2 · LAS DOS LLAMADAS DEL PANEL ERAN RELATIVAS
  runLight() y validateLight() pedian '/prisma/api/...'. En el VPS funciona porque nginx sirve
  /prisma/, pero en 127.0.0.1:5500 eso resuelve a http://127.0.0.1:5500/prisma/... y da 404.
  Corregido a VPS_BASE + '/prisma/api/...' en las dos, usando la base que el panel ya resolvia
  (window.APE_VPS_BASE || 'https://iptv-ape.duckdns.org'). node -c OK.

TRAMPA 3 · GZIP_STATIC SERVIA UN .js.gz VIEJO
  Esto es lo que de verdad rompia la verificacion: el fichero en disco era 69.168 B pero nginx
  servia 68.981 B con last-modified 13:52. nginx.conf:73 tiene gzip_static on, y habia un
  .js.gz de una version anterior que se servia en lugar del .js nuevo.
  MEDIDO: disco sha a5ba925b... vs servido sha distinto, y content-length 68981.
  FIX: regenerar los .gz de los dos ficheros.
  DESPUES: disco 69.168 = servido 69.168 y el MISMO sha256; imagen 103.329 = 103.329.

COMO QUEDA EL SERVIDOR LOCAL
  IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html          291.632 B
    L5127  generation-output-panel.js?v=20261115-light
    L5133  vps-image-panel.js?v=20261115-3bugs
  js/ape-v9/generation-output-panel.js                      69.168 B · 8 piezas LIGHT
  js/ape-v9/vps-image-panel.js                             103.329 B · los 3 parches
  js/ape-v9/m3u8-typed-arrays-ultimate.js                  949.737 B
  js/ape-v9/ape-profiles-config.js                         411.497 B
  NO existe frontend/js/ape-v9/ape-profile-classifier.js: el panel no lo carga desde ahi y el
  index no lo referencia, asi que su ausencia no rompe el panel. Se dice para que nadie la
  busque y crea que falta algo.

LO QUE NO ESTA VERIFICADO
  No he podido cargar http://127.0.0.1:5500 desde aqui: es el navegador del operador. Lo
  verificado es que los ficheros que ese servidor va a servir son los correctos (tamano, sha256
  y las 8 piezas presentes) y que nginx ya sirve la misma version en produccion.
  Falta el reload con Ctrl+Shift+R por parte del operador.

DE PASO, UNA OBSERVACION DE HIGIENE
  /var/www/html/js/ape-v9/ tiene ~110 copias del panel con nombres .bak_2026*, desde 33.950 B
  hasta 68.443 B. No se borro ninguna. Con el disco al 89% es candidato a limpieza previa
  autorizacion.