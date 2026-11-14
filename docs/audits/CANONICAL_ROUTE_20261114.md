# RUTA CANONICA `/lists/<cualquier-lista>.m3u8` — idempotente, polimorfica, isomorfa

**Fecha:** 2026-11-14 · **Autor:** `contract-architect` (t52, team `canary-jit-20261111`)
**Codigo:** [`tools/lab/ape-jit/server.js`](../../tools/lab/ape-jit/server.js) — bloque `RUTA CANONICA DE LISTAS`
junto a `publicBase()` + handler `/lists/…` en el dispatch.
**Prueba:** [`tools/quality/test_canonical_route.js`](../../tools/quality/test_canonical_route.js) (4 casos, motor real).
**Sin desplegar:** el deploy lo hace t48 por CI/CD. Cero escrituras en el VPS, cero SSH de escritura.

## 1. El recurso

La lista del operador, ya medida (no se re-mide aqui):

| Dato | Valor |
|---|---|
| URL | `https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046.m3u8` |
| Tamano / lineas / canales | 1.311.467.322 B · 22.360.136 lineas · 21.224 `#EXTINF` |
| sha256 del fichero | `a727532096782f97ad4e76a0f8dcc65a0a78122572a873335c4c3ca8dbba381b` |
| Cabecera | `#EXTM3U x-tvg-url="" x-tvg-url-epg="" x-tvg-logo=""` + 22 lineas `#EXT-X-APE-*` |

**La ruta no conoce ese nombre.** El identificador sale de la ruta
(`/lists/<id>.m3u8` → `safeId(id)`), y el fichero se resuelve contra un directorio
(`LISTS_DIR`, por defecto `<dir del map>/lists`, en el VPS `/var/www/html/lists`). Cualquier `.m3u8`
del directorio se sirve igual: si aparece `APE_LISTA_20261114.m3u8`, la ruta sigue sin tocar codigo.

## 2. Las tres propiedades, y como se consigue cada una

### 2.1 IDEMPOTENTE

- **Mismos bytes siempre**: no hay nonce, ni fecha, ni contador por peticion. El cuerpo es funcion
  determinista de `(fichero, forma)`.
- **ETag fuerte derivado del fuente**: `"<sha256(fuente)[0..32]>-ape-wire-1-<forma>"`. El sha256 se
  calcula del fichero (no de una copia) y se **cachea por identidad fisica** (`dev:ino:size:mtimeMs`):
  sirve para no releer 1,3 GB en cada GET, y **no altera los bytes** que se entregan.
- **`If-None-Match` → 304 ANTES de abrir el fichero**: un 304 no lee un solo byte del fuente.
- **Sin escrituras**: la ruta solo abre descriptores de lectura. Dos peticiones concurrentes leen el
  mismo fichero y no se pisan porque no hay nada compartido que escribir.

**La forma entra en el ETag** y no es un detalle: dos representaciones distintas (cartucho vs proxy)
del mismo recurso **no pueden compartir validador**, o un `304` serviria la forma equivocada a un
player distinto. Ademas se emite `Vary: User-Agent`, que es la otra mitad del mismo contrato.

### 2.2 POLIMORFA (por reproductor, decidido por User-Agent)

Se reutiliza la **misma** definicion de "cartucho" que ya usa el motor para decidir master-vs-media
(`RE_CARTRIDGE`, la misma regex `VLC|LibVLC|Kodi|LibreELEC` de L6319/L6416): una sola definicion en el
fichero, no dos que puedan divergir.

| Clase | UA que la activa | Forma servida | Por que esa forma |
|---|---|---|---|
| **cartucho** | VLC, LibVLC, Kodi, LibreELEC | **VERBATIM**: el fichero tal cual, byte a byte (`Content-Length` conocido, cero trabajo por linea) | Estos players leen la lista con sus `#EXTINF`/`#EXTVLCOPT`/`#KODIPROP` sin ayuda; envolverles las URLs les rompe el pipeline |
| **proxy** | OTT Navigator, TiviMate, ExoPlayer, Smarters | Cada URL de canal se envuelve en el **contrato del OttShim**: `http://127.0.0.1:<APE_SHIM_PORT>/source.m3u8?id=<tvg-id>&url=<URL original VERBATIM>` | Estos players necesitan que el shim del device sea el que hace la peticion (una sola conexion al proveedor, cabeceras controladas por el shim) |
| **desconocido** | cualquier otro | **VERBATIM** (forma segura) y **se declara**: `X-APE-Form-Reason: ua-desconocido-forma-segura` | Una lista verbatim siempre es parseable; una envoltura mal puesta deja al player sin reproducir |

Las lineas de etiqueta (`#EXTM3U`, `#EXTINF`, las 22 `#EXT-X-APE-*`) **pasan intactas en las dos
formas**: el cableado no destruye la metadata del generador.

**Fail-closed del proxy**: sin `APE_SHIM_PORT` (o `?port=`) la forma proxy devuelve **400** con su
razon, no una lista a medias. Es la misma doctrina que ya aplica `/playlist-shim.m3u8`.

### 2.3 ISOMORFA

`/^\/(?:jit\/)?lists\/([^/]+)\.m3u8$/` → `safeId` → `path.resolve(LISTS_DIR, id + '.m3u8')` con
comprobacion de contencion. Nada del nombre `APE_LISTA_1794100720046` aparece en el codigo. Se acepta
tanto `/lists/…` como `/jit/lists/…` porque `publicBase()` publica con el prefijo `/jit`.

## 3. Streaming: por que no se puede cargar el fichero

`fs.createReadStream(…, { highWaterMark: 64 KB })`:

- **forma cartucho**: `pipe` directo al socket. Ni una linea se procesa.
- **forma proxy**: `pipe` a un `Transform` que parte en lineas conservando el fin de linea original y
  solo reescribe las lineas de URL. El estado por peticion es un `carry` acotado a **4 MB**: si una
  sola linea lo supera, el stream **aborta** (`E_LIST_LINE_TOO_LONG`) en vez de crecer sin control.

Nunca hay un `readFileSync` del fuente en esta ruta. (El `/playlist-shim.m3u8` que ya existia **si**
hace `readFileSync` del catalogo: con 1,3 GB eso mata el VPS. La ruta nueva no lo reutiliza por eso;
reutiliza su *contrato de URL*, que es lo que el OttShim espera.)

## 4. Evidencia de las cuatro pruebas

Salida literal de `node tools/quality/test_canonical_route.js` (motor real en loopback, listas
sinteticas con la forma real: cabecera + 22 lineas `#EXT-X-APE-*` + canales `#EXTINF` con
`tvg-id/tvg-name/tvg-logo/group-title` + URL):

```text
T1 IDEMPOTENCIA  sha256=7304a66dae911249… en los 2 GET ·
                 ETag="7304a66dae9112492ac1aeb765c1147e-ape-wire-1-cartridge" · 304 con 0 B
T2 POLIMORFISMO  cartucho 7304a66dae911249… (4754 B, verbatim) · proxy 6f96230b1decbea3… (6119 B) ·
                 21 canales en ambas · 21 URLs envueltas, 0 crudas · metadata APE 22=22
T3 ISOMORFISMO   pedida como OTRA_LISTA_20261114_xyz -> 4754 B, sha256 identico,
                 id de la ruta="OTRA_LISTA_20261114_xyz" · inexistente -> 404
T4 MEMORIA       <ver 4.4>
```

### 4.1 Idempotencia (T1)

Dos GET con el mismo UA → mismo `sha256` de respuesta y mismo ETag; un tercero con `If-None-Match:
<etag>` → **304 con 0 bytes**. El ETag casa con el patron exigido
(`"<32 hex>-ape-wire-1-<forma>"`), es decir: derivado del sha256 del fuente **y** de la version del
cableador.

### 4.2 Polimorfismo (T2), tabla de diferencias

| | cartucho (UA VLC) | proxy (UA OTT) |
|---|---|---|
| `X-APE-Form` | `cartridge` | `proxy` |
| Bytes | 4.754 | 6.119 |
| sha256 | `7304a66d…` = **el del fichero fuente** | `6f96230b…` (distinto) |
| Canales `#EXTINF` | 21 | 21 (mismo orden) |
| Metadata `#EXT-X-APE-*` | 22 | 22 (intactas) |
| Lineas de URL | 21 crudas al proveedor | 21 envueltas en el OttShim, **0 crudas** |
| URL de ejemplo | `http://provider.example:8080/live/user/pass/10000.m3u8` | `http://127.0.0.1:8899/source.m3u8?id=ch10000&url=http%3A%2F%2Fprovider.example%3A8080%2Flive%2Fu…` |

La URL original viaja **verbatim** dentro de `url=`: no se reescribe, no se pierde, no se inventa.

### 4.3 Isomorfismo (T3)

La misma lista copiada como `OTRA_LISTA_20261114_xyz.m3u8` → mismos bytes, `X-APE-List-Id` refleja el
nombre **pedido** (no un nombre fijo) y el ETag sigue derivando del contenido. Una lista inexistente →
404.

### 4.4 Memoria (T4)

Se construye un fichero del **tamano real de la lista del operador** (1.311.467.322 B, 21.224 canales)
replicando el bloque de canal medido, se sirve **dos veces completas** y se muestrea el RSS del proceso
del motor cada 200 ms durante el servicio:

```text
T4 MEMORIA       fichero 1249.0 MB servido 2x · RSS base 56.1 MB -> pico 98.3 MB (+42.1) ->
                 final +14.7 MB (limite 96 MB) · sha256 estable en las 2 pasadas
```

Corrida completa (`node tools/quality/test_canonical_route.js`, sin `--big-bytes`): **4 casos, PASS 4,
FAIL 0, 43,2 s**. El fichero se genero pidiendo **1.311.467.322 B** (el tamano exacto de la lista del
operador); el generador redondea por canal, de ahi que el fichero medido sea 1.249,0 MiB = 1.309.7xx.xxx B.

Lectura: el RSS del motor **no crece con el fichero**. El crecimiento observado es el buffer de hash
(1 MB) + la churn de V8, no el tamano de la lista. Un `readFileSync` de 1,3 GB habria movido el RSS en
el orden de GB.

## 5. Limites y decisiones que conviene conocer

| Tema | Estado | Razon |
|---|---|---|
| **Nonce por descarga (evasion ISP)** | **NO se aplica, a proposito** | La doctrina `iptv-polimorfismo-idempotencia` muta la lista en cada descarga para que el ISP no pueda firmarla. Eso es **incompatible** con la idempotencia que exige este contrato (mismos bytes + ETag estable + 304). Aqui manda lo pedido: identidad exacta. Si se quiere evasion, va en **otra** capa/otra ruta, y entonces su ETag tiene que ser `no-store` y sin validador |
| **Reescritura de URLs del proveedor** | **NO** | La forma proxy lleva la URL original dentro de `url=`; no se transforma el destino. La doctrina SHIELDED (renombrar el fichero, jamas transformar URLs internas) se respeta |
| **Conexiones al proveedor** | **0 desde el VPS** | El cableado no abre ninguna conexion: la forma proxy delega en el OttShim del device, que es quien ya tiene el gate de una sola conexion |
| **Puerto del shim** | obligatorio en forma proxy | Sin `APE_SHIM_PORT`/`?port=`: 400 declarado, nunca lista rota |
| **Lista real en el VPS** | **NO verificada aqui** | No se ha contactado el VPS. La prueba usa listas sinteticas con la MISMA forma y el MISMO tamano; el fichero real tiene ademas contenido que no cambia la ruta (linea = linea) |
| **Capa nginx/TLS** | fuera de alcance | Esta ruta es del motor Node; el 200/206/302 de nginx y el `content-type` final los pone t48 al desplegar |

## 6. Reproducir

```bash
node -c tools/lab/ape-jit/server.js
node -c tools/quality/test_canonical_route.js
node tools/quality/test_canonical_route.js                      # tamano real 1.311.467.322 B
node tools/quality/test_canonical_route.js --big-bytes 314572800 # version rapida (~300 MB)
```

La prueba arranca el motor en loopback con `LISTS_DIR` y `APE_SHIM_PORT` temporales, escribe solo en
`os.tmpdir`, y borra el fichero grande y el directorio al terminar. El puerto queda libre.

## 7. Como se cablea por el resto del sistema

| Consumidor | Que pide | Que recibe |
|---|---|---|
| VLC / Kodi / LibreELEC | `/lists/<lista>.m3u8` | lista verbatim (la del generador) |
| OTT Navigator / TiviMate / ExoPlayer / Smarters | `/lists/<lista>.m3u8` | misma lista con cada URL envuelta en `127.0.0.1:<shim>/source.m3u8?id=<canal>&url=<destino>` |
| OttShim del device | `GET /source.m3u8?id=<canal>&url=<destino>` | resuelve y sirve por el gate de una conexion (ruta ya existente en el motor) |
| Cualquier client con cache | `If-None-Match: <etag>` | `304` sin cuerpo y sin leer el fichero |

## 8. Consecuencia declarada: este cambio mueve el sha256 del motor

El contrato `contracts/canary_jit_contract_v1.json` **pina el motor por sha256**
(`engine.deployable_engine_sha256 = 290b1103…`). Al añadir la ruta canonica, `tools/lab/ape-jit/server.js`
pasa de 449.392 B a **463.246 B** y su sha256 pasa a **`b5da7e804799c5ca9dac3f3d9d9fcb81e926395b697cc394d2dbe01dd7e5636b`**.

Medido, no supuesto — un recibo emitido con el motor nuevo es rechazado por el juez real:

```text
veredicto con el motor MODIFICADO: REJECT E_ENGINE_SHA_UNVERIFIED
motivo: ["engine_sha256 b5da7e804799c5ca... no es el sha desplegable del manifiesto (290b11030f3b6bf9...)"]
```

Es el comportamiento **correcto** (fail-closed): un recibo que nombra un motor distinto del que el
manifiesto despliega no acredita nada. Pero deja una tarea abierta que **no** se resuelve aqui: **re-pinar
el sha del motor en el contrato** es decision del operador, y el contrato no esta en el alcance de esta
tarea. Hasta que se re-pine, cualquier recibo del motor nuevo sera rechazado con ese codigo.

