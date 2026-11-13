# WORKFLOW DEL SISTEMA APE — cómo funciona de extremo a extremo y cómo se comprueba

**Fecha:** 2026-11-13 · **Método:** cada afirmación lleva su artefacto. Lo que no se midió se declara.

Este es el documento de operación. Los inventarios (`01_APK_INVENTARIO.md`, `02_VPS_INVENTARIO.md`) describen las piezas; este describe **cómo se mueven y cómo se sabe si está sano**.

---

## 1 · El diagrama, con los nombres reales

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ CAPA 1 · GENERADOR (navegador / LAB)     — METADATA INERTE, no toca píxeles  │
│   APEQualityProber → APEFallbackResolver → m3u8-typed-arrays-ultimate.js      │
│   emite: canales + ~671 directivas de metadata por canal                     │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │  lista .m3u8 subida
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ CAPA 2 · VPS iptv-ape.duckdns.org        — REESCRIBE TEXTO, no toca píxeles  │
│   nginx + Lua (body_filter / header_filter) + PHP (prisma/api/*)             │
│   · /live/N.m3u8   → rebase del manifiesto del proveedor                     │
│   · /pulse/        → envuelve el manifiesto                                  │
│   · /sync          → protocolo ARA-X-SYNC-V1 (HMAC-SHA256)                   │
│   · /ara/events    → SSE: entrega device_settings al device                  │
│   · candado: \.(ts|m4s|mp4) → 404 (el VPS NO transporta vídeo)               │
└───────┬──────────────────────────────────────────────────────┬───────────────┘
        │  manifiesto + headers (cadencia del SEGMENTO)         │  SSE device_settings
        ▼                                                      ▼
┌──────────────────────────────┐              ┌────────────────────────────────┐
│ OTT NAVIGATOR / TIVIMATE     │              │ CAPA 3 · APK com.ape.crystal…  │
│  reproduce. Consume la URL,  │              │  · SettingsApplier: valida     │
│  EXTINF y pocas cosas más.   │              │    allowlist y escribe Settings│
│  IGNORA EXTVLCOPT/KODIPROP/  │              │  · ScreenCaptureService: MIDE  │
│  EXTATTRFROMURL.             │              │    y DESCARTA el fotograma      │
└──────────────┬───────────────┘              └───────────────┬────────────────┘
               │                                              │
               └──────────────────┬───────────────────────────┘
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ SISTEMA ANDROID → PANEL                                                      │
│   Settings.Global/Secure aplicados · modo de display · HDR · VPP del SoC     │
│   ← esto es lo que cambia lo que el operador VE                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Fuentes de cada tramo:** inventario VPS (`02_VPS_INVENTARIO.md`) para la capa 2; inventario APK (`01_APK_INVENTARIO.md`) §5–§7 para la capa 3; censo de la lista real (§4 abajo) para las ~671 directivas.

---

## 2 · Las tres capas y quién puede tocar píxeles

| Capa | Qué hace | ¿Toca píxeles? | Evidencia |
|---|---|---|---|
| **1 · Generador** | emite la lista con metadata | **NO** — etiquetas inertes (RFC 8216 §6.3.1) | censo: 1.434.554 `#EXT-X-APE-*` |
| **2 · VPS** | muta el **texto** del manifiesto | **NO** | candado `\.(ts|m4s|mp4) → 404` en nginx |
| **3 · APK** | aplica ajustes del sistema y procesa **solo** sus propios fotogramas | **SÍ, por dos vías limitadas** | `SettingsApplier` + `UltraEnhancePipeline` |

**La mejora de imagen sobre OTT Navigator en el ONN 4K viene de:**
1. **la metadata del manifiesto** (lo único que OTT obedece), y
2. **los ajustes de pantalla** que la APK escribe.

**No** viene de procesar los fotogramas de OTT: Android lo prohíbe, y además `SYSTEM_ALERT_WINDOW = granted FALSE` cierra el camino del overlay.

---

## 3 · La cadencia del bucle de control — honesta

```
HLS recarga el manifiesto cada segmento (≈2–10 s)
      ↓
nginx+Lua reescribe la metadata en cada recarga
      ↓
OTT recibe las directivas nuevas
      ↓
SettingsApplier aplica device_settings vía SSE (independiente del manifiesto)
```

**El bucle es de SEGUNDOS, no de milisegundos.** Lo que es de milisegundos es la **aplicación** de un ajuste ya recibido (una escritura de `Settings`), no el ciclo completo. Decir «corrección por frame» sería falso: entre fotograma y directiva nueva hay, como mínimo, un segmento.

---

## 4 · Censo de lo que la lista lleva de verdad

Fichero `downloaded_list_4K.m3u8`, **220.194.640 B**, escaneado entero (2.051.453 líneas):

| Directiva | Total | Por canal | ¿OTT la consume? |
|---|---|---|---|
| `#EXTINF` (canales) | 2.754 | — | **SÍ** (nombre/atributos) |
| `#EXTVLCOPT` | 261.630 | **95,00** | **NO** |
| · con `video-filter` | 2.754 | **100 % de los canales** | **NO** |
| `#EXT-X-APE-*` | 1.434.554 | **520,9** | **NO** |
| `#EXTHTTP` | 2.754 | 1 | **NO** |
| `#KODIPROP` | 148.720 | 54 | **NO** |

**~671 directivas por canal, y el reproductor ignora casi todas.** Por eso `#EXTATTRFROMURL:quality=top,resolution=highest,bitrate=max` (presente en el 100 % de los canales) **no pide nada**: es una declaración, no una petición.

Las cadenas de `video-filter` son reales y están en todos los canales:
`nlmeans=s=3.0:p=7:r=15,bwdif=mode=1:parity=-1:deint=0,gradfun=radius=16:strength=1.0,unsharp=…`
— desentrelazado (`bwdif`/`yadif`), denoise (`nlmeans`/`hqdn3d`), debanding (`gradfun`), realce (`unsharp`).

**La única vía de pedir de verdad la mejor variante es reordenar el master** (`tools/vps/variant_select.js`, FIX 3, 37/37 PASS, **no desplegado**).

---

## 5 · Rutina operativa: cómo se sabe si está sano

Comandos reales contra el ONN (`adb -s 192.168.1.3:34813 shell …`).

> **Ojo con el namespace:** cada clave vive en uno distinto y `settings get` del namespace
> equivocado devuelve `null`, que parece «no existe» pero es «no está ahí». Verificado el
> 2026-11-13 en el ONN:
>
> | clave | namespace REAL | valor medido |
> |---|---|---|
> | `hdr_conversion_mode` | **global** | 1 |
> | `are_user_disabled_hdr_formats_allowed` | **global** | 1 |
> | `user_preferred_refresh_rate` | **global** | 50.0 |
> | `minimal_post_processing_allowed` | **secure** | 0 |
> | `match_content_frame_rate` | **secure** | 2 |
>
> Las 11 claves `pq_*`/`ai_*` **no están en ninguno de los dos** (medido).

| Comando | Valor sano | Valor síntoma | Qué significa |
|---|---|---|---|
| `dumpsys display \| grep -oE "mActiveModeId=[0-9]+"` | **125** (4K@50) si el contenido es 25/50 fps | 124 (60 Hz) con contenido de 25 fps | cadencia mal encajada → judder |
| `settings get global user_preferred_refresh_rate` | coincide con el modo activo | dice 50 y el panel está en 60 | estado que miente |
| `settings get global hdr_conversion_mode` | **1** (PASSTHROUGH) | 2 o 3 | HDR forzado, riesgo de color shift |
| `settings get secure minimal_post_processing_allowed` | **0** (VPP completo permitido) | 1 | se está bloqueando el post-proceso |
| `settings get secure match_content_frame_rate` | **2** (ALWAYS) | 0 | el sistema no intentará encajar cadencia |
| `dumpsys package com.ape.crystalagent \| grep granted` | `WRITE_SECURE_SETTINGS: granted=true` | `false` | la APK no puede aplicar nada |
| idem | `SYSTEM_ALERT_WINDOW: granted=false` | `true` | ojo: con `true` se abre el camino de overlay |
| `getprop ro.soc.model` | lo que reporta el heartbeat | — | `AMLS905Y4` en el ONN |
| `dumpsys media.metrics \| grep judder-rate` | < 0,10 con la cadencia encajada | ≈0,99 | 98 % de fotogramas mal repartidos |

**Medición base real (60 Hz con contenido 50 fps):** `judder-rate 0,9948`, `framerate-actual 59,9988`, `frames-dropped 3/4626`.

---

## 6 · RUNBOOK de fallos conocidos

### F1 · El panel vuelve a 60 Hz solo
- **Síntoma:** el operador pone 4k@50 en Ajustes, abre la APK, y vuelve a 60.
- **Causa:** `Display4K.kt:21` hacía `maxByOrNull { it.refreshRate }` y fijaba siempre el mayor refresco.
- **Demostrado en 3 pasos:** Ajustes→50 (`mActiveModeId=125`) → abrir APK → 124 → cerrar → 125.
- **Estado:** **corregido en el repo** (`Display4K.kt` no toca nada si el panel ya está en 4K). **No recompilado.**
- **Test:** `tools/quality/test_display_cadence.js` 22/22, con control negativo.

### F2 · La clave de cadencia se escribe pero el panel no cambia
- **Síntoma:** `settings put global user_preferred_refresh_rate 50.0` persiste, `mActiveModeId` sigue en 124.
- **Causa:** DisplayManager no relee la clave. Solo la aplican la UI de Ajustes (uid system, `setUserPreferredDisplayMode`, `@SystemApi`) o el arranque.
- **Probado y descartado como trigger:** `cmd display set-user-preferred-display-mode` → `SecurityException`; `wm size` → no aplica.
- **Consecuencia:** el Shim puede **dictar** la cadencia, y se aplicará **en el próximo arranque** — no en vivo.

### F3 · Los efectos del player dan pantalla negra
- **Medido:** `effects=on` → 16.280 B de PNG (negro); `effects=off` → 1.694.782 B (vídeo real).
- **Causa:** la cadena `CrystalGlEffect` no entrega frames en este device.
- **Estado:** opt-in y declarado roto en `PlayerActivity.kt:32-42`.

### F4 · El VPP nunca llega al device
- **Síntoma:** `pq_ai_sr_enable = null`.
- **Tres causas encadenadas:** GAP-04 (el puente está OFF por defecto) · GAP-03 (`ape_vpp` no viaja en el SSE) · **11 de las 13 claves no existen en este SoC** (medido).
- **Estado:** las tres documentadas; **en este aparato ninguna es reparable por configuración**.

### F5 · El `soc_gate` cierra sin decir por qué
- **Síntoma:** `allowed=false`, ningún error en el device.
- **Causa real:** el heartbeat mandaba `caps.soc = 'AMLS905Y4'` (crudo) y el gate compara en seco contra `[mt8696, amlogic, s905x4, s905x3]`. El APK **ya tenía** el mapa `SOC_ALIASES` con `amls905y4 → amlogic`, pero `socName()` no lo usaba.
- **Estado:** **corregido** (`socName()` devuelve `canonicalSoc(raw) ?: raw`). Test `test_soc_normalization.js` 31/31 + gate `check_soc_vocabulary.js` 10/10.

### F6 · `/api/health` da 404
- **Causa:** `tools/cicd/vps_deploy_map.json` apunta `health_url` a `/api/health`; la ruta viva es `/api/health.php` (200).
- **Estado:** corregir el mapa, no el servidor.

### F7 · Al elegir 4K, la imagen se ve GIGANTE
- **Síntoma reportado:** «cuando escojo 4K, la imagen queda grandísima».
- **Causa medida:** `Override density: 640` sobre una densidad nativa de **320**. Es un ×2 de la interfaz. Se apila con una composición forzada a 1080p sobre panel 4K (otro ×2).
- **Origen:** **provocado en esta sesión.** Dejé puesta `display_size_forced=1920x1080` (de fábrica viene `null`) y apareció un override de densidad que no estaba. **No puedo probar quién puso el 640** — ejecuté `wm density` sólo para leerla, pero escribí `wm size` varias veces y una secuencia pudo disparar compensación del framework. Se declara así.
- **Arreglo, en este orden:**
  ```bash
  adb shell 'settings delete global display_size_forced'
  adb shell 'settings delete secure display_density_forced'
  adb shell 'wm density reset'
  adb shell 'wm size reset'
  ```
- **Verificación:** `powershell -File tools/probe/check_display_state.ps1` → debe dar `LIMPIO` con exit 0.
- **Prevención — regla de operación:** **toda prueba de pantalla o densidad se revierte en el MISMO bloque de comandos que la aplica.** Nunca queda pendiente entre turnos. El aparato del operador no es un entorno de pruebas.
- **Estado:** **CERRADO** — aparato verificado en baseline por la herramienta.

### Herramienta de guardia: `check_display_state.ps1`

Se corre **antes y después** de cualquier prueba que toque `wm size`, `wm density`,
`display_size_forced`, `display_density_forced` o el modo de display.

```bash
powershell -File tools/probe/check_display_state.ps1        # solo verifica, exit 0/1
powershell -File tools/probe/check_display_state.ps1 -Fix   # revierte lo desviado
```

Comprueba 9 cosas contra baseline y nombra el comando exacto de reversión de cada desvío.
**Con `-Fix` solo revierte las dos claves de geometría y los overrides de `wm`; no toca nada más.**

---

## 7 · Huecos abiertos y qué evidencia falta

| # | Hueco | Evidencia que falta |
|---|---|---|
| 1 | `Display4K` corregido pero no desplegado | recompilar, firmar con la clave del publicador, instalar, repetir el A/B de 3 pasos |
| 2 | `socName()` canónico no desplegado | idem; luego un heartbeat y leer `caps.soc` en el VPS |
| 3 | `ai_sr` se reporta pero no se ha visto llegar | un heartbeat con la build nueva y leer `ara_heartbeats.caps_json` |
| 4 | Selección de variante (FIX 3) no desplegada | `luac -p` + `nginx -t` + canary + diff antes/después del master |
| 5 | `judder-rate` a 50 Hz nunca medido con contenido | poner un canal y leer `dumpsys media.metrics` |
| 6 | Vía Amlogic (`tvserver`/`amvecm`) no alcanzable | módulo VPP cargado + SELinux permisivo, o firmware distinto |
| 7 | `IColorDisplayManager` (saturación por app) bloqueado | APK con `CONTROL_DISPLAY_COLOR_TRANSFORMS` (privilegio de sistema) |

---

## 8 · Checklist de cierre

Para saber si el sistema está sano, en orden:

1. `node tools/check_anti_degradation_policy.js` → 8/8 · `check_crystal_4k_law.js` → 5/5 · `check_crystal_6k_law.js` → 6/6
2. `node tools/quality/test_display_cadence.js` → 22/22
3. `node tools/quality/test_variant_select.js` → 37/37
4. `node tools/quality/test_caps_contract.js` → 15/15
5. `node tools/quality/check_soc_vocabulary.js` → 10/10
6. `node tools/quality/test_soc_normalization.js` → 31/31
7. En el device: `mActiveModeId` coincide con la cadencia del contenido
8. En el device: `hdr_conversion_mode=1` (global), `minimal_post_processing_allowed=0` (secure), `WRITE_SECURE_SETTINGS=granted`
9. Un canal reproduciendo, `judder-rate < 0,10`

**Los nueve en verde = sistema sano.** El 9 es el único que mide lo que el operador ve, y hoy **no se ha medido** (falta que haya un canal puesto en el panel a 50 Hz).

---

## 9 · Lo que este workflow deja claro, y conviene no olvidar

- **El VPS no mejora píxeles.** Reescribe texto. Es lo que el reproductor obedece, y ahí está su valor.
- **La APK no procesa los fotogramas de OTT.** Aplica ajustes del sistema. Eso sí llega, y es de milisegundos.
- **La lista declara mucho más de lo que pide.** ~671 directivas por canal, y el reproductor ignora casi todas.
- **En este SoC, el VPP no tiene sustrato.** 11 de 13 claves no existen. No es configuración pendiente; es ausencia.
- **La cadencia sí funciona, y estaba rota por una línea.** Es la mejora más barata y más real disponible hoy.
