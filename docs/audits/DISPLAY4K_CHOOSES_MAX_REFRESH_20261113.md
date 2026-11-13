# `Display4K.kt` elige 60 Hz por ser el máximo, no por encajar con el contenido · 2026-11-13

**Qué se encontró:** midiendo judder en vivo (98,1–99,8 % de fotogramas) y trazando hacia atrás, la lógica que elige el modo de pantalla en la APK tiene un defecto de criterio.

## El código

`IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/app/src/main/java/com/ape/crystalagent/Display4K.kt`

```kotlin
L19: val best = modes
L20:     .filter { it.physicalWidth >= 3840 && it.physicalHeight >= 2160 }
L21:     .maxByOrNull { it.refreshRate }         // ← elige la cadencia MÁXIMA
L22: if (best == null) { ... no hay 4K ... }
L27: val lp = activity.window.attributes
L28: lp.preferredDisplayModeId = best.modeId     // ← la fuerza en la ventana
L29: activity.window.attributes = lp
```

**`maxByOrNull { it.refreshRate }`** filtra por resolución y luego se queda con el **mayor refresco**. Para 4K en este panel eso es `60.000004 Hz` (modo 124).

**La cadencia del contenido no entra en la decisión.** El comentario de cabecera dice *«Intenta fijar la ventana en 3840x2160@<=60 si el TV/HDMI lo soporta»* — ya reconoce que 60 es un techo, pero se usa como objetivo.

## Consecuencia aritmética

| Contenido (medido en el catálogo) | En 60 Hz | En el modo que le corresponde |
|---|---|---|
| **25 fps** (6 de 7 canales medidos) | 60/25 = **2,4** → irregular | 50 Hz → **2,0 exacto** |
| **50 fps** | 60/50 = **1,2** → irregular | 50 Hz → **1,0 exacto** |
| 23,976 fps | 2,503 → irregular | 23,976 Hz → 1,0 exacto |

## Alcance real, medido — y aquí hay que ser preciso

**`Display4K.apply(this)` se llama SOLO desde las actividades de la propia APK:**

```
MainActivity.kt:48    Display4K.apply(this)
PlayerActivity.kt:25  Display4K.apply(this)
```

Y `preferredDisplayModeId` es **por ventana** desde Android 11.

**Por tanto:**

| Afirmación | Estado |
|---|---|
| `Display4K` elige 60 Hz en vez de encajar con el contenido | **CIERTO** (L21, leído) |
| Eso causa el judder que el operador ve **en OTT Navigator** | **FALSO** — OTT corre en su ventana; lo que la APK fije en la suya no le afecta |
| El modo del **sistema** lo pone la APK | **NO ENCONTRADO** — no hay llamada a `DisplayManager`/`setUserPreferredDisplayMode` sobre el sistema; solo `ScreenCaptureService` usa `DisplayManager` para un display virtual |

**El judder que se mide viene del modo del SISTEMA** (`mActiveModeId=124`, 4K@60), que es además el `mDefaultModeId` del panel. La APK no lo controla hoy.

## Pero el defecto importa, por dos razones

1. **Si el operador usa el reproductor propio de la APK**, `Display4K` le pondría **también** 60 Hz. El mismo judder, en el player que sí controlamos.
2. **La APK tiene el mecanismo para arreglarlo en todo el sistema**: su almacenamiento privado contiene `files/adbkey` (verificado, 1.703 B). Es decir, **la APK puede hablar ADB con este mismo aparato** y ejecutar `cmd display set-user-preferred-display-mode <w> <h> <fps>` por canal.

## La corrección propuesta

**En `Display4K.kt`:** elegir el modo cuyo refresco sea **múltiplo entero exacto** de la cadencia del contenido, y entre los que empatan, la mayor resolución.

```
entrada: contentFps  (25, 50, 30, 60, 23.976, 24...)
candidatos = modos con width>=3840 y height>=2160
exactos    = candidatos donde (refreshRate / contentFps) es entero (±0,001)
best       = si hay exactos: el de MAYOR resolución entre ellos
             si no: el actual (mayor refresco) y registrar fallback_reason
```

**En el sistema (para OTT Navigator y TiviMate):** fijar el modo por canal mediante el ADB propio de la APK, al abrir y al cerrar el canal. Requiere autorización explícita, porque cambia configuración del dispositivo del usuario.

## Lo que esto NO es

- **No es un cambio aplicado.** Ni compilado ni desplegado.
- **No es un arreglo del judder actual del operador.** Ese sigue ahí hasta que se cambie el modo del sistema (una línea de ADB) o se implemente lo anterior.
- **No autoriza tocar el dispositivo.** Es una propuesta técnica con su evidencia.

## Cómo sabremos si funciona

Métrica: **`judder-rate`** del códec, que el sistema ya publica (`dumpsys media.metrics`).

- **Línea base medida:** 0,981 – 0,998 en el canal 4K a 50 fps con salida a 60 Hz.
- **Objetivo:** < 0,05 en un canal de 25 fps con el panel a 50 Hz.
- **Falsación:** si tras fijar 50 Hz el `judder-rate` **no** baja de 0,1, la hipótesis es falsa y el judder viene de otra parte — y entonces el problema es mi instrumento, no la cadencia.

Esa es una prueba que se puede correr en un minuto y que puede **refutar** todo lo anterior. Es lo que la hace útil.
