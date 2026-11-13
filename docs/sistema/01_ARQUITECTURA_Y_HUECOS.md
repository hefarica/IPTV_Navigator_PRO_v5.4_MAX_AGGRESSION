# ARQUITECTURA REAL DEL SISTEMA APE Y LOS TRES HUECOS QUE IMPIDEN QUE LA IMAGEN LLEGUE AL TELEVISOR

**Fecha:** 2026-11-13 · **Fuente de la arquitectura:** el operador · **Método:** ingeniería inversa del árbol, cada afirmación con su artefacto.

> **Corrección de un diagnóstico anterior mío:** dije que «las claves `pq_*` son de MediaTek y tu ONN es Amlogic, por eso están en null». **El razonamiento era falso.** El `soc_gate` del repo incluye `amlogic` **a propósito** en `default_allow`. El motivo real de los `null` está más abajo, en GAP-03 y GAP-04.

---

## 1 · Hay DOS canales para llevar la mejora al dispositivo

El operador lo describió así y el árbol lo confirma. No son alternativas: son simultáneos y complementarios.

### Canal 1 — la lista/manifiesto (cadencia del segmento HLS)

```
generador  ->  lista .m3u8 cuyas URIs son endpoints del VPS
           ->  OTT Navigator pide el manifiesto
           ->  nginx + Lua REESCRIBE la metadata en cada recarga
               (headers, tags EXT-X-APE-*, STREAM-INF, RESOLUTION)
           ->  el player recibe los ajustes EN TIEMPO REAL por esa vía
```

**Evidencia:** 141 ficheros `.lua` en el árbol, de los cuales **reescriben metadata** `_vps_stage/edge/*/ape_uhd.lua`, `ape_luatest.lua`, `ape_obs_metrics.lua`, `ape_rebase_lib.lua` (tocan `EXTHTTP`, `EXT-X-APE-*`, `STREAM-INF`).

**Cadencia real del bucle:** la del segmento (segundos). Lo que es de milisegundos es **aplicar** un ajuste ya recibido, no el ciclo.

### Canal 2 — los `device_settings` (aplicación inmediata, < 5 ms)

```
productor PHP  (ape_pq_settings_for_ct | ape_pq_profile | ape_mesh_device_settings)
transporte     (SSE ape-feedforward-stream.php | HTTP one-shot ape-feedforward.php | bus policy_deltas)
consumidor VPS (ape_ff_device_settings_from_delta, si hay policy_delta vigente)
entrega APK    (para_keys device_settings[] del evento SSE 'presets')
SettingsApplier (allowlist key -> regex valor -> try-both-ns -> putString)
SoC            (el VPP aplica el efecto sobre el frame decodificado)
```

**Fuente literal:** `ara-x/spec/actuator_allowlist.json:79`, campo `delivery_chain`, con esta nota:

> *«Cadena REAL de un lever, tal como está hoy en el repo. **Cualquier capa que falte rompe el actuador completo.**»*

### Canal 3 — la medición (ottshim / SessionTap)

Mide velocidad de red e imagen y lo reporta al VPS por endpoint. Con eso el VPS gobierna el **buffer agresivo**: arranque lo más rápido posible, sin que se agote cuando QoE/QoS lo exige.

---

## 2 · El vocabulario real del VPP: los 13 levers

Extraídos de `ara-x/spec/actuator_allowlist.json` → `settings_allowlist.vpp_levers.keys`:

```
pq_ai_sr_enable          ai_sr_level              ai_pq_mode
aipq_enable              pq_sharpness_enable      pq_ai_dnr_enable
pq_dnr_enable            pq_nr_enable             pq_ai_fbc_enable
pq_hdr_enable            pq_hdr_mode
match_content_frame_rate
minimal_post_processing_allowed
```

**Esto es la mejora de imagen real del sistema.** Super-resolution por IA, denoise, sharpen, HDR, frame-accounting. Y actúa **sobre el frame decodificado, cualquier player** — es lo que el operador llama VPP.

**Comparación con lo que la APK tiene en su allowlist propia** (`SettingsCatalog.kt`, 13 claves pero OTRAS):

| En `SettingsCatalog` (APK) | En `vpp_levers` (VPS) |
|---|---|
| `match_content_frame_rate` | **sí** |
| `minimal_post_processing_allowed` | **sí** |
| `hdr_conversion_mode`, `user_preferred_refresh_rate`, resolución, audio… | **no** |
| — | **los 11 `pq_*` / `ai_*` NO están en la allowlist de la APK** |

**Segundo bloqueo estructural:** aunque el bloque `ape_vpp` viajara, la APK **rechazaría por allowlist** 11 de los 13 levers. `SettingsApplier` no escribe lo que no está en `SettingsCatalog` (`SettingsCatalog.kt:33` `isKnown`, y el rechazo se loggea).

---

## 3 · Los tres huecos que impiden que la imagen llegue

Todos documentados en `ara-x/spec/actuator_allowlist.json` → `open_gaps`, severidad **high**.

### GAP-04 — el puente está apagado por defecto

> *«Los 13 levers VPP sólo llegan al APK con `APE_4K_BRIDGE_ENABLED=1` (**default OFF**): **en producción se aplican 3 filas, no 14.**»*
> **fix declarado:** *«Decisión explícita de encender el puente + canary; hoy es un flag invisible.»*

**Evidencia:** `IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/ape-feedforward-stream.php:95` — `getenv('APE_4K_BRIDGE_ENABLED') === '1'`. Y el comentario de la línea 92: *«que el APK aplique los 13 levers VPP (**hoy 2**). Flag-gated»*.

### GAP-03 — el bloque `ape_vpp` no viaja en el SSE

> *«El bloque `ape_vpp` **NO viaja** en el SSE que consume el APK; `AraStatus.vppAllowed` queda siempre `null` en la ruta real.»*
> **dónde:** `ape-feedforward-stream.php:89-129` y `AgentService.kt:69-72`.

**Consecuencia medida:** `pq_ai_sr_enable = null` en el ONN no significa «el chip no lo tiene». Significa **que nunca se envió**.

### GAP-01 / GAP-02 — el gate de SoC usa igualdad exacta

```json
"default_allow": ["mt8696", "amlogic", "s905x4", "s905x3"],
"matching": "igualdad EXACTA tras strtolower+trim. Sin normalización, sin prefijos, sin guiones, sin subcadenas."
```

`amlogic` **sí** está permitido. Pero un SoC reportado como `amlogic_s905x4` (GAP-01) o `amlogic-s905x4` (GAP-02) **no casa** y la política queda `allowed=false` sin explicación. El SoC lo escribe el heartbeat del APK desde `Build.SOC_MODEL` (SDK>=31) o `Build.HARDWARE`.

---

## 4 · Lo que SÍ funciona hoy, verificado

| Componente | Estado | Evidencia |
|---|---|---|
| `SettingsApplier` escribe ajustes del sistema | **VERIFIED** | `WRITE_SECURE_SETTINGS: granted=true` en el aparato |
| El bucle Canary→device llegó al menos una vez | **VERIFIED** | `hdr_conversion_mode=1` (PASSTHROUGH) puesto y medido |
| Cadencia del panel conmutable | **VERIFIED** | Ajustes del TV → 50 Hz → `mActiveModeId=125`, `renderFrameRate 50.0` |
| `Display4K` revierte la cadencia | **VERIFIED (demostrado)** | Abrir la APK → 124; cerrarla → 125. Tres pasos repetibles |
| Los 13 levers VPP llegan al APK | **NO** | GAP-03 + GAP-04 + allowlist de la APK |

## 5 · La cadena de arreglo, en orden

1. **Añadir `ape_vpp` al payload del SSE** (`ape-feedforward-stream.php:89-129`) — cierra GAP-03.
2. **Encender `APE_4K_BRIDGE_ENABLED=1`** con canary y ventana — cierra GAP-04. Es una decisión del operador, no un cambio silencioso.
3. **Añadir los 11 levers `pq_*`/`ai_*` a `SettingsCatalog.kt`** — sin esto, aunque lleguen, la APK los rechaza.
4. **Normalizar el vocabulario de SoC** (`amlogic`, `s905x4` sin guiones) — cierra GAP-01/02.
5. **Arreglar `Display4K.kt:21`** para que no pise la cadencia elegida.

**Nada de esto está aplicado.** Los cinco son cambios de código, y 2 y 3 tocan lo que se escribe en el televisor del operador: exigen su autorización explícita por canal y con rollback.
