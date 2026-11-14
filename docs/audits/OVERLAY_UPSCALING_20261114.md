# LOGO DE UPSCALING ENCIMA DE OTT NAVIGATOR — ESTADO MEDIDO (2026-11-14)

**Autor:** http-prober (equipo canary-jit-20261111) · **Tarea:** t49
**Device:** ONN 4K GTV · `192.168.1.3:5555` · conectado.
**Player objetivo:** `studio.scillarium.ottnavigator` — **y solo ese**.

---

## 0. VEREDICTO EN UNA LINEA

> **NO LOGRADO con el APK instalado.** El APK de ARA **no contiene ningun logo ni indicador de upscaling**: cero clases, cero recursos, cero literales `upscaling`/`UPSCALING`. Lo que si existe es **el vehiculo** (permiso de overlay + `AccessibilityService` + una vista `PrivacyOverlayView` con `TYPE_ACCESSIBILITY_OVERLAY`), pero **no el contenido**.
> **No se puede dibujar ese logo sin recompilar ARA o sin instalar un segundo APK que solo dibuje el badge.** La captura adjunta —con OTT en foco— **NO muestra el logo y por tanto NO es exito**; se incluye como prueba del estado real, no como resultado.

---

## 1. RESTRICCIONES DEL OPERADOR — CUMPLIMIENTO

| Restriccion | Cumplimiento |
|---|---|
| Reproductor = OTT Navigator, solo ese | **SI.** Nunca se cambio de player. `mCurrentFocus` verificado en OTT antes de la captura |
| PROHIBIDO lanzar `com.ape.rea.ReaExternalPlayerActivity` | **SI.** Cero `am start` de actividades de ARA. No se lanzo ningun player |
| PROHIBIDO degradar imagen | **SI.** No se toco `wm size`, ni `display_mode_*`, ni settings de imagen. La degradacion existente se **reporta** (§6), no se empeora |
| adb para LEER y disparar intents | **SI.** Solo lecturas (`dumpsys`, `pm path`, `pull`, `screencap`, `appops query-op`) y **cero** broadcasts disparados (ver §9) |
| No desinstalar / no borrar datos / no cambiar el APK | **SI.** Cero `pm uninstall`, cero `pm clear`, cero instalacion |
| Anotar rollback de cambios de settings | **SI.** No hubo ningun cambio; rollback = no-op (§8) |

---

## 2. IDENTIDAD: LO QUE ANALICE ES LO QUE CORRE

| Comprobacion | Resultado |
|---|---|
| Paquete en device | `com.ape.crystalagent` · `versionCode=651` · `versionName=3.9.5-adb-firetv-shim` · `lastUpdateTime=2026-11-13 23:39:30` |
| APK instalado (pull, solo lectura) | `base.apk` · **25.678.434 B** · `sha256 8d3b145811c0bab3a10952329a81cadc477b08bd365b70f173cfe34ff52aa6e4` |
| `artifacts\ara_agent.apk` (local) | 25.678.434 B · `sha256 8d3b145811c0bab3a10952329a81cadc477b08bd365b70f173cfe34ff52aa6e4` |
| ¿Son el mismo binario? | **SI, byte-identicos.** El analisis estatico de abajo corresponde exactamente a lo instalado |

Local del pull: `scratch\t49_overlay_20261114\installed_base.apk`.

**Correccion al brief:** el brief citaba `wc 651` correctamente, pero conviene fijar que el artefacto local **coincide** — sin esto, el grep del dex no probaria nada sobre el device.

---

## 3. BUSQUEDA EN EL DEX (evidencia del "no existe")

Escaneo del **contenido descomprimido** de los `.dex` (metodo obligatorio de `docs/policies/SECRETS_IN_BINARIES.md`; un `grep` sobre el `.apk` daria 0 por deflate).

| Aguja | Ocurrencias | Lectura |
|---|---|---|
| `TYPE_ACCESSIBILITY_OVERLAY` | **1** | Presente en el **pool de constantes**, rodeada de `TYPE_AD`, `TYPE_ALAW`, `TYPE_ANNOUNCEMENT`, `TYPE_APPLICATION`… (orden alfabetico de la tabla). **No prueba que la app la use** (§5) |
| `WindowManager` | 7 | Hay manipulacion de ventanas |
| `addView` | 7 | Se anaden vistas |
| `LayoutParams` | 39 | Parametros de ventana |
| `AccessibilityService` | 12 | Servicio real |
| `AraAccessibilityService` | 5 | Servicio real y habilitado |
| `overlay` (case-insensitive) | 37 | Casi todo del **nombre de clase `PrivacyOverlayView`** y de la libreria media3/ExoPlayer |
| `PrivacyOverlayView` | clase completa + `$Companion` + lambdas | **Unica vista de overlay propia del APK** |
| **`upscaling` / `UPSCALING` / `ape_upscaling` / `APE · UPSCALING`** | **0 / 0 / 0 / 0** | **No existe ningun texto de upscaling en el APK** |
| Recursos `res/` con `badge|logo|upscal|hud|overlay` | solo `exo_edit_mode_logo.*` (logo de ExoPlayer) | **No hay ningun asset de badge** |

**Clases propias del APK (212 en `com.ape.crystalagent`)** — las unicas relevantes a imagen/ventana:
`PrivacyOverlayView`, `ApeUltraEnhanceGlEffect`, `GlslEnhancePipeline`, `LcevcSyntheticPipeline`, `UltraEnhancePipeline`, `ImageEnhancer`, `Display4K`, `WindowFormat`, `SettingsApplier`, `AraAccessibilityService`.

**No existe** ninguna clase tipo `OverlayBadge`, `UpscaleBadge`, `HudView`, `LogoOverlay` ni equivalente.

**Conclusion de §3:** el APK **no tiene** el logo de upscaling. No es que "exista y no se dispare": **no existe**.

---

## 4. LO QUE SI EXISTE (el vehiculo, medido en el device)

| Pieza | Estado medido |
|---|---|
| `SYSTEM_ALERT_WINDOW` | Declarado en manifest (`uses-permission`) y **concedido**: `com.ape.crystalagent` aparece en `appops query-op SYSTEM_ALERT_WINDOW allow` |
| `AraAccessibilityService` | `service ... exported=true` + `BIND_ACCESSIBILITY_SERVICE`; **habilitado** (confirmado por el capitan, `accessibility_enabled=1`) |
| Su config (`res/xml/ara_accessibility.xml`, 552 B) | `accessibilityEventTypes=0x20` (**TYPE_WINDOW_STATE_CHANGED**), `feedbackType=0x10`, `notificationTimeout=100`, `accessibilityFlags=0x1` (**flagDefault**), **`canRetrieveWindowContent=false`** |
| `PrivacyOverlayView` | Existe como clase. Literales asociados: `privacy=`, `applyPrivacy`, `accessibilityFlags`… |
| `WRITE_SECURE_SETTINGS` | Declarado (permite `SettingsApplier`, no un overlay) |

**Lectura tecnica:** con `canRetrieveWindowContent=false` el servicio **no puede leer el contenido** de OTT — irrelevante para un badge (solo necesita saber que ventana esta en foco), pero **si fuera necesario saber canal/resolucion desde OTT, no podria**. `TYPE_WINDOW_STATE_CHANGED` es justo el evento que permitiria mostrar/ocultar el badge al entrar/salir de OTT.

**Lo que falta no es permiso: es la vista y su contenido.**

---

## 5. LO NO COMPUTADO DE ESTA SECCION (con su razon)

| Item | Razon |
|---|---|
| A que metodo concreto pertenece la unica ocurrencia de `TYPE_ACCESSIBILITY_OVERLAY` | No hay decompilador disponible en este host (`jadx`/`baksmali` no instalados). El string esta en el pool de constantes, no puedo atribuirlo a un call site. **NO COMPUTADO** |
| Si `PrivacyOverlayView` es alcanzable sin abrir la UI de ARA (broadcast/preferencia) | Existe el literal `privacy=` y hay `ZapReceiver`/`AbTestReceiver` exportados con acciones `com.ape.crystalagent.ZAP` y `.AB`, pero **no dispare ninguno**: `.ZAP` puede cambiar de canal y el encargo prohibe romper nada. **NO COMPUTADO** |
| Si el panel entrega realmente 4K | El capitan midio `4K UHD: OFF`. No re-mido el panel. **NO COMPUTADO** |

---

## 6. CAPTURA (honesta: sin logo, luego NO es exito)

| Campo | Valor |
|---|---|
| Fichero | `scratch\t49_overlay_20261114\baseline_ott_in_focus.png` |
| Tamano | 111.270 B · **1920x1080 px** |
| sha256 | `69221034a79443bdebecc53de57fe6c9082755574442d8488b4cd7e90de338d3` |
| Foco en el momento de la captura | `mCurrentFocus=Window{85dd78 u0 studio.scillarium.ottnavigator/studio.scillarium.ottnavigator.MainActivity}` |
| Contenido | UI de OTT Navigator con el aviso **"Ha ocurrido un error"** y la barra de informacion del canal `HISTORY HD` / *Pawn Stars*. **SIN logo de upscaling** |

**Esta captura NO demuestra el pedido.** Se incluye como evidencia del estado real y del foco correcto. **No hay ninguna captura con logo porque el mecanismo para dibujarlo no esta en el APK.**

*Nota de honestidad:* una sonda posterior de foco devolvio `mCurrentFocus=null` (pantalla en reposo o cambio de actividad). El foco `studio.scillarium.ottnavigator/...MainActivity` esta verificado **en el instante de la captura**, que es lo que importa para esta evidencia.

### 6.1 Degradacion de imagen — REPORTADA, NO EMPEORADA

```
Physical size: 3840x2160      <- panel
Override size: 1920x1080      <- override activo (degrada el superficie a FHD)
display_mode_resolution = 2160
```

**Hallazgo:** el device tiene `display_mode_resolution=2160` (lo que el capitan dejo aplicado) pero **`wm size` mantiene un Override a 1920x1080**. El override gana: la UI se compone a 1080p sobre un panel 4K. Es exactamente la degradacion que el operador prohibe. **No la toque.** Rollback (para cuando el operador lo autorice, **no ejecutado**):

```bash
adb -s 192.168.1.3:5555 shell wm size reset      # elimina el Override; vuelve a 3840x2160
```

---

## 7. LA VIA MAS CORTA SIN RECOMPILAR EL APK

> Aviso de precision: **no existe** ninguna via que use el APK actual de ARA, porque el logo no esta en el binario. Las dos vias reales son:

### 7.1 CAMINO A (recomendado) — APK "badge" aparte, sin tocar ARA

Un APK minimo que **solo dibuja** el badge. **No recompila ARA, no lanza su player, no toca la imagen, no desinstala nada.** Convive con OTT (que sigue en foco y reproduciendo).

Coste: ~60 lineas. Requiere **instalar un APK nuevo** → decision del operador (§9).

`AndroidManifest.xml`
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.ape.badge">
  <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>
  <application android:label="APE Badge">
    <activity android:name=".BadgeActivity" android:exported="true">
      <intent-filter><action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/></intent-filter>
    </activity>
  </application>
</manifest>
```

`BadgeActivity.kt` (nucleo)
```kotlin
class BadgeActivity : Activity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        if (!Settings.canDrawOverlays(this)) {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName"))); finish(); return
        }
        val wm = getSystemService(WindowManager::class.java)
        val tv = TextView(this).apply {
            text = "4K ↑ UPSCALED"                      // contenido a decidir por el operador
            setTextColor(Color.WHITE); textSize = 18f
            setBackgroundColor(Color.parseColor("#99000000"))
            setPadding(24, 8, 24, 8)
        }
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,   // API>=26 (este device es API 34)
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.TOP or Gravity.END; x = 32; y = 32 }
        wm.addView(tv, lp)
        finish()   // la vista persiste: el proceso se mantiene por el window token
    }
}
```

**Por que este camino respeta las reglas:** el player sigue siendo OTT · no se ejecuta `ReaExternalPlayerActivity` · no se cambia resolucion ni filtro alguno · no se modifica el APK de ARA.

**Lo que hay que decidir antes de construirlo:** (a) que dice el badge (`4K ↑`, `UPSCALED`, `APE`), (b) si debe aparecer solo cuando OTT esta en foco (necesita un `AccessibilityService` o `UsageStats`, que **ya** esta concedido `PACKAGE_USAGE_STATS`), (c) si se oculta con el mando (hoy `FLAG_NOT_TOUCHABLE` = no roba foco, que es lo deseable para no romper la navegacion de OTT).

### 7.2 CAMINO B — recompilar ARA (el que NO se puede evitar si el logo debe ser "de ARA")

Punto de enganche exacto, reutilizando lo que ya esta compilado:
- **Clase nueva** `UpscaleBadgeOverlay` (patron copiable de `PrivacyOverlayView`), anadida desde `AraAccessibilityService.onAccessibilityEvent` — el servicio ya recibe `TYPE_WINDOW_STATE_CHANGED` y `accessibilityEventTypes=0x20` ya lo incluye.
- Mostrar solo si `event.packageName == "studio.scillarium.ottnavigator"`.
- Tipo de ventana: `TYPE_ACCESSIBILITY_OVERLAY` (el servicio lo permite) o `TYPE_APPLICATION_OVERLAY` (ya hay `SYSTEM_ALERT_WINDOW`).

### 7.3 CAMINO C — senal sin logo, sin instalar nada

OTT Navigator tiene su propio OSD de informacion de stream. Serviria como "senal de calidad" pero **no es un logo de upscaling APE**. No inspeccione su APK para confirmar si admite watermark propio → **NO COMPUTADO**.

---

## 8. ROLLBACK DE MIS CAMBIOS

**No hubo cambios de estado.** Solo lecturas y un `pull` (copia local). Inventario:

| Accion | Efecto en el device |
|---|---|
| `adb pull base.apk` | ninguno (solo lectura) |
| `dumpsys`, `pm path`, `appops query-op`, `wm size`, `getprop` | ninguno |
| `adb exec-out screencap -p` | ninguno |
| `am broadcast` / `am start` / `settings put` / `pm install` | **CERO ejecutados** |

**Rollback: nada que revertir.** La unica deuda pendiente es la degradacion preexistente de §6.1, que no es mia y no toque.

---

## 9. POR QUE NO DISPARE LOS BROADCASTS EXPORTADOS

`ZapReceiver` (accion `com.ape.crystalagent.ZAP`) y `AbTestReceiver` (`.AB`) estan exportados y podria lanzarlos. **No lo hice**: `.ZAP` es el beacon de zapeo y dispararlo **puede cambiar de canal** (romperia la reproduccion del operador) y `.AB` altera el estado de experimentos. El encargo autoriza "disparar intents", no "romper nada"; sin conocer la semantica exacta, disparar a ciegas era el riesgo equivocado. Queda como via de investigacion si el operador lo autoriza.

---

## 10. HONESTIDAD DE FONDO (la parte que importa)

Aunque se dibuje el logo, **hay que decir que declara y que no**:

1. **El APK de ARA no puede mejorar los pixeles de OTT.** Solo procesa frames que decodifica **su propio** ExoPlayer (Android no permite capturar el `MediaCodec` de un player de terceros). Con OTT de player, el pipeline `ApeUltraEnhanceGlEffect` / `UltraEnhancePipeline` **no interviene**.
2. **Lo que si actua sobre OTT es el VPP/AI-PQ del SoC** (post-proceso de hardware, agnostico al player). Un badge `UPSCALED` encima de OTT solo seria **verdadero** si el que mejora es el SoC — no ARA.
3. Por tanto: un logo de ARA sobre OTT seria, hoy, **una declaracion** (`DECLARED`), no un `APPLIED`. Ponerlo sin decirlo seria exactamente lo que la doctrina del contrato prohibe.
4. **Ademas:** con `Override size 1920x1080` activo, cualquier badge que diga "4K" encima de una superficie FHD **miente**. O se quita el override, o el badge no puede afirmar 4K.

**Propuesta honesta de texto del badge:** `APE · VPP SoC ACTIVO` (si el que mejora es el SoC) o `APE · 4K nativo` **solo tras** `wm size reset` y verificacion de que el panel entrega 2160.

---

## 11. LO NO COMPUTADO (resumen)

| Item | Razon |
|---|---|
| Call site de `TYPE_ACCESSIBILITY_OVERLAY` | sin decompilador en el host |
| Alcanzabilidad de `PrivacyOverlayView` sin abrir la UI | no dispare los receivers exportados (riesgo de zapeo) |
| Si OTT admite watermark propio | no inspeccione su APK |
| Entrega real de 4K del panel | el capitan midio `4K UHD: OFF`; no re-mido |
| Efecto del VPP del SoC sobre OTT | fuera de alcance de esta tarea (es la via real, y es otra medicion) |

---

*Medido el 2026-11-14 sobre ONN 4K GTV en 192.168.1.3:5555. Cero cambios de estado en el device. La captura incluida demuestra el estado real (OTT en foco, sin logo) y NO se presenta como exito.*
