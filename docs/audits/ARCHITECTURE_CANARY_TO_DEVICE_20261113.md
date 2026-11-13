# ARQUITECTURA CANARY → DISPOSITIVO: cómo se aplican las correcciones en < 5 ms · 2026-11-13

**Documento de referencia. Esto es la pieza central del sistema y no debe perderse.**

Corrección del operador, que es la fuente: **`ScreenCaptureService` MIDE; `OTTShim` APLICA las correcciones en tiempo real en < 5 ms; eso es lo que el Canary computa y envía de vuelta.**

---

## 1 · El bucle completo, con los nombres reales del código

```
┌─────────────────────────────────────────────────────────────────┐
│ CANARY (VPS)                                                    │
│   computa la corrección por canal/device:                       │
│   device_settings = ["<ns> <key> <val>", ...]                   │
└────────────────────────────┬────────────────────────────────────┘
                             │  SSE  /ara/events
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ APK · SettingsApplier.kt    ← ESTE es el "OTTShim"              │
│                                                                 │
│   "APLICADOR PURO. Escribe el subconjunto de Android Settings    │
│    que el VPS dicta (device_settings). NO observa, NO cambia     │
│    canales, NO abre apps. Solo aplica lo que llega."             │
│                                                                 │
│   Valida contra SettingsCatalog (allowlist) + regex de valor.    │
│   Lo que no está en la lista se RECHAZA y se loggea.             │
└────────────────────────────┬────────────────────────────────────┘
                             │  Settings.Global / Settings.Secure
                             │  (WRITE_SECURE_SETTINGS)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ SISTEMA ANDROID                                                 │
│   aplica el ajuste → afecta a la imagen de CUALQUIER app        │
│   incluido OTT Navigator y TiviMate                             │
└─────────────────────────────────────────────────────────────────┘

En paralelo, de vuelta:
┌─────────────────────────────────────────────────────────────────┐
│ APK · ScreenCaptureService.kt   ← MIDE                          │
│   MediaProjection → ImageReader → measure(img) → close()        │
│   Calcula lastLuma, freezeMs, stalls.  NO procesa el frame.     │
│   Sirve de realimentación para que el Canary ajuste.            │
└─────────────────────────────────────────────────────────────────┘
```

**Por qué son < 5 ms:** el Shim no toca fotogramas. Escribe un ajuste. Una escritura de `Settings` son microsegundos; el sistema la aplica en el siguiente composición. Procesar un fotograma 4K serían 16-40 ms — **eso no es este camino**.

## 2 · Permisos concedidos, medidos en el ONN

```
android.permission.WRITE_SECURE_SETTINGS:  granted = TRUE    ← el aplicador PUEDE escribir
android.permission.SYSTEM_ALERT_WINDOW:    granted = FALSE   ← NO hay overlay
```

**Consecuencia dura:** `SYSTEM_ALERT_WINDOW = false` cierra definitivamente el camino de "capturar OTT, procesar y pintar encima". **El único camino vivo es escribir ajustes.** No es una limitación de diseño, es un permiso no concedido.

## 3 · El vocabulario del Shim — `SettingsCatalog.kt`, allowlist completa

```kotlin
"global" to setOf(
    "hdr_conversion_mode",                    // HDR: conversión entre tipos
    "hdr_force_conversion_type",
    "user_preferred_resolution_width",        // RESOLUCIÓN
    "user_preferred_resolution_height",       // RESOLUCIÓN
    "user_preferred_refresh_rate",            // CADENCIA
    "are_user_disabled_hdr_formats_allowed",
    "user_disabled_hdr_formats",
    "display_size_forced",
    "db_id_audio_drc_mode",                   // AUDIO
    "db_id_droidlogic_audio_digital_mode"
),
"secure" to setOf(
    "match_content_frame_rate",               // emparejamiento de cadencia
    "minimal_post_processing_allowed",        // ? — merece investigación
    "display_density_forced"
),
"system" to emptySet()
```

**13 claves.** Ese es el poder real del Canary sobre el dispositivo.

Desglose verificable: **10 en `global` + 3 en `secure` + 0 en `system` = 13**.
(Las cadenas `"global"`, `"secure"` y `"system"` de la izquierda son los nombres de namespace del mapa, **no** ajustes.)

## 4 · Lo que está VERIFICADO que funciona

**`hdr_conversion_mode = 1`** (PASSTHROUGH), medido en el aparato.

Ese valor es el VPS dictando y `SettingsApplier` aplicando. **El bucle completo funciona hoy.** No es una hipótesis: es un ajuste que está puesto en el dispositivo y salió de la política del Canary.

## 5 · Lo que está VERIFICADO que NO funciona, y por qué

**`user_preferred_refresh_rate` se escribe pero NO se aplica en caliente.**

Medido, paso a paso:

| Acción | Clave | Panel (`mActiveModeId`) |
|---|---|---|
| Settings UI → `4k (50 Hz)` | 50.0 | **125** (50 Hz) ✅ |
| `settings put user_preferred_refresh_rate 50.0` | 50.0 | 124 (60 Hz) ❌ no aplica |
| `cmd display set-user-preferred-display-mode` | 50.0 | 124 ❌ `SecurityException` |
| `settings put` + `wm size` (forzar reconfiguración) | 60.0 | 125 ❌ no aplica |
| APK abre su player (`Display4K`) | 50.0 | **124** ← fuerza 60 |

**La clave se escribe; DisplayManager no la relee.** Solo la aplican:
- la **UI de Ajustes** (uid system, llama a `setUserPreferredDisplayMode`, que es `@SystemApi`);
- el **arranque** (DisplayManager lee la clave al inicializar).

**Para el Shim esto significa: la cadencia se puede dictar, y se aplicará en el próximo arranque — pero no en vivo.** Aplicarla en vivo exige un privilegio de sistema que la APK no tiene.

## 6 · El agravante: `Display4K` deshace lo que el Shim ponga

`Display4K.kt:21` → `maxByOrNull { it.refreshRate }` → fuerza 60 Hz en la ventana del player de la APK.

**Demostrado en vivo, tres pasos:** panel a 50 Hz → abrir la APK → panel a 60 Hz → cerrar la APK → panel a 50 Hz.

Mientras eso siga así, **cualquier corrección de cadencia que el Canary dicte se pierde en cuanto la APK abra su reproductor.**

## 7 · Los tres huecos, en orden de valor

| # | Hueco | Qué cuesta cerrarlo |
|---|---|---|
| **1** | `Display4K` pisa la cadencia | Cambiar `maxByOrNull{refreshRate}` por "múltiplo entero exacto de la cadencia del contenido", o simplemente **no tocar nada si el usuario ya fijó un modo**. Una guarda. |
| **2** | La cadencia no se aplica en vivo desde el Shim | Necesita `setUserPreferredDisplayMode` (SystemApi). Alternativas: build con privilegio de sistema, o aceptar que aplica al arrancar. |
| **3** | El vocabulario son 13 claves y ninguna es nitidez/contraste/saturación | En este SoC (Amlogic) esas no están en `Settings`; son del `tvserver` del vendedor, no expuestas por binder público. |

## 8 · Lo que NO es este sistema (para no volver a confundirlo)

- **No** procesa fotogramas de OTT. `SYSTEM_ALERT_WINDOW=false` y Android lo prohíbe.
- **No** es el player. `UltraEnhancePipeline` procesa **solo** los fotogramas del ExoPlayer propio:
  > *«Procesar frames requiere que NUESTRO APK reproduzca el video (F3 ExoPlayer): Android NO permite capturar el MediaCodec de un player de terceros.»*
- **No** es el VPS tocando píxeles. El VPS computa ajustes; el dispositivo los aplica.

## 9 · Estado verificado del aparato al cerrar

```
panel:     mActiveModeId=125 · renderFrameRate 50.0     (4K @ 50 Hz, puesto desde Ajustes)
clave:     user_preferred_refresh_rate = 50.0           (coherente con el panel)
HDR:       hdr_conversion_mode = 1 (PASSTHROUGH)
permisos:  WRITE_SECURE_SETTINGS=true · SYSTEM_ALERT_WINDOW=false
APK:       3.9.9-host-plus-rea-657
```
