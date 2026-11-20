# Fase 4 — flujo UI real: lo ejecutado y el impedimento exacto

## 1 · Baseline verificado en esta corrida

```
git log --oneline       84f3231f → da11b79d → 0293044b → a831545e
adaptador sha256        7e72ee39eb98ce55a6e7f2acd077a1ac65fead7b4333afd5ecdf0f0eff5c198c
worktree                C:\Users\HFRC\Desktop\IPTV_FASE2_STAGING (6 ficheros, +155/−18)
```

## 2 · Tercer gate de esquema, medido y corregido

El importador de la app (`APE_PROFILES_CONFIG.importFromLABData`, `ape-profiles-config.js:5087`)
rechazaba el LAB de fusión con:

```
Schema invalido: lab_version='APE_v9.0', schema_variant='all_profiles'
(esperado omega_* o bulletproof:true)
```

Era un gate **distinto** del que ya se corrigió en `ape-lab-import-helper.js`. Se amplió solo la
aceptación (`_meta.type === 'all_profiles'` o `lab_schema_variant === 'all_profiles'`), sin mutar
valores y sin abrir la puerta a JSON ajeno.

Resultado en Chrome 157 cargando `index-v4.html#ape-e2e` del worktree:

```json
{"ui":{"fileInput":false,"btnGenerateAudited":true,"btnGenerateTypedArrays":true,
 "btnExportToLAB":true,"genFn":true,"cfg":true,"norm":true,"ape4k6k":true},
 "import":{"family":"profiles","ids":12,"configProfiles":12,"tiene5":6,"applied":true,
 "status":{"ok":true,"labExportedAt":"2026-11-20T03:52:30.647Z","labVersion":"APE_v9.0",
 "profiles":["P0","P1","P2","P3","P4","P5","P0.5","P1.5","P2.5","P3.5","P4.5","P5.5"]}},
 "gen":{"canalesApp":0},"err":[]}
```

**La app real importa el LAB de fusión con los 12 IDs exactos y el gate en `ok:true`.**

## 3 · Selector de archivo: no existe en este frontend

`input[type=file]` = **false** en la app. El LAB entra por el importador de `APE_PROFILES_CONFIG`, no
por un diálogo nativo. Esto no es una omisión del arnés: es el estado medido del frontend.

## 4 · Privacidad del destino, verificada antes de escribir

```
C:\Users\HFRC\APE_PRIVADO   propietario LAPTOP-A80AL617\HFRC
ACL: NT AUTHORITY\SYSTEM      Allow FullControl
     BUILTIN\Administradores  Allow FullControl
     LAPTOP-A80AL617\HFRC     Allow FullControl
     (sin Users, sin Everyone, sin Authenticated Users)
```

El arnés sirve `/lab.json` **solo por loopback** (bind 127.0.0.1, puerto efímero) y el fichero se lee
desde la ruta privada sin copiarlo al repo.

## 5 · Impedimento exacto para generar/exportar

`gen.canalesApp = 0`. El botón real `#btnGenerateAudited` dispara
`window.APEGenerationController.prepublishAndGenerate()`, que necesita canales en el estado de la app.
La vía de ingesta que existe en el frontend es el formulario de proveedor:

```
index-v4.html:1159  <button type="submit" form="connectionForm" id="btnConnect">
index-v4.html:1231  btnProbeQuality → app.probeAllChannelsBackend()
```

Es decir: **la app carga canales conectándose a un proveedor (Xtream/M3U) autorizado**. No hay en el
código activo un cargador de fichero M3U local:

- `input[type=file]` → no existe en `index-v4.html`
- `channelsMaster =` → sin asignaciones en `js/**`
- el parser de ingesta (`js/ape-v9/ape-m3u8-ingestion-parser.js`) elabora líneas HLS, no construye el
  catálogo de canales de la UI

No tengo credenciales de proveedor y fabricar canales para que la matriz salga verde es exactamente
lo que la orden prohíbe. Por eso este tramo queda **NOT_RUN con causa acreditada**, no por falta de
montaje: el arnés, el driver y los botones están montados y ejecutados.

## 6 · Matriz de estado (evidencia de esta ronda)

| ID | Import en app real | OFF/ON metadata | Generación UI | Export/reimport | Motivo |
|---|---|---|---|---|---|
| P0 | PASS | PASS (Node+Chrome) | NOT_RUN | NOT_RUN | sin canales en la app |
| P1 | PASS | PASS | NOT_RUN | NOT_RUN | idem |
| P2 | PASS | PASS | NOT_RUN | NOT_RUN | idem |
| P3 | PASS | PASS | NOT_RUN | NOT_RUN | idem |
| P4 | PASS | PASS | NOT_RUN | NOT_RUN | idem |
| P5 | PASS | PASS | NOT_RUN | NOT_RUN | idem |
| P0.5 | PASS (`.5` preservado) | PASS | NOT_RUN | NOT_RUN | idem |
| P1.5 | PASS | PASS | NOT_RUN | NOT_RUN | idem |
| P2.5 | PASS | PASS | NOT_RUN | NOT_RUN | idem |
| P3.5 | PASS | PASS | NOT_RUN | NOT_RUN | idem |
| P4.5 | PASS | PASS | NOT_RUN | NOT_RUN | idem |
| P5.5 | PASS | PASS | NOT_RUN | NOT_RUN | idem |

`determineProfile` automático: **NOT_RUN** por la misma causa (necesita un canal para decidir).

## 7 · Rollback

Vaciar la marca de `ape-profiles-config.js` (una condición dentro de `isVersionSupported`) y quitar
`_fase4_e2e_driver.js` del `index-v4.html` del worktree. El `else` original queda intacto: sin el
normalizador y sin la marca, la app vuelve a rechazar `profiles` como antes. La habilidad instalada no
se toca.

## 8 · Dos formas de desbloquear, ambas reales

1. **Alta de un servidor autorizado en el panel** (`connectionForm`: alias, URL base, usuario, API) y
   pulsar `btnConnect` → canales reales → generar/exportar/reimportar los 12 perfiles.
2. **Cargar la lista local autorizada** `APE_4K_PREMIUM_6K_METADATA.m3u8` (754.247.241 B,
   sha256 `001713fc…`) desde `APE_PRIVADO`, añadiendo en staging el cargador de fichero M3U mínimo
   sobre el parser existente. Esto además cierra la medición de memoria/cancelación con un archivo
   representativo, que es requisito de la orden.

Ninguna de las dos requiere tocar producción ni el VPS.

## 9 · FLUJO UI EJECUTADO (esta ronda) — generación real con lista real

Se añadió en staging el **control que faltaba** (autorizado por la orden §2): `js/ape-m3u-local-loader.js`
+ `<input type="file" id="apeM3uLocal">`. Es un cargador mínimo: parsea M3U y lo entrega al **mismo**
estado que usa la app (`window.app.state.channelsMaster`); no hay generador ni ruta paralela.

Entrada real usada: 3 canales extraídos de `APE_4K_PREMIUM_6K_METADATA.m3u8`
(754.247.241 B, sha256 `001713fc…`) a `C:\Users\HFRC\APE_PRIVADO\entrada_3ch.m3u8`
(311.477 B, sha256 `c2c9125d…`), servida **solo por loopback**.

Chrome 157 · `index-v4.html#ape-e2e` · importador real + picker real + `#btnGenerateAudited` real:

```
paso  flag   bytes    líneas  sidecar  EXTINF  URIs  sha(16)
0     OFF    288269   3257    0        3       3     33148645b4c01ef2
1     ON     290190   3260    3        3       3     8236c1552a967abf
2     OFF    286722   3257    0        3       3     c2d4116382e6554e
```

Lectura:

- **ON añade exactamente 3 líneas sidecar** (una por canal) y **no toca** EXTINF (3) ni URIs (3).
- **OFF no emite sidecar** y vuelve al mismo número de líneas (3.257).
- Los bytes entre pasadas OFF **no** son idénticos porque el generador es polimórfico por diseño
  (LIST-ID, fingerprint, UA rotativa): la equivalencia byte a byte OFF vs código previo se demostró
  fuera de la UI con el mismo generador y el azar fijado (`previo == off`, sha `a24ef8db…`).
- `err: []` en todo el recorrido.

## 10 · Lo que sigue pendiente (declarado)

- **Los 12 IDs por selección manual en el control real**: el flujo ya está montado y funciona; falta
  iterar la selección de perfil (el control de perfil de la app) y repetir las tres pasadas por ID.
- **`determineProfile` automático** desde la UI.
- **Reimportación** del archivo generado y verificación de restauración exacta en la UI.
## 11 · Doce IDs por el control REAL del profile manager (medido)

`window.ProfileManagerV9.selectProfile(pid)` es el control que usan los propios botones de la UI
(`profile-manager-v9.js:4593,4661`). Recorrido: 12 selecciones + 1 clic real a `#btnGenerateAudited`
por estado, con los 3 canales reales.

```
id    sel   OFF(blob)                       ON(blob, sidecar, intentProfile, target)
P0    true  290138 / d1838ab7 sidecar=0     sin blob (transitorio)
P1    true  288078 / 1906a757 sidecar=0     291067 / sidecar=3 / P3 / 3840x2160 / premium 5760x3240
P2    true  286006 / d844965a sidecar=0     289257 / 3 / P3 / 3840x2160
P3    true  sin blob (transitorio)          289117 / 3 / P3 / 3840x2160
P4    true  286559 / 08fc0822 sidecar=0     289049 / 3 / P3 / 3840x2160
P5    true  283709 / c0a8b485 sidecar=0     286091 / 3 / P3 / 3840x2160
P0.5  true  259547 / dcdc4a15 sidecar=0     260931 / 3 / P3 / 3840x2160
P1.5  true  257634 / 4e29aa3f sidecar=0     260818 / 3 / P3 / 3840x2160
P2.5  true  259772 / 2f6d0f27 sidecar=0     262190 / 3 / P3 / 3840x2160
P3.5  true  259498 / c0969d53 sidecar=0     260365 / 3 / P3 / 3840x2160
P4.5  true  257801 / dcd2baee sidecar=0     260538 / 3 / P3 / 3840x2160
P5.5  true  256787 / f108b0ad sidecar=0     259407 / 3 / P3 / 3840x2160
```

**Hallazgo real:** en las 10 pasadas ON que produjeron blob, el sidecar dice `intentProfile=P3` y
`target=3840x2160` **aunque se seleccionara otro ID**. Causa: el adaptador resuelve el perfil del
canal (`readProfile(ch,'runtime')`) y los canales cargados no traen campo de perfil, así que cae al
default. La selección del manager **no** llega al sidecar.

Eso es exactamente la «herencia no conectada» que la orden §4 exige corregir: falta leer el perfil
activo del manager (`ProfileManagerV9`) cuando el canal no trae uno propio, en vez de un default fijo.
Dos filas sin blob (P0-ON, P3-OFF) son transitorios del clic bajo tiempo virtual, no un fallo de
contrato: la misma combinación produjo blob en las demás.
## 12 · Matriz final simulada en la UI (12 IDs, OFF + ON estables)

Tras conectar el perfil activo del manager en `readProfile` (cuando el canal no trae campo), relanzada
la matriz: **las 12 filas completaron sin transitorios** (`err: []`).

```
id     sel   OFF sidecar   ON sidecar   intentProfile  target
P0     true  0             3            P3             3840x2160
P1     true  0             3            P3             3840x2160
P2     true  0             3            P3             3840x2160
P3     true  0             3            P3             3840x2160
P4     true  0             3            P3             3840x2160
P5     true  0             3            P3             3840x2160
P0.5   true  0             3            P3             3840x2160
P1.5   true  0             3            P3             3840x2160
P2.5   true  0             3            P3             3840x2160
P3.5   true  0             3            P3             3840x2160
P4.5   true  0             3            P3             3840x2160
P5.5   true  0             3            P3             3840x2160
```

**OFF = 0 sidecar en los 12 · ON = 3 sidecar en los 12** (una por canal). Estable y reproducible.

**Persiste `intentProfile=P3`**: el canal que entrega la app **ya trae su propio campo de perfil**
(`P3` por defecto del cargador del frontend), así que `readProfile` lo devuelve antes de consultar el
manager. El fix del manager solo actúa cuando el canal no trae perfil. Para que la selección mande hay
que hacer que el cargador/selectProfile escriba el perfil en los canales cargados (lo que hace la UI
real al aplicar perfiles), o bien que el sidecar use el activo del manager **por encima** del campo del
canal cuando este sea un default no elegido por el usuario. Esa decisión de precedencia exige el
consentimiento del contrato del profile manager, no se toma a ciegas.