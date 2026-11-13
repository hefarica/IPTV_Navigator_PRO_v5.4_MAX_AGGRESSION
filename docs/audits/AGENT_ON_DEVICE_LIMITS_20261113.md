# Qué puede y qué no puede hacer el agente sobre OTT Navigator · 2026-11-13

**Contexto:** el operador corrigió el modelo. La APK **no es un reproductor**: es el agente que debe llevar el Canary del VPS a OTT Navigator / TiviMate y mejorar la imagen de fondo en tiempo real. Este documento mide qué de eso existe de verdad en el ONN 4K.

## 1 · La captura de pantalla MIDE, no mejora

`ScreenCaptureService.kt`, comentario de cabecera:

```kotlin
/**
 * Captura de display con consentimiento (MediaProjection). MIDE el frame compuesto,
 * no el buffer privado de ExoPlayer de otra app. No usa root, DRM ni hooks.
 */
```

Y las variables que actualiza: `lastLuma`, `frames`, `freezeMs`, `stalls` — **telemetría de congelaciones**, no procesamiento. La captura del frame compuesto sirve para detectar freezes, no para mejorarlo.

## 2 · Los efectos del propio player dan pantalla negra — medido, en el código

`PlayerActivity.kt:32-42`:

```kotlin
/* MEDIDO EN EL ONN 4K (2026-11-08) — A/B con captura de pantalla:
 *   effects=on  -> 16.280 B de PNG  = PANTALLA NEGRA
 *   effects=off -> 1.694.782 B      = video real
 * La cadena CrystalGlEffect NO entrega frames en este device.
 * Hasta que se arregle, los efectos quedan OPT-IN y se sabe roto. */
```

**Esto es del propio autor del código, medido en este aparato.** No es una sospecha.

## 3 · Las claves PQ del SoC no existen en Amlogic

Los ajustes que la doctrina AI-PQ usa son de **MediaTek**:

```
pq_ai_sr_enable=null   ai_sr_level=null      ai_pq_mode=null     ai_pic_mode=null
pq_sharpness_enable=null   pq_dnr_enable=null   pq_memc_enable=null   ... los 13 en null
```

Y `SettingsCatalog.kt` de la APK solo contiene claves **HDR**:

```
hdr_conversion_mode · hdr_force_conversion_type ·
are_user_disabled_hdr_formats_allowed · user_disabled_hdr_formats
```

Valores actuales — correctos: `hdr_conversion_mode=1` (PASSTHROUGH), `user_disabled_hdr_formats` vacío.

## 4 · El modo de pantalla tampoco se puede fijar por ADB

```
cmd display set-user-preferred-display-mode 3840 2160 50.0
 -> SecurityException: Package android does not belong to 2000
    at SettingsProvider.mutateGlobalSetting
    at DisplayManagerService.setUserPreferredDisplayModeInternal

resultado: get-user-preferred-display-mode = 50.0   (la preferencia se escribe)
           mActiveModeId = 124                       (el panel NO cambia: sigue 60 Hz)
```

**Estado inconsistente y peligroso:** la preferencia dice una cosa y el panel hace otra. Se restauró a `3840 2160 60.000004` con `mActiveModeId=124` para no dejar un estado que mienta.

La vía que queda es **el menú de Ajustes del televisor** (corre como uid system) o una APK con privilegio.

## 5 · Lo que SÍ está activo y llega a OTT Navigator

**Capa 2 (VPS, metadata-only)**: variantes, perfiles, EXTHTTP, `/pulse/` con rebase. Eso sí funciona y es lo que el reproductor consume.

**Capa 3 (APK) hoy, sobre la imagen de OTT**: **nada**. No puede procesar sus fotogramas (Android prohíbe capturar el MediaCodec de otra app), los efectos GL están roto-medidos, y las claves de VPP del SoC no existen en este chip.

## 6 · La conclusión honesta

> **Activar el Canary sobre la imagen de OTT Navigator no tiene hoy una vía que funcione en este aparato.**

No es un fallo de configuración: son tres limitaciones independientes, cada una con su artefacto. Lo que queda es decidir el camino:

1. **Arreglar `CrystalGlEffect`** para que entregue frames — entonces los efectos funcionan en el player propio, no sobre OTT.
2. **Cambiar el modo de pantalla** desde los Ajustes del televisor (a mano) para el judder — no requiere la APK.
3. **Concentrar el trabajo en la Capa 2**: que el manifiesto haga que OTT elija la mejor variante. Eso sí llega.
