# REA · R2 — Análisis estático real de los APK disponibles
## Identidad, clases de URL/parser, headers, tokens y framework (ExoPlayer 2.x, OkHttp, VLC)

> **Tarea:** `t2` (R2) · **Intento:** `d4b0fce9-b161-42d8-baeb-738102ff3610` · **Miembro:** `android-rea`
> **Ventana de medición:** 2026-10-25, 21:53 → 22:35 (-05:00, America/Bogota)
> **Host:** estación del propietario (`C:\Users\HFRC`, Windows 11) · **Alcance:** **solo local, nada remoto**
> **Regla de la sesión:** no se ejecutó ningún APK, no se instaló nada, no se conectó a ningún dispositivo,
> no se tocó el VPS ni ningún servicio remoto. Todo el trabajo es **descompilación estática offline**.
> **Dependencia satisfecha:** `t1`/R1 (`docs/REA_SCOPE_AND_ARTIFACTS.md`) — gate de inventario e identidad.
> **Decisión de orden del capitán (aplicada):** `1.6.9.4` = **PRIMARIO**, `1.7.3.3` = **SECUNDARIO/DELTA**.

**Etiquetas de evidencia por afirmación (heredadas de R1, obligatorias):**

| Etiqueta | Significado |
|---|---|
| `[observado]` | Leído ahora mismo sobre el artefacto local con REA/JADX 0.7.1, con la llamada reproducible del §Anexo A |
| `[derivado]` | Inferencia directa de una o más observaciones; se declara el razonamiento |
| `[público]` | Conocimiento externo verificable (estándar, documentación de ExoPlayer/Android); no se midió aquí |
| `[no disponible]` | No existe artefacto, no se midió, o **no se puede establecer** con esta evidencia. Nunca se rellena con supuestos |

---

## 0. Resumen ejecutivo

**El objetivo prioritario del propietario (OTT Navigator) es analizable de verdad y su comportamiento de red
está ahora documentado con código real, no con supuestos.** El resultado que más cambia el plan: **los dos
builds de OTT están fuertemente ofuscados (R8/ProGuard con re-siembra de nombres)**, así que el "mapa de
clases por nombre de paquete" que pedía el enunciado **no existe como tal** en este binario. Se sustituye por
**evidencia conductual** (cuerpos de método descompilados + referencias cruzadas de JADX), que es más fuerte
que un nombre.

| # | Pregunta de R2 | Respuesta | Etiqueta |
|---|---|---|---|
| 1 | ¿Framework de reproducción? | **ExoPlayer 2.x** (no media3): `com.google.android.exoplayer2.source.hls.HlsMediaSource` presente y usado; UA por defecto del stack = literal `"ExoPlayerLib/2.15.1"`; **0** clases `androidx.media3` (R1) | `[observado]` |
| 2 | ¿DataSource HTTP? | **Propio**: no existe `HttpDataSource` ni `DefaultHttpDataSource` ni el paquete `...exoplayer2.upstream` en el dex. OTT construye su factory con `hg.k(Context, UA, HashMap encabezados)` | `[observado]` |
| 3 | ¿OkHttp / Cronet / HttpURLConnection? | OkHttp **empaquetado** (sobrevive `okhttp3.internal.publicsuffix.PublicSuffixDatabase`; el resto renombrado). Cronet: **0 clases**. Cliente efectivo del player: `[no disponible]` (renombrado) | `[observado]`/`[derivado]`/`[no disponible]` |
| 4 | ¿Cómo se inyectan headers por canal? | Atributo **`http-h`**; dos sintaxis aceptadas: `Clave=Valor&Clave2=Valor2` **o** objeto JSON `{...}`. Todo va al `Map<String,String>` que consume el DataSource de ExoPlayer | `[observado]` |
| 5 | ¿Referer / User-Agent? | `Referer` se inyecta desde el perfil de proveedor (mapa `http`) y desde un parámetro explícito; el UA se compone en `ig.c.a(..., "ExoPlayerLib/2.15.1")` y **puede** venir del perfil | `[observado]` |
| 6 | ¿Cookies / tokens? | El player **instala su propio `CookieHandler`** (`CookieHandler.setDefault`) antes de crear la fuente; credenciales de proveedor van en la URL. **1.7.3.3 añade** `Authorization: Basic` derivado del `userInfo` de la URL | `[observado]` |
| 7 | ¿Detección de protocolo (HLS/DASH/SS/RTSP/…) | Cadena determinista en `hg.j.a`: atributo `m-t` → `Util.inferContentType(uri)` → esquema (`rtmp/udp/rtp`) → ruta `/ace/getstream` (Xtream) → extensión del último segmento → default HLS/`ts` | `[observado]` |
| 8 | ¿Selección de pistas / ABR? | `hg.a.b(MappedTrackInfo, TrackGroupArray, tipo)` construye la lista de variantes con **ancho×alto×fps** y un índice `grupo*100+pista`. No se observó lógica ABR propia: **delega en ExoPlayer** | `[observado]`+`[derivado]` |
| 9 | ¿DRM? | **Solo inventario**: `d-t` (widevine/clearkey/playready), `d-k`, `d-u` (+`d-d` en 1.7.3.3), `DefaultDrmSessionManager`/`HttpMediaDrmCallback`. **Sin análisis de handshake** (frontera legal de R1 §8) | `[observado]` (inventario) |
| 10 | ¿Parsers M3U8 / XSPF / MPD? | MPD/SmoothStreaming/HLS/RTSP: **ExoPlayer** (`DashMediaSource`, `SsMediaSource`, `HlsMediaSource`, `RtspMediaSource`). M3U/M3U8 y XSPF propios de OTT: **existen pero su clase no es identificable por nombre** | `[observado]`/`[no disponible]` |
| 11 | Motor 1.6.9.4 vs 1.7.3.3 | 1.6.9.4 trae **38 clases** de bindings VLC **y** `libvlc.so`+`libvlcjni.so`. 1.7.3.3 conserva las clases VLC pero **no empaqueta la librería nativa** → en 1.7.3.3 el motor VLC no es cargable | `[observado]`+`[derivado]` |
| 12 | ¿Diferencias de código entre builds? | Misma arquitectura, nombres re-sembrados (`hg.*`→`h8.*`), +**Basic auth por `userInfo`**, +`d-d`, cambio de firma en el constructor de `HlsMediaSource` (10→9 args) | `[observado]` |
| 13 | SFA (sing-box) | `io.nekohasekai.sfa` 1.13.11: **8.745 clases**, núcleo de proxy **nativo** (`libbox.so`), `HTTPClient` = `io.nekohasekai.libbox.HTTPClient` (Go). Import de perfil remoto por deep link `sing-box://import-remote-profile` | `[observado]` |
| 14 | v2rayNG 1.9.31 | `com.v2ray.ang`: **6.514 clases**, `V2RayVpnService`/`V2RayProxyOnlyService`/`V2RayTestService`, `UrlSchemeActivity` (share links), actividades de suscripción | `[observado]` |
| 15 | TiviMate / Disney+ / Prime / Conviva | **No disponibles** en disco (gate R1). Disney+/Prime además **excluidos** por frontera legal | `[no disponible]` |

**Tres hallazgos que el plan no tenía y que son accionables ya:**

1. **`http-h` es el canal de headers de OTT y acepta JSON.** El parser (`hg.j#b` / `h8.k#b`) es idéntico en
   ambos builds: si el valor **no** empieza por `{`, lo parte por `&` y luego por `=` → pares `K=V`; si
   empieza por `{`, lo lee como **objeto JSON** con `name → nextString()` y descarta los `null`. Consecuencia
   directa para nuestra matriz EXTHTTP: **un JSON con nombres de header arbitrarios es el formato "nativo"
   de OTT**, y `K=V&K2=V2` es el formato "compatible". `[observado]`
2. **1.7.3.3 añade `Authorization: Basic` automático desde la URL.** Si la URI trae `user:pass@host`, el build
   vigente inyecta la cabecera antes de crear el DataSource. Es el único cambio funcional de red que la
   comparación de los dos builds revela en el camino HTTP. `[observado]`
3. **El "FILE" de OTT incluye el endpoint Xtream `/ace/getstream`.** Su detector de protocolo tiene un caso
   explícito para esa ruta (`path.contains("/ace/getstream")` → tipo FILE/progresivo). Para nuestro stack, un
   `get.php?…&output=m3u8` **no** cae ahí, pero un `…/live/user/pass/ID.ts` sí puede acabar en progresivo según
   extensión. `[observado]`

**Veredicto operativo:** R2 **se cumple** para OTT (los dos builds) y para SFA/v2rayNG/agente propio en la
parte de manifiesto, framework y stack de red. Lo que **no** se puede afirmar —y por eso no se afirma— es el
nombre de clase del parser M3U/XSPF de OTT, la versión exacta de ExoPlayer empaquetada, ni el cliente HTTP
efectivo del player. Cada uno queda declarado con su ruta de resolución en §10.

---

## 1. Método, herramientas y cobertura

| Paso | Herramienta REA | Versión / identidad | Qué produjo | Etiqueta |
|---|---|---|---|---|
| Identidad + manifiesto | `inspect_android_package` (detail=summary) | `jadx-headless-mcp 0.7.1`, jar sha256 `6e5eacf5…`, bridge 7 | package, SDK, permisos, 35 componentes, `class_count` | `[observado]` |
| Texto del manifiesto | `inspect_analysis_view` kind=android facet=manifest | REA 6.8.0 (proyección sobre evidencia retenida) | XML decodificado por páginas (UTF-16 code units) | `[observado]` |
| Mapa de clases | `search_android_classes` | JADX 0.7.1 | listas por subcadena exacta de nombre | `[observado]` |
| Referencias cruzadas | `trace_android_references` | JADX 0.7.1 (`get_xrefs_to_class`) | clases que usan un tipo (using nodes) | `[observado]` |
| Miembros | `inspect_android_class` | JADX 0.7.1 | métodos, descriptores DEX, campos, clases internas | `[observado]` |
| Cuerpos | `inspect_android_method` | JADX 0.7.1 (`get_method_body`, `smali_fallback=true`) | **Java descompilado real**; `fell_back=false` en todas las extracciones | `[observado]` |
| Paquete de evidencia | `export_evidence_bundle` (sesión REA) | REA 6.8.0 | `docs/evidence/REA_R2_evidence_bundle.json.gz` | `[observado]` |

**Coste/realidad del motor (importa para reproducir):** cada llamada al proveedor Android **recarga el APK**
en un workspace temporal (`load_apk`), sin caché entre llamadas:

| APK | clases JADX | `load_duration_ms` observado |
|---|---:|---:|
| OTT `1.6.9.4` (74,1 MB) | 10.315 | 36.010 – 45.923 |
| OTT `1.7.3.3` (21,8 MB) | 13.492 | 47.668 – 54.924 |
| SFA `1.13.11` (28,2 MB) | 8.745 | 34.297 |
| SFA `1.11.11` (13,7 MB) | 4.054 | (vía summary) |
| v2rayNG (30,9 MB) | 6.514 | (vía summary) |

`[observado]`. Consecuencia práctica: **una llamada = ~35–55 s de carga + descompilación**; el análisis se
planificó con anclas (referencias cruzadas) en vez de barridos exhaustivos.

### 1.1 Límite honesto nº 1 — la ofuscación

Los dos OTT están ofuscados con R8/ProGuard y **re-siembra de nombres entre builds**. Lo que sobrevive con
nombre legible son: las 5 actividades propias, `ui.views.*`/`ui.widget.*`, `utils.BootUtils`, `App`,
`CastOptionsProvider` y **~64 clases del paquete `studio.scillarium.ottnavigator`** (la mayoría de una letra:
`a`…`z`, `a0`…`h0`, `v`…`z`). Todo lo demás vive en paquetes de una/dos letras (`hg`, `fg`, `ug`, `o7`, `i6`,
`d6`, `f8`, `gg`, `ig`, `md`, `k4`, `ee`, `ah`, `bg`, `bh`, `cg`, `ch`, `yg`, `zg`…). `[observado]`

Lo que **sí** sobrevive con nombre completo en el dex de 1.6.9.4: **una sola** clase de ExoPlayer,
`com.google.android.exoplayer2.source.hls.HlsMediaSource` (`search "com.google.android.exoplayer2.source.hls"`
→ 1 resultado). En 1.7.3.3 sobreviven **26** clases de `com.google.android.exoplayer2.source.*`
(`TrackGroup`, `TrackGroupArray`, `dash.DashMediaSource`, `hls.HlsMediaSource`,
`hls.HlsTrackMetadataEntry`, `rtsp.RtspMediaSource`, `smoothstreaming.SsMediaSource` + internas `a,b,c,d`), y
también `com.google.android.exoplayer2.drm.e` / `…ui.SubtitleView`. `[observado]`

`[derivado]` Dos lecturas posibles: (a) el publicador cambió las reglas `-keep`/el ofuscador entre builds; (b)
1.7.3.3 se procesó con una herramienta distinta (coherente con R1: 1.7.3.3 va firmado **solo v2** y sin Source
Stamp). No se puede decidir con evidencia estática → se declara abierto.

### 1.2 Límite honesto nº 2 — no hay búsqueda de strings en el proveedor Android

REA expone `list_classes`, `get_class_summary`, `get_method_body` y `get_xrefs_to_class`. **No** expone
"¿qué clase contiene el literal X?". Por eso el mapa se construyó **desde anclas semánticas**
(`trace_android_references` sobre `HlsMediaSource` → clase que lo instancia; sobre `fg.i` → quién usa el modelo
de item de playlist) y leyendo cuerpos completos. Todo hallazgo de este documento viene de un cuerpo de método
citado, no de una conjetura por nombre. `[derivado del contrato del proveedor]`

### 1.3 Límite honesto nº 3 — firma de APK

La firma la verificó el capitán con REA y se usa **tal cual**, declarada como **datos declarados, no
verificación criptográfica** (`signature_verification=not_performed` en toda la evidencia REA de este
documento):

| APK | Esquemas | Certificado SHA-256 | Source Stamp | Lectura |
|---|---|---|---|---|
| OTT `1.6.9.4` | v1+v2+v3 (coincidentes) | `2e12755bee0b69aac72bb0613ea8d5b9e8683ecc3df3f7534fbb99b054be267d` | **presente** (`3257d599a49d2c961a471ca9843f59d341a405884583fc087df4237b733bbd6d`) | build de Play |
| OTT `1.7.3.3` | **solo v2** | `6cf278ec532189b3dbb36436c5fab655bb30de413da32472d044051de1364e86` | **ausente**, sin linaje | re-firmado por espejo |

`[observado por el capitán con REA · declarado, no verificado]` → **advertencia operativa: 1.7.3.3 no se
instala encima del de Play (firma distinta) y su procedencia no está establecida.**

---

## 2. Arquitectura observada (OTT Navigator) — capas y cadena de llamadas

```
┌─ UI (sin ofuscar) ───────────────────────────────────────────────────────────────┐
│ MainActivity · EditProviderActivity · PlayerActivity · StudioActivity ·          │
│ VodPlayActivity · ui.views.* (PlayerHud, HudInfoView, …)                         │
└───────────────┬──────────────────────────────────────────────────────────────────┘
                │ (item seleccionado)
┌───────────────▼───────────────┐   ┌─────────────────────────────────────────────┐
│ Modelo de playlist (ofuscado) │   │ Modelo de ítem/canal (ofuscado)             │
│ p.ej. fg.i  ── b("clave")     │◄──│ ug.u  ── campo D = Map<String,String>       │
│ (atributos por clave)         │   │ (atributos por clave)                       │
└───────────────┬───────────────┘   └─────────────────────────────────────────────┘
                │ URL + atributos (m-t, http-h, d-t, d-k, d-u, d-d)
┌───────────────▼──────────────────────────────────────────────────────────────────┐
│ FÁBRICA DE MEDIA SOURCE   (1.6.9.4: hg.j#a   |   1.7.3.3: h8.k#a)                │
│  1) instala CookieHandler global                                                 │
│  2) detecta tipo (m-t → inferContentType → esquema → /ace/getstream → extensión)  │
│  3) arma HashMap de headers (perfil "http" + Referer + http-h [+ Basic 1.7.3.3]) │
│  4) compone User-Agent (default "ExoPlayerLib/2.15.1")                            │
│  5) crea DataSource factory  (1.6.9.4: hg.k | 1.7.3.3: clase J0 con (Context,UA,map))│
│  6) opcional: DefaultDrmSessionManager (d-t/d-k/d-u[/d-d])                        │
└───────────────┬──────────────────────────────────────────────────────────────────┘
                │ MediaSource (ExoPlayer 2.x)
┌───────────────▼──────────────────────────────────────────────────────────────────┐
│ ExoPlayer media sources                                                          │
│  HlsMediaSource.Factory · DashMediaSource.Factory · SsMediaSource.Factory ·      │
│  RtspMediaSource.Factory · ProgressiveMediaSource (FILE/ts/rtp/udp)              │
└───────────────┬──────────────────────────────────────────────────────────────────┘
                │ red
┌───────────────▼──────────────────────────────────────────────────────────────────┐
│ Stack HTTP: DataSource propio de OTT + CookieHandler propio. OkHttp 3/4 presente  │
│ en el dex (clase superviviente: okhttp3.internal.publicsuffix.PublicSuffixDatabase)│
│ + nativas: libffmpegJNI.so (FFmpeg 4.2 / Lavc58.54.100), librtmp-jni.so,          │
│   libzstd-jni-1.5.7-4.so;  solo 1.6.9.4: libvlc.so + libvlcjni.so                 │
└──────────────────────────────────────────────────────────────────────────────────┘
```

`[observado]` para cada caja; el *nombre* del modelo `fg.i`/`ug.u` es el que JADX reporta (renombrado), su
**rol** se deduce del uso (ver §3.4/§3.5).

**Cadena de llamadas mínima, extremo a extremo** (1.6.9.4):
`PlayerActivity` → *(clase de reproducción ofuscada)* → `hg.j.a(Context, url, hg.a$c, fg.i, ?, referer, ug.u, gg.a1, mask)`
→ `hg.j.b(fg.i, ug.u, HashMap)` (headers) → `ig.c.a(perfil, ?, map, fg.i, "ExoPlayerLib/2.15.1")` (UA)
→ `new hg.k(Context, UA, map)` → `hg.k#k(): f8.q` (DataSource.Factory) → `HlsMediaSource.Factory.a(MediaItem)`
→ ExoPlayer. `[observado]` (cada salto citado en §3.4–§3.6; la clase intermedia entre `PlayerActivity` y
`hg.j` **no** se aisló → `[no disponible]`).

---

## 3. Deep dive — OTT Navigator **1.6.9.4** (PRIMARIO)

**Artefacto:** `C:\Users\HFRC\Downloads\ott-navigator-1-6-9-4.apk`
**SHA-256:** `bd509c0cb24b32deaae19c311b5537f60d5eb4c853163829f625a13d997d6854` · 74.121.056 B
**Package:** `studio.scillarium.ottnavigator` · vc `23072804` · vName `1.6.9.4` · minSdk 23 · targetSdk 33 · compileSdk 33 · 10.315 clases · 2.394 recursos. `[observado]`

### 3.1 Manifiesto (texto decodificado real)

Cabecera y `application` **verbatim** (ev_00ccffb2…):

```xml
<manifest android:versionCode="23072804" android:versionName="1.6.9.4"
          android:compileSdkVersion="33" package="studio.scillarium.ottnavigator">
  <uses-sdk android:minSdkVersion="23" android:targetSdkVersion="33"/>
  …
  <application
      android:name="studio.scillarium.ottnavigator.App"
      android:allowBackup="true"
      android:largeHeap="true"
      android:extractNativeLibs="true"
      android:fullBackupContent="@xml/backup_descriptor"
      android:usesCleartextTraffic="true"
      android:appComponentFactory="androidx.core.app.CoreComponentFactory"
      android:requestLegacyExternalStorage="true"
      android:preserveLegacyExternalStorage="true">
```

| Hecho | Valor | Etiqueta |
|---|---|---|
| `usesCleartextTraffic` | **`true`** → acepta `http://` sin excepción | `[observado]` |
| `networkSecurityConfig` | **no declarado** (ni en `<application>` ni como recurso referenciado en el manifiesto) | `[observado]` |
| `largeHeap` | `true` | `[observado]` |
| `extractNativeLibs` | `true` → las `.so` se extraen y `System.loadLibrary` funciona por ruta clásica | `[observado]` |
| `uses-library` | `org.apache.http.legacy` (`required=false`) | `[observado]` |
| Componentes propios | 5 activities (`MainActivity` LAUNCHER+LEANBACK, `EditProviderActivity`, `PlayerActivity` singleTask + PiP, `StudioActivity`, `VodPlayActivity`) + receiver `utils.BootUtils` (`BOOT_COMPLETED`,`QUICKBOOT_POWERON`) | `[observado]` |
| Total componentes declarados | 35 (11 activity · 11 service · 11 receiver · 2 provider) — el resto es Google Ads/Cast/Play Core/WorkManager/Room/billing | `[observado]` |
| Permisos de red/estado | `INTERNET`, `ACCESS_NETWORK_STATE`; además `WAKE_LOCK`, `FOREGROUND_SERVICE`, `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `READ/WRITE_EXTERNAL_STORAGE`, EPG TV, `AD_ID` | `[observado]` |
| Red en `PlayerActivity` | `supportsPictureInPicture=true`, `resizeableActivity=true`, `launchMode=singleTask`, `screenOrientation=sensorLandscape` | `[observado]` |

**Lectura para nuestro stack:** OTT no impone ninguna política de red propia más allá de "cleartext permitido".
No hay pinning, no hay `networkSecurityConfig`, no hay allowlist de dominios. `[observado]`

> **Nota de alcance:** el resto del manifiesto (Ads/AppLovin/Huawei/AppCoins en 1.7.3.3) queda **fuera** de
> R2; facturación/DRM de terceros no se analiza (frontera legal R1 §8).

### 3.2 Superficie de clases y qué significa cada paquete

| Paquete (JADX) | Tamaño | Rol observado / derivado | Etiqueta |
|---|---:|---|---|
| `studio.scillarium.ottnavigator` (+`.ui.views`,`.ui.widget`,`.utils`) | 64 nombres | UI y utilidades sin ofuscar; 5 activities reales | `[observado]` |
| `hg.*` (11: `a,c,d,e,f,g,h,j,k,m,s`) | 11 | **Capa de reproducción propia**: `hg.j`=fábrica de MediaSource, `hg.k`=DataSource, `hg.a`=config+lista de pistas | `[observado]`+`[derivado]` |
| `fg.*` (16: `a`…`p`) | 16 | Modelo de playlist/proveedor; `fg.i` = **ítem** con atributos `b(String)`, `d(String,String)` (set), `h(): og.q0`, campos `f17979w: vf.q<String,String>` | `[observado]`+`[derivado]` |
| `ug.u` | 1 | Modelo de canal/atributos con `D: Map<String,String>` (mismo esquema `http-h`) | `[observado]` |
| `o7.*` | — | MediaSource/MediaPeriod de ExoPlayer (renombrado); `o7.b` = factory que usa `HlsMediaSource` | `[observado]` |
| `i6.*` | — | DRM de ExoPlayer (`i6.b` construido con UUID + callback + `int[]` + timeout 300000L) | `[observado]`+`[derivado]` |
| `d6.*` | — | MediaItem/`C`-constants de ExoPlayer (`d6.g` = UUIDs Widevine/ClearKey/PlayReady, `d6.s1` = TrackGroupArray) | `[observado]`+`[derivado]` |
| `ah.*`,`bg.*`,`bh.*`,`cg.*`,`ch.*`,`yg.*`,`zg.*` | cientos | Usuarios del modelo `fg.i` (pantallas, loaders, caché). No aislados uno a uno en esta pasada | `[observado]` (xref) / `[no disponible]` (rol fino) |

`[observado]` (listas de `search_android_classes` + `trace_android_references`). Los roles marcados
`[derivado]` se apoyan en el **uso** (firma del método y cuerpo), no en el nombre.

### 3.3 Framework: identificación y versión

| Evidencia | Resultado | Etiqueta |
|---|---|---|
| `search "com.google.android.exoplayer2.source.hls"` | `com.google.android.exoplayer2.source.hls.HlsMediaSource` (1 coincidencia) | `[observado]` |
| `inspect_android_class HlsMediaSource` | 10 métodos, ctor de 10 args: `(d6.w0, n7.h, n7.i, b0.a, i6.o, f8.s, o7.b, long, boolean, int)`; campos `G: d6.w0$e`, `H: f8.h0` | `[observado]` |
| `search "com.google.android.exoplayer2.upstream"` | **0** coincidencias | `[observado]` |
| `search "HttpDataSource"` | **0** coincidencias | `[observado]` |
| `search "HlsPlaylistParser"` | **0** coincidencias (el parser HLS es interno de ExoPlayer, renombrado) | `[observado]` |
| `search "cronet"` | **0** coincidencias | `[observado]` |
| `search "okhttp"` | `okhttp3.internal.publicsuffix.PublicSuffixDatabase` (1) | `[observado]` |
| `androidx.media3` | **0** (R1, barrido de bytes en `classes*.dex`) | `[observado por R1]` |
| UA por defecto en el código | literal **`"ExoPlayerLib/2.15.1"`** pasado a `ig.c.a(...)` | `[observado]` |

**Veredicto:** **ExoPlayer 2.x** (paquete `com.google.android.exoplayer2`), **no media3**. `[observado]`
**Versión exacta:** el token `ExoPlayerLib/2.15.1` es **una cadena que la app escribe a mano** como UA, no un
campo de versión; la versión empaquetada no se puede leer porque las clases de versión (`ExoPlayerLibraryInfo`)
están renombradas → **`[no disponible]`** (ruta de resolución en §10). `[derivado]`

**OkHttp:** la única clase OkHttp que conserva nombre es `okhttp3.internal.publicsuffix.PublicSuffixDatabase`
(usada por `Cookie`/`HttpUrl.topPrivateDomain()`); el resto del árbol `okhttp3` está renombrado (0 nombres más).
→ OkHttp **está empaquetado** `[derivado]`; que sea el transporte efectivo del player **no** se puede afirmar
`[no disponible]` (el DataSource propio de OTT podría usar `HttpURLConnection` o OkHttp indistintamente).

### 3.4 `hg.j#a` — la fábrica de MediaSource (código real)

Firma: `public static i7.a a(Context, String, hg.a$c, fg.i, String, String, ug.u, gg.a1, int) throws IOException`
(`i7.a` = MediaSource; los dos `String` extra son UA/referer explícitos; el `int` final es la máscara de
defaults Kotlin). Fuente: `ev_c8ae5e7a…` (cuerpo Java completo, `fell_back=false`).

**Extracto 1 — cookie handler + detección de tipo** (verbatim):

```java
Uri uri3 = Uri.parse(str == null ? "" : str);
try {
    CookieHandler cookieHandler = CookieHandler.getDefault();
    md.e eVar3 = f19175a;                       // lazy estático con el cookie handler de OTT
    if (!b4.a.b(cookieHandler, eVar3.getValue())) {
        CookieHandler.setDefault((CookieHandler) eVar3.getValue());
    }
} catch (Exception unused) { }

gg.q qVarA = i0.a(iVar2);                        // perfil del proveedor
if (qVarA == null) qVarA = i0.b(uVar2);

if (cVar != hg.a.c.AUTO) {
    cVar2 = cVar;
} else {
    String strB = (iVar2 == null || (strB = iVar2.b("m-t")) == null)
                ? (uVar2 == null || (map = uVar2.D) == null ? null : map.get("m-t")) : strB;
    boolean zB = b4.a.b(strB, "hls");
    hg.a.c cVar3 = hg.a.c.DASH, cVar4 = hg.a.c.HLS;
    cVar2 = zB ? cVar4 : b4.a.b(strB, "mpd") ? cVar3 : null;
    if (cVar2 == null) {
        int iC = h0.C(uri3);                     // inferencia por URI (tipo de contenido)
        if (iC == 0) cVar2 = cVar3;              // DASH
        else if (iC == 1) cVar2 = hg.a.c.SMOOTHSTREAM;
        else if (iC != 2) cVar2 = iC != 3 ? null : hg.a.c.RTSP;
        else cVar2 = cVar4;                      // HLS
        if (cVar2 == null) {
            String scheme = uri3.getScheme();
            hg.a.c cVar5 = hg.a.c.FILE;
            … "rtmp" → FILE ; "udp" → UDP ; "rtp" → RTP …
            if (cVar2 == null) {
                String path = uri3.getPath();
                if (path != null && ee.i.U(path, "/ace/getstream", false)) {
                    cVar2 = cVar5;               // Xtream Codes → progresivo
                } else {
                    String lastPathSegment = uri3.getLastPathSegment();
                    …
                    if (((HashSet) f19176b.getValue()).contains(ee.n.v0(lastPathSegment, '.', lastPathSegment)))
                        cVar3 = cVar5;           // extensión en lista de "contenedor directo" → FILE
                    else if (!ee.i.M(lastPathSegment, ".mpd", false)) {
                        if (b4.a.b(lastPathSegment, "mpegts")) cVar3 = cVar5;
                        else cVar3 = null;
                    }
                    …
                    /* default: HLS, salvo que el ajuste global diga "ts" → FILE */
                }
            }
        }
    }
}
```

**Campos de control leídos por la fábrica** (clave→origen):

| Clave | Origen 1 | Origen 2 (fallback) | Uso observado | Etiqueta |
|---|---|---|---|---|
| `m-t` | `fg.i.b("m-t")` (ítem) | `ug.u.D.get("m-t")` (canal) | tipo de media declarado: `hls` / `mpd` | `[observado]` |
| `http-h` | `fg.i.b("http-h")` | `ug.u.D.get("http-h")` | headers extra (ver §3.5) | `[observado]` |
| `d-t` | ítem | canal | tipo de DRM: `widevine`/`clearkey`/`playready`, **case-insensitive** | `[observado]` |
| `d-k` | ítem | canal | clave/material de DRM | `[observado]` |
| `d-u` | ítem | canal | URI de licencia DRM | `[observado]` |

**Extracto 2 — headers, Referer y User-Agent** (verbatim):

```java
HashMap map5 = new HashMap();
map5.putAll(vf.d.j((qVarA == null || (aVarF = qVarA.f()) == null
                    || (qVar = aVarF.f18704m) == null) ? null : qVar.b("http")));
String strJ = str9 == null ? (qVarA != null ? qVarA.j(iVar2) : null) : str9;
if (strJ != null) map5.put("Referer", strJ);
b(iVar2, uVar2, map5);                                   // ← parser de http-h
String strA = ig.c.a(qVarA, str8, map5, iVar2, "ExoPlayerLib/2.15.1");   // ← UA
md.e eVar6 = new md.e(new k(context, strA, map5));       // ← DataSource factory
```

**Extracto 3 — selección final de MediaSource** (verbatim, ramas relevantes):

```java
switch (cVar2.ordinal()) {
  case 1:   // FILE / progresivo
      m6.f fVar = new m6.f();
      if (qVarA != null && qVarA.p()) fVar.c();
      fVar.d(i11);                                        // i11: "compat"→0 · "max"→9 · resto→1
      f8.q qVar2 = (f8.q) eVar.getValue();
      j6.h hVar5 = new j6.h(fVar);
      return new i7.c0(w0.a(uri), qVar2, hVar5, bVar, new f8.s(), 1048576);
  case 2:   // HLS
      if (a1Var2 != null) a1Var2.A = str5;                // str5 = "hls"
      n7.d dVar = new n7.d(i11);
      HlsMediaSource.Factory factory = new HlsMediaSource.Factory((f8.q) eVar.getValue());
      factory.f = new t7.b(bVar);                          // proveedor de DRM
      factory.f4993h = false;
      factory.f4988b = dVar;
      return factory.a(w0.a(uri));
  case 3:   // DASH
      DashMediaSource.Factory factory2 = new DashMediaSource.Factory((f8.q) eVar.getValue());
      factory2.f4912c = new u7.d(bVar);
      return factory2.a(w0.a(uri));
  case 4:   // SmoothStreaming
      SsMediaSource.Factory factory3 = new SsMediaSource.Factory((f8.q) eVar.getValue());
      factory3.f5098d = …;
      return factory3.a(w0.a(uri));
  case 5: { // RTSP
      RtspMediaSource.Factory factory4 = new RtspMediaSource.Factory();
      factory4.f5003b = str6;                              // UA
      return new RtspMediaSource(w0.a(uri), new …rtsp.l(factory4.f5002a), factory4.f5003b); }
  case 6: case 7: // FILE vía extractores / RTP/UDP
      …
  default: throw new IllegalArgumentException("sourceType " + cVar + ' ' + cVar2);
}
```

**Hallazgos de `hg.j#a`:**

1. **El player fija un `CookieHandler` global** al entrar (una sola vez por proceso si ya coincide). Es el
   gestor de cookies del reproductor, no del WebView. `[observado]`
2. **Detección de tipo en cascada** con 6 niveles; el tipo se puede forzar por metadato (`m-t`) — importante
   para nuestro generador: **si emitimos `#EXT-X-...`/`m-t` no aplica** (OTT no lee tags HLS para esto), pero un
   proveedor Xtream/Stalker puede mandar `m-t="hls"|"mpd"` en su API. `[observado]`
3. **`/ace/getstream` ⇒ FILE.** El detector conoce el endpoint de Xtream y lo trata como **progresivo**
   (extractor), no como HLS. `[observado]`
4. **`i11`** (modo "compat"/"max"/default → 0/9/1) se pasa a `m6.f#d` (load control/extractores) y a
   `n7.d` (tracker HLS). `[observado]`; el significado exacto de cada valor `[no disponible]`.
5. **`factory.f4993h = false`**: se asigna un flag del `HlsMediaSource.Factory`; al estar **renombrado** el
   campo, **no** se puede afirmar cuál es (`allowChunklessPreparation`/`useSessionKeys` son candidatos
   públicos de la API de ExoPlayer) → `[no disponible]`, ver §10. `[observado el assignment / no disponible la semántica]`

### 3.5 `hg.j#b` — el parser de headers por canal (código real, **hallazgo central**)

`public static void b(fg.i iVar, ug.u uVar, HashMap map) throws IOException` — `ev_474fc0c2…` (verbatim):

```java
public static void b(fg.i iVar, u uVar, HashMap map) throws IOException {
    String strB;
    Map<String, String> map2;
    if (iVar == null || (strB = iVar.b("http-h")) == null) {
        strB = (uVar == null || (map2 = uVar.D) == null) ? null : map2.get("http-h");
    }
    if (strB != null) {
        if (!ee.n.q0(strB, '{')) {                       // NO empieza por '{'
            for (String str : ee.n.n0(strB, new char[]{'&'}, 0, 6)) {
                if (ee.n.W(str, '=')) {
                    List listN0 = ee.n.n0(str, new char[]{'='}, 0, 6);
                    map.put((String) listN0.get(0), (String) listN0.get(1));
                }
            }
            return;
        }
        JsonReader jsonReaderF = vf.d.f(strB);           // SÍ empieza por '{' → JSON
        if (jsonReaderF.peek() != JsonToken.BEGIN_OBJECT) { jsonReaderF.skipValue(); return; }
        jsonReaderF.beginObject();
        while (jsonReaderF.hasNext()) {
            String strNextName = jsonReaderF.nextName();
            if (jsonReaderF.peek() == JsonToken.NULL) { jsonReaderF.nextNull(); }
            else { map.put(strNextName, jsonReaderF.nextString()); }
        }
        jsonReaderF.endObject();
    }
}
```

**Gramática efectiva (la que debemos respetar al emitir):**

```
http-h := "K1=V1&K2=V2&…"      (se parte por '&'; cada par se parte por '='; solo pares CON '=')
        | "{ \"K1\":\"V1\", \"K2\":\"V2\", … }"   (objeto JSON; valores NULL se ignoran)
precedencia: atributo del ítem (fg.i)  >  atributo del canal (ug.u.D)
destino: HashMap que se pasa tal cual al DataSource de ExoPlayer
```

`[observado]` (cuerpo completo arriba). Consecuencias para nuestra doctrina de headers:

| Regla nuestra | ¿Qué dice el binario? | Etiqueta |
|---|---|---|
| EXTHTTP JSON con nombres arbitrarios | **Soportado nativamente** (`nextName()` → clave literal) | `[observado]` |
| Formato `K=V&K2=V2` | **Soportado** (fallback / alternativa) | `[observado]` |
| Valores con `=` dentro (p.ej. `Cookie: a=b`) | **Se pierde** lo que haya tras el segundo `=` (parte por `=` y usa índice 0 y 1) | `[derivado]` |
| Valores con `&` dentro | **Se rompe** (el `&` es separador de pares en modo querystring) | `[derivado]` |
| Valores con `{` al inicio pero no JSON válido | Se descarta **todo** el bloque (no cae al modo `&`) | `[observado]` |
| Petición con `'null'` explícito | Se **omite** el header | `[observado]` |
| Header repetido | Gana el **último** (`map.put`) → un solo valor por nombre | `[derivado]` |

> **Aplicación directa:** nuestro `#EXTHTTP:{...}` en **JSON** es el camino más seguro para OTT (no hay
> ambigüedad de `&`/`=`); el modo `&` solo es viable para valores simples sin `&`, `=`, `{`.
> La matriz v9 de 139 headers (alcance fijado en R1 §443) puede evaluarse header por header contra esta
> gramática sin necesidad de ejecutar el APK.

### 3.6 `hg.k` — DataSource/factory HTTP propio

```java
public final class hg.k {                 // ev_58bc00a6…
    private final Context p;
    private final String f19179q;         // User-Agent compuesto
    private final HashMap<String,String> f19180r;  // headers
    public hg.k(Context context, String str, HashMap<String,String> map) { … }
    public f8.q k() { … }                 // descriptor DEX: ()Ljava/lang/Object; (bridge covariante)
}
```

`[observado]`: constructor `(Context, String, HashMap<String,String>)`; un método `k()` cuyo tipo declarado es
`f8.q`, **el mismo tipo que `HlsMediaSource.Factory` recibe como `DataSource.Factory`** (`(f8.q) eVar.getValue()`
en §3.4). `[derivado]` → `hg.k` es el puente "config → DataSource.Factory" del player; el cliente HTTP concreto
queda dentro de código renombrado → `[no disponible]`.

**Nativas de red que acompañan (R1, observado):** `libffmpegJNI.so` (FFmpeg `Lavc58.54.100` = FFmpeg 4.2),
`librtmp-jni.so`, `libzstd-jni-1.5.7-4.so`, `libchelper.so`, `libmmkv.so`. En **1.6.9.4** además `libvlc.so` +
`libvlcjni.so`. `[observado por R1]`

### 3.7 Selección de pistas / ABR — `hg.a#b` (código real)

`public static List b(d6.s1 s1Var, d8.f fVar, int i10)` — `ev_40dce2eb…` (verbatim, recortado a lo esencial):

```java
public static List b(s1 s1Var, d8.f fVar, int i10) {          // s1=TrackGroupArray, f=d8.f (MappedTrackInfo-like)
    d dVar = null;
    d8.i.a aVar = (fVar == null) ? null : fVar.f16494c;
    for (int i11 = 0; aVar != null && i11 < aVar.f16495a; i11++) {
        l0 l0Var = aVar.f16497c[i11];                          // l0 = TrackGroup
        if (l0Var.f19533o != 0) {
            boolean z = s1Var != null && (s1Var.Z(),
                       s1Var.f16221d.f16065d[i11].getTrackType() == i10);
            if (z) { dVar = new d(l0Var); break; }             // d = hg.a.d (wrapper de TrackGroup)
        }
    }
    if (dVar == null) return nd.n.f22570o;                      // lista vacía
    e8.b bVar = new e8.b(studio.scillarium.ottnavigator.e.a.a().getResources());
    ArrayList arrayList = new ArrayList();
    l0 l0Var2 = dVar.f19152a;
    for (int i13 = 0; i13 < l0Var2.f19533o; i13++) {
        k0 k0Var = l0Var2.p[i13];                               // k0 = TrackGroup interna
        for (int i15 = 0; i15 < k0Var.f19524o; i15++) {
            q0 q0Var = k0Var.p[i15];                            // q0 = Format
            ig.b bVar2 = new ig.b(bVar.a(q0Var), (i13*100)+i15, q0Var.f16180q, q0Var.p);
            if (i10 == 2) {                                     // tipo VIDEO
                bVar2.f19906e = new md.f<>(Integer.valueOf(q0Var.E),   // ancho
                                           Integer.valueOf(q0Var.F),   // alto
                                           Float.valueOf(q0Var.G));    // fps
            }
            arrayList.add(bVar2);
        }
    }
    return arrayList;
}
```

**Lectura:** OTT **no implementa su propio ABR**; consume `MappedTrackInfo`/`TrackGroupArray` de ExoPlayer y
construye una **lista de variantes para la UI** con `ancho`, `alto`, `fps` y un **id estable `grupo*100+pista`**.
La selección real de calidad la hace el `TrackSelector` de ExoPlayer (renombrado). `[observado]`+`[derivado]`

`[derivado]` Implicación para nosotros: **el `BANDWIDTH`/`RESOLUTION`/`FRAME-RATE` del `EXT-X-STREAM-INF` es lo
que la UI de OTT mostrará como "calidades"**, porque los tres campos leídos (`E`,`F`,`G` de `Format`) son
exactamente width/height/frameRate, y el id `grupo*100+pista` sigue el orden del manifest. Si el master lista
una variante que no existe, OTT mostrará una entrada muerta.

**Campos de configuración global:** `hg.a` declara `int[] f19138a/f19139b/f19140c/f19141d` (4 arrays) y
`a(Context, fg.i, boolean, boolean): hg.a$a` (constructor de config desde perfil). `[observado]` — el
contenido de esos arrays (probablemente preferencias de códec/orden) **no** se leyó (valores estáticos
`null` en la metadata) → `[no disponible]`.

### 3.8 Cookies, credenciales y "tokens"

| Elemento | Observación | Etiqueta |
|---|---|---|
| Cookie jar | `CookieHandler.setDefault(<handler propio>)` al crear la fuente (`hg.j#a`) | `[observado]` |
| Credenciales de proveedor | Van **en la URL** (patrón Xtream `…/user/pass/…`); el detector conoce `/ace/getstream` | `[observado]` (detección) / `[derivado]` (patrón) |
| Perfil HTTP del proveedor | mapa `http` en el perfil (`vf.q<String,String>`) → se vuelca en los headers (`map5.putAll`) | `[observado]` |
| Referer | parámetro explícito (`str9`) o `perfil.j(ítem)`; se inyecta como `"Referer"` | `[observado]` |
| User-Agent | `ig.c.a(perfil, ?, headers, ítem, "ExoPlayerLib/2.15.1")` | `[observado]` |
| OAuth/JWT/refresh | **No se observó** ningún flujo de token ni endpoint de auth en el camino de reproducción | `[no disponible]` (no hay evidencia) |
| Cuentas/billing | `com.android.vending.BILLING` + `ProxyBillingActivity` — **fuera de alcance** (R1 §8) | `[observado]`/excluido |

### 3.9 DRM — **inventario de clases únicamente** (frontera legal R1 §8 vigente)

> **Declaración explícita:** en esta sección **no** se describe ningún handshake de licencias, ni se
> reconstruye el algoritmo de construcción de peticiones, ni se documenta cómo evadir Widevine/PlayReady.
> Se enumera **qué clases existen** y **qué atributos las alimentan**, que es lo que el alcance permite.

| Elemento | Observación | Etiqueta |
|---|---|---|
| Atributos | `d-t` (widevine/clearkey/playready, case-insensitive), `d-k`, `d-u`; **1.7.3.3 añade `d-d`** | `[observado]` |
| UUIDs constantes | `d6.g.f16021d` (Widevine), `f16020c` (ClearKey), `f16022e` (PlayReady), `f16018a` (NONE) | `[observado]` |
| Manager | se construye `i6.b(UUID, x1, <callback>, HashMap, boolean multiSesión, int[], boolean, f8.s, 300000L)` | `[observado]` |
| Sin DRM | rama `i6.o.f19372a` (manager "void") cuando no hay `d-t`/`d-k`/`d-u` | `[observado]` |
| Provider en cada fuente | `HlsMediaSource.Factory.f = new t7.b(bVar)`; `DashMediaSource.Factory.f4912c = new u7.d(bVar)`; `SsMediaSource.Factory.f5098d = …` | `[observado]` |
| Timeout | `300000L` (5 min) en el manager | `[observado]` |

**Clases involucradas (inventario, sin análisis de protocolo):** `com.google.android.exoplayer2.drm.*`
(1.7.3.3 conserva `drm.e` = `DrmSessionManager` con nombre), `i6.b`, `i6.o`, `i6.f`, `c0` (clave local),
`a0`/`a` (callback de licencia), `d6.g` (UUIDs). `[observado]`

**Lo que NO se hizo (y no se hará):** captura de licencias, ingeniería del `HttpMediaDrmCallback`, derivación de
claves, análisis de CDM, ni nada que permita reproducir contenido protegido sin autorización. `[frontera R1 §8]`

### 3.10 Parsers de playlist — qué se observó y qué no

| Formato | Dónde se parsea | Evidencia | Etiqueta |
|---|---|---|---|
| **HLS** (`m3u8`) | ExoPlayer (`HlsMediaSource` + `n7.d` tracker + `n7.h/n7.i` parsers internos) | `hg.j#a` case 2; clases `n7.*` | `[observado]` |
| **DASH** (`mpd`) | ExoPlayer `DashMediaSource` | case 3; `DashMediaSource.Factory` | `[observado]` |
| **SmoothStreaming** | ExoPlayer `SsMediaSource` | case 4 | `[observado]` |
| **RTSP/RTP/UDP** | ExoPlayer `RtspMediaSource` / progresivo | case 5–7 | `[observado]` |
| **MPEG-TS / progresivo** | ExoPlayer `ProgressiveMediaSource` (`i7.c0`) + `j6.h` extractores | case 1/6 | `[observado]` |
| **M3U/M3U8 de lista de canales (M3U Plus)** | Parser propio de OTT | **No identificado**: el modelo `fg.i` (ítem con atributos) lo consumen ~cientos de clases (`ah.*`,`bg.*`,`bh.*`,`cg.*`,`ch.*`,`yg.*`,`zg.*`); el parser concreto no se aisló | `[no disponible]` |
| **XSPF** | Parser propio de OTT | idem (no se observó ninguna clase con `XmlPullParser`/`Document` en las firmas revisadas — muestra parcial, no prueba de ausencia) | `[no disponible]` |

**Cómo se cerraría (sin inventar):** `trace_android_references` sobre el **creador** del modelo (p.ej. sobre
`fg.i` filtrando por clases con métodos estáticos que devuelven `List<fg.i>`), o instrumentación dinámica
(Frida sobre `fg.i#<init>` y leer el stack). Ambas fuera del alcance actual (la segunda exige dispositivo). `[derivado]`

### 3.11 Motores en 1.6.9.4 — ExoPlayer **y** VLC

| Evidencia | Resultado | Etiqueta |
|---|---|---|
| `search "org.videolan.libvlc"` | **38 clases** con nombre: `LibVLC`, `LibVLCFactory`, `Media`, `MediaPlayer`, `MediaList`, `MediaDiscoverer`, `RendererDiscoverer`, `VLCObject`, `VideoHelper`, `stubs.*`, `util.HWDecoderUtil`, `util.AndroidUtil`, `util.VLCUtil`, `util.Extensions`, `util.MediaBrowser`, `util.VLCVideoLayout`, `media.MediaPlayer`, `media.VideoView`, `interfaces.*` | `[observado]` |
| Nativas (R1) | `libvlc.so`, `libvlcjni.so` presentes en `arm64-v8a`, `armeabi-v7a`, `x86` | `[observado por R1]` |
| Camino ExoPlayer | completo y mapeado (§3.4–§3.7) | `[observado]` |
| Selector de motor (UI: ExoPlayer/VLC/FFmpeg) | **No aislado** (clase renombrada) | `[no disponible]` |

`[derivado]` En 1.6.9.4 **ambos** motores son funcionalmente posibles: bindings Java completos + librería
nativa presente + `extractNativeLibs=true` (carga clásica por ruta).

---

## 4. Deep dive — OTT Navigator **1.7.3.3** (SECUNDARIO / DELTA)

**Artefacto:** `C:\Users\HFRC\Downloads\studio-scillarium-ottnavigator-25110201-72288060-be45e5b34348383c8eef398cb7ff927e.apk`
**SHA-256:** `b964c27457b43be633ee5828a2dabeb09d7f56a3d39b82172e110ed26039b6fd` · 21.849.704 B
**Package:** `studio.scillarium.ottnavigator` · vc `25110201` · minSdk 26 · targetSdk 30 · **13.492 clases** (3.177 más que 1.6.9.4). `[observado]`

### 4.1 Delta de manifiesto e identidad

| Campo | 1.6.9.4 | 1.7.3.3 | Etiqueta |
|---|---|---|---|
| minSdk / targetSdk | 23 / 33 | **26 / 30** | `[observado]` |
| Clases / recursos | 10.315 / 2.394 | **13.492 / 3.124** | `[observado]` |
| Componentes | 11 act · 11 svc · 11 rcv · 2 prv | **62 act · 11 svc · 12 rcv · 6 prv** (R1) | `[observado por R1]` |
| `usesCleartextTraffic` | `true` | `true` | `[observado por R1]` |
| `networkSecurityConfig` | ausente | ausente | `[observado por R1]` |
| Nativas VLC | `libvlc.so` + `libvlcjni.so` | **ausentes** | `[observado por R1]` |
| Firmas | v1+v2+v3, Source Stamp | **solo v2**, sin stamp | `[declarado por el capitán]` |
| SDKs de terceros | Ads/Cast/Play Core/WorkManager/Room | + AppLovin MAX, Huawei Ads/PPS, AppCoins, `ru.ok.tracer` | `[observado por R1]` |
| Clases ExoPlayer con nombre | 1 (`source.hls.HlsMediaSource`) | **26** (`source.TrackGroup`, `source.TrackGroupArray`, `dash.DashMediaSource`, `hls.*`, `rtsp.*`, `smoothstreaming.*`) + `drm.e`, `ui.SubtitleView` | `[observado]` |

### 4.2 Re-siembra de ofuscación: el mapa viejo→nuevo

| Rol | 1.6.9.4 | 1.7.3.3 | Evidencia |
|---|---|---|---|
| Fábrica de MediaSource | `hg.j` (`#a`) | **`h8.k`** (`#a`) | `ev_c8ae5e7a…` / `ev_dbdc5d8d…` |
| Parser de `http-h` | `hg.j#b` | **`h8.k#b`** | `ev_474fc0c2…` / `ev_12125ddd…` |
| Modelo de ítem | `fg.i` (`b(String)`) | **`f8.d`** (`a(String)`) | `ev_0f9255e2…` / `ev_feb69672…` |
| Modelo de canal | `ug.u` (campo `D`) | **`A8.v`** (`a(String)`) | idem |
| Config de player | `gg.a1` | `g8.n` | idem |
| DataSource factory | `hg.k` | **`J0(Context, UA, map, 4)`** (clase con otro nombre) | `ev_c8ae5e7a…` / `ev_dbdc5d8d…` |
| Cookie handler lazy | `md.e` (`f19175a`) | `W5.h` (`f46591a`) | idem |

`[observado]` (por las firmas equivalentes y el flujo idéntico). `[derivado]` El **mapeo uno-a-uno** se sostiene
porque los dos métodos hacen exactamente la misma secuencia con los mismos parámetros posicionales.

### 4.3 `h8.k#b` — el mismo parser de headers, idéntico (verbatim)

```java
public static void b(f8.d dVar, v vVar, HashMap map) throws IOException {
    String strA;
    if (dVar == null || (strA = dVar.a("http-h")) == null) {
        strA = vVar != null ? vVar.a("http-h") : null;
    }
    if (strA != null) {
        if (!s6.l.Z(strA, '{')) {
            for (String str : s6.l.W(strA, new char[]{'&'}, 6)) {
                if (s6.l.A(str, '=')) {
                    List listW = s6.l.W(str, new char[]{'='}, 6);
                    map.put((String) listW.get(0), (String) listW.get(1));
                }
            }
            return;
        }
        JsonReader jsonReaderF = T7.c.f(strA);
        try {
            if (jsonReaderF.peek() != JsonToken.BEGIN_OBJECT) { jsonReaderF.skipValue(); return; }
            jsonReaderF.beginObject();
            while (jsonReaderF.hasNext()) {
                String strNextName = jsonReaderF.nextName();
                if (jsonReaderF.peek() == JsonToken.NULL) { jsonReaderF.nextNull(); }
                else { map.put(strNextName, jsonReaderF.nextString()); }
            }
            jsonReaderF.endObject();
        } catch (EOFException unused) { }
    }
}
```

`[observado]` → **misma gramática exacta** (§3.5) + `try/catch (EOFException)` (tolerancia a JSON truncado).
Conclusión: **la matriz de headers que definamos aplica igual a las dos versiones.**

### 4.4 `h8.k#a` — la fábrica en 1.7.3.3 (delta funcional real)

Firma: `a(Context, String, String, f8.d, String, String, A8.v, g8.n, int): g3.a` — **9 parámetros**, con **dos
`String`** delante del modelo (tipo declarado + ¿? ), frente a 1.6.9.4 que recibía un **enum** `hg.a$c`.

**Extracto 1 — cookie handler, tipo y Basic auth (verbatim):**

```java
Uri uri = Uri.parse(str == null ? "" : str);
try {
    CookieHandler cookieHandler = CookieHandler.getDefault();
    W5.h hVar2 = f46591a;
    if (!A7.a.a(cookieHandler, hVar2.getValue())) {
        CookieHandler.setDefault((CookieHandler) hVar2.getValue());
    }
} catch (Exception unused) { }

g8.e eVarA = g8.j.a(dVar2);                 // perfil
if (eVarA == null) eVarA = g8.j.b(vVar2);

i8.b bVar3 = new i8.b(str2);                // ← tipo de fuente como objeto
if (str2.equals(aw.f3do)) { bVar = null; }
String strA5 = (bVar != null) ? bVar.f46872a : null;
if (strA5 == null) {
    bVar = bVar3;
    strA5 = m8.c.a(uri, eVarA, dVar2, vVar2);   // ← inferencia de tipo (equivalente a h0.C + m-t)
}

HashMap map = new HashMap();
… map.putAll(T7.c.j(<perfil."http">)) …
String strI = str13 == null ? (eVarA != null ? eVarA.i(dVar2) : null) : str13;
if (strI != null) map.put("Referer", strI);
b(dVar2, vVar2, map);                        // ← http-h

String strA6 = i8.d.a(eVarA, str12, map, dVar2, "ExoPlayerLib/2.15.1");   // ← UA

/* ===== NUEVO EN 1.7.3.3: Basic auth desde el userInfo de la URL ===== */
String userInfo = uri.getUserInfo();
if (userInfo != null && (strA4 = s4.a.A(userInfo)) != null) {
    String strDecode = URLDecoder.decode(strA4, "UTF-8");
    Charset charset = s6.a.f49925b;
    map.put("Authorization", "Basic ".concat(new String(Base64.encode(strDecode.getBytes(charset), 0), charset)));
}

W5.h hVar5 = new W5.h(new J0(context, strA6, map, 4));   // DataSource factory
```

**Extracto 2 — DRM: atributo nuevo `d-d` (verbatim, recortado; **sin** detalle de construcción de claves):**

```java
if (dVar2 == null || (strA2 = dVar2.a("d-d")) == null) {
    strA2 = vVar2 != null ? vVar2.a("d-d") : null;
    if (strA2 == null) strA2 = dVar2 != null ? dVar2.a("d-k") : null;
    if (strA2 == null) strA2 = vVar2 != null ? vVar2.a("d-k") : null;
}
/* strA2 se procesa como identificador de dispositivo/clave; el resultado (strA3)
   se pasa a DashMediaSource.Factory.f19078h.  [inventario — no se documenta el algoritmo] */
```

**Extracto 3 — ramas de MediaSource (verbatim, recortado):**

```java
if (strA5.equals(str8)) {                     // str8 = "hls"
    l3.d dVar3 = new l3.d(i6);                // tracker factory
    HlsMediaSource.Factory factory = new HlsMediaSource.Factory((C3.q) hVar5.getValue());
    factory.f19175f = new B(i23, eVar);       // proveedor DRM
    factory.f19171b = dVar3;
    …
    return new HlsMediaSource(v9, cVar, hVar22, aVar5, eVarA2, sVar3, new m3.b(cVar, sVar3, cVar2),
                              factory.f19178j, factory.f19177h);     // ← 9 args
}
if (strA5.equals("ts")) { … new w(vB2, qVar, uVar, eVar, sVar4, 1048576); }   // progresivo
if (strA5.equals("mpd")) { DashMediaSource.Factory f2 = new DashMediaSource.Factory(...);
                           f2.f19073c = new B(i23, eVar); f2.f19078h = new b(strA3); … }
if (strA5.equals("ss")) { SsMediaSource.Factory f3 = new SsMediaSource.Factory(...); … }
if (strA5.equals("rtsp")) { RtspMediaSource.Factory f4 = new RtspMediaSource.Factory(); f4.f19195a = strA6; … }
if (strA5.equals("rtp") || "udp") { … }
throw new IllegalArgumentException("sourceType " + i8.b.a(str2) + " " + i8.b.a(strA5));
```

**Delta funcional de la fábrica:**

| Cambio | 1.6.9.4 | 1.7.3.3 | Etiqueta |
|---|---|---|---|
| Tipo de fuente | enum `hg.a.c` (AUTO/HLS/DASH/SMOOTHSTREAM/RTSP/FILE/UDP/RTP) + cascada inline | **objeto/String** (`i8.b`) + inferencia delegada a `m8.c.a(uri, perfil, ítem, canal)`; valores literales `"hls"`, `"ts"`, `"mpd"`, `"ss"`, `"rtsp"`, `"rtp"`, `"udp"` | `[observado]` |
| Detección por extensión/`/ace/getstream` | inline en `hg.j#a` | **no visible** en `h8.k#a` (movida a `m8.c.a`) | `[observado]` (no está aquí) / `[no disponible]` (dónde) |
| `Authorization: Basic` | **no** | **sí**, desde `uri.getUserInfo()` | `[observado]` |
| Atributo DRM extra | — | **`d-d`** (con fallback a `d-k`) | `[observado]` |
| `http-h` | idéntico | idéntico (+`EOFException`) | `[observado]` |
| UA por defecto | `"ExoPlayerLib/2.15.1"` | **`"ExoPlayerLib/2.15.1"`** (mismo literal) | `[observado]` |
| `HlsMediaSource` | ctor 10 args (incluye `boolean`) | ctor **9 args** (sin `boolean`) | `[observado]` |
| Modo "compat"/"max" | `k4.f4312w0` → 0/9/1 | `S0.f14846l0` → 0/9/1 | `[observado]` |

`[derivado]` El cambio de aridad del constructor de `HlsMediaSource` indica **versión distinta de ExoPlayer**
(la API de `HlsMediaSource` cambió entre minors). No se puede fijar el número con esta evidencia.

### 4.5 Motores en 1.7.3.3 — ExoPlayer sí, VLC **no cargable**

| Evidencia | Resultado | Etiqueta |
|---|---|---|
| Clases `org.videolan.*` en dex | presentes (R1: 152 hits de `org/videolan`) | `[observado por R1]` |
| `libvlc.so` / `libvlcjni.so` en `lib/**` | **ausentes** | `[observado por R1]` |
| `libffmpegJNI.so` | presente (con `ExoPlayer` 9 hits y `Lavc58.54.100`) | `[observado por R1]` |
| Camino ExoPlayer | completo y mapeado (§4.3–§4.4) | `[observado]` |

`[derivado]` Sin la librería nativa, cualquier intento de usar el motor VLC en 1.7.3.3 fallaría al cargar
(`UnsatisfiedLinkError` en `System.loadLibrary`). **El único motor Ejecutable en 1.7.3.3 es ExoPlayer 2.x**
(con renderers de software FFmpeg para lo que el MediaCodec no acepte). No se observó el selector de motor
(renombrado) → `[no disponible]` el punto exacto donde se decide.

### 4.6 Qué significa el delta para nuestro stack

1. **Headers:** nada que cambiar; la gramática `http-h` es la misma → **nuestra matriz EXTHTTP JSON vale para
   las dos versiones**. `[observado]`
2. **Credenciales en URL:** si algún día emitimos `http://user:pass@host/...`, **1.7.3.3** añadirá
   `Authorization: Basic` automáticamente y **1.6.9.4 no**. Si además mandamos nuestro propio `Authorization`
   por `http-h`, el orden importa: el Basic se añade **después** de `b(...)` → **sobrescribe** el nuestro
   (`map.put`). `[derivado del orden de llamadas observado]`
3. **Motor:** en 1.7.3.3 desaparece la vía VLC → si el propietario dependía de VLC para algún códec/contenedor,
   ese caso ya no está cubierto por el build vigente. `[derivado]`
4. **Riesgo de actualización:** build vigente **re-firmado** (solo v2, sin Source Stamp) → no se instala
   encima del de Play y su procedencia no está establecida. `[observado/declarado]`

---

## 5. Deep dive — SFA / sing-box (`io.nekohasekai.sfa`)

### 5.1 `SFA 1.13.11` (sha256 `9adfa37e…`, vc 662, minSdk 23, targetSdk 35, compileSdk 36, **8.745 clases**, 1.071 recursos)

**Manifiesto (verbatim, extracto, ev_c223f4fa…):**

```xml
<application android:name="io.nekohasekai.sfa.Application" android:allowBackup="true"
             android:extractNativeLibs="true" android:fullBackupContent="@xml/backup_rules">
  <activity android:name="io.nekohasekai.sfa.compose.MainActivity" android:exported="true"
            android:launchMode="singleTask" android:theme="@style/AppTheme">
      <intent-filter><action android:name="android.intent.action.MAIN"/>
                     <category android:name="android.intent.category.LAUNCHER"/></intent-filter>
      <!-- módulo Xposed -->
      <intent-filter><action android:name="android.intent.action.MAIN"/>
                     <category android:name="de.robv.android.xposed.category.MODULE_SETTINGS"/></intent-filter>
      <!-- import de perfil remoto -->
      <intent-filter><action android:name="android.intent.action.VIEW"/>
                     <category android:name="android.intent.category.BROWSABLE"/>
                     <data android:scheme="sing-box" android:host="import-remote-profile"/></intent-filter>
      <!-- import de archivo .bpf / config -->
      <intent-filter android:priority="999"> … <data android:scheme="file"/>
          <data android:scheme="content"/> <data android:pathPattern="/.*\\.bpf"/> … </intent-filter>
  </activity>
  <service android:name="io.nekohasekai.sfa.bg.VPNService" android:exported="false"
           android:permission="android.permission.BIND_VPN_SERVICE"
           android:foregroundServiceType="systemExempted">
      <intent-filter><action android:name="android.net.VpnService"/></intent-filter>
  </service>
  <service android:name="io.nekohasekai.sfa.bg.ProxyService"
           android:foregroundServiceType="specialUse" android:exported="false"/>
```

| Hecho | Valor | Etiqueta |
|---|---|---|
| `usesCleartextTraffic` | **no declarado** (con `targetSdk 35`, Android bloquea cleartext **para esta app**) | `[observado]` |
| `networkSecurityConfig` | **no declarado** | `[observado]` |
| Servicios de túnel | `bg.VPNService` (`BIND_VPN_SERVICE`, FGS `systemExempted`), `bg.ProxyService` (FGS `specialUse`), `bg.RootServer` | `[observado]` |
| Quick Settings | `bg.TileService` (`BIND_QUICK_SETTINGS_TILE`, `directBootAware=true`) | `[observado]` |
| Boot | `bg.BootReceiver` (`BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`) | `[observado]` |
| Privilegios | proveedor **Shizuku** (`rikka.shizuku.ShizukuProvider`), proveedor **libxposed** (`io.github.libxposed.service.XposedProvider`), permiso `moe.shizuku.manager.permission.API_V23` | `[observado]` |
| Paquetes | `QUERY_ALL_PACKAGES`; permite `REQUEST_INSTALL_PACKAGES` + `UPDATE_PACKAGES_WITHOUT_USER_ACTION` | `[observado]` |
| Ubicación | `ACCESS_FINE/COARSE/BACKGROUND_LOCATION`, `ACCESS_WIFI_STATE` | `[observado]` |
| Cámara | `CAMERA` (QR de perfiles) | `[observado]` |

**Mapa de paquetes (observado, 759 entradas elididas por tamaño — muestra representativa):**

| Paquete | Contenido relevante | Etiqueta |
|---|---|---|
| `bg` | `VPNService`, `ProxyService`, `BoxService`, `ServiceBinder`, `ServiceConnection`, `DefaultNetworkMonitor`, `DefaultNetworkListener`, `LocalResolver`, `PlatformInterfaceWrapper`, `RootServer/RootClient`, `UpdateProfileWork`, AIDL `IService`/`IServiceCallback` | `[observado]` |
| `database` | `Profile`, `ProfileManager`, `TypedProfile` (`Convertor.unmarshall`), `ProfileDatabase` (Room), `Settings`, `preference.KeyValueDatabase` | `[observado]` |
| `constant` | `Action`, `Alert`, `Path`, `ServiceMode`, `SettingsKey`, `Status`, `EnabledType` | `[observado]` |
| `utils` | **`HTTPClient`**, `CommandClient`, `ConnectivityBinderUtils`, `HookStatusClient`, `VpnDetectionTest`, `MIUIUtils` | `[observado]` |
| `vendor` | `ApkDownloader`, `ApkInstaller`, `GitHubUpdateChecker`, `RootInstaller`, `ShizukuInstaller`, `UpdateWorker` | `[observado]` |
| `xposed` + `xposed.hooks.hidevpn` | `VpnSanitizer`, `VpnAppStore`, `HookConnectivityManager*` (13 hooks), `HookNetworkCapabilitiesWriteToParcel`, `HookNetworkInterfaceGetName` | `[observado]` |
| `compose.*` | UI (Jetpack Compose): dashboard, profiles, logs, connections, settings, QR | `[observado]` |
| `qrs` | `LubyCodec`, `QRSEncoder/Decoder`, `SolitonDistribution` (transferencia por QR multi-frame) | `[observado]` |

**Stack de red (lo que importa):**

```java
public final class io.nekohasekai.sfa.utils.HTTPClient {     // ev_b08d355d…
    private final io.nekohasekai.libbox.HTTPClient client;   // ← Go (sing-box core)
    private final ed.f userAgent$delegate;                   // Kotlin lazy: UA
    public final String getString(String url) { … }
    public final void close() { … }
}
```

`[observado]` → **el cliente HTTP de SFA es nativo (libbox / sing-box en Go), no Java**. Consecuencia: los
headers, TLS y proxy de SFA **no son analizables estáticamente en el dex**; lo único visible es el wrapper
Kotlin y el `userAgent` lazy. `[derivado]`

`[derivado]` Para el diagnóstico del túnel (rebote nginx / breaker del gateway) esto significa que **la
evidencia relevante de SFA no está en el APK**, sino en su configuración (`Profile` en Room) y en el log del
núcleo. El APK solo confirma: `sing-box` 1.13.11, perfil importable por URL (`sing-box://import-remote-profile`),
túnel por `VpnService` + `ProxyService` y auto-arranque por `BootReceiver`.

### 5.2 `SFA 1.11.11` (sha256 `83e2d08f…`, vc 520, minSdk **21**, targetSdk 35, **4.054 clases**)

| Hecho | 1.11.11 | 1.13.11 | Etiqueta |
|---|---|---|---|
| Clases | **4.054** | 8.745 | `[observado]` |
| UI | clásica: `ui.MainActivity`, `ui.ShortcutActivity`, `ui.profile.NewProfileActivity/EditProfileActivity/EditProfileContentActivity`, `ui.profileoverride.*`, `ui.debug.DebugActivity/VPNScanActivity`, `ui.profile.QRScanActivity` | **Compose** (`compose.*`) | `[observado]` |
| `bg.VPNService` / `ProxyService` / `BootReceiver` | presentes (igual) | igual | `[observado]` |
| `moe.shizuku…` permiso | **no** | sí | `[observado]` |
| `REQUEST_INSTALL_PACKAGES` / `UPDATE_PACKAGES_WITHOUT_USER_ACTION` | **no** | sí | `[observado]` |
| ML Kit | no | `com.google.mlkit.*` | `[observado]` |
| Deep link `sing-box://import-remote-profile` | **no observado** (4 intent-filters en `MainActivity`: MAIN + VIEW/OPENABLE) | sí | `[observado]` |

`[derivado]` 1.11.11 → 1.13.11 es una **reescritura de UI + endurecimiento de privilegios** (Shizuku/Xposed,
instalación de paquetes), no un cambio del núcleo de túnel (que es nativo en ambos).

---

## 6. Deep dive — v2rayNG `1.9.31`

**Artefacto:** `v2rayNG.apk` · sha256 `52a79ed8…` · 30.905.560 B · package `com.v2ray.ang` · vc `4000627` · minSdk 21 · targetSdk 35 · **6.514 clases** · sólo nativas `armeabi-v7a` (`libgojni.so`, `libhysteria2.so`, `libtun2socks.so`, `libmmkv.so`). `[observado]`

| Área | Observación | Etiqueta |
|---|---|---|
| Túnel | `service.V2RayVpnService` (`BIND_VPN_SERVICE`, FGS `specialUse`), `service.V2RayProxyOnlyService` (FGS `specialUse`), `service.V2RayTestService` | `[observado]` |
| Quick Settings / widget | `QSTileService`, `receiver.WidgetProvider`, `receiver.BootReceiver` (`BOOT_COMPLETED`) | `[observado]` |
| Entrada por enlaces | `ui.UrlSchemeActivity` (exported, `VIEW`+`SEND`+`BROWSABLE`) → import de `vmess://`/`vless://`/`ss://`… | `[observado]` |
| Suscripciones | `ui.SubSettingActivity`, `ui.SubEditActivity`, `ui.UserAssetActivity` / `UserAssetUrlActivity` | `[observado]` |
| Routing | `ui.RoutingSettingActivity`, `ui.RoutingEditActivity` | `[observado]` |
| QR / barcode | `quickie.QRScannerActivity`, `journeyapps.barcodescanner.CaptureActivity`, `ui.ScannerActivity`, `ui.ScScannerActivity` | `[observado]` |
| Automatización | `ui.TaskerActivity` + `receiver.TaskerReceiver` (Locale/Tasker plugin) | `[observado]` |
| Per-app proxy | `ui.PerAppProxyActivity`, `QUERY_ALL_PACKAGES` | `[observado]` |
| Núcleo | **nativo** `libgojni.so` (Xray) → protocolos no analizables en dex | `[derivado]` |

`[derivado]` v2rayNG es un **front-end** de Xray: el APK define UI, importación de perfiles y ciclo de vida del
túnel; los protocolos, TLS y transporte viven en Go. Para nuestro stack su interés es **operativo** (qué
cliente de túnel corre en el device), no de ingeniería de headers.

---

## 7. `ape-crystal-agent` (APK propio) — fuente primero

- **Identidad:** `com.ape.crystalagent` vName `1.0.0`, vc 1, **debug + `debuggable=true`**, targetSdk 28,
  sha256 `11101de8…`, 34.192.621 B. `[observado por R1]`
- **Nativas:** `libtensorflowlite_jni.so`, `libtensorflowlite_gpu_jni.so`, `libwg-go.so`, `libwg-quick.so`,
  `libwg.so`. `[observado por R1]`
- **Clases propias visibles (R1 + árbol Gradle en el repo):** `AgentService`, `ApePlayer`,
  `ApeUltraEnhanceGlEffect`, `GlslEnhancePipeline`, `TfliteInferenceEngine`, `UltraEnhancePipeline`,
  `LcevcSyntheticPipeline`, `MediaEnhanceApiPipeline`, `QoEReporter`, `SettingsApplier`, `WireGuardManager`,
  `EnrollClient`, `FeedForwardClient`, `SelfUpdateManager`, `ListLoader`, `IptvChannel`, `PlayerActivity`,
  `MainActivity`, `BootReceiver`, `AdbSelfGrantManager`. `[observado por R1]`
- **Doctrina de evidencia:** al existir el **proyecto Gradle completo** junto al APK
  (`IPTV_v5.4_MAX_AGGRESSION/android/ape-crystal-agent/`), para este artefacto **la fuente manda sobre el
  binario**; R2 no re-descompiló sus clases y no se afirma nada de su comportamiento interno aquí.
  `[derivado del alcance]` → `[no disponible]` en esta pasada (fuera del foco de R2).

---

## 8. UML de las clases halladas y cadena UI → red

### 8.1 Diagrama de clases (1.6.9.4; entre corchetes el equivalente en 1.7.3.3)

```mermaid
classDiagram
    class PlayerActivity
    class VodPlayActivity
    class hg_j["hg.j  (1.7.3.3: h8.k)"]
    class hg_a["hg.a  (config + pistas)"]
    class hg_a_c["hg.a.c  {AUTO,HLS,DASH,SMOOTHSTREAM,RTSP,FILE,UDP,RTP}"]
    class fg_i["fg.i  (ítem de playlist)  (1.7.3.3: f8.d)"]
    class ug_u["ug.u  (canal)  D: Map  (1.7.3.3: A8.v)"]
    class hg_k["hg.k  (DataSource factory bridge)"]
    class f8_q["f8.q  (DataSource.Factory)"]
    class HlsMediaSource
    class DashMediaSource
    class SsMediaSource
    class RtspMediaSource
    class ProgressiveMediaSource["i7.c0 (ProgressiveMediaSource)"]
    class i6_b["i6.b  (DefaultDrmSessionManager)"]
    class CookieHandler

    PlayerActivity --> hg_j : crea fuente
    VodPlayActivity --> hg_j
    hg_j --> hg_a_c : usa enum de tipo
    hg_j --> fg_i : lee atributos (m-t, http-h, d-t, d-k, d-u)
    hg_j --> ug_u : fallback de atributos
    hg_j --> hg_k : (Context, UA, headers)
    hg_k --> f8_q : k()
    f8_q --> HlsMediaSource : Factory(DataSource.Factory)
    f8_q --> DashMediaSource
    f8_q --> SsMediaSource
    f8_q --> RtspMediaSource
    f8_q --> ProgressiveMediaSource
    hg_j --> i6_b : si d-t/d-k/d-u
    i6_b --> HlsMediaSource : DrmSessionManagerProvider
    hg_j --> CookieHandler : setDefault()
    hg_a --> hg_j : config (modo compat/max)
```

### 8.2 Secuencia (zap → primer byte del segmento)

```
Usuario → PlayerActivity
  → [clase de reproducción ofuscada]          (no aislada → [no disponible])
    → hg.j.a(ctx, url, AUTO, item, …, referer, canal, cfg, mask)
       1. CookieHandler.setDefault(cookieJarPropio)
       2. tipo := m-t(item|canal) | infer(uri) | scheme | /ace/getstream | extensión | default(HLS|ts)
       3. headers := perfil."http"  ++  {Referer: …}  ++  parse(http-h)
       4. UA := ig.c.a(perfil, …, headers, item, "ExoPlayerLib/2.15.1")
       5. dsFactory := hg.k(ctx, UA, headers).k()          /* f8.q */
       6. drm := si d-t|d-k|d-u → i6.b(uuid, …, 300000L)
       7. switch(tipo): HLS→HlsMediaSource.Factory(dsFactory, …, drm)
                        DASH/SS/RTSP/progresivo…
  → ExoPlayer (TrackSelector propio, renombrado)  → LoadControl/Allocator (i11: compat|max|default)
    → DataSource de OTT (dentro de código renombrado) → HTTP(S)
      → respuesta → MediaCodec / FFmpeg (libffmpegJNI) / [solo 1.6.9.4] VLC (libvlc)
```

`[observado]` para los pasos 1–7; `[no disponible]` para la clase intermedia y para el nombre del `TrackSelector`.

---

## 9. Matriz de compatibilidad y hallazgos aplicables a nuestro stack

> Base: **solo** lo observado en los binarios. La matriz de 139 headers v9 (alcance R1 §443) **no** se
> re-verifica aquí; lo que se entrega es **la gramática del contenedor de headers de OTT** y las reglas que
> cualquier header debe cumplir para llegar intacto al DataSource.

| # | Hallazgo | Qué implica para nuestras listas / VPS | Etiqueta |
|---|---|---|---|
| C1 | `http-h` acepta **JSON objeto** y **querystring `k=v&…`** | Emitir **JSON** por defecto para OTT (sin ambigüedad de `&`/`=`). El modo `&` solo para valores simples | `[observado]` |
| C2 | En modo `&`, el valor se corta en el **segundo** `=` (`split('=')` → índice 0 y 1) | **Prohibido** emitir `Cookie: a=b; c=d` o `Authorization: Bearer x=y` en modo `&`; usar JSON | `[derivado]` |
| C3 | Si el valor empieza por `{`, se parsea **solo** como JSON; si no es objeto, se descarta todo | Nunca emitir un valor que empiece por `{` y no sea JSON | `[observado]` |
| C4 | `null` explícito ⇒ header omitido | Útil para "borrar" un header heredado del perfil | `[observado]` |
| C5 | Un solo valor por nombre (`put` sobrescribe) | Los headers multi-valor deben ir en **una** línea; nada de repetir claves | `[derivado]` |
| C6 | El perfil del proveedor aporta un mapa `http` base, luego `Referer`, luego `http-h` | `http-h` **gana** sobre el perfil; nuestro `Referer` explícito también puede ser sobrescrito por `http-h` si se repite | `[observado]`/`[derivado]` |
| C7 | `Referer` se inyecta como header literal `"Referer"` | Correcto y esperado; no hay normalización rara | `[observado]` |
| C8 | UA por defecto `ExoPlayerLib/2.15.1`, sustituible por perfil | Coherente con la doctrina de UA pool: OTT acepta UA custom; **no** hay validación interna del literal | `[observado]` |
| C9 | 1.7.3.3 añade `Authorization: Basic` desde `user:pass@` | Si usamos credenciales en URL, en 1.7.3.3 se enviarán **dos** mecanismos; evitar `user:pass@` cuando ya mandamos `Authorization` por `http-h` | `[observado]`/`[derivado]` |
| C10 | Detección `/ace/getstream` → **progresivo** | Un `…/ace/getstream` no se trata como HLS por OTT; para HLS hay que dar URL `.m3u8` o `m-t=hls` | `[observado]` |
| C11 | Detección por **extensión del último segmento** (`.mpd`, `mpegts`, lista en `HashSet`, default HLS) | URLs sin extensión (típico `get.php?…&output=m3u8`) caen al **default HLS** → correcto para nosotros | `[observado]`/`[derivado]` |
| C12 | `usesCleartextTraffic=true`, sin pinning ni NSC | `http://` es aceptable en OTT; no hay barrera TLS que romper | `[observado]` |
| C13 | Cookie jar propio del player | Si el proveedor exige cookie de sesión, OTT la persiste entre peticiones del player | `[observado]` |
| C14 | UI de calidades = `width×height×fps` del `Format` + id `grupo*100+pista` | `RESOLUTION` y `FRAME-RATE` del master **se muestran**; declarar de menos es degradar la percepción de calidad | `[observado]`/`[derivado]` |
| C15 | Motor: 1.7.3.3 **sin VLC** | Cualquier plan que asuma VLC en el build vigente es inválido | `[observado]`+`[derivado]` |
| C16 | SFA/v2rayNG: núcleo nativo (Go) | No esperar headers/protocolos en el dex; el diagnóstico del túnel va por config + log del núcleo | `[observado]` |

**Lo que esta matriz NO prueba:** que un header concreto (de los 139) sea *aceptado por el proveedor*. Eso es
upstream y se mide con probe, no con REA. `[derivado]`

---

## 10. Lo que NO se pudo establecer (declarado, con ruta de resolución)

| # | Desconocido | Por qué | Cómo se cerraría |
|---|---|---|---|
| U1 | Nombre de la clase del **parser M3U/M3U8** de OTT | Ofuscada; el modelo destino (`fg.i`) lo usan ~cientos de clases | `trace_android_references` filtrado por creadores del modelo + lectura de cuerpos; o Frida sobre `fg.i#<init>` con stack |
| U2 | Nombre de la clase del **parser XSPF** | ídem | ídem |
| U3 | **Versión exacta de ExoPlayer** empaquetada | `ExoPlayerLibraryInfo` renombrada; el UA `2.15.1` es literal de la app | Leer `BuildConfig`/constantes de versión si sobreviven; o huella de API (aridad de constructores) contra releases; o `strings` del dex (fuera del proveedor actual) |
| U4 | Semántica de `HlsMediaSource.Factory` campo **`f4993h=false`** (1.6.9.4) y `f19171b`/`f19177h`/`f19178j` (1.7.3.3) | Campos renombrados | Mapear contra el fuente público de ExoPlayer 2.x de la misma aridad |
| U5 | Cliente HTTP efectivo del DataSource de OTT (OkHttp vs `HttpURLConnection`) | Clase renombrada; OkHttp presente pero sin nombre | Leer el cuerpo del DataSource (`hg.k#k()` y la clase que instancia); o captura de tráfico en device autorizado |
| U6 | Selector de motor (ExoPlayer/VLC/FFmpeg) y su UI de preferencia | Clase renombrada | Búsqueda por referencias a `org.videolan.libvlc.LibVLCFactory` (using nodes) + lectura del factory |
| U7 | Significado de los 4 `int[]` de `hg.a` y de `i11` (0/9/1) | Valores estáticos no visibles; uso parcial | Leer `<clinit>` y `hg.a#a`; cruzar con ajustes del perfil |
| U8 | Contenido del **mapa `http`** del perfil de proveedor | Es dato de usuario, no del APK | Exportar el perfil del device autorizado (`/data/data/…/files`) o del backup |
| U9 | Dónde está la lógica de `/ace/getstream` en 1.7.3.3 | Se movió a `m8.c.a(...)` | Leer `m8.c#a` |
| U10 | Comportamiento en runtime de cualquiera de estos caminos | **No se ejecutó** ningún APK (no hay dispositivo ADB: R1, 0 dispositivos) | ADB con equipo autorizado por RSA (nunca remoto) + `logcat`/Frida |

---

## 11. Anexos

### Anexo A — Llamadas REA y evidencia (todas reproducibles)

| # | Operación REA | Objeto | Resultado | Evidence ID |
|---|---|---|---|---|
| 1 | `inspect_android_package` (summary) | OTT 1.6.9.4 | package/SDK/35 componentes/10.315 clases | `ev_2d41b299b0534cb4ad975d5cf94188626ce65b0bb6fe543b47465a41a8acf32f` |
| 2 | `inspect_analysis_view` android/manifest | OTT 1.6.9.4 (pág. 0–9000) | XML verbatim | `ev_00ccffb2f1962d31a6d3371e454e2515ea1bb61813c15ba8c4a4693bfc75af36` |
| 3 | `search_android_classes` | `com.google.android.exoplayer2.source.hls` | 1 coincidencia | `ev_8f4791e0cff47344e8b07f49a03e961ad7189221f34d93c6432112e41ad2f595` |
| 4 | `search_android_classes` | `com.google.android.exoplayer2.upstream` | 0 | `ev_c4d04f55a3c1b6d963c8152feee2e429b8e27d4e24e56c8481dde7d30b301c69` |
| 5 | `search_android_classes` | `HttpDataSource` | 0 | `ev_56fa3d47b0ce36d0eebe3da15c746a4dbb32547de77913df83143707aff94125` |
| 6 | `search_android_classes` | `HlsPlaylistParser` | 0 | `ev_1a7245614c525ac7fa7dec5875a0ab7a4edf2093236434627f73f6c8a84fbc50` |
| 7 | `search_android_classes` | `okhttp` | 1 (`okhttp3.internal.publicsuffix.PublicSuffixDatabase`) | `ev_fd4321835d09e1185aab81caf4f1c67c6740d18644414508a7883dd2889993ae` |
| 8 | `search_android_classes` | `cronet` | 0 | `ev_1c42d436d9359709613c2aaf4aa4ad86514f4cb8c5cb297d5398ec7223965cad` |
| 9 | `search_android_classes` | `studio.scillarium.ottnavigator` | 64 clases | `ev_bada21a1846f722b2843d9f03aa5d49897aa662b30d360f05c63b9b6950858ae` |
| 10 | `search_android_classes` | `hg.` | 11 (`hg.a,c,d,e,f,g,h,j,k,m,s`) | `ev_40336d3c95ed827fca3bd91eb137b51e92dcb1aaa4d02170e52d82ab81eac9a3` |
| 11 | `search_android_classes` | `fg.` | 16 (`fg.a`…`fg.p`) | `ev_22dd1be1422154eb3fc94039085e552ae57149e74c749622273c8c7b4f770ecf` |
| 12 | `trace_android_references` | `fg.i` | ~cientos de usuarios (`ah.*`,`bg.*`,`bh.*`,`cg.*`,`ch.*`,`yg.*`,`zg.*`) | `ev_9157b41bfee304e711c5d28934e82248a2983be8f50577ac77d2670611f1d158` |
| 13 | `trace_android_references` | `HlsMediaSource` (1.6.9.4) | `hg.j`, `o7.b` | `ev_c9366f7bd655c22e32e9989888794aab202d40ea377093951bb24369d867d7ea` |
| 14 | `inspect_android_class` | `HlsMediaSource` (1.6.9.4) | ctor 10 args | `ev_db8d797ef87faf1d570735050b9dbde4bfd071b972b61241a68f612eb1eae30a` |
| 15 | `inspect_android_class` | `hg.j` | 4 métodos, 3 campos, 3 inner | `ev_0f9255e2327fac6c742061502389b48ef3a397098ca244f364b432f1b9238d37` |
| 16 | `inspect_android_method` | **`hg.j#a`** | fábrica de MediaSource (Java, `fell_back=false`) | `ev_c8ae5e7a8a72be1f11f2c5a7c85c69ef6b85ec9f1a098560632b0dd65f795a99` |
| 17 | `inspect_android_method` | **`hg.j#b`** | parser `http-h` | `ev_474fc0c20d3beb47e99fad7c7e4afbf7efc6680a9a8970a554909c02c9887115` |
| 18 | `inspect_android_class` | `hg.a` | 6 inner, 4 `int[]` | `ev_adb117c841132d41742fc5b04831c53399d9e207384e605370699832d4ec841b` |
| 19 | `inspect_android_method` | **`hg.a#b`** | lista de pistas con w/h/fps | `ev_40dce2eb28d4a87d2827a9083447fa6b1096814aac49ae612f41a1a188017cf7` |
| 20 | `inspect_android_class` | `hg.k` | ctor `(Context,String,HashMap)` + `k(): f8.q` | `ev_58bc00a66b5d0b87536c0cc65228c534f18fa20884855450c341c9c52b96f084` |
| 21 | `search_android_classes` | `org.videolan.libvlc` (1.6.9.4) | **38 clases** | `ev_fa0a4939414e0691789a94fd8b15e68af65132b83df2132d1f37e3b2cfd63209` |
| 22 | `search_android_classes` | `com.google.android.exoplayer2.source` (1.7.3.3) | **26 clases** | `ev_1cc8765fb4badce3e05eb6b9eb8547274ce0a39b32ce9e978b77b57661daf174` |
| 23 | `trace_android_references` | `HlsMediaSource` (1.7.3.3) | `h8.h`, `h8.k` | `ev_201dd8e5b14200a2ee10e888717d030749969cfa837cf010f883f847ae75ff17` |
| 24 | `inspect_android_class` | `h8.h` (1.7.3.3) | 27 métodos, 11 campos (player/UI) | `ev_bd99f85de639e8369669e4dafd5a13aaec37bde82f43602379ed8fb36a25256b` |
| 25 | `inspect_android_class` | `h8.k` (1.7.3.3) | 3 métodos, 5 campos | `ev_feb69672cef15d826b9ed5f0876ce8ab2236bd8a8be29ac5480dba9e9821d4da` |
| 26 | `inspect_android_method` | **`h8.k#b`** | mismo parser `http-h` + `EOFException` | `ev_12125ddddfce98acde3cb4920601fe26a3a7c8ca6c0ec692d47917438a9aaedb` |
| 27 | `inspect_android_method` | **`h8.k#a`** | fábrica 1.7.3.3 + **Basic auth** + `d-d` | `ev_dbdc5d8d5e4f90062dd45746c4ac64c33fba82df2167db728664f241c54d79f7` |
| 28 | `inspect_android_package` (summary) | SFA 1.13.11 arm64 | 8.745 clases, 20 componentes | `ev_0258985cc85026d4d0164b3cf661a18f0d90b92836c5996d59d75edfa9bd68c5` + vista `ev_21b70df3eb9d8bbd981a6cfa9ef0b1d241a222c8677346fc63266ee400c9e389` |
| 29 | `inspect_analysis_view` android/manifest | SFA 1.13.11 (pág. 0–7000) | XML verbatim | `ev_c223f4fab7efaf6815cc1fe4166c21353dfe84136c823c8c335658d26cd02299` |
| 30 | `search_android_classes` | `io.nekohasekai.sfa.` | 759+ clases de app | `ev_1d355c81995c511601d861e341075f2a46cf5ec664bedfb322fd2ccf77ed3c53` |
| 31 | `inspect_android_class` | `io.nekohasekai.sfa.utils.HTTPClient` | cliente Go `libbox` + UA lazy | `ev_b08d355dd733aca9c7d668c46e2a95ea17a327d5be7f11fb8525a817aac82875` |
| 32 | `inspect_android_package` (summary) | SFA 1.11.11 | 4.054 clases; UI clásica | `ev_488f150c80b6a133f2c359815601e042a36dfa1c3f2e04012947dd3c7acb1775` + vista `ev_791575a94fd3dd35e159c89f091f3b9d034ec03517030acc8089478552844666` |
| 33 | `inspect_android_package` (summary) | v2rayNG 1.9.31 | 6.514 clases; 42 componentes | `ev_3c75c6f943ce9e17d02763780aafd1b38e16f2e8f10f9fbbb305433939288168` + vista `ev_1b8399eb1a16f38a89a66f7bfbdefcea3c94de1ef8817a9199a0e9351e7195e0` |

**Bundle exportado:** `docs/evidence/REA_R2_evidence_bundle.json.gz` (REA `export_evidence_bundle`; formato
canónico, byte-stable).

### Anexo B — Identidad del motor de análisis (para reproducibilidad)

| Componente | Valor |
|---|---|
| REA | `rea-agents 6.8.0` (server `rea` 6.8.0, started 2026-10-25T22:53:06Z), protocolo MCP 2026-07-28 |
| Proveedor Android | `jadx` / `jadx-headless-mcp 0.7.1`, jar sha256 `6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75`, source revision `5844800a486d2248fa949b74c9896285f5b54de2` |
| Bridge | `rea-jadx-bridge 7`, sha256 `e5044a8312dd0731f53af3f095508b3e5cff54df6b971c95d4305e2f39b4fa30` |
| JVM | OpenJDK `21.0.12.1`, `max_heap_bytes` 4.294.967.296, 16 procesadores |
| Límites del motor | `decompile_timeout_ms` 90.000; `resources: full`; `threads: 1` |

### Anexo C — Cómo repetir cualquier hallazgo

```
# 1) identidad + manifiesto
inspect_android_package  path=<APK>  detail=summary
inspect_analysis_view    source={kind:retained-evidence, evidence_id=<parent>}  view={kind:android, facet:manifest, offset:0, limit:9000}
# 2) mapa por nombre
search_android_classes   path=<APK>  query=<subcadena exacta>
# 3) ancla por referencias
trace_android_references path=<APK>  class_name=<tipo>
# 4) miembros y cuerpo real
inspect_android_class    path=<APK>  class_name=<clase>
inspect_android_method   path=<APK>  class_name=<clase>  method_name=<m>  overload_index=<i>
```
Cada llamada imprime `fell_back` / `representation`; **todas** las extracciones de este documento fueron
`representation=java`, `fell_back=false` (descompilación, no smali).

### Anexo D — Frontera legal aplicada (reiteración de R1 §8)

Se analizó **estática y localmente**. **No** se hizo ni se hará: handshake de licencias Disney+/Prime,
instrumentación de CDM, derivación de claves, bypass de Widevine/PlayReady, ni captura de tráfico de terceros.
La sección DRM (§3.9/§4.4) es **inventario de clases y atributos**; no contiene receta de evasión. No se
ejecutó ningún APK; no se usó ningún dispositivo (0 dispositivos ADB, R1). Toda extracción de un equipo ajeno
requiere **autorización RSA por host** y consentimiento del propietario; **nunca** remoto.

---

## 12. Cierre

- **Cumplido:** identidad y manifiesto de los 6 artefactos analizables (OTT ×2, SFA ×2 builds únicos ×3
  variantes de ABI, v2rayNG), framework identificado, cadena UI→red mapeada con **código real citado**,
  parser de headers documentado con su gramática, delta entre builds de OTT documentado, UML y matriz de
  compatibilidad entregados.
- **Declarado como no disponible (sin relleno):** nombre de clases del parser M3U/XSPF de OTT, versión exacta
  de ExoPlayer, cliente HTTP efectivo, selector de motor, semántica de campos renombrados, y todo
  comportamiento en runtime.
- **Siguiente paso natural (t3):** cruzar la gramática `http-h` (§3.5, §9 C1–C13) con la matriz v9 de 139
  headers y producir la tabla `header → ¿sobrevive a OTT? → sintaxis recomendada`, sin ejecutar nada.
