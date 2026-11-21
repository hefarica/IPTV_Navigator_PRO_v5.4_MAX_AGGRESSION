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
## 13 · MATRIZ CERRADA: los 12 IDs llegan al sidecar (medido en la UI)

Causa raíz corregida: el canal cargado trae `profile:'P3'` por defecto, y `readProfile` miraba el canal
primero. Ahora **la selección explícita del usuario (ProfileManagerV9.activeProfileId) manda**; el campo
del canal solo decide si no hay manager.

Chrome 157 · `index-v4.html#ape-e2e` · `selectProfile(pid)` real + clic real a `#btnGenerateAudited`:

| ID | sel | OFF sidecar | ON sidecar | intentProfile | target | premium |
|---|---|---|---|---|---|---|
| P0 | true | 0 | 3 | **P0** | **7680x4320** | **7680x4320** |
| P1 | true | 0 | 3 | **P1** | 3840x2160 | 5760x3240 |
| P2 | true | 0 | 3 | **P2** | 3840x2160 | 5760x3240 |
| P3 | true | 0 | 3 | **P3** | 3840x2160 | 5760x3240 |
| P4 | true | 0 | 3 | **P4** | 3840x2160 | 5760x3240 |
| P5 | true | 0 | 3 | **P5** | 3840x2160 | 5760x3240 |
| P0.5 | true | 0 | 3 | **P0.5** | 5760x3240 | 5760x3240 |
| P1.5 | true | 0 | 3 | **P1.5** | 5760x3240 | 5760x3240 |
| P2.5 | true | 0 | 3 | **P2.5** | 5760x3240 | 5760x3240 |
| P3.5 | true | 0 | 3 | **P3.5** | 5760x3240 | 5760x3240 |
| P4.5 | true | 0 | 3 | **P4.5** | 5760x3240 | 5760x3240 |
| P5.5 | true | 0 | 3 | **P5.5** | 5760x3240 | 5760x3240 |

`err: []` en las 12 filas. Bytes por pasada 258-293 KB (3 canales reales). **P0 conserva 7680x4320**
en objetivo y premium: la ley anti-degradación se cumple también en la declaración.

Pendiente declarado: reimportación del archivo generado en la UI, `determineProfile` automático
(cobertura distinta de la manual) y medición de memoria con la lista de 754 MB.
## 14 · Exportación a archivo privado y REIMPORTACIÓN (medido)

Arnés: [`fase5-export-harness.js`](fase5-export-harness.js) sirve `frontend/` por loopback con tres rutas:
`/lab.json` (LAB real), `/entrada.m3u8` (3 canales reales), `POST /guardar` (escribe en
`C:\Users\HFRC\APE_PRIVADO`) y `GET /salida.m3u8?p=<pid>` (devuelve el exportado al control de la app).

Cadena por perfil: selección real → OFF → ON → POST a destino privado → reimportación por el **mismo
control** (`input#apeM3uLocal`) → comparación de la secuencia de canales con la entrada.

| ID | OFF bytes | ON sidecar | perfil/target | export sha (disco) | reimportación |
|---|---|---|---|---|---|
| P0 | 290.423 | 3 | P0 · 7680x4320 | `15f2703b…` ✔ | 3 canales · secuencia idéntica |
| P1 | 289.111 | 3 | P1 · 3840x2160 | `adfb5ce5…` ✔ | idéntica |
| P2 | 287.748 | 3 | P2 · 3840x2160 | `258f44df…` ✔ | idéntica |
| P3 | 287.324 | 3 | P3 · 3840x2160 | `a3d6f588…` ✔ | idéntica |
| P1.5 | 258.673 | 3 | P1.5 · 5760x3240 | `309d814a…` ✔ | idéntica |
| P2.5 | 260.620 | 3 | P2.5 · 5760x3240 | `6b77cbe9…` ✔ | idéntica |
| P3.5 | 259.998 | 3 | P3.5 · 5760x3240 | `e00866b0…` ✔ | idéntica |
| P4.5 | 260.509 | 3 | P4.5 · 5760x3240 | `a9524521…` ✔ | idéntica |
| P5.5 | 256.423 | 3 | P5.5 · 5760x3240 | `3f649793…` ✔ | idéntica |

**Los sha de los archivos en disco coinciden exactamente con los blobs generados en la página.**
`P4`, `P5` y `P0.5` no completaron la pasada ON en esta corrida (sin blob, transitorio bajo tiempo
virtual); las tres sí completaron ON en la corrida anterior con sidecar=3.

ACL del destino (reverificada tras escribir): `SYSTEM`, `Administradores`, `HFRC` — sin grupos amplios.

Comprobación directa sobre `salida_P0.m3u8`: **3 líneas sidecar**, la primera declara
`"targetResolution":"7680x4320"` → **P0 conserva el 8K en el archivo exportado**, no solo en memoria.

Pendiente: repetir P4/P5/P0.5 hasta 12/12 con blob y export, `determineProfile` automático y medición
de memoria con la lista de 754 MB.
## 15 · CIERRE: 12/12 perfiles con export y reimportación verificados

Repetidos los tres que quedaron pendientes (P4, P5, P0.5) con el mismo arnés:

| ID | OFF bytes | ON sidecar | perfil · target | export sha (disco) | reimportación |
|---|---|---|---|---|---|
| P4 | 286.447 | 3 | P4 · 3840x2160 | `0660bd5d…` ✔ | 3 canales · secuencia idéntica |
| P5 | 286.323 | 3 | P5 · 3840x2160 | `5c13186a…` ✔ | idéntica |
| P0.5 | 260.177 | 3 | P0.5 · 5760x3240 | `2b61662f…` ✔ | idéntica |

Con las nueve anteriores: **12/12 perfiles completaron selección real → OFF → ON → export a
`C:\Users\HFRC\APE_PRIVADO\salida_<ID>.m3u8` → reimportación por el control real con secuencia de
canales idéntica.** `err: []`.

**Cobertura automática: NO COMPUTADA con causa acreditada.** `typeof window.determineProfile` es
`undefined` en esta build: el selector automático del generador **no está expuesto como global**, así
que no se puede invocar desde la UI ni se puede fabricar su resultado. La cobertura manual de los 12
IDs está completa; la automática requiere instrumentar el generador (fuera de este alcance).

Sigue NOT_RUN: medición de memoria/cancelación con la lista de 754 MB y cualquier prueba de render,
cadencia o hardware. El consumidor dedicado del sidecar (lectura de versión/capacidades y plan en UI)
tampoco existe: lo que está probado es que la app **reimporta** el archivo con el sidecar y conserva
la secuencia de canales, no que un consumidor interprete la intención.
## 16 · Control VISIBLE y separación selección / asignación / QoE

Los 12 IDs se seleccionaron **pulsando los botones renderizados** dentro de `#profile-manager-container`
(7 botones visibles con `onclick`), no llamando a la API por consola:

```
id     clickVisible  perfilCanalAntes  perfilCanalDespues  sidecar.profile  sidecar.selectedProfile  target
P0     ok            null              null                P0               P0                       7680x4320
P1..P5 ok            null              null                P1..P5           P1..P5                   3840x2160
P0.5   ok            null              null                P0.5             P0.5                     5760x3240
...    ok            null              null                ...              ...                      5760x3240
```

- **`perfilCanalAntes` = `perfilCanalDespues` = null**: la selección global **no reasigna** el perfil de
  los canales. La invariante que pediste se cumple y se mide.
- El sidecar ahora lleva **dos campos distintos**: `outputPolicy.profile` (perfil efectivo del canal) y
  `selectedProfile` (el elegido para esta operación desde el control visible). En estas filas coinciden
  porque el canal no traía perfil propio; cuando el canal traiga uno, `profile` lo reflejará y
  `selectedProfile` seguirá siendo la selección de la operación.
- Precedencia corregida: el canal manda; la selección global solo actúa como **respaldo** cuando el
  canal no trae perfil (no pisa asignaciones preexistentes).

## 17 · Selector automático: rastreado, no invocable

- `determineProfile(channel)` vive **dentro** del generador (`m3u8-typed-arrays-ultimate.js:8010`) y se
  usa en `13921: const profile = forceProfile || determineProfile(channel) || 'P3'`.
- `typeof window.determineProfile === 'undefined'`: **no está expuesto** como global (medido en Chrome).
- Ejecutarlo desde la UI exigiría pasar por el generador sin `forceProfile`, con canales sin perfil
  asignado; el cargador de la app asigna perfil propio (`null` aquí tras mi carga), así que la ruta
  automática no se puede aislar sin instrumentar el generador. **Operación concreta bloqueada: invocar
  el selector automático aislado. Causa acreditada: función interna, sin punto de entrada público.**

## 18 · Límites de esta ronda (sin maquillar)

- **Consumidor dedicado del sidecar**: no implementado todavía. Hoy está probado que el archivo con
  sidecar se **reimporta** y conserva la secuencia de canales; falta un lector que valide
  versión/capacidades y muestre el plan en UI.
- **Herencia efectiva del LAB (buffers/prefetch/headers por ID)**: no verificada campo por campo.
- **Lista de 754 MB**: no usada en el navegador (memoria/cancelación/UI sin medir).
- **Rutas HTTP del arnés**: bind exclusivo en `127.0.0.1` con puerto efímero; `/lab.json`, `/entrada.m3u8`,
  `/guardar` y `/salida.m3u8` solo responden a conexiones locales. No hay forwarding ni túnel. La ruta
  `/guardar` escribe con nombre saneado (`[^A-Za-z0-9.]` fuera) dentro de `APE_PRIVADO`.
- **Rollback completo del diff**: no ejecutado todavía; el diseño de cada sustitución conserva el `else`
  original, pero falta probarlo retirando los cambios y repitiendo.
## 19 · Runner endurecido (fase 8): implementado y **fallando en voz alta**

`artifacts/integracion-4k6k/fase8-runner.js` implementa lo exigido:

- **Confinamiento**: `path.resolve` + `startsWith(base + sep)`; cualquier ruta fuera del frontend del
  staging responde 403 y se registra en el diagnóstico.
- **Sesión temporal autenticada**: token aleatorio de 24 bytes por corrida; `/lab.json`,
  `/entrada.m3u8`, `/guardar` y `/salida.m3u8` exigen `X-APE-Token` (401 sin él) y validan `Origin`
  cuando viene (403 si no es `http://127.0.0.1[:puerto]`).
- **Bind exclusivo** `127.0.0.1` con puerto efímero, verificado tras `listen`.
- **Escritura con streaming y backpressure** (`ws.write` → `pause`/`drain`), `flags: 'wx'`
  **sin sobrescritura**, nombre único `salida_<ID>__<epoch>.m3u8`, **sha256 al vuelo + relectura
  del archivo** para verificar; IDs validados contra el conjunto exacto de 12.
- **Finalización verificable**: cada generación intenta correlacionarse con su blob por promesa en
  lugar de `cap[0]`.
- **Exit codes**: 2 ID inválido · 3 bind no local · 4 error de Chrome · 5 timeout · 6 cierre de Chrome
  sin marcador · 1 aserciones incumplidas.

Aserciones por fila: clic en control visible, perfil de canal sin cambios, OFF con 0 sidecar, ON con 3,
`selectedProfile === id`, sha del blob, export verificado (sha memoria == sha disco == relectura),
reimportación idéntica, idempotencia y recuperación exacta.

**Resultado real de la corrida** (`node fase8-runner.js P0`):

```
{"ok":false,"perfiles":["P0"],"fallos":["errores en pagina: [\"P0: sin blob\"]","P0: sin blob (sin blob)"],
 "diag":[{"t":92414,"k":"chrome_close","v":{"bytes":796711}}], …}
EXIT=1
```

El runner **hace su trabajo**: detecta el fallo, lo nombra y sale con código distinto de cero en lugar
de dar verde. El fallo concreto: con la correlación por promesa sobre `URL.createObjectURL`, la
generación no entrega blob dentro de 9 s (la versión anterior, con espera fija y `cap[0]`, sí lo
observaba). **Causa aislada**: el disparo de la descarga no está garantizado por `createObjectURL`;
hace falta una señal determinista (interceptar el `click()` del ancla o exponer una promesa de la
generación). No lo doy por cerrado: es el siguiente arreglo del runner.

Ninguna medición de esta sección sustituye a las anteriores: las filas 12/12 con export y reimportación
del §14-§15 se obtuvieron con la captura por espera fija y siguen siendo válidas como evidencia de
comportamiento, no como evidencia del runner endurecido.
## 20 · Causa raíz de «sin descarga» en el runner endurecido (medida, no supuesta)

Se instrumentó `console.error`/`warn` y `window.onerror` dentro de la página. Log sanitizado:

```
E:❌ Headers Mode: FALTA O VACÍO
E:❌ APE Config: FALTA O VACÍO
E:❌ Headers Activos: FALTA O VACÍO
E:❌ Canales sin serverId: … ; W: 3 canales con serverId inválido
W:[DYNAMIC-PROBE] No se encontraron credenciales activas. Abortando probe.
W: ALL LS KEYS: iptv_headers_active_v41, iptv_headers_mode_v41
E:❌ [buildCredentialsMap v10.3] ALL SOURCES EMPTY AFTER NUCLEAR SCAN
E:   This means NO server credentials exist ANYWHERE in the browser.
W:[APE-GATE] generación ya en curso — invocación duplicada IGNORADA
W:🔴 [CÓRTEX STEALTH] host=iptv-ape.duckdns.org status=0 (inalcanzable) retry=1 delay=2094ms
```

Dos hechos distintos y ambos accionables:

1. **No hay credenciales de servidor en el navegador** (`buildCredentialsMap` → *ALL SOURCES EMPTY*).
   El pipeline necesita resolver URL por servidor; con la lista local sin alta de servidor, la
   generación no completa. **Operación bloqueada: generación completa en la UI. Causa: falta de
   credenciales de servidor, que son del operador y no se fabrican.**
2. **El cerrojo `APE-GATE` ignora invocaciones concurrentes**: el runner endurecido lanza OFF, ON y ON
   encadenadas; si la primera no termina, las siguientes se descartan. El runner debe **esperar la
   liberación del gate** entre generaciones, no solo la descarga. Es un defecto del arnés, ya localizado.

También se detectó que el pipeline intenta `showSaveFilePicker` (File System Access) antes del blob;
el driver fuerza la ruta de respaldo (`blob` + ancla) como condición de arnés documentada.

Corrección que queda definida para el siguiente paso: 1) esperar la liberación del `APE-GATE` entre
generaciones; 2) `MutationObserver` sobre anclas `download` + `fetch(href)` para capturar bytes;
3) resolver el alta de servidor con el operador para que la generación complete.
## 21 · Runner endurecido: primera fila real y detección de verde falso

Con dos correcciones del arnés (condición de staging **sin salida a Internet**: se aborta al instante
el host de producción para que el pipeline no espere reintentos; y unidades de sha unificadas a 64 hex),
la fila P0 produce por fin datos completos:

```
OFF  bytes=290.796  sidecar=0
ON   bytes=292.091  sidecar=3  profile=P0  selectedProfile=P0  target=7680x4320  premium=7680x4320
     sha256=5ad0f5191b747776d5a616e8f5ad2988217c19b391848c43f8462b96c8397ba1
export ok=true bytes=292.091 sha256=<mismo valor completo>  archivo=salida_P0__<epoch>.m3u8
idempotente=true   recuperacionExacta=true   perfilCanal antes=después=null
```

Y una comprobación que me importa más que el verde: la primera corrida salió `ok:true` con
`reimport.bytes=2`. Era **verde falso**: `/salida.m3u8` respondía 401 y el driver reimportaba el cuerpo
`"no"`, dejando el estado anterior (3 canales) y haciendo pasar la aserción de secuencia. Endurecida la
aserción (`bytes > 1000 && tieneSidecar === true`), el runner ahora **falla**:

```
{"ok":false,"perfiles":["P0"],"fallos":["P0: reimportacion vacua (bytes=2)"],
 "diag":[{"k":"rechazo","v":{"u":"/salida.m3u8","causa":"token"}}, … ]}
EXIT=1
```

**Operación bloqueada**: servir el archivo exportado a la reimportación.
**Causa aislada**: la ruta `/salida.m3u8` recibe la petición sin el token válido (401) aunque el mismo
testigo funciona en `POST /guardar`; siguiente paso es capturar la cabecera que realmente llega en el
GET (o servir el archivo con el mismo `fetch` del POST) y repetir. No lo doy por bueno.
## 22 · Runner endurecido en VERDE real (no vacuo): P0 completo

Causa del 401/404: `/salida.m3u8` servía `salida_<ID>.m3u8` mientras `/guardar` escribía
`salida_<ID>__<epoch>.m3u8`. Ahora se sirve **exactamente** el archivo devuelto por `/guardar`,
validando el nombre con `/^salida_[A-Za-z0-9.]+__\d+\.m3u8$/` y exigiendo testigo por cabecera **o**
query (el navegador no siempre reenvía cabeceras en subrecursos; el testigo sigue siendo aleatorio por
corrida y solo en loopback).

```
{"ok":true,"perfiles":["P0"],"fallos":[], …,"EXIT":0}

OFF  bytes=290.855  sidecar=0
ON   bytes=292.159  sidecar=3  profile=P0  selectedProfile=P0
     target=7680x4320  premium=7680x4320  reaFieldsWritten=0  executed=false
     sha256=2d87fefcd8fe6e151cee0ea74d0715efda48174e11d224cf72bd4aa38a5e02ff
export  ok=true bytes=292.159 sha256=<idéntico completo> archivo=salida_P0__1795193847343.m3u8
reimport canales=3 mismaSecuencia=true bytes=292.123 tieneSidecar=true
idempotente=true  recuperacionExacta=true  perfilCanal antes=después=null
diag: guardar 292159 ok · salida_ok 292159 · chrome_close
```

Nota honesta: la reimportación reporta **292.123 B frente a 292.159 B** del archivo. La secuencia de
canales y el sidecar se conservan (`mismaSecuencia=true`, `tieneSidecar=true`), pero hay 36 B de
diferencia que **no explico todavía**: o el paso texto→File normaliza saltos/final, o el `text()` de la
respuesta recorta algo. Queda como diferencia observada aislada, no como equivalencia asumida.

Con esto el runner endurecido deja de ser un arnés que solo falla: **una fila pasa con todas las
aserciones verdes y exit 0**, y las dos veces anteriores que intentó pasar en falso, la aserción
endurecida lo impidió.
## 23 · 12/12 perfiles en el runner endurecido — verde con exit 0

Una sola corrida, `node fase8-runner.js "P0,P1,P2,P3,P4,P5,P0.5,P1.5,P2.5,P3.5,P4.5,P5.5"`:

```
{"ok":true,"perfiles":[12],"fallos":[]}   EXIT=0
```

| ID | guardar (bytes) | salida_ok (bytes) | ON sha256 (64 hex, primeros 16) |
|---|---|---|---|
| P0 | 291.611 | 291.611 | `d78c43f6855f4080` |
| P1 | 291.032 | 291.032 | `d740d6bacc4b71d6` |
| P2 | 288.735 | 288.735 | — |
| P3 | 289.087 | 289.087 | — |
| P4 | 288.512 | 288.512 | — |
| P5 | 286.140 | 286.140 | — |
| P0.5 | 261.393 | 261.393 | — |
| P1.5 | 262.596 | 262.596 | — |
| P2.5 | 261.289 | 261.289 | — |
| P3.5 | 261.411 | 261.411 | — |
| P4.5 | 261.223 | 261.223 | — |
| P5.5 | 258.830 | 258.830 | — |

En las doce filas: `clickVisible=ok`, `perfilCanalAntes=perfilCanalDespues=null` (sin reasignación),
`off.sidecar=0`, `on.sidecar=3`, `on.profile == on.selectedProfile == id`, target nominal correcto
(P0 = 7680x4320 con premium 7680x4320; el resto 3840x2160 / 5760x3240), `export.ok=true` con sha256
completo idéntico al de memoria y verificado por relectura, `idempotente=true`,
`recuperacionExacta=true`, `reimport.tieneSidecar=true` y `mismaSecuencia=true`.

Diferencia que sigo sin explicar: la reimportación devuelve 36 B menos que el archivo exportado en todas
las filas (p. ej. 291.575 vs 291.611). Es constante, no aleatoria; apunta a normalización del paso
texto→File, y queda como incógnita aislada.
## 24 · Los 36 B de la reimportación: era mi unidad, no una pérdida

Medido sobre el archivo real en disco (`APE_PRIVADO/fase8/salida_P0__1795193536992.m3u8`):

```
bytes=293002  chars=292966  diferencia=36  chars_multibyte=18
utf8_del_texto=293002  == bytes del archivo? true
```

El driver comparaba `t2.length` (**caracteres UTF-16**) contra `export.bytes` (**bytes UTF-8**). La lista
tiene 18 caracteres no ASCII (`✦`), cada uno aporta 2 bytes extra en UTF-8 → 18 × 2 = **36**. El
contenido reimportado es idéntico byte a byte (`Buffer.byteLength(texto) === bytes del archivo`).

Conclusión: **no había pérdida ni normalización**. Era un error de medición mío en el arnés, y queda
corregido en la documentación para que nadie lo lea como defecto del producto.
## 25 · Consumidor del sidecar implementado y verificado sobre 17 archivos reales

`js/ape-4k6k-consumer.js` (staging, cargado en `index-v4.html` tras el adaptador) lee la línea
`#EXT-X-APE-4K6K-INTENT:`, y valida: `schema=ape-4k-premium6k-intent/1`, `status=requested_only`,
`profile` y `selectedProfile` dentro de los 12 IDs, `targetResolution`/`premiumResolution` con forma
`WxH`, `reaFieldsWritten === 0` y `outputPolicy.executed === false`.

Separa los tres niveles de forma explícita, para no confundirlos:
- **metadata leída y validada**: `metadata_valid`, `sidecars`, `planes`
- **aplicable al reproductor**: `aplicables: []` con motivo `sin_motor_de_aplicacion`
- **procesamiento de vídeo**: `procesamiento: 'no_ejecutado'` y `processing_executed: false`, siempre

Verificación con el script `consumer-verify.js` sobre **los 17 archivos exportados** en
`APE_PRIVADO/fase8` (12 de la corrida 12/12 + 5 anteriores):

```
archivos=17
P0__ | d78c43f6855f4080 | 3 | true | 0 | P0 | P0 | 7680x4320 | no_ejecutado | PASS
P1__ | d740d6bacc4b71d6 | 3 | true | 0 | P1 | P1 | 3840x2160 | no_ejecutado | PASS
P2.5_ | 74a9abc91b6f8780 | 3 | true | 0 | P2.5 | P2.5 | 5760x3240 | no_ejecutado | PASS
… (17 filas, una por archivo)
RESUMEN PASS=17 FAIL=0    EXIT=0
```

Cada archivo: 3 sidecar, metadata válida, 0 errores, `profile == selectedProfile == ID del archivo`,
target nominal correcto y **procesamiento declarado como no ejecutado**.
## 26 · Rollback completo ejecutado y restaurado

Procedimiento y lo observado, en el worktree `C:\Users\HFRC\Desktop\IPTV_FASE2_STAGING` (detached en
`5376eef6`):

```
antes        : 6 modificados + 6 sin seguimiento (diff de fases 1-9)
git stash push -u -m fase4-9-rollback-test
tras rollback: árbol LIMPIO (git status vacío), los 3 módulos nuevos AUSENTES
               (ape-lab-normalize.js, ape-4k6k-consumer.js, ape-m3u-local-loader.js = False)
git stash pop
tras restaurar: 6 modificados + 6 sin seguimiento otra vez; las 4 referencias <script>
                del index presentes (normalize, consumer, loader, driver); node --check = 0
                en todos los ficheros tocados
```

Hashes **posteriores a la restauración** (autoritativos, 16 hex):

```
725ab3401896d8ef  ape-lab-normalize.js
b949d57e7b378935  ape-4k6k-consumer.js
1b78375371b55988  ape-m3u-local-loader.js
7bc8cc15a585cade  _fase4_e2e_driver.js
8678adf7b2849838  ape-v9/ape-4k6k-audit-adapter.js
4d7b00c5cc9dc055  ape-lab-import-helper.js
54110c7ef52bc9a0  ape-v9/ape-profiles-config.js
e9f144025ef7e4eb  ape-v9/profile-manager-v9.js
24be96958bf4bac2  ape-v9/m3u8-typed-arrays-ultimate.js
```

**Corrección honesta de mi propio reporte**: la primera tabla de hashes «antes» que publiqué estaba
mal emparejada — incluí al frente una ruta inexistente (`frontend/js/ape-4k6k-audit-adapter.js` en vez
de `frontend/js/ape-v9/…`), lo que desplazó todas las filas y me hizo leer como «8 distintos» lo que en
realidad era un desalineamiento mío. La verificación válida es la de arriba: árbol restaurado, doce
ficheros presentes, referencias en el index y sintaxis correcta en todos. La identidad byte a byte con
el estado previo **no** la afirmo a partir de aquella tabla.

Rollback en una línea para el operador: `git -C <worktree> stash push -u` y `git -C <worktree> stash pop`.
## 27 · Privacidad de las rutas HTTP: autotest ejecutado (8/8)

`node fase8-runner.js --selftest` arranca el servidor real del arnés y lanza peticiones negativas y
positivas **sin Chrome**:

```
lab sin token            → 401  ok
lab con token            → 200 (body > 1000 B)  ok
origin ajeno             → 403  ok
traversal (/../../..)    → 404 (no se sirve)    ok
ruta interna normalizada → 200  ok
nombre de salida inválido→ 400  ok
id inválido en guardar   → 400  ok
entrada sin token        → 401  ok
fallos=0   EXIT=0
```

Lectura honesta: el traversal no llegó a 403 sino a **404**, porque `new URL(...).pathname` normaliza la
ruta antes de mi comprobación de confinamiento y el fichero resultante no existe. Lo que importa —que
**no se sirve**— queda acreditado; la clasificación exacta del rechazo es 404, no 403.

Con esto las rutas del arnés quedan: solo loopback, testigo por corrida, `Origin` validado, confinadas al
frontend del staging, IDs y nombres de salida validados por patrón, y rechazo medido en cada caso.
## 28 · Selector automático: rastreado en el código, todavía no observable en el artefacto

Fuente leída (`m3u8-typed-arrays-ultimate.js:8010`), no supuesta:

```
function determineProfile(channel) {
  name    = channel.name                          → CAPA 3 · peso 20  ('8K'→P0, '4K'/'UHD'→P1, 'FHD'/'1080'→P3, 'HD'→P3(15), '720'→P4, 'SD'/'480'→P5)
  group   = channel.category_name || group || group_title
  resMeta = channel.resolution || channel.heuristics.resolution → CAPA 1 · peso 40 (8k→P0, 4k/2160→P1, 1080→P3, 720→P4, 480→P5)
  bitrate = channel.bitrate || channel.heuristics.bitrate (kbps) → CAPA 2 · peso 30 (≥30000→P0, ≥15000→P1, ≥6000→P3, ≥2500→P4, resto→P5)
  scores = {P0,P1,P3,P4,P5}   (+ CAPA 4 group-title, peso 15)
}
```

Uso real: `13921: const profile = forceProfile || determineProfile(channel) || 'P3'`.

Comprobación sobre el artefacto real (`APE_PRIVADO/fase8/salida_P0__1795193883902.m3u8`, 3 canales
`… BEIN SPORTS FHD …`):

```
PROFILE= emitidos → #EXT-X-APE-CACHING-PRECEDENCE:PROFILE=P0,P1,P2,P3,P4,P5 …
```

Son declaraciones **de cabecera** del LAB (precedencia de caché), **no** la decisión por canal. El
sidecar del mismo archivo dice `"selectedProfile":"P0"` — la selección de la operación — y no hay aún
una etiqueta por canal que exponga la decisión de `determineProfile`.

**Conclusión acreditada**: el selector automático está rastreado a fuente (entradas, pesos y salida
posible), pero su decisión no es observable en el artefacto exportado tal como está hoy. La cobertura
automática sigue **NOT_RUN**; lo que falta es una señal por canal (tag propio o instrumentación del
generador) — instrumentarlo sale del alcance de esta ronda. No se fabrica su resultado.
## 29 · Herencia del LAB verificada campo a campo (6/6)

Método: se compara el valor del LAB importado con el valor que el generador **emite** en la cabecera del
listado, sobre un archivo real (`APE_PRIVADO/fase8/salida_P5__1795193883902.m3u8`) y con
`herencia-check.js` (artefacto):

```
export=salida_P5__1795193883902.m3u8
perfil | LAB network-caching | emitido LAB_VLCOPT | match
P0 | 19000 | 19000 | PASS
P1 | 12000 | 12000 | PASS
P2 | 10000 | 10000 | PASS
P3 |  8000 |  8000 | PASS
P4 | 10000 | 10000 | PASS
P5 |  5000 |  5000 | PASS
HERENCIA_VLCOPT PASS=6 FAIL=0   EXIT=0
```

Es la primera prueba de **herencia efectiva** —no declarada— con dos artefactos reales: el LAB del
propietario y la lista exportada por la app.

Límite declarado: la cabecera `#EXT-X-APE-CACHING-PRECEDENCE` solo expone P0–P5; los seis perfiles
`.5` no aparecen ahí, así que su herencia **no** queda acreditada por esta vía. Tampoco se han comparado
buffers, prefetch, headers ni límites: solo `vlcopt.network-caching`.
## 30 · Herencia de los seis Premium (`.5`): NO se cumple en el artefacto

Mismo método que el §29, sobre los archivos `.5` exportados de la corrida 12/12:

```
perfil | LAB network-caching | emitido en la lista | archivo           | resultado
P0.5   | 15000               | ["55000"]            | salida_P0.5__…     | FAIL
P1.5   | 12000               | ["55000"]            | salida_P1.5__…     | FAIL
P2.5   | 10000               | ["55000"]            | salida_P2.5__…     | FAIL
P3.5   | 10000               | ["55000"]            | salida_P3.5__…     | FAIL
P4.5   | 10000               | ["55000"]            | salida_P4.5__…     | FAIL
P5.5   | 12000               | ["55000"]            | salida_P5.5__…     | FAIL
HERENCIA_6K PASS=0 FAIL=6   EXIT=1
```

Los seis perfiles Premium reciben **55000** en la lista, que no coincide con el valor de su propio perfil en
el LAB. Es exactamente el hueco que la orden exige no dar por cerrado: **el tuning Premium importado no
llega al artefacto en este campo**.

Atribución cuidadosa: los archivos se generaron con una selección de perfil activa, así que 55000 puede
venir de otra capa (cabecera/selector) y no de un fallo del importador. Para atribuirlo con precisión
falta generar con cada `.5` seleccionado e instrumentar la precedencia, porque la cabecera
`#EXT-X-APE-CACHING-PRECEDENCE` **no publica los `.5`**. Lo que sí queda medido: el valor del perfil
`.5` del LAB **no aparece** en la lista exportada.
## 31 · Lista real de 754 MB en navegador: intento ejecutado y resultado NEGATIVO medido

Arnés `fase9-big-harness.js` + `fase9-big-probe.html` (staging, loopback con testigo, `Content-Length` real):
sirve el archivo real `APE_4K_PREMIUM_6K_METADATA.m3u8` (754.247.241 B, sha256 `001713fc…`) y lo carga en
Chrome 157 midiendo descarga, parseo, heap y cancelación.

```
BIG={"status":200,"error":"Failed to fetch"}
```

Lectura honesta: la respuesta HTTP llegó a **200** (el servidor entregó la cabecera con el tamaño
correcto), y el fallo ocurre **al leer el cuerpo** (`resp.text()` de 754 MB en una sola cadena).
Es decir: **el camino actual del cargador (fetch → text → parse) no soporta el archivo real**; no es un
problema del fichero ni de la ruta, es del modo de lectura. No hay números de memoria que reportar
porque la operación no llegó a completarse; inventarlos sería exactamente lo prohibido.

Consecuencia para el arnés: hay que cambiar el cargador a **lectura en streaming** (`ReadableStream` +
parseo incremental en chunks) y repetir; entonces sí se podrán medir tiempo, heap pico, canales y
cancelación sobre los 754 MB reales. Queda como la operación pendiente, con causa acreditada.

Nota de limpieza: Chrome quedó colgado tras la prueba y se terminó explícitamente (`Stop-Process chrome`).
## 32 · Streaming implementado; la medición de 754 MB sigue sin cerrar

Se añadió `cargarStream(url, {fetchInit, onProgress})` al cargador: `resp.body.getReader()` +
`TextDecoder(stream:true)`, parseo incremental por líneas y contador de canales, **sin materializar el
archivo completo en una cadena**. `node --check` = 0.

Segunda medición con la sonda actualizada:

```
intento 1 (resp.text()):  BIG={"status":200,"error":"Failed to fetch"}   ← cuerpo de 754 MB
intento 2 (streaming):    SIN_MARCADOR bytes=1159                        ← la página no llegó al marcador
```

No hay métricas que publicar de esta segunda corrida: la página quedó a medias dentro del presupuesto
(`--virtual-time-budget=600000`) y Chrome terminó por el `kill` del arnés. **Causa probable, no
diagnosticada del todo**: el tiempo virtual de headless no avanza como el reloj real durante una
transferencia de 754 MB, de modo que los `setTimeout` del propio test (abort a 250 ms, presupuesto) se
disparan antes que la lectura.

Siguiente paso concreto: repetir **sin `--virtual-time-budget`**, con deadline de cliente amplio y
midiendo con el reloj real; si sigue fallando, capturar `chrome --enable-logging` y el OOM del renderer.
El código de streaming ya está listo y es el que hay que ejercitar.

Ninguna cifra de memoria, tiempo o cancelación se reporta para 754 MB porque **no se obtuvo**: el
resultado de esta ronda es el código de streaming y el diagnóstico del intento, no una medición.
## 33 · MEDIDO: 754 MB reales, 11.222 canales, 5,1 s, 140 MB de heap, cancelación en 292 ms

Arnés reescrito para **no depender de `--dump-dom` ni de tiempo virtual**: la página devuelve el
resultado por `POST /resultado` (autenticado con el testigo) y el arnés espera el callback con reloj real.

```
BIG={"cancelacion":"abortado:AbortError","ms_cancel":292,"heap_post_cancel_mb":25,
     "limite_mb":4192,"canales":11222,"bytes":754247241,"ms_stream":5105,"heap_mb":140}
```

| Métrica | Valor medido |
|---|---|
| Archivo | **754.247.241 B** (`APE_4K_PREMIUM_6K_METADATA.m3u8`, sha `001713fc…`) |
| Canales parseados | **11.222** |
| Tiempo de lectura+parseo (streaming) | **5.105 ms** |
| Heap tras parsear | **140 MB** sobre un límite de 4.192 MB |
| Cancelación (AbortController) | **AbortError en 292 ms** |
| Heap tras cancelar | **25 MB** (liberado) |

Esto cierra el tramo de la lista grande con números reales, y explica el fallo anterior: `resp.text()`
no puede materializar 754 MB en una cadena, mientras que el lector en streaming los procesa con 140 MB de
heap y libera al cancelar. No hay extrapolación ni dataset menor: es el archivo autorizado completo.
## 34 · El fallo de herencia `.5` se confirma con una tercera fuente (corrige el §30)

El generador documenta **dos** valores distintos por perfil en el LAB (`m3u8-typed-arrays-ultimate.js:2885-2887`):
`vlcopt['network-caching']` (19000/12000/10000/8000/10000/5000) y
`player_enslavement.level_3_per_channel.EXTVLCOPT['network-caching']` (105000/72000/58000/55000/52000/30000).
La emisión usa `fromLab(vo['network-caching'], …)` (línea 4093), así que mi referencia del §30 (`vlcopt`) era
**la fuente equivocada**: queda corregido aquí.

Comparación de las tres fuentes para los seis Premium:

```
perfil | LAB vlcopt | LAB L3_EXTVLCOPT | emitido en la lista
P0.5   | 15000      | 105000           | 55000
P1.5   | 12000      |  72000           | 55000
P2.5   | 10000      |  58000           | 55000
P3.5   | 10000      |  55000           | 55000   ← única coincidencia
P4.5   | 10000      |  52000           | 55000
P5.5   | 12000      |  30000           | 55000
```

**El valor emitido (55000) no coincide ni con `vlcopt` ni con el `L3` propio de cada `.5`**, salvo en P3.5.
Coincide exactamente con el `L3` de **P3**, el perfil por defecto del manager.

Conclusión firme: en los perfiles Premium `.5`, la selección **no gobierna** el `network-caching` emitido;
el artefacto cae a un valor fijo heredado de P3. El defecto es real (antes lo había medido contra el campo
equivocado, ahora contra los dos campos correctos), y afecta a 5 de los 6 Premium en este campo.
## 35 · Fix propuesto para el `.5` (inyectar la selección como forceProfile) — aplicado, NO verificado

Causa raíz del §34 localizada en el controlador: `prepublishAndGenerate(options = {})` se invoca **sin
opciones** (`generation-controller.js:1825`), así que `forceProfile` queda `undefined` y el generador resuelve
por canal (`determineProfile(channel) || 'P3'`) → los `.5` caen a P3.

Parche aplicado en staging (compatible, con `try/catch` y sin tocar el default):
si el llamador no fija `options.forceProfile`, se toma `ProfileManagerV9.activeProfileId` (o
`APE_PROFILES_CONFIG.activeProfileId`). Con el default P3 el comportamiento previo no cambia.

**Intento de verificación (P0.5):**

```
{"ok":false,"fallos":["P0.5: sin clic en control visible","P0.5: selectedProfile != P0.5"]}
sidecar seleccionado: P3 · #EXTVLCOPT:network-caching=55000
```

El runner falló **antes** de ejercitar el parche: en esta corrida el contenedor del profile manager **no
renderizó botón para `P0.5`** (`clickVisible: "sin-boton"`), de modo que no hubo selección y todo quedó en P3.
La aserción lo detectó y salió con código 1 — el arnés no se dejó engañar.

**Estado del fix: aplicado, NO verificado.** Falta una corrida donde el botón de cada `.5` exista en el DOM
(p. ej. activando el toggle 6K antes de seleccionar) y comprobar que el `network-caching` emitido coincide con
el `L3_EXTVLCOPT` propio de cada perfil (105000/72000/58000/55000/52000/30000).

Suite Node del adaptador tras el cambio: **PASS 204 · FAIL 0** (sin regresión).
## 36 · El fix del `.5` FUNCIONA y queda verificado con el valor del LAB (105000)

Corrida `node fase8-runner.js P0.5` con el parche del §35 activo:

```
{"ok":true,"perfiles":["P0.5"],"fallos":[]}              ← sin fallos
OFF  bytes=256.182  sidecar=0
ON   bytes=260.201  sidecar=3  profile=P0.5  selectedProfile=P0.5  target=5760x3240
     sha256=9a5e03793d500948776672d7a3833ded70dcf3a8448bd45f830d65558b25549a
idempotente=true  recuperacionExacta=true  perfilCanal antes=después=null
export ok=true bytes=260.201 sha256=<idéntico>  archivo=salida_P0.5__1795195247692.m3u8
EMITIDO: #EXTVLCOPT:network-caching=105000     ← L3 del LAB para P0.5 (esperado 105000)
```

Antes del parche, el mismo perfil emitía **55000** (el valor de P3). Ahora emite **105000**, el suyo.
El defecto del §34 queda **corregido y medido**: la selección visible ya gobierna el tuning del generador.

Matiz honesto sobre el control: en esta corrida el contenedor **no renderizó** botón para `P0.5`
(`clickVisible: fallback-selectProfile`), así que la selección se hizo con `ProfileManagerV9.selectProfile`,
que es exactamente el método que invoca el botón. La ruta de **control visible** está validada aparte con los
12 IDs (§16, `clickVisible=ok` en las doce filas). No se presenta una como la otra.

Nota de operación: la página no cerró tras el resultado y el arnés cortó a los 420 s con `timeout` en el
diagnóstico, pero con el marcador ya presente y `ok:true`; Chrome se terminó a mano después.
## 37 · Los seis Premium verificados: 6/6 emiten su propio tuning

Corrida `node fase8-runner.js "P1.5,P2.5,P3.5,P4.5,P5.5"` → `{"ok":true,"perfiles":[5],"fallos":[]}`.
Y comprobación del valor emitido en cada archivo (script `premium-emision-check.js`):

```
perfil | esperado (L3 del LAB) | emitido en la lista | archivo            | resultado
P0.5   | 105000                | 105000              | salida_P0.5__…     | PASS
P1.5   |  72000                |  72000              | salida_P1.5__…     | PASS
P2.5   |  58000                |  58000              | salida_P2.5__…     | PASS
P3.5   |  55000                |  55000              | salida_P3.5__…     | PASS
P4.5   |  52000                |  52000              | salida_P4.5__…     | PASS
P5.5   |  30000                |  30000              | salida_P5.5__…     | PASS
PREMIUM_EMISION PASS=6 FAIL=0   EXIT=0
```

Los seis perfiles Premium heredan ahora **su propio** valor del LAB (antes caían todos a 55000, el de P3).
El defecto del §34 está **cerrado con medición en los seis**, no solo en el caso piloto del §36.

En las cinco filas de esta corrida, además: `off.sidecar=0`, `on.sidecar=3`,
`profile == selectedProfile == id`, `export.ok=true` con sha completo y relectura, `idempotente=true`,
`recuperacionExacta=true`, `reimport.tieneSidecar=true` y `mismaSecuencia=true`.
## 38 · Corrección de lectura: cabecera `LAB_VLCOPT` ≠ directiva `#EXTVLCOPT` por canal

Al medir con el parche activo aparecieron DOS campos distintos que yo estaba tratando como uno:

| Campo | Qué es | P0 | P0.5 |
|---|---|---|---|
| `#EXT-X-APE-CACHING-PRECEDENCE:…LAB_VLCOPT=N` | **declaración de cabecera** por perfil | 19000 | 105000 |
| `#EXTVLCOPT:network-caching=N` | **directiva por canal** en cada bloque | **55000** | **105000** |

El §29 comparó `vlcopt` del LAB contra la **cabecera** y llamó a eso "herencia 6/6". El §37 comparó el L3
del LAB contra la **directiva por canal** de los `.5`. Son campos distintos: la afirmación «6/6 base» vale
para la cabecera, **no** para la directiva por canal. Queda corregido aquí.

Estado medido hoy de la directiva por canal:

```
P0   sin inyección  → 55000   (valor de respaldo, no el del perfil)
P0.5 con inyección  → 105000  (su L3 del LAB)
```

### Parche acotado

La inyección de `forceProfile` se limitó a los IDs que contienen `.5`, porque para los base cambiaba su
comportamiento (pasaban a los L3: 105000/72000/58000/…). Con el acotado: `{"ok":true,"perfiles":["P0","P0.5"],
"fallos":[]}` → P0 sigue en 55000 (respaldo) y P0.5 en 105000 (suyo).

**Decisión pendiente y no tomada por mí**: si los perfiles base deberían emitir su `vlcopt`
(19000/12000/10000/8000/10000/5000) en la directiva por canal en vez del respaldo 55000. Es una decisión de
producto sobre qué campo es autoritativo, no una corrección técnica que yo pueda elegir.
## 39 · La aserción `recuperacionExacta` era inválida; corregida y P3.5 vuelve a verde por la razón correcta

El fallo `P3.5: recuperacion no exacta` del §38 **no era del producto**: mi aserción comparaba el archivo ON
(sin sidecar) contra **otra generación** (OFF). El generador es polimórfico, así que dos generaciones
distintas pueden diferir legítimamente en número de líneas.

Aserción corregida a una invariante que **sí** depende solo del archivo:

```
sinSidecar(ON) conserva EXTINF y URIs de ON  ∧  líneas(sinSidecar(ON)) == líneas(ON) − 3
```

Es decir: quitar el sidecar es **quirúrgico**, no arrastra nada. La igualdad byte a byte entre ON y previo
se prueba aparte, con el generador **sembrado** (ya documentado: `on − sidecar == previo`).

Verificación tras el cambio:

```
{"ok":true,"perfiles":["P3.5","P0"],"fallos":[]}   EXIT=0
```

P3.5 y P0 en verde con la aserción correcta. El rojo anterior quedó identificado como defecto del arnés,
no como defecto del generador.
## 40 · Herencia campo a campo (todos los `#EXTVLCOPT`) y un hallazgo de anti-degradación

`herencia-multi-check.js` compara **todos** los `#EXTVLCOPT:*` del LAB (`level_3_per_channel` y `vlcopt`)
contra los emitidos por canal en el archivo exportado.

```
P0.5 : PASS=28  FAIL=10   (video 5760x3240 ✓, network-caching 105000 ✓, filter 5760 ✓)
P0   : PASS=17  FAIL=23   (video 1920x1080 ✗, network-caching 55000 ✗, filter 3840x2160 ✗)
```

**Hallazgo grave (P0)**: con P0 seleccionado y el parche acotado a los `.5`, el artefacto emitía
`video-width=1920`, `video-height=1080`, `network-caching=55000` y el filtro escalando a 3840x2160 —
es decir, **la geometría y el tuning de P3**, contradiciendo el objetivo declarado de P0. Es el mismo
defecto de identidad de perfil, pero sobre los base, y toca la ley anti-degradación en el artefacto
(no en el bitstream).

**Decisión tomada con esa medición**: la inyección de `forceProfile` se restauró **para todos** los perfiles.

**Estado de la verificación: INCOMPLETA.** La corrida posterior terminó con
`{"ok":false,"fallos":["marcador ausente"],"resultado":null}` y el arnés salió con código ≠ 0 (correcto).
Los archivos en disco son de la corrida anterior, así que **no afirmo** que el cambio corrija el P0 hasta
repetir la corrida.

Divergencias medidas que NO he corregido y quedan como hallazgos:
`video-hdr` (LAB true → emitido false en P0.5) · `video-hdr-mode` (HDR10PLUS/DOLBY_VISION_P8 → HLG/SDR)
· `video-hdr-nits` (1000 → 4000, 10000 → 400) · `audio-channels` (2 → 6) · `clock-jitter` (1000/2000 → 0)
· `saturation` (1.06 → 1.08) · `http-user-agent`/`http-referrer` con plantillas `{config.*}` sin resolver.
## 41 · P0 CORREGIDO Y VERIFICADO: el artefacto ya declara 7680x4320, no la geometría de P3

Corrida tras restaurar la inyección para todos: `{"ok":true,"perfiles":["P0"],"fallos":[]}`.
Archivo `salida_P0__1795196092579.m3u8` (292.810 B, guardar y salida_ok con el mismo tamaño):

```
video-width            = 7680      (antes 1920)
video-height           = 4320      (antes 1080)
adaptive-maxwidth      = 7680      (antes 1920)
adaptive-maxheight     = 4320      (antes 1080)
network-caching        = 105000    (antes 55000)
video-fps              = 30        (coincide con el LAB de P0)
```

El defecto de anti-degradación medido en el §40 queda **corregido en el artefacto**: con P0 seleccionado, la
lista declara ahora su geometría 8K real y no la de P3.

Cadena completa de esta corrección, toda medida:
1. §34/§35: la selección visible no llegaba al generador (`forceProfile` undefined) → fix de inyección.
2. §38: acotarlo a los `.5` dejaba el defecto en los base → medido con P0 emitiendo 1920x1080.
3. §41: inyección para todos → **P0 emite 7680x4320 + 105000**.

Pendiente con esto: repetir la matriz 12/12 completa (una sola corrida) para dejar la tabla final con la
aserción de recuperación ya corregida.
## 42 · MATRIZ FINAL 12/12 en el runner endurecido, con geometría y caching por perfil

Una sola corrida: `node fase8-runner.js "P0,…,P5.5"` → **`{"ok":true,"perfiles":[12],"fallos":[]}`**.

Geometría y caching medidos en cada archivo exportado:

```
perfil | geometry emitida | network-caching | selectedProfile
P0     | 7680x4320        | 105000          | P0
P1     | 3840x2160        |  72000          | P1
P2     | 3840x2160        |  58000          | P2
P3     | 1920x1080        |  55000          | P3
P4     | 1280x720         |  52000          | P4
P5     |  854x480         |  30000          | P5
P0.5   | 5760x3240        | 105000          | P0.5
P1.5   | 5760x3240        |  72000          | P1.5
P2.5   | 5760x3240        |  58000          | P2.5
P3.5   | 5760x3240        |  55000          | P3.5
P4.5   | 5760x3240        |  52000          | P4.5
P5.5   | 5760x3240        |  30000          | P5.5
```

- **`network-caching` coincide con el `L3_EXTVLCOPT` propio en los 12** (columna espNC == nc en todas las filas).
- **Geometría = resolución nominal del perfil**: 7680x4320 · 3840x2160 · 1920x1080 · 1280x720 · 854x480 · 5760x3240. Sin degradación.
- `selectedProfile` correcto en los 12.

Mi script de comprobación marcó 4 «FAIL» porque esperaba el valor de `vlcopt['video-width']` en vez de la
resolución nominal del perfil: **error de mi tabla de expectativas, no del artefacto** (P3 emitiendo
1920x1080 es lo correcto para P3). El runner, con sus aserciones propias, dio verde en las doce.
## 43 · Dos «divergencias» del §40 eran mi comparación, no el producto

- `http-user-agent` y `http-referrer`: el LAB trae **plantillas** (`{config.user_agent}`, `{config.referer}`) y
  el artefacto emite valores **resueltos** (UA de Chrome/Android, `https://www.netflix.com/`). El generador
  **sí resuelve** la plantilla; mi tabla marcaba FAIL porque comparaba la plantilla literal contra el valor
  resuelto. No es defecto.
- `video-fps` de P0: el LAB declara 30 y el artefacto emite 30 → correcto (mi lectura previa de 60 venía de
  otra corrida, antes de la inyección del perfil).

## 44 · Lo que queda genuinamente abierto en HDR (localizado, sin juzgar)

`#EXTVLCOPT:video-hdr` y `video-hdr-mode` se emiten en `m3u8-typed-arrays-ultimate.js:4133-4142`, con una
compuerta `_isHDR` en la línea 4410 que puede forzar el valor declarado. En P0.5 el LAB dice
`video-hdr=true` / `video-hdr-mode=HDR10PLUS` y el artefacto emitió `false` / `SDR`.

**No lo declaro defecto ni lo corrijo**: hay una compuerta deliberada cuyo criterio (¿probe del canal?
¿capacidad del device?) no he medido. La siguiente ronda debe leer 4400-4430 y decidir con el criterio a la
vista, no por la etiqueta. Lo mismo aplica a `audio-channels` (2→6), `clock-jitter` (1000/2000→0) y
`saturation` (1.06→1.08).
## 45 · El cluster HDR/audio/saturación viene de una TERCERA resolución de perfil (`pmProfile`)

Leído en `m3u8-typed-arrays-ultimate.js:4405-4424`:

```
const _labVo   = pmProfile?.vlcopt || {};
const _isHDR   = _labVo['video-hdr'] === 'true' || ... cfg.hdr_support ...
const _pixelFormat = ... _colorDepth de _labVo['video-bit-depth'] || cfg.color_depth
const _hdrMode = _labVo['video-hdr-mode'] || (_isHDR ? 'HDR10' : 'SDR');
```

Estos campos no salen de `profile` (el que fuerza la selección) sino de **`pmProfile`**, otra resolución de
perfil, más `cfg` para los respaldos. Por eso el `network-caching` y la geometría ya heredan bien (usan `vo`/
`profile`) mientras que `video-hdr`, `video-hdr-mode`, `video-hdr-nits`, `audio-channels`, `clock-jitter` y
`saturation` siguen mostrando valores de otra capa: **no vienen de la selección**.

Consecuencia medida y coherente con todo lo anterior: el cluster de divergencias del §40/§44 no son siete
defectos sueltos, es **una sola causa** — un tercer camino de resolución de perfil que `forceProfile` no toca.

Dónde mirar en la próxima ronda, sin adivinar: `pmProfile` se construye antes de la línea 4405; hay que
identificar su origen (`profileManager.getProfile(<id derivado del canal>)` o similar) y decidir si debe
respetar la selección activa. **No lo modifico sin ver ese origen**: cambiar la fuente de HDR/audio/filtros a
ciegas puede romper la coherencia codec↔resolución que la ley cardinal protege.
## 46 · El origen de `pmProfile` es `APE_PROFILES_CONFIG.getProfile(profile)` — el desajuste está en lo que devuelve

Leído en `m3u8-typed-arrays-ultimate.js:4394-4396`:

```
const pmProfile = (typeof window !== 'undefined' && window.APE_PROFILES_CONFIG
    && typeof window.APE_PROFILES_CONFIG.getProfile === 'function')
    ? window.APE_PROFILES_CONFIG.getProfile(profile) : null;
```

No es una resolución «por canal» como supuse en el §45: recibe **`profile`**, el mismo identificador que ya
gobierna la geometría (que sí es correcta: P0 → 7680x4320). El desajuste por tanto **no está en la selección**
sino en **lo que `getProfile(profile)` devuelve**: su `.vlcopt` no trae `video-hdr` / `video-hdr-mode`, mientras
que el `vlcopt` del LAB para ese mismo perfil sí los trae.

Dos objetos del mismo perfil, con contenido distinto. Eso explica que geometría y `network-caching` hereden
(dependen de `vo`, leído del LAB) y que HDR/audio/saturación no (dependen de `pmProfile.vlcopt`).

Próxima sonda exacta, sin adivinar: en el navegador, comparar
`APE_PROFILES_CONFIG.getProfile('P0.5').vlcopt` contra el `vlcopt` del LAB para P0.5 y listar las claves que
faltan. Si faltan, el defecto está en el importador/normalizador que puebla `APE_PROFILES_CONFIG`, no en el
generador. **No se corrige nada hasta ver esa diferencia.**
## 47 · CAUSA DEL CLUSTER: la homologación del importador (`includeLabExtras`), no el generador

Cadena medida, eslabón por eslabón:

```
LAB crudo        P0.5 vlcopt.video-hdr=true  mode=HDR10PLUS  51 claves
normalizado      P0.5 vlcopt.video-hdr=true  mode=HDR10PLUS  51 claves
profilesOf()     P0.5 vlcopt.video-hdr=true  mode=HDR10PLUS  51 claves   ← intacto
export final     P0.5 video-hdr=false        video-hdr-mode=SDR          ← perdido
export final     P0   video-hdr=true         video-hdr-mode=DOLBY_VISION ← OK
```

El dato sobrevive al crudo, al normalizador y a `profilesOf`. Se pierde **dentro de `importFromLABData`**
(`ape-profiles-config.js:5046`), que no copia el LAB tal cual: **homologa** claves a su propio esquema y deja
las no homologables detrás de una compuerta declarada en su propio código:

```
options.includeExtrasByProfile: { P0: true|false, ... }
  "gate que el generator usa para decidir si emite vlcopt/kodiprop/headers
   no homologables a PM9. Persistido en this.profiles[pid].includeLabExtras."
options.collisionResolutions / headerOverrides (settings/vlcopt/hlsjs/optimized_knobs)
```

Es decir: `video-hdr` / `video-hdr-mode` de los `.5` **no están homologados** y quedan fuera salvo que
`includeLabExtras` esté activo para ese ID. Encaja con el patrón completo: P0 homologa (`DOLBY_VISION_P8` →
`DOLBY_VISION`), P0.5 no (`HDR10PLUS` → cae a `SDR`). Y explica también `audio-channels`, `clock-jitter` y
`saturation`, que son de la misma familia de extras.

**No lo corrijo en esta ronda**: activar `includeExtrasByProfile` para los doce cambia la emisión de los base
(que hoy homologa bien) y eso exige medir el efecto antes/después, no un interruptor a ciegas. La próxima
ronda es: importar con `includeExtrasByProfile` a `true` **solo para los `.5`**, reexportar y comprobar los
seis campos; si los base no se mueven, se generaliza.
## 48 · `includeExtrasByProfile` para los `.5`: probado y SIN efecto (resultado negativo)

Driver modificado para importar con
`{ includeExtrasByProfile: { 'P0.5':true, 'P1.5':true, 'P2.5':true, 'P3.5':true, 'P4.5':true, 'P5.5':true } }`
y corrida de P0.5:

```
{"ok":true,"perfiles":["P0.5"],"fallos":[]}
salida_P0.5__1795242527857.m3u8
video-hdr=false · video-hdr-mode=SDR · video-hdr-nits=4000 · audio-channels=6 · clock-jitter=0 · saturation=1.08
```

**Idénticos a antes del cambio.** La hipótesis del §47 (compuerta `includeExtrasByProfile`) **no se sostiene
tal como la planteé**: activarla para los seis Premium no devuelve `video-hdr=true` / `HDR10PLUS`.

Lo que queda acreditado: el valor HDR emitido no sale de `pmProfile.vlcopt` en esa ruta, pese a que ese
objeto (medido en el §47) sí contiene `true`/`HDR10PLUS`. Hay otro origen por delante —probablemente `cfg`
(la config por perfil calculada antes del bloque de emisión) o un override por canal.

No presento esto como causa cerrada: es una hipótesis descartada con su medición. La siguiente sonda debe
leer `cfg` y de dónde se puebla `hdr_support`/`peak_luminance_nits` para los `.5`, no `pmProfile`.
## 49 · El importador no nombra las claves HDR: `getProfile().vlcopt` no puede ser el `vlcopt` del LAB

Búsqueda medida sobre `ape-profiles-config.js` completo:

```
Select-String -Pattern "'video-hdr'|video-hdr-mode"  →  0 coincidencias
```

Es decir: el importador/homologador **no nombra ni una vez** `video-hdr` ni `video-hdr-mode`. Combinado con la
contradicción del generador:

```
_isHDR = (_labVo['video-hdr'] === 'true') || cfg.hdr_support.some(h => h !== 'sdr')
_labVo = pmProfile?.vlcopt        (pmProfile = APE_PROFILES_CONFIG.getProfile(profile))
```

si `getProfile(profile).vlcopt` conservara `video-hdr='true'`, `_isHDR` sería **true** y el artefacto habría
emitido HDR. Emitió `false`/`SDR`. Conclusión: **el `vlcopt` que devuelve `getProfile()` no es el `vlcopt`
del LAB** — la homologación lo reconstruye y las claves HDR no están entre las que copia.

Esto cierra la cadena del §46-§49 con evidencia buscable (0 coincidencias) y sitúa el defecto **en el
importador**, no en el generador ni en la selección.

Corrección pendiente (una sola, acotada): añadir `video-hdr`, `video-hdr-mode`, `audio-channels`,
`clock-jitter`, `saturation` a la tabla de homologación de `vlcopt`, o pasar `vlcopt` entero sin filtrar.
No se aplica aquí: cambiar la tabla afecta a los doce perfiles y exige medir el antes/después (§29-§42).
## 50 · MECANISMO EXACTO del cluster: los `.5` los crea el módulo 12K al inicio y el LAB no los pisa

Tres hechos medidos en fichero:

1. `getProfile(id) { return this.profiles[id] || null; }` — devuelve el objeto guardado tal cual. Luego lo que
   haya en `this.profiles['P0.5'].vlcopt` es lo que se emite.
2. `ape-profiles-12k.js` (16.642 B) define los seis `.5` y contiene **0 ocurrencias de `video-hdr`**.
3. `_merge12kProfiles()` **no pisa** un perfil existente:

```
if (this.profiles[id]) return;      // no pisar un perfil ya persistido
```

Cadena: al iniciar, `_merge12kProfiles()` crea P0.5..P5.5 desde el módulo 12K (sin claves HDR). Después, la
importación del LAB encuentra esos IDs ya presentes y **no los reemplaza** → `vlcopt` del LAB (que sí trae
`video-hdr=true`, `HDR10PLUS`) nunca llega a los `.5`. Los base P0..P5 no fueron creados por el 12K, así que
sí reciben el LAB y por eso su HDR funciona.

Esto explica el patrón completo sin excepciones, y descarta el importador genérico como culpable: el problema
es la **precedencia entre el módulo 12K y el LAB para los `.5`**.

Fix definido (no aplicado, por presupuesto): al importar el LAB, para los IDs que ya existen **fusionar
`vlcopt`** (LAB rellena las claves ausentes; el 12K conserva lo suyo) en vez de omitir el perfil. Requiere
medir antes/después en los doce, como se hizo con `forceProfile`.
## 51 · CORRECCIÓN del §50: el LAB **sí** pisa al 12K. El fallo está en la homologación a `lpFixed`

Leído `ape-profiles-config.js:5182-5199`. Para un perfil que ya existe, el import hace:

```
this.profiles[pid] = Object.assign({}, this.profiles[pid], JSON.parse(JSON.stringify(lpFixed)));
```

Es decir, **el LAB (`lpFixed`) sobrescribe en bloque** las secciones que trae. Mi explicación del §50
(«el 12K crea el `.5` y el LAB no lo pisa») es **incorrecta**: el `if (this.profiles[id]) return;` que cité es de
`_merge12kProfiles()`, que corre en el arranque, no del import.

Consecuencia lógica, ahora sí consistente con el código: si `lpFixed` **no trae `vlcopt`** para los `.5`, el
`Object.assign` conserva el `vlcopt` del 12K (que no tiene claves HDR). El punto de pérdida es, por tanto,
**la construcción de `lpFixed`** — la homologación del perfil del LAB — y no la precedencia entre módulos.

Los hechos que siguen firmes: el `vlcopt` del LAB crudo y normalizado **sí** contiene `video-hdr=true` /
`HDR10PLUS` (§47, medido), y `ape-profiles-12k.js` **no contiene** esas claves (0 coincidencias, §50).

Siguiente sonda exacta: instrumentar la importación de **un** ID `.5` y volcar `lpFixed.vlcopt` antes del
`Object.assign`. Con eso se ve si la homologación lo omite o lo transforma. **No se toca nada antes de verlo.**
## 52 · La homologación tampoco pierde `vlcopt`: la hipótesis siguiente es el objeto `vo` del emisor

Leído `ape-profiles-config.js:5154`:

```
const lpFixed = Object.assign({}, lp);      // copia SUPERFICIAL del perfil del LAB
```

`lpFixed.vlcopt` es **la misma referencia** que `lp.vlcopt`, y el `Object.assign` del §51 lo escribe en
`this.profiles[pid]`. Con lo medido en el §47 (el `vlcopt` del LAB **sí** trae `video-hdr=true`/`HDR10PLUS`),
la cadena de importación **no explica** la pérdida. Tercera hipótesis descartada de la serie.

Queda un solo candidato coherente con el código del emisor (`m3u8-typed-arrays-ultimate.js`):

```
4093:  const netCache = fromLab(vo['network-caching'], cfg.network_cache_ms);   ← usa `vo`
4142:  if (vo['video-hdr']) vlcopts.push(`#EXTVLCOPT:video-hdr=${vo['video-hdr']}`);
4205:  'video-hdr','sharpen-sigma','contrast','brightness','saturation','gamma',
4414:  const _labVo = pmProfile?.vlcopt || {};
```

Hay **dos objetos distintos** en juego: `vo` (del que salen `network-caching`, `video-hdr`, `saturation`,
etc. en el bucle de 4142) y `pmProfile.vlcopt` (del que sale `_isHDR`/`_hdrMode`). Para P0.5 la geometría y
`network-caching` salieron correctas → `vo` es **el del perfil correcto**; pero emitió `video-hdr=false`, lo
que solo ocurre si `vo['video-hdr']` es la **cadena** `'false'` (truthy para el `if`, y se imprime tal cual).

Sonda exacta y única siguiente: volcar `vo['video-hdr']` y `pmProfile.vlcopt['video-hdr']` en el emisor para
**un** ID `.5`. Si `vo` trae `'false'` y `pmProfile` trae `true`, el defecto es de qué objeto alimenta cada
directiva, no de la importación — y el arreglo es elegir una sola fuente.

Serie de hipótesis descartadas con medición: import genérico (§47) · `includeExtrasByProfile` (§48) ·
precedencia 12K (§50, corregido en §51) · homologación (§52). Todas quedan escritas para no repetirlas.
## 53 · `vo` y `_labVo` son EL MISMO objeto: queda una sola explicación posible

Leído en el emisor:

```
4080: const vo     = pmProfile.vlcopt;
4407: const _labVo = pmProfile?.vlcopt || {};
```

No hay dos fuentes: **`vo` y `_labVo` son el mismo objeto**. La hipótesis «dos objetos en juego» del §52
queda descartada con la misma lectura que la inspiró.

Deducción por eliminación, con todo lo medido:

1. `norm.data` (LAB normalizado) **tiene** `vlcopt['video-hdr']=true` para P0.5 → §47.
2. El import escribe `this.profiles[pid] = Object.assign({}, existente, lpFixed)` con
   `lpFixed = Object.assign({}, lp)` (copia superficial) → §51-§52.
3. `getProfile(id)` devuelve `this.profiles[id]` tal cual → §50.
4. El emisor lee `pmProfile.vlcopt` → §4080/4407.
5. El artefacto emite `video-hdr=false` / `SDR`.

Si los pasos 1-4 son ciertos, el 5 no puede ocurrir. Por tanto **algo entre (1) y (4) no es como lo estoy
leyendo**, y el único punto que no he inspeccionado directamente es el valor real de
`this.profiles['P0.5'].vlcopt` **dentro del navegador**, después de la importación.

Sonda final, ya sin ambigüedad: una línea en el driver que registre
`JSON.stringify(window.APE_PROFILES_CONFIG.getProfile('P0.5').vlcopt['video-hdr'])` tras importar y antes de
generar. Ese dato cierra el caso: `true` → el defecto está después (emisión); ausente/`'false'` → el defecto
está en la importación, y habrá que ver qué `data` recibe realmente `importFromLABData`.

Nota de la serie: cuatro hipótesis descartadas por lectura directa, ninguna aceptada sin ver el valor real.
## 54 · CAUSA RAÍZ DEL CLUSTER: hay DOS escritores de `video-hdr`, y gana el segundo

Sonda del §53 ejecutada en el navegador tras importar (capturada a fichero para no truncar):

```
"probe":{"tiene_vlcopt":true,"hdr":"true","mode":"HDR10PLUS","claves":51}
```

**El perfil importado tiene los valores correctos.** La importación no era el problema: queda descartada.

Entonces, el artefacto emitiendo `false`/`SDR` solo se explica encontrando **otro escritor**. Búsqueda sobre el
generador:

```
4142:  if (vo['video-hdr']) vlcopts.push(`#EXTVLCOPT:video-hdr=${vo['video-hdr']}`);     ← primer escritor (LAB)
10704: lines.push(`#EXTVLCOPT:video-hdr=${_isAnyHdr ? 'true' : 'false'}`);               ← SEGUNDO escritor
10705: lines.push(`#EXTVLCOPT:video-hdr-nits=${_pmNitsTarget}`);
10706: lines.push(`#EXTVLCOPT:video-hdr-mode=${_hdrModeM3U}`);
```

El bloque de ~10695-10706 emite **las mismas tres directivas** desde `_isAnyHdr` / `_pmNitsTarget` /
`_hdrModeM3U` —variables de OTRA sección (4K False Supremo), no del `vlcopt` del LAB—. Al ir después, **sus
valores son los que sobreviven**. Eso explica `video-hdr=false`, `video-hdr-nits=4000` y `video-hdr-mode=SDR`
en P0.5, y también el `HLG` que apareció en P0.

Con esto se cierra la cadena completa: selección (arreglada) → import (intacto) → **duplicidad de emisión**
(defecto real). Y encaja con `audio-channels=6`, `clock-jitter=0` y `saturation=1.08`: los emite esa misma
sección con sus propios valores.

Fix definido (no aplicado): unificar en un solo escritor — que el bloque de 10704-10706 tome sus valores del
`vlcopt` del perfil efectivo (como hace 4142) o que no emita si el primero ya lo hizo. Requiere medir los 12
antes/después; es exactamente el tipo de cambio que no se aplica sin esa medición.
## 55 · Guarda de regresión HDR añadida (aún sin ejercitar)

Se añadió al arnés la comprobación que impide que el §54 pase desapercibido en el futuro:

- **driver**: mide `#EXTVLCOPT:video-hdr-mode` del archivo ON y lo compara con
  `APE_PROFILES_CONFIG.getProfile(pid).vlcopt['video-hdr-mode']` del LAB → `fila.hdr = { emitido, esperado }`.
- **runner**: falla la fila si `emitido !== esperado`, con mensaje
  `<id>: HDR emitido X != LAB Y`.

Hoy **el guardián debe fallar** (dos escritores, `:4142` y `:10704`); se deja activo para que cualquier arreglo
futuro se demuestre ahí y no en la prosa.

**Estado de la corrida**: `{"ok":false,"fallos":["marcador ausente"],"diag":[{"t":55449,"k":"chrome_close"}]}`
→ `EXIT=1`. La página no llegó al marcador en esa pasada, así que la guarda **no llegó a evaluarse**. El arnés
hizo lo correcto (fallar en voz alta), pero el valor de la comparación sigue pendiente de una corrida que
complete.

Ambos ficheros pasan `node --check` (RUNNER=0, DRIVER=0).
## 56 · La guarda HDR funciona y demuestra el defecto automáticamente

Corrida de P0.5 con la guarda del §55 activa:

```
"fallos": ["P0.5: HDR emitido SDR != LAB HDR10PLUS"]
"hdr":    {"emitido":"SDR","esperado":"HDR10PLUS"}
diag:     guardar 261.751 B · salida_ok 261.751 B
idempotente=true · recuperacionExacta=true · export.ok=true
EXIT=1
```

El defecto del §54 deja de ser una observación en prosa: **el arnés lo detecta, lo nombra y falla con código
distinto de cero**. Cuando se arregle el doble escritor (`:4142` vs `:10704`), esta misma aserción será la que
lo demuestre — y si alguien lo reintroduce, vuelve a rojo.

En la misma pasada, todo lo demás sigue verde: export verificado con sha y relectura, idempotencia del sidecar
y recuperación quirúrgica.
## 57 · Intento de arreglo del doble escritor: aplicado, rompió la página, REVERTIDO

Parche intentado en `m3u8-typed-arrays-ultimate.js:10704` para que el segundo escritor no reemitiera una
directiva HDR ya presente en el bloque del canal:

```
const _yaHdr  = lines.some(l => ... '#EXTVLCOPT:video-hdr=' ...);
if (!_yaHdr)  lines.push(`#EXTVLCOPT:video-hdr=${_isAnyHdr ? 'true' : 'false'}`);
… ídem nits y mode
```

Resultado de la corrida de verificación:

```
{"ok":false,"fallos":["marcador ausente"],"resultado":null}
diag: chrome_close a los 62.9 s con 479.555 B
```

La página **no llegó al marcador**, lo que apunta a un error de ejecución introducido por el parche (posible
redeclaración de `const` si ese bloque se evalúa en un ámbito ya usado). `node --check` pasaba, así que el
fallo es de ejecución, no de sintaxis.

**El parche fue revertido** en el acto: `ocurrencias_yaHdr=0`, generador con `node --check` = 0. El árbol queda
como estaba en el commit anterior (`9e2b75bb`), sin cambios funcionales en el generador.

Estado: el defecto del §54 **sigue presente y sigue cubierto por la guarda** (§56), que lo nombra y sale con
código 1. El arreglo requiere un ámbito seguro (probablemente antes del ensamblado del bloque, no dentro) y su
propia verificación; no lo dejo aplicado a medias.
## 58 · El «marcador ausente» era MI DRIVER, no el generador. Restaurado y verde

Evidencia de que la causa no estaba en el producto: dos corridas seguidas fallaban con `marcador ausente` y
**exactamente los mismos 479.554 B** de DOM, antes y después de revertir el parche del generador. Un cambio en
el generador no produce un DOM del mismo tamaño byte a byte.

Prueba directa: restauré el driver del commit **`ee446a28`** (el que dio 12/12 verde) y relancé:

```
EXIT=0
"fallos": []
guardar/salida_ok: P0 291.723 B · P0.5 260.761 B · P3.5 …
```

**Verde otra vez.** Por tanto las ediciones que rompían la página eran las mías (sonda `R.probe` + bloque
`fila.hdr`), no el generador ni el parche revertido.

Consecuencia honesta sobre la guarda del §55: sigue en el runner, pero al no recibir `fila.hdr` del driver
restaurado **queda inerte** (la condición exige que el campo exista). No vuelve a dar rojo falso, y tampoco
demuestra nada hasta que el driver vuelva a medir HDR — con cuidado esta vez, y verificando con una corrida
corta antes de la matriz completa.

Lección aplicada: cada cambio en el driver se valida con 3 perfiles antes de lanzar los 12.
## 59 · El fallo intermitente del runner es de DISEÑO: `--dump-dom` compite con el driver

Con el mismo driver que acaba de dar 3 perfiles en verde:

```
3 perfiles (P0,P0.5,P3.5) → EXIT=0, "fallos":[]
12 perfiles              → EXIT=1, "marcador ausente", chrome_close a 43 s, DOM 479.554 B
```

Y el DOM tiene **exactamente los mismos 479.554 B** que en los fallos anteriores. Es la firma de siempre:
`chrome --dump-dom` imprime el documento cuando termina la carga, y mi marcador se añade **después**, cuando el
driver acaba. Con 12 perfiles (36 generaciones) la página a veces no llega; con 3 casi siempre llega.

Es decir: **el runner depende de una carrera** entre el volcado del DOM y el final del trabajo asíncrono. Los
verdes anteriores fueron reales, pero el mecanismo es frágil, y por eso el 12/12 no es reproducible a voluntad.

**Arreglo ya probado en este mismo repo**: el patrón del arnés de 754 MB (`fase9-big-harness.js`) — la página
hace `POST /resultado` con el JSON y el runner **espera el callback** con reloj real, sin `--dump-dom`. Ese
patrón funcionó a la primera con 754 MB. Es lo que hay que portar al runner de la matriz.

No lo aplico en esta ronda por presupuesto: es un cambio de mecánica del arnés, no un retoque, y merece su
propia verificación con 12 perfiles. Queda definido y con precedente medido.
## 60 · 12/12 REPRODUCIBLE: dos lotes de seis, ambos en verde

Como el runner es intermitente con los 12 de una tirada (§59), se ejecuta en **dos lotes de seis** — mismo
arnés, mismas aserciones, sin tocar código:

```
node fase8-runner.js "P0,P1,P2,P3,P4,P5"                    → EXIT=0 · "fallos":[]
node fase8-runner.js "P0.5,P1.5,P2.5,P3.5,P4.5,P5.5"         → EXIT=0 · "fallos":[]
```

Diag de la primera corrida: `guardar P0 293.344 B` + `salida_ok` con el mismo tamaño. Segunda:
`guardar P0.5 258.950 B` + `salida_ok` idéntico.

Con esto la cobertura de los doce perfiles deja de depender de una carrera: **dos invocaciones de seis salen
verdes de forma consistente**. La matriz de una sola tirada queda como comodidad, no como requisito.

Comando de reproducción (el que debe usarse):

```bat
node IPTV_v5.4_MAX_AGGRESSION\artifacts\integracion-4k6k\fase8-runner.js "P0,P1,P2,P3,P4,P5"
node IPTV_v5.4_MAX_AGGRESSION\artifacts\integracion-4k6k\fase8-runner.js "P0.5,P1.5,P2.5,P3.5,P4.5,P5.5"
```
## 61 · Dedupe del escritor HDR aplicado sin romper nada — pero NO cambia el resultado, y ya sé por qué

Parche (sin declaraciones nuevas, para no repetir el fallo del §57):

```
if (!lines.some(l => typeof l === 'string' && l.indexOf('#EXTVLCOPT:video-hdr=') === 0)) lines.push(...)
if (!lines.some(... 'video-hdr-nits=' ...)) lines.push(...)
if (!lines.some(... 'video-hdr-mode=' ...)) lines.push(...)
```

Corrida de verificación **en verde**: `EXIT=0`, `"fallos":[]`, `guardar P0.5 260.401 B` + `salida_ok`.
La página **no** se rompe esta vez.

Pero el resultado no cambia:

```
P0.5: hdr=false  mode=SDR           width=5760
P0  : hdr=true   mode=DOLBY_VISION  width=7680
P3.5: hdr=false  mode=SDR           width=5760
```

**Deducción medida**: si la guarda hubiera encontrado una directiva previa, no habría escrito nada; escribió,
luego **el primer escritor (`:4142`) no emite para los `.5`**. Es decir, `vo['video-hdr']` es falso/ausente en
esa ruta para los Premium, y `video-hdr-mode` del LAB tampoco llega ahí.

Conclusión: la deduplicación era la hipótesis equivocada. El arreglo real es que **`:10704-10706` lean el
`vlcopt` del perfil efectivo** (no `_isAnyHdr`/`_hdrModeM3U` de la sección 4K False), o que `:4142` reciba el
objeto correcto para los `.5`. Ambas cosas exigen ver qué es `vo` en esa ruta para un `.5`.

El parche queda aplicado porque **no altera el resultado** (verificado: mismos valores que antes, arnés verde) y
deja el terreno preparado para cuando el primero escriba.
## 62 · El objeto del perfil CAMBIA entre la importación y la generación

Lectura de `m3u8-typed-arrays-ultimate.js:4066-4143`:

```
function generateEXTVLCOPT(profile) {
  const cfg = getProfileConfig(profile);
  let pmProfile = null;
  if (window.APE_PROFILES_CONFIG?.getProfile) pmProfile = window.APE_PROFILES_CONFIG.getProfile(profile);
  if (pmProfile && pmProfile.vlcopt && Object.keys(pmProfile.vlcopt).length > 0) {
    const vo = pmProfile.vlcopt;
    …
    if (vo['video-hdr']) vlcopts.push(`#EXTVLCOPT:video-hdr=${vo['video-hdr']}`);   // :4142
```

Esa línea es **incondicional** dentro de la rama: si `vo['video-hdr']` fuera `'true'`, emitiría `video-hdr=true`.
No lo emite (el artefacto dice `false`), y la sonda del §53 midió `'true'` **justo después de importar**.

Por eliminación, con dos medidas que no encajan: **el `vlcopt` del perfil `.5` cambia entre la importación y la
generación**. Algo reescribe `this.profiles['P0.5']` en medio (candidato: `_merge12kProfiles()` ejecutándose de
nuevo, o una recarga de persistencia que trae la versión del módulo 12K, que no tiene claves HDR — §50).

Sonda que lo cierra, y es la única que falta: registrar `getProfile('P0.5').vlcopt['video-hdr']` **antes y
después** de la primera generación, en la misma corrida. Si cambia de `'true'` a ausente, el culpable es quien
reescribe; si no cambia, el fallo está en el propio `generateEXTVLCOPT` recibiendo otro `profile`.

No aplico más parches hasta tener ese dato: tres intentos sobre este mismo punto (§57, §61) no han movido el
valor, y el patrón indica que estoy mirando el sitio equivocado.
## 63 · PRUEBA DIRECTA: la rama del LAB no se ejecuta. No es que el valor se pierda: no se emite

Los tres vecinos de `video-hdr` en el mismo bloque salen del **mismo** `vo` y se emiten en las líneas
inmediatamente anteriores (`:4133-4137`, `:4142`):

```
_hom    = vo['hdr-output-mode'] || vo['video-hdr-mode']     → #EXTVLCOPT:hdr-output-mode
_tmpeak = vo['video-tone-mapping-peak'] || vo['video-hdr-nits'] → #EXTVLCOPT:tone-mapping-peak
if (vo['tone-mapping']) …                                    → #EXTVLCOPT:tone-mapping
if (vo['video-hdr']) …                                       → #EXTVLCOPT:video-hdr
```

Medido en el export de P0.5:

```
hdr-output-mode = (ausente)
tone-mapping    = (ausente)
tone-mapping-peak = (ausente)
video-hdr       = false        ← este SÍ, pero viene de :10704
```

Si `vo` fuera el `vlcopt` del LAB (51 claves, medido tras importar), `hdr-output-mode` valdría `HDR10PLUS` y
`tone-mapping-peak` valdría 1000. **No aparecen.** Por tanto la rama
`if (pmProfile && pmProfile.vlcopt && Object.keys(...).length > 0)` (`:4074`) **no se ejecuta** para estos
canales, y el `video-hdr=false` del artefacto procede únicamente del bloque posterior.

Conclusión medida y coherente: `generateEXTVLCOPT(profile)` recibe un `profile` cuyo `getProfile()` no tiene
`vlcopt`, aunque el sidecar declare `selectedProfile: "P0.5"` y la geometría sea 5760x3240.

Sonda final (una línea, removible): registrar el argumento `profile` dentro de `generateEXTVLCOPT`. Con eso se
ve qué identificador llega realmente, y el arreglo pasa a ser trivial — pasar el correcto.

Esto también explica por qué `audio-channels`, `clock-jitter` y `saturation` no heredan: son de la misma rama
que no se ejecuta.
## 64 · CAUSA DEFINITIVA: `generateEXTVLCOPT` es CÓDIGO MUERTO — una sola ocurrencia en 17k líneas

Conteo medido sobre `m3u8-typed-arrays-ultimate.js`:

```
Select-String -Pattern 'generateEXTVLCOPT'   →  1 coincidencia
4066: function generateEXTVLCOPT(profile) {      ← la definición, y NADA MÁS
```

**Cero llamadas.** Toda la función que contiene el bloque del LAB —`hdr-output-mode` (`:4134`),
`tone-mapping-peak` (`:4136`), `video-hdr` (`:4142`), `video-hdr-nits`, `audio-channels`, `clock-jitter`,
`saturation`, etc.— **nunca se ejecuta**.

Eso explica el cluster completo, sin excepciones, y explica por qué todos mis intentos anteriores no movían el
valor: estaba parchando una función que nadie invoca.

Lo que sí se emite viene de otros escritores:
- `EXTVLCOPT:network-caching` aparece **8 veces** en el fichero (por eso el caching sí hereda).
- `video-hdr` / `video-hdr-mode` / `video-hdr-nits` salen del bloque 4K False (`:10704-10706`), que usa
  `_isAnyHdr` / `_hdrModeM3U` / `_pmNitsTarget` — no el `vlcopt` del perfil.

**Consecuencia**: para los `.5` (y para cualquier perfil cuya rama LAB se esperaba) el tuning HDR/audio de la
audio del LAB no llega al artefacto porque su emisor está desconectado.

Arreglo, dos caminos (ninguno aplicado aún):
1. **Conectar** `generateEXTVLCOPT(profile)` en el ensamblado del bloque de canal (respetando el orden y sin
   duplicar `network-caching`, ya emitido por otro camino).
2. **Portar** solo la lógica de las claves ausentes al emisor vivo (`:10704`), leyendo `vo` del perfil efectivo.

Ambos exigen una corrida de verificación con la guarda HDR y los 12 perfiles. Es la corrección de fondo que
queda identificada con prueba estática, no con sospechas.
## 65 · CORREGIDO Y VERIFICADO: `video-hdr` de los `.5` ya hereda del LAB

Parche en el emisor vivo (`:10589`), no en el código muerto: `_pmHdrCanonical` toma
`settings.hdr_canonical` y, si falta, **traduce `vlcopt['video-hdr-mode']`** del perfil efectivo
(HDR10PLUS → hdr10+, DOLBY_VISION → dolby-vision, HLG, HDR10, SDR). Envuelto en `try/catch`; sin él, el
`_isAnyHdr` quedaba en `false` para los Premium.

Corrida de verificación: `EXIT=0`, `"fallos":[]`, `guardar P0.5 260.130 B` + `salida_ok`.

```
antes   P0.5: hdr=false mode=SDR
ahora   P0.5: hdr=true  mode=HDR10_PLUS
        P0  : hdr=true  mode=DOLBY_VISION   (sin cambio, no regresión)
```

Con esto el cluster HDR deja de tener como causa el emisor desconectado: la directiva que sobrevive
(`:10704`) ya recibe el modo real del perfil. Los `.5` declaran su HDR; P0 sigue en Dolby Vision.

Pendiente del mismo cluster, no tocado: `audio-channels` (2→6), `clock-jitter` (1000/2000→0) y
`saturation` (1.06→1.08) siguen saliendo de la sección 4K False. Mismo enfoque: leerlos del `vlcopt` del
perfil efectivo.
## 66 · Los valores que faltan no se pierden: están **literales** en el emisor

Búsqueda en el generador:

```
10747: lines.push(`#EXTVLCOPT:audio-channels=6`);      ← 6 escrito a mano
 3163: '#EXTVLCOPT:saturation=1.08',                  ← 1.08 escrito a mano
 4341: `#EXTVLCOPT:saturation=1.0`,                   ← 1.0 en otro preset
 4247: vlcopts.push(`#EXTVLCOPT:clock-jitter=${Number(cfg.clock_jitter ?? cfg.clockJitter ?? 1500)}`);
 4107: vlcopts.push(`#EXTVLCOPT:clock-jitter=${vo['clock-jitter'] || 1500}`);   ← esta rama es del código muerto
```

Es decir: `audio-channels=6` y `saturation=1.08` **no vienen del LAB ni de una pérdida de datos** — están
escritos como constante en la sección 4K False. El LAB de los perfiles declara `audio-channels=2` y
`saturation=1.06`; el artefacto emite 6 y 1.08 porque esas líneas no consultan el perfil.

Esto cierra la explicación del cluster completo, campo por campo:

| Campo | LAB | Emitido | Origen real |
|---|---|---|---|
| `audio-channels` | 2 | **6** | literal en `:10747` |
| `saturation` | 1.06 | **1.08** | literal en `:3163` |
| `clock-jitter` | 1000/2000 | **0** | `cfg.clock_jitter` en `:4247` (LAB no llega) |
| `video-hdr-mode` | HDR10PLUS | ~~SDR~~ → **HDR10_PLUS** | corregido en `:10589` (§65) |

Arreglo definido (no aplicado): sustituir esos literales por el valor del `vlcopt` del perfil efectivo, con el
literal como último respaldo, igual que se hizo con el HDR. Es un cambio de tres líneas, pero toca la sección
4K False y exige la misma verificación con guarda que el §65.

Nota de doctrina: un literal en el emisor contradice `iptv-no-hardcode-doctrine` del propio repo; estos tres
casos son la evidencia concreta de esa deuda.
## 67 · CORREGIDO Y VERIFICADO: `audio-channels` literal 6 → valor del perfil (2)

Parche en `:10747` con el mismo patrón del §65: lee `vlcopt['audio-channels']` del perfil efectivo y deja el
`6` solo como respaldo.

```
antes   P0.5: audio-channels=6    P0: audio-channels=6
ahora   P0.5: audio-channels=2    P0: audio-channels=2
        P0.5: hdr=true mode=HDR10_PLUS   (sin regresión)
        P0   : hdr=true mode=DOLBY_VISION (sin regresión)
EXIT=0 · "fallos":[] · guardar P0.5 260.483 B + salida_ok
```

Dos de los tres literales del §66 corregidos y verificados. Queda `saturation` (`:3163`, literal 1.08 frente a
1.06 del LAB) y `clock-jitter` (`:4247`, `cfg` con respaldo 1500 mientras el LAB declara 1000/2000), ambos con
el mismo enfoque pendiente.
## 68 · `saturation`: está en un preset estático (`:3163`), no en el bloque vivo

Búsqueda acotada al tramo vivo del generador:

```
Select-String -Pattern 'saturation' | Where LineNumber -gt 10000   →  0 coincidencias
```

Luego el `saturation=1.08` del artefacto sale del **preset estático de la línea 3163** (un elemento de array),
que el bloque de canal reutiliza. No es una línea condicional corregible con el patrón del §65: exige hacer ese
preset **consciente del perfil** (o filtrar esa directiva del preset y emitirla desde el perfil), lo que es un
cambio estructural, no un reemplazo puntual.

Estado de los tres literales del §66:

| Campo | Estado |
|---|---|
| `video-hdr-mode` | **corregido y verificado** (§65) |
| `audio-channels` | **corregido y verificado** (§67) |
| `saturation` | localizado en preset estático `:3163` — cambio estructural pendiente |
| `clock-jitter` | `:4247` usa `cfg` con respaldo 1500; el LAB declara 1000/2000 — pendiente de trazar `cfg` |

No lo aplico sin verificación: tocar un preset compartido afecta a todos los perfiles, y este repo ya pagó
caro un cambio así (§57).
## 69 · `clock-jitter`: parcheé código muerto otra vez y lo revertí

Intenté que `:4247` tomara el valor del perfil. Corrida: `EXIT=0` pero **`clock-jitter=0` igual** en P0 y P0.5.

Causa: `:4107` y `:4247` están **dentro de `generateEXTVLCOPT`** — la función con 1 ocurrencia y 0 llamadas (§64).
Volví a parchear código muerto. Revertido: `node --check` = 0 y el árbol queda sin ese cambio.

El `clock-jitter=0` del artefacto lo emite el bloque 4K False, igual que `audio-channels` (§67). Es el único
punto donde hay que mirar de ahora en adelante para este campo.

Regla que me llevo, y que ya está escrita dos veces en este documento: **antes de parchear una directiva,
confirmar que su línea pertenece a una función que se ejecuta**. El conteo de referencias va primero.
## 70 · Localizado el último literal: `clock-jitter` está en CUATRO presets

```
14932: 'clock-jitter': '0', 'clock-synchro': '0',
14970: 'clock-jitter': '0', 'clock-synchro': '0',
15006: 'clock-jitter': '0', 'clock-synchro': '0',
15042: 'clock-jitter': '0', 'clock-synchro': '0',
```

El `clock-jitter=0` del artefacto **no se pierde ni se calcula mal**: está escrito a mano en cuatro tablas de
preset. Igual que `saturation=1.08` en `:3163`.

Clase de defecto única, no dos bugs sueltos: **los presets estáticos pisan al LAB**. Los campos que heredan
(geometría, `network-caching`, HDR, `audio-channels`) son los que se emiten con `lines.push` desde el perfil;
los que no heredan (`saturation`, `clock-jitter`, `clock-synchro`) están congelados en tablas.

Cierre de la investigación del cluster, con ubicación exacta de todo:

| Campo | Origen real | Clase |
|---|---|---|
| geometría, `network-caching` | emisor del perfil | **hereda** (12/12) |
| `video-hdr`, `video-hdr-mode` | 4K False + `vlcopt` tras §65 | **corrige** |
| `audio-channels` | 4K False tras §67 | **corrige** |
| `saturation` | preset `:3163` | **literal** |
| `clock-jitter`, `clock-synchro` | presets `:14932/14970/15006/15042` | **literal** |
| `generateEXTVLCOPT` entera | 1 ocurrencia, 0 llamadas | **código muerto** |

Arreglo pendiente, uno solo y estructural: sustituir esos literales por el valor del `vlcopt` del perfil
efectivo, con el literal como último respaldo. Es el mismo patrón de §65/§67, aplicado a tablas en vez de a
líneas sueltas, y exige la misma verificación con guarda.
## 71 · Guarda offline de HDR/audio añadida — y caza un defecto nuevo (P3 declara HLG sobre un perfil SDR)

`guarda-hdr-audio.js` compara, sobre los archivos exportados y **sin Chrome**, el `video-hdr`,
`video-hdr-mode` y `audio-channels` emitidos contra el `vlcopt` del LAB de cada perfil:

```
P0    | hdr=true  | DOLBY_VISION | esp=DOLBY_VISION | ac=2 | PASS
P1    | hdr=true  | HDR10_PLUS   | esp=HDR10_PLUS   | ac=2 | PASS
P2    | hdr=true  | HDR10        | esp=HDR10        | ac=2 | PASS
P3    | hdr=true  | HLG          | esp=SDR          | ac=2 | FAIL   ← NUEVO
P4    | hdr=false | SDR          | esp=SDR          | ac=2 | PASS
P5    | hdr=false | SDR          | esp=SDR          | ac=2 | PASS
P0.5…P5.5 | hdr=true | HDR10_PLUS | esp=HDR10_PLUS   | ac=2 | PASS
GUARDA_HDR_AUDIO PASS=11 FAIL=1   EXIT=1
```

**Hallazgo**: P3 emite `hdr=true` / `HLG` cuando su LAB dice **SDR**. Es el error inverso al de los Premium:
no falta HDR, se **declara HDR sobre un perfil que el propietario calibró como SDR**. Para una fuente SDR, un
`video-hdr=true` puede provocar color shift en players que lo interpretan como forzado.

Causa probable: el respaldo del §65 solo actúa cuando `settings.hdr_canonical` falta; si los settings del perfil
P3 (integrados en la app) dicen `hlg` y el LAB dice `SDR`, gana settings. El arreglo correcto es **dar
precedencia al LAB cuando existe** `vlcopt['video-hdr']`, no solo como respaldo.

La guarda queda como artefacto reejecutable: cualquier cambio futuro en esta zona se mide en un segundo, sin
navegador.
## 72 · CORREGIDO Y VERIFICADO: el LAB manda sobre `settings` — guarda en 12/12

Cambio de precedencia en `:10589`: si el perfil trae `vlcopt['video-hdr-mode']`, **se usa antes** que
`settings.hdr_canonical` de la app. Antes era al revés (settings primero, LAB solo de respaldo), y por eso P3
declaraba `HLG` sobre un perfil que el propietario calibró como `SDR`.

```
antes   GUARDA_HDR_AUDIO PASS=11 FAIL=1   (P3: HLG vs SDR)
ahora   GUARDA_HDR_AUDIO PASS=12 FAIL=0
        corrida P3,P0.5,P0 → EXIT=0 · "fallos":[] · guardar P3 291.040 B
```

Los doce perfiles coinciden ahora con su LAB en `video-hdr`, `video-hdr-mode` y `audio-channels`.

Cadena completa de esta zona, toda medida: causa raíz = `generateEXTVLCOPT` código muerto (§64) → emisor vivo
con literales (§66) → precedencia invertida (§71) → **12/12**.
## 73 · La guarda amplía a `saturation` y `clock-jitter`: 12/12 en ROJO, con los números exactos

```
perfil | emitido sat | LAB sat | emitido cj | LAB cj | resultado
P0     | 1.08        | 1.06    | 0          | 2000   | FAIL
P1     | 1.08        | 1.05    | 0          | 1000   | FAIL
P2     | 1.08        | 1.04    | 0          | 1000   | FAIL
P3     | 1.08        | 1.03    | 0          | 1000   | FAIL
P4     | 1.08        | 1.02    | 0          | 1000   | FAIL
P5     | 1.08        | 1.00    | 0          | 1000   | FAIL
P0.5   | 1.08        | 1.06    | 0          | 1000   | FAIL
P1.5   | 1.08        | 1.05    | 0          | 1000   | FAIL
P2.5   | 1.08        | 1.04    | 0          | 1000   | FAIL
P3.5   | 1.08        | 1.03    | 0          | 1000   | FAIL
P4.5   | 1.08        | 1.02    | 0          | 1000   | FAIL
P5.5   | 1.08        | 1.00    | 0          | 1200   | FAIL
GUARDA_HDR_AUDIO PASS=0 FAIL=12   EXIT=1
```

Lo importante no es el rojo: es **lo que revela**. El LAB tiene un valor **distinto por perfil** para
`saturation` (1.06→1.00 descendente) y para `clock-jitter` (2000/1000, con 1200 en P5.5). El artefacto emite
`1.08` y `0` planos para los doce: **el tuning per-perfil de esos dos campos no llega a la lista en ningún
caso**.

HDR y `audio-channels` siguen verdes en las mismas filas — la corrección de §65-§72 no se ha tocado.

Queda por tanto un resto único y bien medido: cinco literales (`:3163` saturation; `:14932/14970/15006/15042`
clock-jitter/clock-synchro) que hay que sustituir por el valor del `vlcopt` del perfil, con el literal como
último respaldo — el mismo patrón que ya funcionó tres veces en esta serie.
## 74 · Intento de reescritura de `saturation`/`clock-jitter` en el bloque: sin efecto, revertido

Inserté, junto al parche de `audio-channels` (que sí funcionó), una reescritura de las líneas
`#EXTVLCOPT:saturation=` / `clock-jitter=` / `clock-synchro=` sobre el propio array, tomando el valor de
`vlcopt` del perfil. Corrida `P0,P3,P5.5` → `EXIT=0`, `"fallos":[]`, pero la guarda siguió:

```
P0 | sat=1.08 eSat=1.06 | cj=0 eCj=2000 | FAIL
P3 | sat=1.08 eSat=1.03 | cj=0 eCj=1000 | FAIL
```

Conclusión medida: en ese punto del ensamblado el array **todavía no contiene** esas directivas — se añaden
más tarde o en otro array. Por eso `audio-channels` (que sí se emite ahí) se corrigió y estas dos no.

Parche **revertido**: `node --check` = 0, 0 ocurrencias de `[FASE 11]`. El árbol queda como en `dd43e972`,
con la guarda en rojo midiendo el resto.

Siguiente paso, ya acotado: localizar el punto de emisión real de `saturation`/`clock-jitter` (posterior a
`:10747`) y aplicar allí la misma reescritura. La guarda dirá si `PASS=12`.
## 75 · `saturation` está en `__omegaComplianceTags()` (`:3155`), llamada sin argumentos en `:13905`

Localización definitiva del literal:

```
3155: function __omegaComplianceTags() {
3163:    '#EXTVLCOPT:saturation=1.08',        ← literal del bloque OMEGA CRYSTAL
13905: + '\n' + __omegaComplianceTags();      ← única llamada, sin argumentos
```

Intenté hacerlo consciente del perfil (parámetro opcional + `typeof profile` en la llamada). Corrida `P0,P3`:
`EXIT=0`, pero `sat=1.08` seguía → **en `:13905` `profile` no está en ese ámbito** (`typeof profile` da
`undefined`), así que el respaldo 1.08 se mantiene.

**Revertido** con `git checkout` del fichero: `node --check` = 0, 0 ocurrencias de `FASE 12`, árbol igual a
`dd43e972`.

Conclusión operativa para la próxima: en `:13905` hay que pasar el identificador de perfil **desde el llamador
que sí lo tiene** (el mismo que ya usa `vo`/`profile` para geometría y caching) y, además, reescribir
`clock-jitter` en el mismo bloque. Es un cambio de firma con dos llamadores, no un parche local.

Tres intentos sobre estos dos campos, tres descartes medidos: no están en el array de `:10747`, no reciben
`profile` en `:13905`, y el literal vive en `__omegaComplianceTags()`.
## 76 · `saturation` HEREDA por perfil: P0 → 1.06 y P3 → 1.03, medidos

Arreglo en `:3155`/`:13905`: `__omegaComplianceTags(__pId)` usa `vlcopt['saturation']` del perfil, y la llamada
le pasa `forceProfile || ProfileManagerV9.activeProfileId || 'P3'` — que es lo único disponible **antes** de que
`:13921` calcule `profile` (la llamada a las omega tags ocurre en `:13905`, 16 líneas antes).

Verificación (se regeneraron **solo** P0 y P3):

```
P0 | sat=1.06 | eSat=1.06 | PASS en saturation
P3 | sat=1.03 | eSat=1.03 | PASS en saturation
P1 | sat=1.08 | eSat=1.05 | archivo VIEJO (no regenerado en esta corrida)
P2 | sat=1.08 | eSat=1.04 | archivo VIEJO
```

El literal 1.08 ya no es el valor emitido cuando el perfil lo declara: `saturation` pasa a heredar.
`clock-jitter` sigue en 0 (no incluido en este parche).
## 77 · Tabla completa: TRES campos en 12/12 y `clock-jitter` como único rojo

Salida completa de `guarda-hdr-audio.js` tras regenerar los doce:

```
perfil | hdr   | modo emitido  | modo LAB      | ac | sat emit | sat LAB | cj emit | cj LAB
P0     | true  | DOLBY_VISION  | DOLBY_VISION  | 2  | 1.06     | 1.06    | 0       | 2000
P1     | true  | HDR10_PLUS    | HDR10_PLUS    | 2  | 1.05     | 1.05    | 0       | 1000
P2     | true  | HDR10         | HDR10         | 2  | 1.04     | 1.04    | 0       | 1000
P3     | false | SDR           | SDR           | 2  | 1.03     | 1.03    | 0       | 1000
P4     | false | SDR           | SDR           | 2  | 1.02     | 1.02    | 0       | 1000
P5     | false | SDR           | SDR           | 2  | 1.00     | 1.00    | 0       | 1000
P0.5   | true  | HDR10_PLUS    | HDR10_PLUS    | 2  | 1.06     | 1.06    | 0       | 1000
P1.5   | true  | HDR10_PLUS    | HDR10_PLUS    | 2  | 1.05     | 1.05    | 0       | 1000
P2.5   | true  | HDR10_PLUS    | HDR10_PLUS    | 2  | 1.04     | 1.04    | 0       | 1000
P3.5   | true  | HDR10_PLUS    | HDR10_PLUS    | 2  | 1.03     | 1.03    | 0       | 1000
P4.5   | true  | HDR10_PLUS    | HDR10_PLUS    | 2  | 1.02     | 1.02    | 0       | 1000
P5.5   | true  | HDR10_PLUS    | HDR10_PLUS    | 2  | 1.00     | 1.00    | 0       | 1200
GUARDA_HDR_AUDIO PASS=0 FAIL=12
```

Lectura correcta de ese 0/12: **la aserción es conjunta**. Por campo, los doce coinciden en
`video-hdr` (12/12), `video-hdr-mode` (12/12), `audio-channels` (12/12) y **`saturation` (12/12, con el
gradiente completo 1.06→1.00)**. El único campo que no coincide es **`clock-jitter`: 0 emitido frente a
2000/1000/1200 del LAB**, y por él fallan las doce filas.

Queda un único defecto conocido en todo el cluster, con su emisor localizado en cuatro presets
(`:14932/14970/15006/15042`) y patrón de arreglo ya probado (§76).
## 78 · `clock-jitter`: mi valor aterriza PRIMERO y tres ceros lo pisan después

Añadí `clock-jitter`/`clock-synchro` al bloque OMEGA (junto a `saturation`, que sí funcionó) leyéndolos del
perfil. Medición por canal:

```
P0 clock-jitter = 2000,0,0,0   (4 ocurrencias)
P3 clock-jitter = 1000,0,0,0   (4 ocurrencias)
```

**El valor correcto es el primero** y hay **tres ceros después** (`:14932/14970/15006/15042`). En VLC gana la
última directiva, así que el 0 sigue imponiéndose. `saturation`, en cambio, aparece **una sola vez** — por eso
su arreglo funcionó.

Conclusión: para `clock-jitter` no basta con emitirlo bien; hay que emitirlo **después** de los presets, o
eliminar las tres emisiones redundantes.

Parche **revertido** (`git checkout`): `node --check` = 0, árbol en `1265d8db`.

Estado final del cluster: tres campos en 12/12 (HDR, audio, saturation) y `clock-jitter` pendiente de mover su
emisión al final del bloque de canal. La causa ya no es una hipótesis: está contada en ocurrencias por archivo.
## 79 · CERRADO: guarda HDR/audio/saturación/jitter en **12/12 PASS**

Se eliminaron las **6** ocurrencias del preset `'clock-jitter': '0', 'clock-synchro': '0',` y se emiten desde el
bloque OMEGA con el valor del perfil (respaldo 1500/1). Medición por canal antes y después:

```
antes   P0 clock-jitter = 2000,0,0,0 (4 ocurrencias)   ← ganaba el último 0
ahora   P0 clock-jitter = 2000 (1) · sat=1.06 (1)
        P3 clock-jitter = 1000 (1) · sat=1.03 (1)
```

Regenerados los doce (dos lotes, ambos `EXIT=0` con `"fallos":[]`) y guarda completa:

```
GUARDA_HDR_AUDIO PASS=12 FAIL=0
```

Por campo, los doce perfiles coinciden ahora con el LAB en `video-hdr`, `video-hdr-mode`,
`audio-channels`, `saturation` y `clock-jitter`. El cluster queda cerrado de punta a punta:

`generateEXTVLCOPT` código muerto (§64) → literales en el emisor (§66) → precedencia invertida (§71) →
emisión pisada por presets (§78) → **12/12**.
## 80 · Selector automático: observado en el flujo real (antes del fix) y coherente con sus reglas

Lo que sí quedó medido, sin inventar entradas:

- Con **tres canales reales** cuyos nombres son `✦●✦| FHD - BEIN SPORTS FHD |✦●✦`, `AR| BEIN SPORTS NEWS FHD`,
  `AR| BEIN SPORTS NBA FHD`, y **sin** `forceProfile`, el pipeline emitió **P3** para los tres.
- Eso es exactamente lo que predicen las reglas de `determineProfile` (`:8010`): ningún nombre lleva `8K`,
  `4K`, `UHD`, `720`, `SD` ni `480`; todos llevan `FHD` → **CAPA 3, `NAME:FHD/1080→P3` (peso 20)**. Sin
  `resolution` ni `bitrate` en el canal, el resto de capas no suman.

Es decir: **la decisión automática se observó en el flujo real** (3/3 → P3) y coincide con la regla declarada.
Lo que **no** existe es una señal por canal en el artefacto que exponga esa decisión de forma aislada: el
sidecar declara `selectedProfile` (la operación) y la geometría sale del perfil forzado.

Por eso, desde el arreglo de `forceProfile`, la ruta automática queda **bypassada** en la app: se elige perfil
explícitamente. Ejercitarla de nuevo exigiría generar sin selección y con canales que aporten señales distintas
(4K, 8K, 720, SD), cosa que el catálogo real de 3 canales no permite.

Estado: **observada y coherente**; **no aislable** con el catálogo actual — límite de datos, no del arnés.
## 81 · Intento de fixture con señales variadas: el catálogo no las ofrece (y mi extracción era ruidosa)

Extraje de la lista autorizada de 754 MB, en streaming, `#EXTINF` + URL buscando señales `8K`, `4K`, `720`, `SD`:

```
senales_encontradas = 720, SD      canales = 2
720 -> UK| Sky MAX FHD [MEGA]
SD  -> FR| LFM TV FHD [MEGA]
fixture = C:\Users\HFRC\APE_PRIVADO\entrada_senales.m3u8  (1.297 B)
```

**Dos problemas, y los digo antes de que nadie los use como prueba:**

1. Mi detección miraba toda la línea `#EXTINF`, no solo `tvg-name`; los dos aciertos son **falsos positivos**
   (los nombres dicen `FHD`; el `720`/`SD` vino de otro atributo). El fixture **no** aporta señales distintas.
2. El catálogo autorizado parece dominado por nombres `FHD`, así que **no hay** `8K`/`4K` en el nombre con la
   muestra recogida.

Consecuencia: la cobertura automática **sigue sin aislarse**, y ahora la causa está acotada a los datos: el
catálogo no trae canales con señales de nombre variadas. La extracción habría que hacerla por `tvg-name`
exacto, y si el catálogo no las tiene, no hay fixture honesto que fabricar.
## 82 · El catálogo SÍ tiene señales: 41 canales UHD reales (y cero 8K/720/SD)

Conteo por `tvg-name` exclusivamente (corrige el ruido del §81), sobre los 11.222 canales:

```
canales_totales      = 11222
tvg-name con 8K      = 0
tvg-name con 4K/UHD  = 41     ej: "NL| ZIGGO SPORT UHD [MEGA]"
tvg-name con 720     = 0
tvg-name con SD      = 0
```

Esto cambia la conclusión anterior: **sí hay fixture honesto** para aislar el selector automático. Con canal
`FHD` (→ `NAME:FHD/1080→P3`) y canal `UHD` (→ `NAME:4K/UHD→P1`) en la misma entrada, `determineProfile` debe
producir **dos decisiones distintas** desde dos entradas reales distintas. Eso es una prueba de la ruta
automática, no de la manual.

Lo que no hay es 8K/720/SD en nombres, así que la cobertura automática alcanzable con este catálogo es de **dos
tiers** (P1 y P3), no de cinco. Se declara el alcance en vez de inventar señales.

Pendiente inmediato: construir la entrada con 1 canal UHD + 1 canal FHD reales, generar **sin** `forceProfile`
(hay que permitir esa ruta en el driver) y leer el perfil emitido. Si sale P1 para el UHD y P3 para el FHD, el
selector automático queda probado en el flujo real.
## 83 · Prueba de la ruta automática con el fixture mixto: sigue sin ejercitarse, y el motivo es MI inyección

Corrida con `entrada_mixta.m3u8` (1 canal UHD + 1 canal FHD, sha `73317b20…`) y `activeProfileId = null` antes de
generar. Resultado en el archivo exportado:

```
video-width      = 1920,1920
network-caching  = 55000,55000
fallos: ["P3: ON sin 3 sidecar", "P3: recuperacion no exacta"]   ← esperado: la entrada tiene 2 canales, no 3
```

**Ambos canales resolvieron a P3**, incluido el UHD. Es decir, `determineProfile` **no tomó la decisión**: el
perfil siguió viniendo de `forceProfile`.

Causa, y es mía: la inyección del §35 tiene dos fuentes —

```
_sel = (pm && pm.activeProfileId) || (APE_PROFILES_CONFIG && APE_PROFILES_CONFIG.activeProfileId) || null
```

Anulé la primera y **la segunda siguió devolviendo P3**. Por tanto el flujo sigue forzado y la ruta automática
nunca se ejecuta. No es un fallo del generador ni del selector.

Corrección para la próxima: probar la ruta automática requiere **no inyectar nada** — es decir, un modo explícito
en el driver (`window.APE_SIN_FORCE = true`) que el controlador respete, en lugar de intentar vaciar la selección
por la puerta de atrás.

Nota: los dos fallos del arnés (`ON sin 3 sidecar`, `recuperacion no exacta`) son correctos: la entrada tiene
2 canales y las aserciones esperan 3. El arnés no se equivocó; la prueba cambió de entrada.
## 84 · `APE_SIN_FORCE` añadido al controlador; el driver quedó roto y se restauró

Cambio aplicado en `generation-controller.js` (compatible, tres líneas):

```
if (window.APE_SIN_FORCE === true) { /* modo sonda: ruta automatica */ }
else if (_sel) options = Object.assign({}, options, { forceProfile: String(_sel) });
```

Con eso el flujo automático es alcanzable **sin** tocar la selección por la puerta de atrás: basta
`window.APE_SIN_FORCE = true`.

Pero mi edición del **driver** produjo `SyntaxError: Unexpected token 'else'` (encadené un `else` sobre un
`else if` ya existente). `node --check` = 1 → **driver restaurado** desde la copia commiteada
(`node --check` = 0, sin `mix=1`).

Estado: el controlador tiene el escape listo; el driver volvió a su versión buena y **la corrida automática
sigue pendiente**. No dejo el arnés en estado roto.

Para la próxima, en este orden y sin encadenar: (1) driver carga `entrada_mixta`, (2) driver fija
`window.APE_SIN_FORCE = true` en una rama **independiente** (no `else if`), (3) correr y leer los dos
`video-width` esperados: **3840** (UHD→P1) y **1920** (FHD→P3).
## 85 · SELECTOR AUTOMÁTICO EJERCITADO Y CORREGIDO: FHD→P3 y UHD→P1 en el flujo real

Con `entrada_mixta.m3u8` (sha `73317b20…`, 1 canal UHD + 1 canal FHD reales) y `window.APE_SIN_FORCE = true`
(ruta automática, sin perfil forzado):

```
ANTES:  widths = 1920,1920   sel=null   ← los dos a FHD: el UHD caía a P3
FIX:    regla NAME:HD exigía !UHD y !4K (porque "UHD" contiene "HD")
DESPUÉS: widths = 1920,3840  sel=null   ← FHD→P3 (1920) y UHD→P1 (3840)
```

**El selector automático decide por canal en el flujo real**: dos entradas reales distintas, dos decisiones
distintas, sin `forceProfile`. Es la primera vez en toda la serie que la ruta automática se ejerce y se mide.

El defecto corregido era real: `if (name.includes('HD') …)` puntuaba P3 para `UHD`, así que un canal UHD se
clasificaba como FHD. Ahora ese canal llega a P1.

`EXIT=1` en esa corrida es **esperado y correcto**: el arnés exige 3 canales/sidecars y el fixture tiene 2.
La aserción no se relajó; se usó otra entrada.
## 86 · Primer paso del patrón callback: el driver ya publica su resultado

Añadida una línea al final del driver, después del marcador DOM:

```
fetch('/resultado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(R) });
```

`node --check` = 0. El **runner aún no tiene la ruta** (`runner_ruta_resultado = False`), así que hoy ese POST
recibe 404 y **el arnés sigue funcionando por `--dump-dom`**: el cambio es inocuo y deja el terreno preparado.

Falta para cerrar el patrón callback:
1. En el runner, ruta `POST /resultado` que guarde el cuerpo y marque la finalización.
2. Que `fin()` prefiera ese cuerpo al DOM y **no** dependa de `--dump-dom`.
3. Verificar con 3 perfiles antes de los 12 (la lección de §58/§84/§86).

Con eso el 12/12 saldría en una tirada sin carrera. Hoy se cubre con dos lotes de seis, reproducible.
## 87 · El runner ya recibe el callback: `resultado_cb` confirmado y matriz verde

Ruta añadida al servidor del arnés:

```
if (u === '/resultado' && req.method === 'POST') { … RESULTADO_CB = b; log('resultado_cb', {bytes}); … }
```

Verificación con tres perfiles:

```
EXIT=0 · "fallos":[] · diag contiene resultado_cb … cb=True
```

Es decir: el driver publica su JSON, el runner lo **recibe**, y la matriz sigue verde. Las dos mitades funcionan
por separado y conviviendo con `--dump-dom`, que sigue siendo la fuente actual.

Falta solo el último paso, y es el que cambia la mecánica:
1. Que `fin()` prefiera `RESULTADO_CB` al DOM cuando exista.
2. Quitar `--dump-dom` de los flags.
3. Correr 3 perfiles, y después los 12 en **una** tirada.

Con eso desaparece la carrera por la que el 12/12 tenía que ir en dos lotes.
## 88 · 12 PERFILES EN UNA SOLA TIRADA: la carrera `--dump-dom` queda eliminada

`fin()` prefiere ahora el cuerpo del callback y solo cae al DOM si no llegó:

```
const FUENTE = RESULTADO_CB ? ('E2E:' + RESULTADO_CB + '</pre>') : buf;
```

Corrida única de los doce:

```
EXIT=0 · "fallos":[] · resultado_cb presente (cb=True) · guardar P0 292.961 B
```

El arnés ya no depende de cuándo Chrome vuelca el DOM: el resultado llega por la ruta autenticada
`POST /resultado`, con el testigo de la sesión. Los dos lotes de seis dejan de ser necesarios, y el 12/12 deja de
ser intermitente.

Cierre de la serie de mecánica del arnés, hecha en dos entregas verificadas (publicar → comprobar, recibir →
comprobar, consumir → comprobar) en lugar de un solo gesto, que es lo que me había costado tres reversiones.
## 89 · Hueco de seguridad propio, cerrado: `/resultado` exige testigo

Al añadir la ruta `POST /resultado` (§87) la dejé **sin autenticación** — era una ruta que aceptaba datos de
cualquier proceso local. Lo detecté al revisar el diseño antes de dar la mecánica por cerrada:

```
if (u === '/resultado' && req.method === 'POST') {
    if (req.headers['x-ape-token'] !== TOKEN) { log('rechazo', {u, causa:'token'}); return responder(res, 401, …); }
```

Y el driver pasa el testigo:

```
headers: Object.assign({ 'Content-Type': 'application/json' }, H)
```

Verificación doble:

```
--selftest                        → 8/8 casos, fallos=0, EXIT=0
12 perfiles en una tirada         → EXIT=0 · "fallos":[] · cb=True · rechazo=False
```

Es decir: el callback llega **autenticado** y, sin testigo, la ruta responde 401 como el resto de rutas
sensibles. No quedó una puerta abierta por comodidad.
## 90 · Rollback re-verificado sobre el árbol final — y el paso que faltaba en el procedimiento

Segundo ciclo completo, ahora con el diff definitivo:

```
antes            : 12 entradas (6 modificados + 6 sin seguimiento)
git stash push -u: árbol limpio · los 3 módulos nuevos AUSENTES · index sin refs
git stash pop    : CONFLICTO la primera vez → "stash entry is kept"
```

El conflicto lo provoqué yo: al probar la restauración copié el driver desde el artefacto commiteado **dentro
del árbol ya limpio**, y esa copia sin seguimiento chocó con la del stash.

Recuperación aplicada (y que ahora forma parte del procedimiento):

```
rm frontend/_fase4_e2e_driver.js      # quitar la copia que sobra
git stash pop                          # aplica sin conflicto
```

Resultado verificado:

```
status = 12 entradas · 6 ficheros clave presentes · node --check = 0 en los 3 críticos ·
stash list = 0
```

**Procedimiento de rollback correcto, definitivo:**

```bat
git -C <worktree> stash push -u -m "rollback"
:: verificar que los modulos nuevos ya no existen
git -C <worktree> stash pop
:: si dio conflicto: borrar las copias sin seguimiento que sobren y repetir el pop
```

Rollback probado dos veces, con el diff completo y con el árbol final. La primera vez salió limpio; la segunda
me enseño que una copia manual de más rompe el pop.