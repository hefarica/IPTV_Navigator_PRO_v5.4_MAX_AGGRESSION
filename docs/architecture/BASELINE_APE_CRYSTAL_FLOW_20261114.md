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
