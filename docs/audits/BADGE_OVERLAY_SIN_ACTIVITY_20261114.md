# BADGE DE UPSCALING SIN ACTIVITY — overlay montado desde el Service (2026-11-14)

**Tarea:** t68 · **Autor:** http-prober · **Kind:** work
**Síntoma del operador (textual):** *"cuando selecciono un canal, me salta y me lleva al menú del ARA"*

---

## 0. RESULTADO

| Criterio | Antes | Después | Estado |
|---|---|---|---|
| (a) foco al dispararse el badge | `com.ape.crystalagent/.MainActivity` ← **la raíz de la tarea del ARA** | — | reproducido |
| (b) foco con OTT reproduciendo | — | `studio.scillarium.ottnavigator/.PlayerActivity` · `grep -c 'mFocusedApp.*crystalagent'` = **0** | **PASA** |
| (c) overlay montado | ventanas del badge 3 (vía Activity) | `grep -c UpscaleBadge` = **3** · `Window{9613a84 u0 UpscaleBadge}` con Surface propia | **PASA** |
| (d) OTT no se pausa | OTT en `Buffering: 0%` | `state:started` = **1**, sostenido **62 s** | **PASA** |
| (e) log sin Activity | log emitido detrás de un `startActivity` | `badge de upscaling mostrado sobre OTT canal=\|CH\| BLUE SPORT 3 UHD (DE) [line.tivi-ott.net] (overlay sin Activity)` | **PASA** |
| (f) captura del overlay | badge ausente | `scratch/t68_badge_20261114/04_overlay_sobre_ott_reproduciendo.png` | **PASA** |
| `UpscaleBadgeActivity` en la pila | aparecía | **0** | **PASA** |

**Build:** `BUILD SUCCESSFUL` · **APK** 28.267.906 B · `sha256 8c2a1de0dbc59a8007fe65e9194060129f984d63cad21815795faa011d72e2db`
**Instalado:** `versionCode=668` (el device tenía **657**, no 667 — ver §5).

---

## 1. CAUSA RAÍZ — medida, no supuesta

El ticker de `AgentService` (cada 5 s) detectaba reproducción con `AudioManager.isMusicActive()` y hacía
`startActivity(UpscaleBadgeActivity)` con `FLAG_ACTIVITY_NEW_TASK` (AgentService.kt:288 y :301).

**Medición que afinó el diagnóstico:** con la Activity del badge lanzada a mano,
`dumpsys activity activities | grep mFocusedApp` devolvió **`com.ape.crystalagent/.MainActivity`**, no
`UpscaleBadgeActivity`. Es decir: la Activity del badge es transitoria (su `finish()` en `finally` del commit
15b64da5 funciona), pero al nacer en primer plano **arrastra su tarea y la raíz de esa tarea es MainActivity —
el "menú del ARA"**. Eso explica el síntoma exacto del operador y por qué el `finish()` no lo arreglaba:
el daño no era que la Activity quedara abierta, era que **naciera**.

Además, una Activity en primer plano pausa al player de detrás: OTT quedaba en `Buffering: 0%`.

---

## 2. QUÉ SE CAMBIÓ

### 2.1 `BadgeOverlay.kt` (NUEVO) — el montaje, sin Activity

`object` con estado propio (`badge`, `wm`, `ticker`, `lastInput`, `lastCanal`) que monta el mismo `TextView`
con:

```kotlin
WindowManager.LayoutParams(
    WRAP_CONTENT, WRAP_CONTENT,
    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
    FLAG_NOT_FOCUSABLE or FLAG_NOT_TOUCHABLE or FLAG_LAYOUT_IN_SCREEN,
    PixelFormat.TRANSLUCENT
)
w.setTitle("UpscaleBadge")
```

- **API:** `show(ctx, input, canal)` · `hide(ctx)` · `texto(...)` (formato puro) · `mounted`.
- **Hilos:** se puede llamar desde el ticker (hilo de fondo); todo el trabajo de WindowManager se postea al
  hilo principal con `Handler(Looper.getMainLooper())`.
- **Fail-honest:** si `addView` lanza (sin `SYSTEM_ALERT_WINDOW`), se registra `badge no mostrado: …`, se
  deja `mounted=false` y **el agente sigue**. No propaga la excepción.
- **Título de ventana** `UpscaleBadge`: sin Activity el WindowManager no le pone nombre y el overlay sería
  invisible en `dumpsys`; con título se verifica con el comando que pide la tarea.
- Se conserva íntegro el **formato honesto** del texto: `REAL` / `SIMULADA ×N` / `REDUCIDA` / `entrada: N/D`,
  con el color como información (verde/ámbar/rojo/gris), no como decoración.

### 2.2 `AgentService.kt` — fuera el `startActivity`

| Antes | Ahora |
|---|---|
| `startActivity(Intent(this, UpscaleBadgeActivity).putExtra("channel", nombre).addFlags(NEW_TASK))` | `BadgeOverlay.show(this@AgentService, null, nombre)` |
| `startActivity(Intent(this, UpscaleBadgeActivity).putExtra("hide", true).addFlags(NEW_TASK))` | `BadgeOverlay.hide(this@AgentService)` |

**Verificado: `startActivity` reales en AgentService.kt = 0** (las 2 coincidencias que quedan son texto de
los comentarios del fix). El ticker de detección (`isMusicActive`) **no se tocó**: solo se le quitó el
`startActivity`.

### 2.3 `UpscaleBadgeActivity.kt` — solo disparador manual, delega

Ya **no monta** nada: traduce los extras (`input`, `channel`, `hide`) a llamadas de `BadgeOverlay` y cierra
con `finish()` en `finally`. Se conserva para el disparo por ADB:

```bash
adb shell am start -n com.ape.crystalagent/.UpscaleBadgeActivity --es input "1920x1080"
adb shell am start -n com.ape.crystalagent/.UpscaleBadgeActivity --ez hide true
```

La cabecera del fichero documenta que **usarla en el camino de la reproducción vuelve a producir el salto**.

### 2.4 `build.gradle.kts`
`versionCode 657 → 668` · `versionName …-668-overlay-sin-activity`. Solo para que la instalación sea
**distinguible por `dumpsys`**; el binario anterior era el 657 y con el mismo número no habría forma de
probar que se instaló el nuevo.

---

## 3. VERIFICACIÓN (comandos y salida literal)

```bash
# build + install
gradlew.bat :app:assembleDebug        # BUILD SUCCESSFUL in 8s / 1m17s
adb install -r app-debug.apk          # Success
dumpsys package com.ape.crystalagent | grep versionCode
#   versionCode=668 minSdk=22 targetSdk=28

# el agente debe estar vivo (el install lo mata: hay que relanzarlo)
am start -n com.ape.crystalagent/.MainActivity
dumpsys activity services com.ape.crystalagent   # -> ServiceRecord{.../.AgentService} presente

# reproducir: OTT al frente + DPAD_CENTER para abrir canal
#   foco : studio.scillarium.ottnavigator/.PlayerActivity
#   audio: 1

# (b) foco
dumpsys activity activities | grep -m1 mFocusedApp
#   mFocusedApp=ActivityRecord{410c93a u0 studio.scillarium.ottnavigator/.PlayerActivity t1206}

# (c) overlay
dumpsys window windows | grep -c UpscaleBadge          # -> 3
dumpsys window windows | grep -E 'Window\{.*UpscaleBadge'
#   Window #0 Window{9613a84 u0 UpscaleBadge}:
#     mSurface=Surface(name=UpscaleBadge)/@0x74d2dae

# (d) 62 s después, OTT sigue reproduciendo
dumpsys audio | grep -c state:started                  # -> 1
dumpsys activity activities | grep -m1 mFocusedApp     # -> .../PlayerActivity (sin cambios)
dumpsys window windows | grep -c UpscaleBadge          # -> 3

# la Activity JAMÁS aparece
dumpsys activity activities | grep -c 'UpscaleBadgeActivity'      # -> 0
dumpsys activity activities | grep -c 'mFocusedApp.*crystalagent' # -> 0

# (e) log
logcat -d | grep 'badge de upscaling'
#   11-14 18:05:45.941 32761 463 I ApeAgentService: badge de upscaling mostrado sobre OTT
#   canal=|CH| BLUE SPORT 3 UHD (DE) [line.tivi-ott.net] (overlay sin Activity)
```

**(f) captura:** `scratch/t68_badge_20261114/04_overlay_sobre_ott_reproduciendo.png`
(1920×1080, `sha256 c827f1f9…b0d04ab`) — el badge se ve arriba a la derecha sobre el player:
`|CH| BLUE SPORT 3 UHD (DE) …` / `3840×2160 · salida nativa` / `entrada: N/D`.
El borde es **gris** porque la entrada es N/D: **no se inventa** el veredicto.
(screencap de la superficie de vídeo sale negra; lo que importa —el overlay— se ve.)

---

## 4. LO QUE NO SE TOCÓ (respetado)

| Elemento | Estado |
|---|---|
| Shim (`:shim` / `ProxyService` / `SessionTap`) y su arranque | **sin cambios** (siguen corriendo: 3 ServiceRecord) |
| Ticker de detección `isMusicActive()` | **sin cambios**; solo se le quitó el `startActivity` |
| `SettingsApplier`, display, settings de calidad | **sin tocar** |
| VPS | **sin tocar** |
| `CONTEXT` del badge (formato/colores/`N/D`) | **idéntico**, movido de la Activity al objeto |

---

## 5. HALLAZGO COLATERAL (corrección de un dato del encargo)

El encargo dice *"El binario desplegado hoy es v667 (artifacts/ape-crystal-agent-v667-badge-nofocus.apk)"*.
**Medido: el device tenía `versionCode=657`**, no 667. El artefacto
`artifacts/ape-crystal-agent-v667-badge-nofocus.apk` existe (28.218.741 B, `sha256 f28c193c…`) pero **no
estaba instalado**. La fuente en el repo también decía 657. Conclusión: la versión "desplegada" del brief no
coincidía con el device; ahora está el **668**, que sí incluye este fix.

**Nota operativa:** cualquier `adb install -r` **mata el proceso** y con él `AgentService`; el badge no sale
hasta que algo lo relance (`MainActivity` → `ensureRunning`, `BootReceiver`, `ZapReceiver`,
`CaptureWatchdogService` o `AraCommandBridge`). Si el operador reporta "el badge no aparece" tras una
instalación, lo primero es comprobar `dumpsys activity services com.ape.crystalagent | grep AgentService`.

---

## 6. RIESGO RESIDUAL

- Si otra versión vuelve a llamar `startActivity(UpscaleBadgeActivity)` desde el ticker, **el salto vuelve**.
  Queda documentado en la cabecera de `UpscaleBadgeActivity.kt` y en `BadgeOverlay.kt`.
- `isMusicActive()` es **global**: si el operador reproduce audio en otra app, el badge también sale (estaba
  documentado antes y no se cambió).
- Warning benigno del compilador: `AgentService.kt:209 Variable 'ottUid' is never used` (**preexistente**, no
  introducido aquí).

*Medido el 2026-11-14 sobre ONN 4K en 192.168.1.3:5555. Sin tocar el shim, los settings ni el VPS.*
