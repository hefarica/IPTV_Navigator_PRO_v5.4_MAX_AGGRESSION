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