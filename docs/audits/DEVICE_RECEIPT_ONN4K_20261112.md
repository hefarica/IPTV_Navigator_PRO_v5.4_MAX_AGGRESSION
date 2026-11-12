# Primer recibo de dispositivo — ONN 4K (Cali) · 2026-11-12

**Estado:** dispositivo **conectado y medido** por ADB. Lo que sigue es lo que el aparato declaró, no lo que dice un documento. Captura en `docs/audits/DEVICE_MEASURE_20261112T205642Z.json` y crudo en `scratch/device_measure_20261112T205642Z/`.

```
adb 192.168.1.3:5555 / :34813  →  device · onn__4K_Streaming_Box
```

## Identidad

| | |
|---|---|
| Caja | **onn. 4K Streaming Box** · SoC **Amlogic `s4`** · **Android 14** (SDK **34**) |
| Cores | **4** (`nproc`) |
| RAM | **1.971.588 kB ≈ 1,88 GiB** total · **35 MB libres** en la captura |
| Panel | **SAMSUNG** (PnP `SAM`, productId 28695, fabricado **2020 semana 1**) por **HDMI** (`connectionToSinkType=2`) |

## Pantalla — dos resoluciones distintas a la vez

```
Physical size: 3840x2160        ← el panel
Override size: 1920x1080        ← `wm size`: lo que Android dice a las apps
mActiveModeId=124  → 3840x2160  ← el modo real del compositor
mUserPreferredMode = 3840x2160 @ 60.0
```

**El panel es 4K y el modo activo es 4K, pero hay un override lógico a 1080p.** Las apps creen tener 1920x1080 y SurfaceFlinger escala a 3840x2160. Es una vía real de degradación silenciosa para la UI y los overlays; **no** demuestra por sí sola que el vídeo se entregue a 1080p (un player puede componer la superficie de vídeo a resolución nativa). Se declara la distinción, no se concluye.

**Modos disponibles (medidos):** 3840x2160 @ **59,94 · 60 · 50 · 29,97 · 30 · 25 · 23,976 · 24**; también 1080p y 720p a esas cadencias. El aparato **soporta match exacto de frame rate**, incluidas 25 y 23,976 — relevante para §5 (no convertir 23,976 en 30).

## HDR — lo que el panel acepta de verdad

```
hdrCapabilities mSupportedHdrTypes=[2, 3, 4]  mMaxLuminance=1000.0  mMinLuminance=0.0
mHdrConversionMode = HDR_CONVERSION_PASSTHROUGH
```

Los tipos de `Display.HdrCapabilities` en Android son: **1=Dolby Vision, 2=HDR10, 3=HLG, 4=HDR10+**.

| Tipo | ¿Soportado? |
|---|---|
| HDR10 | **SÍ** |
| HLG | **SÍ** |
| HDR10+ | **SÍ** |
| **Dolby Vision** | **NO** |

**Consecuencia medida:** emitir `SUPPLEMENTAL-CODECS="dvh1…"` o un `dvh1.*` en `CODECS=` hacia este televisor sería una **declaración de códec que el panel no puede mostrar** — exactamente la mentira que rompe reproductores y que la doctrina prohíbe.

**Luminancia máxima 1000 nits.**

Y confirmación de una corrección ya documentada: `mHdrConversionMode` está en **PASSTHROUGH** (modo 1), que **deja pasar el HDR real y no convierte SDR en HDR** — coincide con la corrección del 2026-06-17 que desmintió el "SDR→HDR" del sistema.

## Decodificadores de hardware

```
c2.amlogic.avc.decoder        + .secure
c2.amlogic.hevc.decoder       + .secure
c2.amlogic.av1.decoder        + .secure
(c2.android.* = respaldo en software)
```

**AVC, HEVC y AV1 por hardware**, los tres con variante *secure*. Es lo que habilita declarar esas familias; **no** dice nada sobre perfil/nivel concretos ni sobre si el silicio sostiene 4K a 60 fps reales — eso exige reproducción.

## Térmica — el dato más accionable de hoy

```
Temperature{mValue=63.7, mName=soc_thermal, mStatus=0}
Temperature{mValue=52.5, mName=soc_thermal, mStatus=0}
mHotThrottlingThresholds=[NaN, 65.0, 75.0, 95.0, NaN, 105.0, 120.0]
```

El primer umbral de *throttling* térmico es **65,0 °C** y el SoC estaba a **63,7 °C**: **1,3 °C de margen**. No es una estimación; es el sensor y la tabla de umbrales del propio aparato.

Esto cambia el diseño de §5: cualquier gobernador térmico tiene que tratar **65 °C como el techo operativo real**, no 95 ni 105 — esos son los escalones siguientes, y ya llegar al primero degrada.

## Lo instalado

| Paquete | Versión |
|---|---|
| **`com.ape.crystalagent`** (la APK) | **3.9.9-host-plus-rea-657** · versionCode **657** · minSdk 22 · targetSdk 28 · instalada 2026-11-07, **actualizada 2026-11-09** |
| **`studio.scillarium.ottnavigator`** | **1.7.3.3** · versionCode 25110201 · minSdk 26 · targetSdk 30 |
| `ar.tvplayer.tv` | instalada |
| `com.cbs.ott` | instalada |

## Lo que este recibo NO establece

- **Nada de reproducción.** El aparato estaba en Ajustes, `media_session` sin actividad y `media.metrics` solo con audio de sistema. **No hay códec decodificado, ni resolución de vídeo real, ni frames perdidos medidos.**
- **HDR real en pantalla.** Los tipos `[2,3,4]` son las capacidades del panel derivadas del EDID; `dataspace=UNKNOWN` y `hdr metadata types=0` eran el estado de la UI SDR. Que el panel *pueda* HDR10 no prueba que un flujo HDR se esté mostrando en HDR.
- **Perfil y nivel por códec.** Que exista `c2.amlogic.hevc.decoder` no dice qué niveles soporta ni si sostiene 4K@60.
- **Nada de OTT Navigator reproduciendo**, ni de TiviMate, ni de zapping, ni de audio multi-pista.

Para cerrar esas filas hace falta **reproducir un canal con OTT Navigator y volver a capturar** durante la reproducción.
