# INFORME FINAL DE VERIFICACIÓN — APE / APK / VPS / M3U8

**Fecha:** 2026-11-08 · **Rama:** `audit/rea-alignment-20261108` · **HEAD:** `0d7772b1`

Este documento **no repite** la auditoría: la indexa. Cada afirmación del informe externo tiene aquí su
veredicto, y cada veredicto cita el artefacto del que sale. Lo que no se pudo medir se declara
**NO COMPROBADO** y no se rellena con una suposición.

**Cómo leer los veredictos**

| Veredicto | Significa |
|---|---|
| **CONFIRMADO** | Medido y coincide con lo afirmado |
| **CORREGIDO** | El hecho base es cierto, pero el alcance o el valor cambia |
| **REFUTADO** | Medido y **no** coincide |
| **NO COMPROBADO** | No se midió en esta sesión; no se afirma nada |

---

## 1 · El catálogo y su publicación

| Afirmación del informe | Veredicto | Evidencia |
|---|---|---|
| M3U8 HTTP 200, **1.311.381.927 bytes**, **21.224 canales** | **CORREGIDO** | El fichero auditado localmente es **1.298.722.596 B**, sha256 `5f08f4e6…`, 21.224 canales. La diferencia de **12.659.331 B** es la reescritura de URLs del envoltorio. Son dos representaciones distintas y ambas correctas sobre su objeto |
| 21.224 entradas con exactamente 1 URI | **CONFIRMADO** | `canales=21224 uris=21224 1-uri=SI` |
| `EXTHTTP` con JSON válido en todos | **CONFIRMADO** | `exthttp_ok=21224 mal=0` |
| 0 `tvg-id` duplicados | **CONFIRMADO** | `tvg_id_dup=0` |
| Sin cruce de cabeceras entre canales | **CONFIRMADO** | Cabeceras entre `EXTINF` y su URI, 21.224/21.224 |
| `X-APE-List-Source: pulse-wrapped-if-present` | **NO COMPROBADO** | No se repitió la consulta HTTP a la cabecera |
| 8 KB de presupuesto en `EXTHTTP` | **NO COMPROBADO** | No se re-midió el rango 7.113–7.935 B |
| 202 claves por `EXTHTTP` | **NO COMPROBADO** | No se re-contaron |

---

## 2 · Las recetas de filtrado — aquí el informe se equivoca

| Afirmación | Veredicto | Evidencia |
|---|---|---|
| «falta `atadenoise`, la receta es de la revisión anterior» | **REFUTADO** | `atadenoise` aparece **0 veces** en las 56.366 B de metadata embebida, y **0** en las cadenas de filtro. Además `#EXTVLCOPT:video-filter` **lo ignora VLC por política de seguridad**, no por sintaxis. Añadirlo no cambiaría un píxel |
| «0 / 21.224 coincidencias con el LAB adjunto» | **CORREGIDO** | El carril ejecutable no es `video-filter`. El mecanismo real está en `quality_levels`: la cadena emitida **= `quality_levels.L3.video_filter` + `minterpolate`**. La comparación del informe usa el campo equivocado |
| Las 6 filas `.5` con su técnica y factor son el output | **CONFIRMADO y ahora validado** | Test escenario 8 comprueba fila por fila: `P0.5/P1.5/P3.5/P4.5/P5.5` con `TECHNIQUE`, `RATIO`, `SOURCE`, `BITRATE` y `TRUTH:DECLARED_ENHANCEMENT;NOT_SOURCE`. **5/5 filas** |

---

## 3 · Metadatos que el informe cita y no existen

| Afirmación | Veredicto | Evidencia |
|---|---|---|
| «2.629 diferencias entre `ape-profile` y el parámetro `p`» | **REFUTADO** | El parámetro `p=` aparece en **0 URIs** de la lista |
| «envoltorio con parámetro `u` reversible» | **REFUTADO** | **0 parámetros de query** en 21.224 URIs; todas son directas al proveedor |
| `EXTATTRFROMURL` con 54 etiquetas por canal | **CONFIRMADO con matiz** | `tags=1146096` (54/canal) — pero **`con_url=0`**: ninguna es URL, luego son **inertes** por diseño del mecanismo |
| `bit_depth=12` en metadata vs `10` en el adjunto | **CONFIRMADO y ampliado** | Discrepan **6 de 12 perfiles**: P0, P0.5, P3, P3.5, P4.5, P5.5. Gobierna `bit_depth` (`_firstDef`) |
| `LAB-DNA:sha256=unverified` | **CORREGIDO** | El generador ahora emite el sha256 real y declara la procedencia por perfil |
| Sobre global declara **P0** | **CORREGIDO** | Cierto y peor de lo que dice: P0 tiene **0 canales**, mientras P3 es el 95,3 %. Ahora el sobre declara el **perfil dominante** con `profile_basis=dominant_of_channels` |

---

## 4 · Lo que el informe no vio: el contrato criptográfico

| Hecho medido | Evidencia |
|---|---|
| El **LAB canónico está pinneado** dentro del contrato REA en **4 sitios** | `contracts/lab/APE_LAB_REA_PROCESSING_OVERLAY_v1.json:5,14,131` y `contracts/rea/rea-processing-v1.json:8` (`source_lab.sha256`) |
| Corregir `P3.settings.bitDepth` **rompe `processing_policy`** (PASS → FAIL) | Intentado y **revertido**: el gate tiene razón, el contrato certifica `345783e3…` |
| El alias del canónico **se queda como está** | No es inocuo de arreglar: está atado a un contrato. Y no urge: `bit_depth` gobierna y la lista emite `#EXT-X-APE-OVERRIDE:bit_depth;GOVERNS=bit_depth;ALIAS_IGNORED=bitDepth` |

---

## 5 · El JIT — el informe acierta en el diagnóstico y se queda corto

| Afirmación | Veredicto | Evidencia |
|---|---|---|
| «el JIT tiene indexada esta M3U8» | **CONFIRMADO** | `/jit/source.json` identificaba la lista; `channels.json` con **21.224 canales** |
| «`/jit/health` ok:true, active:null, pid:null» | **CORREGIDO — es más grave** | Además `uptime_s: 0`: **nunca procesó un canal**. No había sesión «en ese instante»: no había habido ninguna |
| «la reproducción usa `/pulse/` en modo proxy» | **REFUTADO para esta lista** | **0 URIs `/pulse/`** y **0 URIs `/jit/`** en el fichero auditado. Todas directas al proveedor |
| El mirror JIT degrada | **CONFIRMADO** | `fps=30` y `-ac 2` incondicional en 3 ramas; `Environment=APE_2K=1` en el unit |
| El gate anti-degradación no lo miraba | **CONFIRMADO** | Leía doctrina, no código. **Corregido**: ahora escanea el JIT y tiene línea base (8 comprobaciones) |
| **Desplegar el parche REA** | **EJECUTADO** | Servicio pasa de `ape-jit-mirror` a **`ape-jit-cmaf`**, sha `09a804e5…`, `APE_2K` eliminado del unit, **0 `fps=30`**, **0 `-ac 2`**, `-c:a copy` presente. Mapa: 21.224 canales |

---

## 6 · La APK — el informe subestima el problema

| Afirmación | Veredicto | Evidencia |
|---|---|---|
| «la APK publicada sigue siendo la 651» | **CORREGIDO — no es la que corre** | La instalada es `com.ape.crystalagent` **2.3.0-noWG, versionCode 600**, que **no contiene `PlayerActivity`**. Es otro build, ni el 651 publicado ni las REA |
| «recibir o guardar el LAB no demuestra que sus parámetros lleguen al procesamiento» | **CONFIRMADO, y con creces** | Lo que no llega no son los parámetros: **no llega la imagen**. Ver §7 |
| La 654 añade `ReaProfileStore/Policy/ProfilesActivity` | **CONFIRMADO como clases, ROTO como función** | Las tres clases están en el dex. Pero **MainActivity no tiene ningún control que abra la pantalla**, y `ReaProfilesActivity` no es exportada ni tiene `intent-filter` |
| «falta prueba de instalación y ejecución física» | **CERRADO** | Instalada (`adb install` Success) y ejecutada. Ver §7 |

---

## 7 · Prueba física del reproductor — el hallazgo central

**Dispositivo:** `onn. 4K Streaming Box` · Amlogic `s4` · Android 14 (SDK 34) · `adb-GUSA2441015311-RXlL4A`

### Capacidades medidas

| Dato | Valor | Fuente |
|---|---|---|
| Decoder HEVC térmico | **4096 × 2160** (`size max=4096x4096`) | `media_codecs_amlogic_video.xml` |
| Panel / salida | **3840 × 2160 @ 59.94 Hz** | `SurfaceFlinger` |
| HDR | **HDR10 / HLG / HDR10+** (sin Dolby Vision) | `HdrCapabilities [2,3,4]` |
| Luminancia máxima | 1000 nits | idem |
| Red | WiFi 60 Mbps, RTT 21,8 ms, **VALIDATED, NOT_VPN** | `dumpsys connectivity` |

**Consecuencia dura:** el objetivo 6K es **5760 × 3240**, que **excede el decoder en ambas dimensiones con el que cuenta el dispositivo**. La capa `.5` **no puede decodificarse aquí**. El fallback que corresponde es no aplicar 6K, y eso es lo que ocurre.

### El defecto medido

```
04:00:52.899  VIDEO elegido: avc1.640028 1920x1080 bps=6221600
04:00:54.622  PLAYING   position=1238   buffered=65083
04:00:56.632  PLAYING   position=3235   buffered=140016
04:00:58.629  PLAYING   position=4675   buffered=150000   <- BUFFER LLENO
04:00:59.679  tracks sin video (groups=0)
04:01:00.632  BUFFERING position=4675   buffered=4675     <- COLAPSO
```

**El buffer pasa de 150 s a 4,7 s en un segundo, justo después de que la enumeración de pistas devuelva
cero grupos de vídeo.** No se agota: **se vacía**.

### Descartes, todos con medición

| Hipótesis | Cómo | Resultado |
|---|---|---|
| Red / WAN | HLS local ffmpeg en LAN, 15 MB, segmentos 4 s | **DESCARTADA** — atasca igual |
| VPN | `ip route get 8.8.8.8 → wlan0`; `always_on_vpn_app=null` | **DESCARTADA** |
| Códec | AVC 1080p y HEVC | **DESCARTADA** |
| Manifiesto | 4 fuentes distintas | **DESCARTADA** |
| Overlay REA | `PlayerActivity` estándar de la misma APK, `-e url` | **DESCARTADA** — falla idéntico |
| SELinux `dmabuf` | El camino sin overlay también falla | **DESCARTADA como causa única** |
| **`ApePlayer`** | Toda la evidencia | **ÚNICA COMPATIBLE** |

---

## 8 · Dos correcciones a mi propio trabajo

El rigor vale tanto para mis conclusiones como para las del informe. Estas dos fueron mías y las dejé
escritas en el repo:

| Error mío | Corrección |
|---|---|
| «el override a 1080p te está robando el 4K» | **Falso.** El `mode` es **694 = 3840×2160@60** en base y en override. El 1920×1080 es el tamaño de composición de la UI. Reinicié el equipo sobre una premisa equivocada; el device quedó restaurado byte a byte |
| «el reproductor no produce imagen» | **Falso.** Medí un solo instante, tomado después del atasco. Pinta **~4,5 s** (Big Buck Bunny visible, timestamp `00:00:00.260`) y luego se congela |

---

## 9 · Estado verificado del repositorio

```
rama   audit/rea-alignment-20261108 · HEAD 0d7772b1 · árbol limpio
681 commits por delante de origin/master · NADA pusheado

unitario rea-6k-lab-provenance    44/44
E2E rea-v24-e2e-playlist          22/22
gate anti-degradacion              8/8
trinquete de credenciales   SIN_FUGA_NUEVA
suite de aceptacion     OK=20 / FALLAN=4 / BLOQ=1 / NC=1
```

Los 4 fallos son **portabilidad Windows** (`deploy_regressions` awk, `deploy_confirmation_security`
cp1252, `jit_real_ffmpeg_evidence` artefacto privado, `workflow_yaml_and_bash_syntax` bash). No son
defectos del producto.

**Un comando reproduce la auditoría de la lista:**

```bash
node tools/audit/verify_alignment_with_lab.js --list <lista.m3u8> --lab <lab.json> --json <salida>
```

---

## 10 · Lo que queda abierto, y por qué

| Abierto | Por qué no se cierra aquí |
|---|---|
| **El botón de perfiles** | `ReaProfilesActivity` no es exportada y MainActivity no la invoca. Necesita rebuild |
| **El volcado de buffer** | Causa raíz en el ciclo `global_beat`/`REARM` de `ApePlayer`. Sin fuente solo quedan síntomas |
| **Rotación de credenciales** | 22 ficheros trackeados, publicados en `origin`. Decisión del operador |
| **Alias `bitDepth` del canónico** | Pinneado en el contrato REA. Cambiarlo exige actualizar el pin, que es cambio de contrato |
| **OTT Navigator en `Buffering: 0%`** | Observado en un canal del proveedor. No se determinó si es el mismo fallo |
| **Peticiones HTTP del informe** | Cabecera `X-APE-List-Source`, rango de 8 KB, 202 claves: **no re-medidos** |

---

## 11 · Cómo reproducir cada cosa

```bash
# lista
node tools/audit/verify_alignment_with_lab.js --list <m3u8> --lab <json> --json out.json

# gates
pwsh tools/audit/verify_rea_patch.ps1 -RunGates

# JIT desplegado
curl -s https://iptv-ape.duckdns.org/jit/health
curl -s https://iptv-ape.duckdns.org/jit/capabilities.json   # service: ape-jit-cmaf

# dispositivo
S=adb-GUSA2441015311-RXlL4A._adb-tls-connect._tcp
adb -s $S shell "sed -n '/video\/hevc/,/<\/MediaCodec>/p' /vendor/etc/media_codecs_amlogic_video.xml"
adb -s $S shell "dumpsys display | grep -oE 'supportedHdrTypes=\[[0-9, ]+\]' | head -1"
adb -s $S shell 'am start -n com.ape.crystalagent.rea/com.ape.crystalagent.PlayerActivity -e url "<HLS>"'
adb -s $S logcat | grep -E "ApePlayer|tracks sin video|buffered position"
```

---

**Resumen en una línea:** la capa declarativa de la lista está verificada y corregida; el JIT desplegado
ya no degrada; el dispositivo no puede ejecutar 6K y no lo pretende; y el reproductor de la APK se
congela porque vacía su propio buffer tras una enumeración de pistas fallida — un defecto concreto de
código, no de datos ni de red.
