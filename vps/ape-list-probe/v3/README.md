# ape-list-probe 3.0.0

Servicio de auditoría de listas M3U por HTTP(S), con lectura en streaming, identidad SHA-256, censo de entradas y muestreo HTTP acotado. Incluye las correcciones de las versiones adjuntas v1 y v2. Preparado el 13 de noviembre de 2026.

## Inicio rápido

Requisito: Node.js 22 o superior. Validación realizada con Node.js 24.22.1 en Linux x64. No requiere instalar paquetes externos.

Desde la carpeta extraída:

```bash
node ape-list-probe.js
```

En otra terminal:

```bash
curl http://127.0.0.1:8787/health
curl --get http://127.0.0.1:8787/probe \
  --data-urlencode 'url=https://tu-servidor.example/lista.m3u8' \
  --data-urlencode 'force=1'
```

Sustituir la URL del ejemplo por la lista que se quiere revisar. `--data-urlencode` conserva correctamente las consultas con `?`, `&` y URLs anidadas de `/pulse/`.

Para mantener la configuración, copiar `.env.example` como `.env`, completar `APE_PROBE_LIST` y ejecutar:

```bash
node --env-file=.env ape-list-probe.js
```

Con la lista configurada basta consultar `http://127.0.0.1:8787/probe`. El archivo `.env` puede contener la URL con sus credenciales; conservarlo localmente y fuera del control de versiones.

### Windows PowerShell

```powershell
Copy-Item .env.example .env
# Editar .env y completar APE_PROBE_LIST.
node --env-file=.env ape-list-probe.js
```

Desde una segunda ventana:

```powershell
Invoke-RestMethod 'http://127.0.0.1:8787/health'
$lista = 'https://tu-servidor.example/lista.m3u8'
$objetivo = 'http://127.0.0.1:8787/probe?force=1&url=' + [uri]::EscapeDataString($lista)
Invoke-RestMethod $objetivo | ConvertTo-Json -Depth 20
```

## Qué cambió

| Problema de los adjuntos | Comportamiento de esta versión |
|---|---|
| v2 entrega `Buffer` al consumidor y usa `.trim()` como si recibiera texto | Decodificación incremental con `TextDecoder` antes de separar líneas |
| UTF-16 dividido buscando el byte `0A`; `utf16be` no aceptado por `Buffer.toString()` | UTF-8, UTF-16LE y UTF-16BE con BOM, incluso dividido entre bloques |
| Última línea sin LF omitida en v1 | Se procesa al completar el cuerpo |
| Hash de un prefijo publicado como identidad completa | `sha256` y `sha256_http` quedan en `null` ante interrupciones o límites |
| Timeout de v2 finaliza al recibir cabeceras | Plazos de descarga y auditoría que incluyen el cuerpo y redirecciones |
| Caché inoperante o que reutiliza estados viejos | Revalidación 304 con ETag fuerte, procedencia visible y muestras nuevas |
| Clases y muestras sin límite efectivo | Límites por línea, URL, clases, muestras, concurrencia, caché e IP |
| 3xx o una muestra buena declaran viva toda una clase | Redirecciones verificadas, inspección de prefijo y estado `MIXTA` cuando corresponde |
| URLs con usuario, clave y tokens en JSON/caché | Rutas normalizadas, consultas ocultas y clave de caché SHA-256 |
| Bloqueo de privados solo por texto de hostname | Comprobación de direcciones DNS y conexión fijada a una dirección verificada |
| Segmentos HLS contados como canales | Clasificación separada de catálogo, HLS media y HLS master |
| Tags APE interpretados como funcionamiento del harness | Presencia textual separada de ejecución; `ejecucion_verificada: false` |

El User-Agent conserva el valor original `VLC/3.0.20 LibVLC/3.0.20`.

## Identidad, bytes y compresión

| Campo | Significado |
|---|---|
| `sha256` | SHA-256 del cuerpo M3U después de descomprimir; antes de convertir su codificación a texto. Conserva bytes BOM, CRLF y UTF-16 originales. |
| `bytes` | Número de bytes de esa misma secuencia aceptados por el analizador. En descargas incompletas es un contador parcial. |
| `sha256_http` | SHA-256 del cuerpo HTTP recibido, antes de descomprimir. Excluye cabeceras, TLS y framing de transferencia. |
| `bytes_http` | Tamaño del cuerpo HTTP procesado antes de descomprimir. |
| `identidad.origen` | `DESCARGA_COMPLETA`, `CACHE_REVALIDADA` o `NO_COMPUTADA`. |
| `identidad.calculada_en` | Fecha del cálculo original. Un 304 conserva esta fecha. |
| `integridad.completa` | La lectura, los límites, el EOF y la descompresión concluyeron correctamente. |
| `integridad.censo_completo` | El analizador llegó al final de la entrada. |

Con contenido sin compresión, los dos hashes coinciden. Con gzip, el hash HTTP corresponde al contenido comprimido y el principal al contenido M3U descomprimido. Se aceptan `Content-Encoding: gzip`, `deflate` y `br`; un archivo gzip sin esa cabecera se detecta por su firma. Se procesa una capa de compresión. No se interpretan archivos ZIP ni combinaciones de varias capas.

El censo no normaliza el archivo antes del hash y nunca escribe la lista. Si una descarga se corta, los contadores observados pueden ayudar al diagnóstico, pero no son el tamaño ni el censo completo. No se guarda esa lectura en caché.

## Interpretación del informe

El esquema es **`ape.list.identity.v3`**. Conserva los nombres principales `sha256`, `bytes`, `canales`, `lineas`, `patrones`, `servabilidad`, `harness`, `no_computado` y `duracion_ms`, pero amplía su significado mediante campos explícitos.

| `estado` | Interpretación |
|---|---|
| `SIN_FALLOS_EN_MUESTRA` | Las muestras HTTP ejecutadas devolvieron un manifiesto o datos compatibles y no hubo hallazgos estructurales observados. No extrapola el resultado a todos los canales. |
| `CON_HALLAZGOS` | Inconsistencias del censo/directivas o fallos concretos en alguna muestra. |
| `NO_VERIFICADA` | Censo completo con muestreo desactivado, insuficiente, inconcluso o interrumpido. |
| `HLS_DETECTADO` | Manifiesto HLS de reproducción. `canales` es 0; los `EXTINF` de segmentos no se cuentan como canales y no se descargan segmentos. |
| `INVALIDA` | El contenido no reúne la estructura básica de una lista reconocida. |
| `INCOMPLETA` | No se pudo terminar la lectura/análisis dentro de límites: ambos hashes completos son `null`. |
| `NO_COMPUTADO` | No se obtuvo el cuerpo de lista necesario, por ejemplo por bloqueo del destino, fallo DNS o estado HTTP del origen. |

Las clases de muestra pueden resultar `SIN_FALLOS_EN_MUESTRA`, `MIXTA`, `CON_FALLOS`, `INCONCLUSA` o `NO_MUESTREADA`. El informe incluye resultados individuales, códigos HTTP, bytes inspeccionados y latencia de cada intento. `muestreo` expone solicitudes planificadas/ejecutadas, clases cubiertas y presupuesto.

`harness` conserva los indicadores URL2-CARTRIDGE, QMAX, QUALITY-WATCH, LAB, TVG y M3U. Se compara `APE-CHANNELS` con el número de `EXTINF` del catálogo; los nombres de las directivas se comparan completos. Se cuentan `#EXTVLCOPT`, `#KODIPROP` y `#EXTHTTP`, y se comprueba que `EXTHTTP` contenga un objeto JSON.

La presencia de directivas no demuestra que un reproductor las aplique. El servicio no decodifica vídeo, ejecuta filtros, reproduce segmentos, comprueba DRM, mide fluidez ni verifica un watchdog. Los muestreos no ejecutan `#KODIPROP`, `#EXTVLCOPT` ni cabeceras de autenticación definidas en `#EXTHTTP`; por tanto, un 401/403 puede requerir revisar el contexto de autorización del reproductor. Las conexiones de muestra se cierran al reunir el prefijo o agotar su plazo, incluso si el servidor ignora `Range`.

## Caché y actualización

La caché tiene LRU real, máximo de entradas, TTL desde la medición y escritura asíncrona mediante archivo temporal y reemplazo. El reinicio no renueva artificialmente la fecha de expiración.

Se reutiliza una identidad solo si el origen devuelve 304 con el mismo ETag fuerte y la misma URL final. Un ETag débil o una fecha `Last-Modified` no bastan para reutilizar una identidad exacta. Esta es una política deliberadamente conservadora: un 304 es evidencia del validador del servidor, no un nuevo cálculo de SHA. `force=1` obliga a descargar y calcular de nuevo.

Las URLs de muestra completas permanecen solo en memoria. La caché persistida contiene claves hash, rutas redactadas y datos de identidad. Si se reinicia el servicio y están activadas las muestras, se vuelve a descargar para obtener sus URLs; si las muestras están desactivadas, puede reutilizar la identidad persistida tras la revalidación. Para listas que redirigen a otro URL se realiza una descarga completa; no se propaga el validador a una URL diferente.

`APE_PROBE_CACHE=off` desactiva la escritura a disco y conserva la caché temporal en memoria. El archivo de configuración y los resultados que el operador decida guardar quedan bajo su propio control.

## Configuración

Todos los valores numéricos de entorno se validan al iniciar. `.env.example` contiene el conjunto completo.

| Variable | Predeterminado | Función |
|---|---:|---|
| `APE_PROBE_BIND` | `127.0.0.1` | Interfaz de escucha |
| `APE_PROBE_PORT` | `8787` | Puerto |
| `APE_PROBE_LIST` | Vacío | Lista para `/probe` sin `url` |
| `APE_PROBE_TOKEN` | Vacío | Bearer token; obligatorio con al menos 24 caracteres para bind externo |
| `APE_MAX_BYTES` | `3221225472` | Máximo de bytes M3U descomprimidos |
| `APE_MAX_HTTP_BYTES` | `3221225472` | Máximo de bytes HTTP |
| `APE_MAX_LINE_BYTES` | `1048576` | Máximo por línea antes del LF |
| `APE_MAX_URL_BYTES` | `16384` | Máximo por URL |
| `APE_MAX_PATTERNS` | `128` | Clases conservadas; el censo general continúa si se supera |
| `APE_FETCH_TIMEOUT_MS` | `180000` | Plazo de obtención y lectura de la lista |
| `APE_TOTAL_TIMEOUT_MS` | `240000` | Plazo de la auditoría, incluido muestreo |
| `APE_IDLE_TIMEOUT_MS` | `15000` | Inactividad de una conexión |
| `APE_DNS_TIMEOUT_MS` | `5000` | Plazo para esperar la resolución DNS |
| `APE_MAX_REDIRECTS` | `5` | Máximo de saltos por operación |
| `APE_SAMPLE_URLS` | `3` | Máximo de URLs candidatas por clase; 0 desactiva muestras |
| `APE_SAMPLE_BUDGET` | `24` | Máximo global de muestras; 0 desactiva muestras |
| `APE_SAMPLE_CONCURRENCY` | `4` | Máximo de muestras simultáneas por auditoría |
| `APE_SAMPLE_TIMEOUT_MS` | `15000` | Plazo por muestra, incluidos saltos y cuerpo |
| `APE_SAMPLE_BYTES` | `2048` | Máximo de prefijo inspeccionado por muestra |
| `APE_MAX_CONCURRENT` | `2` | Máximo de auditorías simultáneas |
| `APE_RATE_PER_MIN` | `12` | Capacidad y reposición por minuto del token bucket por IP |
| `APE_MAX_RATE_IPS` | `2048` | Máximo de IP conservadas por el limitador |
| `APE_CACHE_TTL_MS` | `900000` | Antigüedad máxima de una medición en caché |
| `APE_CACHE_MAX_ENTRIES` | `16` | Entradas máximas de caché |
| `APE_CACHE_MAX_FILE_BYTES` | `16777216` | Máximo del archivo de caché |
| `APE_PROBE_CACHE` | `state/cache-v3.json` junto al script | Archivo propio; `off` desactiva persistencia |
| `APE_ALLOWED_HOSTS` | Vacío | Allowlist opcional de hosts exactos para listas, saltos y muestras |
| `APE_ALLOW_PRIVATE_HOSTS` | Vacío | Excepciones exactas para destinos privados que el operador necesite |
| `APE_SHUTDOWN_TIMEOUT_MS` | `10000` | Plazo para cierre de conexiones del servicio |

Ejemplo de excepción para una lista del propio equipo: `APE_ALLOW_PRIVATE_HOSTS=127.0.0.1`. Esto autoriza ese destino HTTP(S) y sus puertos; no cambia el bind. La allowlist, si se configura, debe incluir también los hosts necesarios de canales y redirecciones. Se bloquean redirecciones de HTTPS a HTTP y URL con `usuario:clave@host`; las credenciales habituales en ruta y consulta se admiten y se ocultan en la respuesta.

Al escuchar fuera de loopback, las consultas llevan `Authorization: Bearer <APE_PROBE_TOKEN>`. Si existe un proxy inverso, debe pasar un `Host` de loopback cuando el proceso escucha localmente; el servicio no confía en `X-Forwarded-For`. La concurrencia y el rate limit se calculan con la IP de la conexión directa.

Los límites son por auditoría salvo la concurrencia de auditorías y la caché. El máximo normal de muestras simultáneas del servicio es `APE_MAX_CONCURRENT × APE_SAMPLE_CONCURRENCY`. El límite de prefijo controla lo que se conserva e inspecciona; el sistema operativo puede haber recibido bytes adicionales en sus buffers antes del cierre.

## Contrato HTTP y migración

- Solo `GET`. Otros métodos producen 405 y `Allow: GET`.
- `/health` devuelve estado del servicio, contadores y memoria sin publicar la URL completa de la lista.
- `/probe` devuelve HTTP 200 cuando puede emitir un informe; se debe interpretar `estado`, `integridad` y `no_computado` para evaluar la lista.
- 400: petición/parámetros inválidos; 401: token ausente o incorrecto; 403: origen/Host del cliente rechazado; 429: frecuencia excedida; 503: concurrencia agotada o cierre.
- No se devuelve un stack ni un mensaje de red arbitrario que pueda incluir credenciales.
- El cliente que abandona la respuesta cancela su auditoría. SIGTERM/SIGINT cierran trabajos y esperan la escritura de caché antes de salir.

Las integraciones de v1/v2 deben actualizar el esquema y los estados: `SANA`, `SUCIA`, `VIVA` y `MUERTA` fueron sustituidos por los estados anteriores. `cache` es ahora un objeto. `url`, `url_final` y las clases contienen rutas redactadas; `url_id` identifica el objetivo mediante SHA-256. No se promete compatibilidad binaria del JSON anterior.

## Validación incluida

```bash
node --test test/probe.test.js
```

La entrega incluye **25 pruebas** y su salida en `test-results.tap`: final sin LF, BOM, UTF-8/UTF-16 por bloques, gzip, cortes, límites, timeout del cuerpo, HTML, HLS, destinos privados, saltos, ocultación de credenciales, caché fuerte/débil, recálculo, muestras actuales tras 304, cierre de streams, resultados mixtos, directivas, clasificación acotada, concurrencia y métodos HTTP.

Prueba de carga opcional:

```bash
node test/stream-benchmark.js --gib=1.31 --out=benchmark-result.json
```

Genera la lista localmente con un bloque reutilizable, transmite respetando la contrapresión y compara hashes y censos con cálculos independientes. No mantiene ni escribe el archivo gigante. La ejecución incluida procesó **1.406.619.384 bytes, 22.870 canales y 22.343.992 líneas**, con identidad y conteos coincidentes. `benchmark-result.json` contiene tiempos y picos de memoria de la ejecución entregada. RSS incluye Node, productor HTTP y auditor en el mismo proceso. Es una medición sintética local, sin muestreo de canales; no representa velocidad de Internet, del VPS ni de proveedores.

El código, las pruebas y el benchmark se ejecutan sin modificar las listas observadas, el APK, el LAB ni los reproductores. Las validaciones incluidas utilizan servidores locales, no listas externas del operador.

## Referencias técnicas

- [Node.js HTTP: lookup personalizado, cierre de requests y cuerpos completos](https://nodejs.org/download/release/latest-v24.x/docs/api/http.html).
- [Node.js TextDecoder: codificaciones, BOM y decodificación incremental](https://nodejs.org/download/release/latest-v24.x/docs/api/util.html#class-utiltextdecoder).
- [RFC 9110: validadores, ETag y solicitudes condicionales](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.8.3).
- [RFC 9111: revalidación de caché HTTP](https://www.rfc-editor.org/rfc/rfc9111.html#section-4.3).
