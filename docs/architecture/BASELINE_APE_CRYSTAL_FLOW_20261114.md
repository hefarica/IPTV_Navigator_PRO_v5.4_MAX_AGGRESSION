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